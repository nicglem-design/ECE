/**
 * Deposit detection for Bitcoin.
 * Fetches incoming transactions from mempool.space and credits balances.
 */

import { db } from "../db";

const MEMPOOL_API = process.env.BITCOIN_API_URL || "https://mempool.space/api";
const SATOSHI_PER_BTC = 100_000_000;

interface MempoolTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number };
  vin: { prevout?: { scriptpubkey_address: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

/** Fetch transactions for an address. */
async function fetchAddressTxs(address: string): Promise<MempoolTx[]> {
  const res = await fetch(`${MEMPOOL_API}/address/${address}/txs`);
  if (!res.ok) return [];
  return (await res.json()) as MempoolTx[];
}

/** Sync Bitcoin deposits for one user. */
export async function syncBitcoinDepositsForUser(userId: string, address: string): Promise<number> {
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

    const amountBtc = totalReceived / SATOSHI_PER_BTC;
    const txId = `dep_${tx.txid}_${userId}`;
    const now = Date.now();
    db.prepare(
      "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(txId, userId, "bitcoin", "received", String(amountBtc), "unknown", address, tx.txid, now);

    const row = db.prepare(
      "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
    ).get(userId, "bitcoin") as { amount: number } | undefined;
    if (row) {
      db.prepare(
        "UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(amountBtc, now, userId, "bitcoin");
    } else {
      db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, "bitcoin", "BTC", "Bitcoin", amountBtc, now);
    }
    count++;
  }
  return count;
}
