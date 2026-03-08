/**
 * Stripe webhook handler. Must receive raw body for signature verification.
 * Mounted in main.ts BEFORE express.json().
 */

import { Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { config } from "../config";
import { requireKycApproved } from "../lib/kyc";

const SUPPORTED_FIAT = ["USD", "EUR", "GBP", "SEK"];
const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

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

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!stripe || !config.stripeWebhookSecret) {
    res.status(503).send("Webhook not configured");
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
      const kycCheck = await requireKycApproved(userId);
      if (!kycCheck.ok) {
        console.warn(`Stripe webhook: KYC not approved for user ${userId}, refunding payment ${session.payment_intent || session.id}`);
        const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id;
        if (paymentIntentId) {
          try {
            await stripe!.refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer" });
          } catch (e) {
            console.error("Stripe refund failed:", e);
          }
        }
      } else {
        const { v4: uuidv4 } = await import("uuid");
        const now = Date.now();
        await ensureFiatBalance(userId, currency);
        await db.prepare(
          "UPDATE fiat_balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND currency = ?"
        ).run(amount, now, userId, currency);
        const txId = `fiat_dep_${Date.now()}_${uuidv4().slice(0, 8)}`;
        await db.prepare(
          "INSERT INTO fiat_transactions (id, user_id, currency, type, amount, status, method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(txId, userId, currency, "deposit", amount, "completed", "stripe", now);
      }
    }
  }
  res.json({ received: true });
}
