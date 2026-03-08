/**
 * Deposit detection for Solana.
 * Fetches incoming SOL transfers via RPC and credits balances.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { db } from "../db";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;

interface ParsedTx {
  signature: string;
  amount: number;
}

/** Fetch and parse incoming SOL transfers for an address. */
async function fetchIncomingTransfers(address: string): Promise<ParsedTx[]> {
  const connection = new Connection(RPC_URL);
  const pubkey = new PublicKey(address);
  const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 50 });
  const result: ParsedTx[] = [];

  for (const s of sigs) {
    try {
      const tx = await connection.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx || !tx.meta) continue;
      const accountKeys = tx.transaction.message.accountKeys.map((k) =>
        typeof k.pubkey === "string" ? k.pubkey : k.pubkey.toBase58()
      );
      const myIndex = accountKeys.findIndex((k) => k === address);
      if (myIndex < 0) continue;

      const preBalance = tx.meta.preBalances[myIndex] ?? 0;
      const postBalance = tx.meta.postBalances[myIndex] ?? 0;
      const diff = postBalance - preBalance;
      if (diff <= 0) continue;

      result.push({ signature: s.signature, amount: diff });
    } catch {
      // skip failed parses
    }
  }
  return result;
}

/** Sync Solana deposits for one user. */
export async function syncSolanaDepositsForUser(userId: string, address: string): Promise<number> {
  const transfers = await fetchIncomingTransfers(address);
  let count = 0;

  for (const { signature, amount } of transfers) {
    const existing = await db.prepare("SELECT 1 FROM transactions WHERE tx_hash = ?").get(signature);
    if (existing) continue;

    const amountSol = amount / LAMPORTS_PER_SOL;
    const txId = `dep_${signature}_${userId}`;
    const now = Date.now();
    await db.prepare(
      "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(txId, userId, "solana", "received", String(amountSol), "unknown", address, signature, now);

    const row = (await db.prepare(
      "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
    ).get(userId, "solana")) as { amount: number } | undefined;
    if (row) {
      await db.prepare(
        "UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(amountSol, now, userId, "solana");
    } else {
      await db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, "solana", "SOL", "Solana", amountSol, now);
    }
    count++;
  }
  return count;
}
