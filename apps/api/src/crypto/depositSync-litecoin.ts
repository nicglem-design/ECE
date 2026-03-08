/**
 * Deposit detection for Litecoin.
 */

import { db } from "../db";

const LITECOIN_API = process.env.LITECOIN_API_URL || "https://blockstream.info/litecoin/api";
const SATOSHI_PER_LTC = 100_000_000;

interface BlockstreamTx {
  txid: string;
  status?: { confirmed: boolean };
  vout: { scriptpubkey_address?: string; value: number }[];
}

async function fetchAddressTxs(address: string): Promise<BlockstreamTx[]> {
  const res = await fetch(`${LITECOIN_API}/address/${address}/txs`);
  if (!res.ok) return [];
  return (await res.json()) as BlockstreamTx[];
}

export async function syncLitecoinDepositsForUser(userId: string, address: string): Promise<number> {
  const txs = await fetchAddressTxs(address);
  let count = 0;

  for (const tx of txs) {
    if (!tx.status?.confirmed) continue;
    let totalReceived = 0;
    for (const out of tx.vout) {
      if (out.scriptpubkey_address === address) totalReceived += out.value;
    }
    if (totalReceived <= 0) continue;
    const existing = db.prepare("SELECT 1 FROM transactions WHERE tx_hash = ?").get(tx.txid);
    if (existing) continue;

    const amountLtc = totalReceived / SATOSHI_PER_LTC;
    const txId = `dep_${tx.txid}_${userId}`;
    const now = Date.now();
    db.prepare(
      "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(txId, userId, "litecoin", "received", String(amountLtc), "unknown", address, tx.txid, now);

    const row = db.prepare(
      "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
    ).get(userId, "litecoin") as { amount: number } | undefined;
    if (row) {
      db.prepare(
        "UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(amountLtc, now, userId, "litecoin");
    } else {
      db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, "litecoin", "LTC", "Litecoin", amountLtc, now);
    }
    count++;
  }
  return count;
}
