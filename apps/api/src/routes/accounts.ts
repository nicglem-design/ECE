import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";
import { require2FAIfEnabled } from "../crypto/twofaVerify";
import { v4 as uuidv4 } from "uuid";
import { logAudit } from "../lib/audit";
import { checkWithdrawalLimit } from "../lib/limits";
import { requireKycApproved } from "../lib/kyc";

const router = Router();
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

const SUPPORTED_FIAT = ["USD", "EUR", "GBP", "SEK"];

async function ensureFiatBalance(userId: string, currency: string): Promise<void> {
  const row = (await db.prepare(
    "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
  ).get(userId, currency)) as { amount: number } | undefined;
  if (!row) {
    const now = Date.now();
    await db.prepare(
      "INSERT INTO fiat_balances (user_id, currency, amount, updated_at) VALUES (?, ?, 0, ?)"
    ).run(userId, currency, now);
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

/** POST /api/v1/accounts/connect-onboarding - Create Stripe Connect Express account link for bank withdrawals */
router.post("/connect-onboarding", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (!stripe) {
    res.status(503).json({ message: "Withdrawals not configured. Set STRIPE_SECRET_KEY." });
    return;
  }
  try {
    const userRow = (await db.prepare("SELECT email FROM users WHERE id = ?").get(user.sub)) as { email: string } | undefined;
    const email = userRow?.email || `user-${user.sub}@ece.local`;
    const profileRow = (await db.prepare(
      "SELECT stripe_connect_account_id FROM profiles WHERE user_id = ?"
    ).get(user.sub)) as { stripe_connect_account_id: string | null } | undefined;

    let accountId = profileRow?.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: email.toLowerCase(),
        metadata: { userId: user.sub },
      });
      accountId = account.id;
      const now = Date.now();
      const updated = await db.prepare(
        "UPDATE profiles SET stripe_connect_account_id = ?, updated_at = ? WHERE user_id = ?"
      ).run(accountId, now, user.sub);
      if (updated.changes === 0) {
        await db.prepare(
          "INSERT INTO profiles (user_id, display_name, avatar_url, theme, preferred_currency, stripe_connect_account_id, updated_at) VALUES (?, '', '', 'dark', 'usd', ?, ?)"
        ).run(user.sub, accountId, now);
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: config.stripeConnectRefreshUrl,
      return_url: config.stripeConnectReturnUrl,
      type: "account_onboarding",
    });
    res.json({ url: link.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connect onboarding failed";
    res.status(500).json({ message: msg });
  }
});

/** GET /api/v1/accounts/connect-status - Check if Stripe Connect bank is linked */
router.get("/connect-status", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = (await db.prepare(
    "SELECT stripe_connect_account_id FROM profiles WHERE user_id = ?"
  ).get(user.sub)) as { stripe_connect_account_id: string | null } | undefined;
  const accountId = row?.stripe_connect_account_id;
  const linked = !!accountId;

  let bankDetails: { bankName?: string; last4?: string } | null = null;
  let linkedAccountId: string | null = null;

  if (stripe && accountId) {
    try {
      const account = await stripe.accounts.retrieve(accountId, {
        expand: ["external_accounts.data"],
      });
      const ext = account.external_accounts?.data?.[0] as { object: string; bank_name?: string; last4?: string } | undefined;
      if (ext && (ext.object === "bank_account" || ext.object === "card")) {
        bankDetails = {
          bankName: ext.bank_name ?? (ext as { brand?: string }).brand,
          last4: ext.last4,
        };
        const existing = (await db.prepare(
          "SELECT id FROM linked_accounts WHERE user_id = ? AND stripe_account_id = ?"
        ).get(user.sub, accountId)) as { id: string } | undefined;
        if (existing) {
          linkedAccountId = existing.id;
        } else {
          const id = `la_${uuidv4()}`;
          const now = Date.now();
          const label = bankDetails.bankName
            ? `${bankDetails.bankName}${bankDetails.last4 ? ` ****${bankDetails.last4}` : ""}`
            : "Connected bank account";
          await db.prepare(
            "INSERT INTO linked_accounts (id, user_id, type, label, last_four, stripe_account_id, created_at) VALUES (?, ?, 'bank', ?, ?, ?, ?)"
          ).run(id, user.sub, label, bankDetails.last4 ?? null, accountId, now);
          linkedAccountId = id;
        }
      }
    } catch (err) {
      console.error("Connect status fetch bank details:", err);
    }
  }

  res.json({ linked, bankDetails: bankDetails ?? undefined, linkedAccountId: linkedAccountId ?? undefined });
});

