/**
 * Supported chains and deterministic address derivation.
 * For demo: addresses are derived from user ID (deterministic, not on-chain).
 */

import { createHash } from "crypto";

export interface Chain {
  id: string;
  name: string;
  symbol: string;
  type: string;
}

export const CHAINS: Chain[] = [
  { id: "ethereum", name: "Ethereum", symbol: "ETH", type: "evm" },
  { id: "bitcoin", name: "Bitcoin", symbol: "BTC", type: "utxo" },
  { id: "solana", name: "Solana", symbol: "SOL", type: "solana" },
  { id: "binancecoin", name: "BNB Chain", symbol: "BNB", type: "evm" },
  { id: "matic-network", name: "Polygon", symbol: "MATIC", type: "evm" },
  { id: "avalanche-2", name: "Avalanche", symbol: "AVAX", type: "evm" },
  { id: "litecoin", name: "Litecoin", symbol: "LTC", type: "utxo" },
  { id: "dogecoin", name: "Dogecoin", symbol: "DOGE", type: "utxo" },
];

const CHAIN_PREFIXES: Record<string, string> = {
  ethereum: "0x",
  bitcoin: "bc1q",
  solana: "",
  binancecoin: "0x",
  "matic-network": "0x",
  "avalanche-2": "0x",
  litecoin: "ltc1q",
  dogecoin: "D",
};

/** Derive a deterministic demo address for a user on a chain. */
export function deriveAddress(userId: string, chainId: string): string {
  const hash = createHash("sha256").update(`${userId}:${chainId}:kanox`).digest("hex");
  const prefix = CHAIN_PREFIXES[chainId] || "0x";
  const suffix = hash.slice(0, prefix ? 40 : 44);
  return prefix + suffix;
}
