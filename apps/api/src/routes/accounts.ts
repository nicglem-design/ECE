import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

const SUPPORTED_FIAT = ["USD", "EUR", "GBP", "SEK"];

function ensureFiatBalance(userId: string, currency: string): void {
  const row = db.prepare(
    "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
  ).get(userId, currency) as { amount: number } | undefined;
  if (!row) {
    const now = Date.now();
    db.prepare(
      "INSERT INTO fiat_balances (user_id, currency, amount, updated_at) VALUES (?, ?, 0, ?)"
    ).run(userId, currency, now);
  }
}

/** GET /api/v1/accounts/fiat - Get fiat balances */
router.get("/fiat", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  for (const c of SUPPORTED_FIAT) ensureFiatBalance(user.sub, c);
  const rows = db.prepare(
    "SELECT currency, amount FROM fiat_balances WHERE user_id = ?"
  ).all(user.sub) as { currency: string; amount: number }[];
  const balances = rows.map((r) => ({
    currency: r.currency,
    amount: r.amount,
  }));
  res.json({ balances });
});

/** POST /api/v1/accounts/create-checkout - Create Stripe Checkout session for real deposit */
router.post("/create-checkout", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (!stripe) {
    res.status(503).json({ message: "Stripe not configured. Set STRIPE_SECRET_KEY." });
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
            name: "Deposit to KanoXchange",
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
    db.prepare(
      "INSERT INTO stripe_payments (id, user_id, currency, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(paymentId, user.sub, curr, numAmount, "pending", now);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Checkout failed";
    res.status(500).json({ message: msg });
  }
});

/** POST /api/v1/accounts/deposit - Simulated fiat deposit (when Stripe not configured) */
router.post("/deposit", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
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
  ensureFiatBalance(user.sub, curr);
  const now = Date.now();
  db.prepare(
    "UPDATE fiat_balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND currency = ?"
  ).run(numAmount, now, user.sub, curr);
  const txId = `fiat_dep_${Date.now()}_${uuidv4().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO fiat_transactions (id, user_id, currency, type, amount, status, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, curr, "deposit", numAmount, "completed", method || "card", now);
  res.json({ success: true, amount: numAmount, currency: curr });
});

/** POST /api/v1/accounts/stripe-webhook - Stripe webhook for payment completion */
router.post("/stripe-webhook", (req: Request, res: Response) => {
  if (!stripe || !config.stripeWebhookSecret) {
    res.status(503).send("Stripe webhook not configured");
    return;
  }
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripeWebhookSecret
    );
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : "Unknown"}`);
    return;
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.userId;
    const amount = parseFloat(session.metadata?.amount || "0");
    const currency = (session.metadata?.currency || "USD").toUpperCase();
    if (userId && amount > 0 && SUPPORTED_FIAT.includes(currency)) {
      const now = Date.now();
      ensureFiatBalance(userId, currency);
      db.prepare(
        "UPDATE fiat_balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND currency = ?"
      ).run(amount, now, userId, currency);
      const txId = `fiat_dep_${Date.now()}_${uuidv4().slice(0, 8)}`;
      db.prepare(
        "INSERT INTO fiat_transactions (id, user_id, currency, type, amount, status, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(txId, userId, currency, "deposit", amount, "completed", "stripe", now);
    }
  }
  res.json({ received: true });
});

/** POST /api/v1/accounts/withdraw - Withdraw fiat to linked account or card */
router.post("/withdraw", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { currency, amount, linkedAccountId } = req.body;
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
  ensureFiatBalance(user.sub, curr);
  const balance = db.prepare(
    "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
  ).get(user.sub, curr) as { amount: number } | undefined;
  if (!balance || balance.amount < numAmount) {
    res.status(400).json({ message: "Insufficient balance" });
    return;
  }
  let destination = "External account";
  let stripeAccountId: string | null = null;
  if (linkedAccountId) {
    const linked = db.prepare(
      "SELECT label, last_four, stripe_account_id FROM linked_accounts WHERE id = ? AND user_id = ?"
    ).get(linkedAccountId, user.sub) as { label: string; last_four: string; stripe_account_id: string | null } | undefined;
    if (linked) {
      destination = `${linked.label} ****${linked.last_four || ""}`;
      stripeAccountId = linked.stripe_account_id ?? null;
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
      const msg = err instanceof Error ? err.message : "Stripe transfer failed";
      res.status(400).json({ message: msg });
      return;
    }
  }

  const now = Date.now();
  db.prepare(
    "UPDATE fiat_balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND currency = ?"
  ).run(numAmount, now, user.sub, curr);
  const txId = `fiat_wd_${Date.now()}_${uuidv4().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO fiat_transactions (id, user_id, currency, type, amount, status, destination, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, curr, "withdraw", numAmount, status, destination, now);
  res.json({ success: true, amount: numAmount, currency: curr });
});

/** GET /api/v1/accounts/linked - List linked bank accounts and cards */
router.get("/linked", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const rows = db.prepare(
    "SELECT id, type, label, last_four, currency, stripe_account_id as stripeAccountId FROM linked_accounts WHERE user_id = ? ORDER BY created_at DESC"
  ).all(user.sub) as { id: string; type: string; label: string; last_four: string; currency: string; stripeAccountId: string | null }[];
  res.json({ accounts: rows });
});

/** POST /api/v1/accounts/linked - Add linked bank account or card */
router.post("/linked", authMiddleware, (req: Request, res: Response) => {
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
  db.prepare(
    "INSERT INTO linked_accounts (id, user_id, type, label, last_four, stripe_account_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, user.sub, type, String(label).trim(), lastFour ? String(lastFour).slice(-4) : null, stripeAccountId ? String(stripeAccountId) : null, now);
  res.json({ success: true, id });
});

/** DELETE /api/v1/accounts/linked/:id - Remove linked account */
router.delete("/linked/:id", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { id } = req.params;
  const result = db.prepare(
    "DELETE FROM linked_accounts WHERE id = ? AND user_id = ?"
  ).run(id, user.sub);
  if (result.changes === 0) {
    res.status(404).json({ message: "Account not found" });
    return;
  }
  res.json({ success: true });
});

/** GET /api/v1/accounts/transactions - Fiat transaction history */
router.get("/transactions", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const rows = db.prepare(
    "SELECT id, currency, type, amount, status, method, destination, created_at as createdAt FROM fiat_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(user.sub) as { id: string; currency: string; type: string; amount: number; status: string; method: string; destination: string; createdAt: number }[];
  res.json({ transactions: rows });
});

export default router;
