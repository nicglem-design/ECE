import { Router, Request, Response } from "express";
import braintree from "braintree";
import { z } from "zod";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { config } from "../config";
import { require2FAIfEnabled } from "../crypto/twofaVerify";
import { v4 as uuidv4 } from "uuid";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import { checkWithdrawalLimit } from "../lib/limits";
import { requireKycApproved } from "../lib/kyc";
import { requireEmailVerified } from "../lib/emailVerify";
import { sendWithdrawalConfirmationEmail } from "../lib/email";
import { increment } from "../lib/metrics";

const router = Router();

const gateway = config.braintreeMerchantId && config.braintreePrivateKey
  ? new braintree.BraintreeGateway({
      environment: config.braintreeEnvironment === "production"
        ? braintree.Environment.Production
        : braintree.Environment.Sandbox,
      merchantId: config.braintreeMerchantId,
      publicKey: config.braintreePublicKey,
      privateKey: config.braintreePrivateKey,
    })
  : null;

const checkoutChargeSchema = z.object({
  paymentMethodNonce: z.string().min(1),
  currency: z.string().optional().default("USD"),
  amount: z.coerce.number().min(0.5).max(10000),
}).strict();

const depositSchema = z.object({
  currency: z.string().min(1).max(10),
  amount: z.coerce.number().positive().max(100000),
  method: z.string().max(50).optional(),
}).strict();

const withdrawSchema = z.object({
  currency: z.string().min(1).max(10),
  amount: z.coerce.number().positive(),
  linkedAccountId: z.string().optional(),
  totpCode: z.string().optional(),
}).strict();

const SUPPORTED_FIAT = ["USD", "EUR", "GBP", "SEK"];

async function ensureFiatBalance(userId: string, currency: string): Promise<void> {
  const row = (await db.prepare(
    "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
  ).get(userId, currency)) as { amount: number } | undefined;
  if (!row) {
    const now = Date.now();
    await db.prepare(
      "INSERT INTO fiat_balances (user_id, currency, amount, updated_at) VALUES (?, ?, ?, ?)"
    ).run(userId, currency, 0, now);
  }
}

/** GET /api/v1/accounts/fiat - Get fiat balances */
router.get("/fiat", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  for (const c of SUPPORTED_FIAT) await ensureFiatBalance(user.sub, c);
  const rows = (await db.prepare(
    "SELECT currency, amount FROM fiat_balances WHERE user_id = ?"
  ).all(user.sub)) as { currency: string; amount: number }[];
  const balances = rows.map((r) => ({
    currency: r.currency,
    amount: r.amount,
  }));
  res.json({ balances });
});

/** GET /api/v1/accounts/checkout-client-token - Braintree client token for Drop-in UI */
router.get("/checkout-client-token", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const kycCheck = await requireKycApproved(user.sub);
  if (!kycCheck.ok) {
    res.status(403).json({ message: kycCheck.message, code: kycCheck.code });
    return;
  }
  if (!gateway) {
    res.status(503).json({ message: "Payment not configured. Set BRAINTREE_MERCHANT_ID and keys." });
    return;
  }
  try {
    const { clientToken } = await gateway.clientToken.generate({});
    res.json({ clientToken });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate client token";
    logger.error({ err }, "Braintree client token error");
    res.status(500).json({ message: msg });
  }
});

