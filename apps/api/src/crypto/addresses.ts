/**
 * Address resolution: real custody (EVM, Bitcoin, Solana) or legacy derived addresses.
 */

import { createHash } from "crypto";
import { db } from "../db";
import { CHAINS } from "../chains";
import { generateWallet, isCustodyEnabled, isEVMChain } from "./custody";
import { generateBitcoinWallet, isBitcoinCustodyEnabled } from "./custody-bitcoin";
import { generateSolanaWallet, isSolanaCustodyEnabled } from "./custody-solana";

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

/** Map chain_id to wallet_keys chain_type. */
function chainIdToChainType(chainId: string): string | null {
  if (isEVMChain(chainId)) return "evm";
  if (chainId === "bitcoin") return "bitcoin";
  if (chainId === "solana") return "solana";
  return null;
}

/** Legacy: derive deterministic address from userId (not on-chain). */
function deriveAddress(userId: string, chainId: string): string {
  const hash = createHash("sha256").update(`${userId}:${chainId}:kanox`).digest("hex");
  const prefix = CHAIN_PREFIXES[chainId] || "0x";
  const suffix = hash.slice(0, prefix ? 40 : 44);
  return prefix + suffix;
}

/** Get or create address for user on chain. Uses real custody when enabled. */
export function getOrCreateAddress(userId: string, chainId: string): string {
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) return deriveAddress(userId, chainId);

  const chainType = chainIdToChainType(chainId);
  const useCustody =
    (chainType === "evm" && isCustodyEnabled()) ||
    (chainType === "bitcoin" && isBitcoinCustodyEnabled()) ||
    (chainType === "solana" && isSolanaCustodyEnabled());

  if (useCustody && chainType) {
    const keyRow = db.prepare(
      "SELECT address FROM wallet_keys WHERE user_id = ? AND chain_type = ?"
    ).get(userId, chainType) as { address: string } | undefined;

    if (keyRow) {
      const addrRow = db.prepare(
        "SELECT address FROM addresses WHERE user_id = ? AND chain_id = ?"
      ).get(userId, chainId) as { address: string } | undefined;
      if (addrRow) return addrRow.address;
      const now = Date.now();
      db.prepare(
        "INSERT OR IGNORE INTO addresses (user_id, chain_id, address, created_at) VALUES (?, ?, ?, ?)"
      ).run(userId, chainId, keyRow.address, now);
      return keyRow.address;
    }

    let address: string;
    let encryptedPrivateKey: string;

    if (chainType === "evm") {
      const w = generateWallet();
      address = w.address;
      encryptedPrivateKey = w.encryptedPrivateKey;
    } else if (chainType === "bitcoin") {
      const w = generateBitcoinWallet();
      address = w.address;
      encryptedPrivateKey = w.encryptedPrivateKey;
    } else {
      const w = generateSolanaWallet();
      address = w.address;
      encryptedPrivateKey = w.encryptedPrivateKey;
    }

    const now = Date.now();
    db.prepare(
      "INSERT INTO wallet_keys (user_id, chain_type, address, encrypted_private_key, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, chainType, address, encryptedPrivateKey, now);

    if (chainType === "evm") {
      for (const c of CHAINS) {
        if (isEVMChain(c.id)) {
          db.prepare(
            "INSERT OR IGNORE INTO addresses (user_id, chain_id, address, created_at) VALUES (?, ?, ?, ?)"
          ).run(userId, c.id, address, now);
        }
      }
    } else {
      db.prepare(
        "INSERT OR IGNORE INTO addresses (user_id, chain_id, address, created_at) VALUES (?, ?, ?, ?)"
      ).run(userId, chainId, address, now);
    }
    return address;
  }

  const row = db.prepare(
    "SELECT address FROM addresses WHERE user_id = ? AND chain_id = ?"
  ).get(userId, chainId) as { address: string } | undefined;

  if (row) return row.address;

  const address = deriveAddress(userId, chainId);
  const now = Date.now();
  db.prepare(
    "INSERT OR IGNORE INTO addresses (user_id, chain_id, address, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, chainId, address, now);
  return address;
}

/** Get address only (does not create). */
export function getAddress(userId: string, chainId: string): string | null {
  const row = db.prepare(
    "SELECT address FROM addresses WHERE user_id = ? AND chain_id = ?"
  ).get(userId, chainId) as { address: string } | undefined;
  return row?.address ?? null;
}

/** Get encrypted private key for a chain type (null if not custody). */
export function getEncryptedPrivateKey(userId: string, chainType: "evm" | "bitcoin" | "solana" = "evm"): string | null {
  const row = db.prepare(
    "SELECT encrypted_private_key FROM wallet_keys WHERE user_id = ? AND chain_type = ?"
  ).get(userId, chainType) as { encrypted_private_key: string } | undefined;
  return row?.encrypted_private_key ?? null;
}
