/**
 * Deposit detection for Dogecoin via BlockCypher.
 */

import { db } from "../db";

const DOGECOIN_API = process.env.DOGECOIN_API_URL || "https://api.blockcypher.com/v1/doge/main";
const SATOSHI_PER_DOGE = 100_000_000;

interface BlockCypherTx {
  hash: string;
  confirmations: number;
  outputs?: { addresses?: string[]; value: number }[];
}

async function fetchAddressTxs(address: string): Promise<BlockCypherTx[]> {
  const res = await fetch(`${DOGECOIN_API}/addrs/${address}?limit=50`);
  if (!res.ok) return [];
  const data = (await res.json()) as { txrefs?: { tx_hash: string }[] };
  const hashes = [...new Set((data.txrefs ?? []).map((r) => r.tx_hash))].slice(0, 20);
  const txs: BlockCypherTx[] = [];
  for (const h of hashes) {
    const txRes = await fetch(`${DOGECOIN_API}/txs/${h}`);
    if (txRes.ok) {
      const tx = (await txRes.json()) as BlockCypherTx;
      txs.push(tx);
    }
  }
  return txs.filter((t) => t.confirmations > 0);
}

export async function syncDogecoinDepositsForUser(userId: string, address: string): Promise<number> {
  const txs = await fetchAddressTxs(address);
  let count = 0;

  for (const tx of txs) {
    let totalReceived = 0;
    for (const out of tx.outputs ?? []) {
      if (out.addresses?.includes(address)) totalReceived += out.value;
    }
    if (totalReceived <= 0) continue;
    const existing = await db.prepare("SELECT 1 FROM transactions WHERE tx_hash = ?").get(tx.hash);
    if (existing) continue;

    const amountDoge = totalReceived / SATOSHI_PER_DOGE;
    const txId = `dep_${tx.hash}_${userId}`;
    const now = Date.now();
    await db.prepare(
      "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(txId, userId, "dogecoin", "received", String(amountDoge), "unknown", address, tx.hash, now);

    const row = (await db.prepare(
      "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
    ).get(userId, "dogecoin")) as { amount: number } | undefined;
    if (row) {
      await db.prepare(
        "UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(amountDoge, now, userId, "dogecoin");
    } else {
      await db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, "dogecoin", "DOGE", "Dogecoin", amountDoge, now);
    }
    count++;
  }
  return count;
}