/** POST /api/v1/accounts/checkout-charge - Charge via Braintree (nonce from Drop-in) */
router.post("/checkout-charge", authMiddleware, validateBody(checkoutChargeSchema), async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const kycCheck = await requireKycApproved(user.sub);
  if (!kycCheck.ok) {
    res.status(403).json({ message: kycCheck.message, code: kycCheck.code });
    return;
  }
  const emailCheck = await requireEmailVerified(user.sub);
  if (!emailCheck.ok) {
    res.status(403).json({ message: emailCheck.message, code: emailCheck.code });
    return;
  }
  if (!gateway) {
    res.status(503).json({ message: "Payment not configured. Set BRAINTREE_MERCHANT_ID and keys." });
    return;
  }
  const { paymentMethodNonce, currency, amount } = req.body;
  const curr = (currency || "USD").toUpperCase();
  if (!SUPPORTED_FIAT.includes(curr)) {
    res.status(400).json({ message: "Unsupported currency" });
    return;
  }
  if (curr !== "USD") {
    res.status(400).json({ message: "Card payments currently support USD only. Use manual deposit for other currencies." });
    return;
  }
  const numAmount = parseFloat(String(amount));
  if (isNaN(numAmount) || numAmount <= 0 || numAmount > 10000) {
    res.status(400).json({ message: "Amount must be between 0.50 and 10000" });
    return;
  }
  try {
    const result = await gateway.transaction.sale({
      amount: numAmount.toFixed(2),
      paymentMethodNonce,
      options: { submitForSettlement: true },
    });
    if (!result.success) {
      const msg = result.transaction?.processorResponseText
        || result.message
        || "Payment failed";
      res.status(400).json({ message: msg });
      return;
    }
    const txId = result.transaction?.id;
    const paymentId = `pay_${txId || uuidv4()}`;
    const now = Date.now();
    await ensureFiatBalance(user.sub, curr);
    await db.prepare(
      "UPDATE fiat_balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND currency = ?"
    ).run(numAmount, now, user.sub, curr);
    await db.prepare(
      "INSERT INTO stripe_payments (id, user_id, currency, amount, status, stripe_payment_intent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(paymentId, user.sub, curr, numAmount, "completed", txId || null, now);
    await db.prepare(
      "INSERT INTO fiat_transactions (id, user_id, currency, type, amount, status, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(`fiat_dep_${Date.now()}_${uuidv4().slice(0, 8)}`, user.sub, curr, "deposit", numAmount, "completed", "card", now);
    increment("fiat_deposits_total");
    res.json({ success: true, amount: numAmount, currency: curr });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Payment failed";
    logger.error({ err }, "Braintree charge error");
    res.status(500).json({ message: msg });
  }
});

/** POST /api/v1/accounts/connect-onboarding - Bank withdrawals not supported (Braintree has no Connect equivalent) */
router.post("/connect-onboarding", authMiddleware, async (_req: Request, res: Response) => {
  res.status(503).json({ message: "Bank withdrawals are not configured. Connect bank is not available." });
});

/** GET /api/v1/accounts/connect-status - Bank withdrawals not supported */
router.get("/connect-status", authMiddleware, async (_req: Request, res: Response) => {
  res.json({ linked: false });
});

/** POST /api/v1/accounts/deposit - Add fiat to account (manual/demo). Restricted in production unless ALLOW_MANUAL_DEPOSIT=true. */
router.post("/deposit", authMiddleware, validateBody(depositSchema), async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (!config.allowManualDeposit) {
    res.status(403).json({ message: "Manual deposit is disabled in production. Use Card, Apple Pay, or Google Pay to add funds." });
    return;
  }
  const kycCheck = await requireKycApproved(user.sub);
  if (!kycCheck.ok) {
    res.status(403).json({ message: kycCheck.message, code: kycCheck.code });
    return;
  }
  const emailCheck = await requireEmailVerified(user.sub);
  if (!emailCheck.ok) {
    res.status(403).json({ message: emailCheck.message, code: emailCheck.code });
    return;
  }
  const { currency, amount, method } = req.body;
  const curr = (currency || "USD").toUpperCase();
  if (!SUPPORTED_FIAT.includes(curr)) {
    res.status(400).json({ message: "Unsupported currency. Use USD, EUR, GBP, or SEK." });
    return;
  }
  const numAmount = parseFloat(String(amount));
  if (isNaN(numAmount) || numAmount <= 0 || numAmount > 100000) {
    res.status(400).json({ message: "Amount must be between 0 and 100000" });
    return;
  }
  await ensureFiatBalance(user.sub, curr);
  const now = Date.now();
  await db.prepare(
    "UPDATE fiat_balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND currency = ?"
  ).run(numAmount, now, user.sub, curr);
  const txId = `fiat_dep_${Date.now()}_${uuidv4().slice(0, 8)}`;
  await db.prepare(
    "INSERT INTO fiat_transactions (id, user_id, currency, type, amount, status, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, curr, "deposit", numAmount, "completed", method || "card", now);
  increment("fiat_deposits_total");
  res.json({ success: true, amount: numAmount, currency: curr });
});

/** POST /api/v1/accounts/withdraw - Withdraw fiat (bank transfers not configured; balance deduction only for demo) */
router.post("/withdraw", authMiddleware, validateBody(withdrawSchema), async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const kycCheck = await requireKycApproved(user.sub);
  if (!kycCheck.ok) {
    res.status(403).json({ message: kycCheck.message, code: kycCheck.code });
    return;
  }
  const emailCheck = await requireEmailVerified(user.sub);
  if (!emailCheck.ok) {
    res.status(403).json({ message: emailCheck.message, code: emailCheck.code });
    return;
  }
  const { currency, amount, totpCode } = req.body;
  const twofaCheck = await require2FAIfEnabled(user.sub, totpCode);
  if (!twofaCheck.ok) {
    res.status(400).json({ message: twofaCheck.error, code: "2FA_REQUIRED" });
    return;
  }
  const curr = (currency || "USD").toUpperCase();
  if (!SUPPORTED_FIAT.includes(curr)) {
    res.status(400).json({ message: "Unsupported currency" });
    return;
  }
  const numAmount = parseFloat(String(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ message: "Invalid amount" });
    return;
  }
  const limitCheck = await checkWithdrawalLimit(user.sub, numAmount, curr);
  if (!limitCheck.ok) {
    res.status(400).json({ message: limitCheck.message });
    return;
  }
  await ensureFiatBalance(user.sub, curr);
  const balance = (await db.prepare(
    "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
  ).get(user.sub, curr)) as { amount: number } | undefined;
  if (!balance || balance.amount < numAmount) {
    res.status(400).json({ message: "Insufficient balance" });
    return;
  }

  res.status(503).json({
    message: "Bank withdrawals are not configured. Connect bank is not available.",
    code: "WITHDRAWALS_NOT_CONFIGURED",
  });
});

