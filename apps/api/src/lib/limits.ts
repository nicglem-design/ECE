/**
 * Withdrawal and send limits (configurable via env).
 */

import { db } from "../db";
import { config } from "../config";

/** Rough USD equivalent per unit (for limit checks). */
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.1,
  GBP: 1.27,
  SEK: 0.1,
};

function toUsd(amount: number, currency: string): number {
  return amount * (CURRENCY_TO_USD[currency.toUpperCase()] ?? 1);
}

/** Returns { ok: false, message } if over daily withdrawal limit. */
export async function checkWithdrawalLimit(
  userId: string,
  amount: number,
  currency: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (config.withdrawalLimitDaily <= 0) return { ok: true };
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = (await db.prepare(
    "SELECT currency, amount FROM fiat_transactions WHERE user_id = ? AND type = 'withdraw' AND created_at > ?"
  ).all(userId, since)) as { currency: string; amount: number }[];
  let totalUsd = 0;
  for (const r of rows) {
    totalUsd += toUsd(r.amount, r.currency);
  }
  totalUsd += toUsd(amount, currency);
  if (totalUsd > config.withdrawalLimitDaily) {
    return {
      ok: false,
      message: `Daily withdrawal limit exceeded (max ${config.withdrawalLimitDaily} USD equivalent).`,
    };
  }
  return { ok: true };
}

/** Returns { ok: false, message } if over daily send count limit. */
export async function checkSendLimit(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (config.sendLimitDaily <= 0) return { ok: true };
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const row = (await db.prepare(
    "SELECT COUNT(*) as cnt FROM transactions WHERE user_id = ? AND type = 'sent' AND created_at > ?"
  ).get(userId, since)) as { cnt: number };
  const count = row?.cnt ?? 0;
  if (count >= config.sendLimitDaily) {
    return {
      ok: false,
      message: `Daily send limit reached (max ${config.sendLimitDaily} per day).`,
    };
  }
  return { ok: true };
}
