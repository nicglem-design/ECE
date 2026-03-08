/**
 * Deposit detection for EVM chains.
 * Fetches incoming transactions from Etherscan (or similar) and credits balances.
 */

import { db } from "../db";
import { isEVMChain } from "./custody";

const ETHERSCAN_API: Record<string, string> = {
  ethereum: "https://api.etherscan.io/api",
  binancecoin: "https://api.bscscan.com/api",
  "matic-network": "https://api.polygonscan.com/api",
  "avalanche-2": "https://api.snowtrace.io/api",
};

function getApiKey(chainId: string): string {
  const key = process.env.ETHERSCAN_API_KEY || process.env.ETHEREUM_ETHERSCAN_API_KEY;
  return key || "";
}

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: string;
  timeStamp: string;
}

/** Fetch normal (non-internal) transactions for an address. */
async function fetchTxList(
  chainId: string,
  address: string,
  startBlock: number
): Promise<EtherscanTx[]> {
  const base = ETHERSCAN_API[chainId];
  if (!base) return [];
  const apiKey = getApiKey(chainId);
  const url = `${base}?module=account&action=txlist&address=${address}&startblock=${startBlock}&sort=asc${apiKey ? `&apikey=${apiKey}` : ""}`;
  const res = await fetch(url);
  const data = (await res.json()) as { result?: EtherscanTx[]; message?: string };
  if (!data.result || Array.isArray(data.result) === false) return [];
  return data.result as EtherscanTx[];
}

/** Get the highest block we've processed for this user/chain. */
function getLastProcessedBlock(userId: string, chainId: string): number {
  const row = db.prepare(
    "SELECT block_number FROM deposit_sync WHERE user_id = ? AND chain_id = ?"
  ).get(userId, chainId) as { block_number: number } | undefined;
  return row?.block_number ?? 0;
}

/** Record processed block for next sync. */
function setLastProcessedBlock(userId: string, chainId: string, blockNumber: number): void {
  const now = Date.now();
  db.prepare(
    "INSERT OR REPLACE INTO deposit_sync (user_id, chain_id, block_number, updated_at) VALUES (?, ?, ?, ?)"
  ).run(userId, chainId, blockNumber, now);
}

/** Sync deposits for one user on one chain. */
export async function syncDepositsForUser(
  userId: string,
  chainId: string,
  address: string
): Promise<number> {
  if (!isEVMChain(chainId)) return 0;
  const startBlock = getLastProcessedBlock(userId, chainId);
  const txs = await fetchTxList(chainId, address, startBlock);
  const addressLower = address.toLowerCase();
  let count = 0;
  let maxBlock = startBlock;

  for (const tx of txs) {
    const to = (tx.to || "").toLowerCase();
    if (to !== addressLower) continue;
    const from = (tx.from || "").toLowerCase();
    if (from === addressLower) continue;
    const valueWei = BigInt(tx.value || "0");
    if (valueWei <= 0n) continue;

    const existing = db.prepare(
      "SELECT 1 FROM transactions WHERE tx_hash = ?"
    ).get(tx.hash);
    if (existing) continue;

    const amountEth = Number(valueWei) / 1e18;
    const txId = `dep_${tx.hash}_${userId}`;
    const now = Date.now();
    db.prepare(
      "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(txId, userId, chainId, "received", String(amountEth), tx.from, tx.to, tx.hash, now);

    const row = db.prepare(
      "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
    ).get(userId, chainId) as { amount: number } | undefined;
    if (row) {
      db.prepare(
        "UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(amountEth, now, userId, chainId);
    } else {
      const chainInfo: Record<string, { symbol: string; name: string }> = {
        ethereum: { symbol: "ETH", name: "Ethereum" },
        binancecoin: { symbol: "BNB", name: "BNB" },
        "matic-network": { symbol: "MATIC", name: "Polygon" },
        "avalanche-2": { symbol: "AVAX", name: "Avalanche" },
      };
      const info = chainInfo[chainId] || { symbol: "ETH", name: "Native" };
      db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, chainId, info.symbol, info.name, amountEth, now);
    }
    setLastProcessedBlock(userId, chainId, parseInt(tx.blockNumber, 10));
    maxBlock = Math.max(maxBlock, parseInt(tx.blockNumber, 10));
    count++;
  }
  if (count > 0) setLastProcessedBlock(userId, chainId, maxBlock);
  return count;
}