/** GET /api/v1/accounts/linked - List linked bank accounts and cards */
router.get("/linked", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const rows = (await db.prepare(
    "SELECT id, type, label, last_four, currency, stripe_account_id as stripeAccountId FROM linked_accounts WHERE user_id = ? ORDER BY created_at DESC"
  ).all(user.sub)) as { id: string; type: string; label: string; last_four: string; currency: string; stripeAccountId: string | null }[];
  res.json({ accounts: rows });
});

/** POST /api/v1/accounts/linked - Add linked bank account or card */
router.post("/linked", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { type, label, lastFour, stripeAccountId } = req.body;
  if (!type || !label) {
    res.status(400).json({ message: "type and label required" });
    return;
  }
  if (type !== "bank" && type !== "card") {
    res.status(400).json({ message: "type must be bank or card" });
    return;
  }
  const id = `la_${uuidv4()}`;
  const now = Date.now();
  await db.prepare(
    "INSERT INTO linked_accounts (id, user_id, type, label, last_four, stripe_account_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, user.sub, type, String(label).trim(), lastFour ? String(lastFour).slice(-4) : null, stripeAccountId ? String(stripeAccountId) : null, now);
  res.json({ success: true, id });
});

/** DELETE /api/v1/accounts/linked/:id - Remove linked account */
router.delete("/linked/:id", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  const result = await db.prepare(
    "DELETE FROM linked_accounts WHERE id = ? AND user_id = ?"
  ).run(id, user.sub);
  if (result.changes === 0) {
    res.status(404).json({ message: "Account not found" });
    return;
  }
  res.json({ success: true });
});

/** GET /api/v1/accounts/transactions - Fiat transaction history */
router.get("/transactions", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const rows = (await db.prepare(
    "SELECT id, currency, type, amount, status, method, destination, created_at as createdAt FROM fiat_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(user.sub)) as { id: string; currency: string; type: string; amount: number; status: string; method: string; destination: string; createdAt: number }[];
  res.json({ transactions: rows });
});

export default router;