/** POST /api/v1/accounts/create-checkout - Create Stripe Checkout for deposit (card + Apple Pay) */
router.post("/create-checkout", authMiddleware, async (req: Request, res: Response) => {
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
  if (!stripe) {
    res.status(503).json({ message: "Payment not configured. Set STRIPE_SECRET_KEY." });
    return;
  }
  const { currency, amount, successUrl, cancelUrl } = req.body;
  const curr = (currency || "USD").toUpperCase();
  if (!SUPPORTED_FIAT.includes(curr)) {
    res.status(400).json({ message: "Unsupported currency" });
    return;
  }
  const numAmount = parseFloat(String(amount));
  if (isNaN(numAmount) || numAmount <= 0 || numAmount > 10000) {
    res.status(400).json({ message: "Amount must be between 0 and 10000" });
    return;
  }
  const amountCents = Math.round(numAmount * 100);
  if (amountCents < 50) {
    res.status(400).json({ message: "Minimum deposit is 0.50" });
    return;
  }
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: curr.toLowerCase(),
          product_data: {
            name: "Deposit to ECE",
            description: `Add ${numAmount} ${curr} to your account`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: successUrl || config.stripeSuccessUrl,
      cancel_url: cancelUrl || config.stripeCancelUrl,
      client_reference_id: user.sub,
      metadata: { userId: user.sub, currency: curr, amount: String(numAmount) },
    });
    const paymentId = `pay_${session.id}`;
    const now = Date.now();
    await db.prepare(
      "INSERT INTO stripe_payments (id, user_id, currency, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(paymentId, user.sub, curr, numAmount, "pending", now);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Checkout failed";
    res.status(500).json({ message: msg });
  }
});

/** POST /api/v1/accounts/deposit - Add fiat to account (manual/demo) */
router.post("/deposit", authMiddleware, async (req: Request, res: Response) => {
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
  res.json({ success: true, amount: numAmount, currency: curr });
});

/** POST /api/v1/accounts/withdraw - Withdraw fiat to bank (Stripe Connect) or record only */
router.post("/withdraw", authMiddleware, async (req: Request, res: Response) => {
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
  const { currency, amount, linkedAccountId, totpCode } = req.body;
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

  let destination = "External account";
  let stripeAccountId: string | null = null;
  if (linkedAccountId) {
    const linked = (await db.prepare(
      "SELECT label, last_four, stripe_account_id FROM linked_accounts WHERE id = ? AND user_id = ?"
    ).get(linkedAccountId, user.sub)) as { label: string; last_four: string; stripe_account_id: string | null } | undefined;
    if (linked) {
      destination = `${linked.label}${linked.last_four ? ` ****${linked.last_four}` : ""}`;
      stripeAccountId = linked.stripe_account_id ?? null;
    }
  }
  if (!stripeAccountId) {
    const profile = (await db.prepare(
      "SELECT stripe_connect_account_id FROM profiles WHERE user_id = ?"
    ).get(user.sub)) as { stripe_connect_account_id: string | null } | undefined;
    if (profile?.stripe_connect_account_id) {
      stripeAccountId = profile.stripe_connect_account_id;
      destination = "Connected bank account";
    }
  }

  let status = "completed";
  if (stripe && stripeAccountId && numAmount >= 1) {
    try {
      const amountCents = Math.round(numAmount * 100);
      await stripe.transfers.create({
        amount: amountCents,
        currency: curr.toLowerCase(),
        destination: stripeAccountId,
        description: `Withdrawal to ${destination}`,
        metadata: { userId: user.sub },
      });
    } catch (err) {
      status = "failed";
      const msg = err instanceof Error ? err.message : "Bank transfer failed";
      res.status(400).json({ message: msg });
      return;
    }
  } else if (!stripeAccountId && numAmount >= 1) {
    res.status(400).json({
      message: "Connect your bank account to withdraw. Click 'Connect bank' below.",
      code: "BANK_REQUIRED",
    });
    return;
  }

  const now = Date.now();
  await db.prepare(
    "UPDATE fiat_balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND currency = ?"
  ).run(numAmount, now, user.sub, curr);
  const txId = `fiat_wd_${Date.now()}_${uuidv4().slice(0, 8)}`;
  await db.prepare(
    "INSERT INTO fiat_transactions (id, user_id, currency, type, amount, status, destination, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, curr, "withdraw", numAmount, status, destination, now);
  logAudit(user.sub, "withdraw_fiat", { currency: curr, amount: numAmount, destination }).catch(() => {});
  res.json({ success: true, amount: numAmount, currency: curr });
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
