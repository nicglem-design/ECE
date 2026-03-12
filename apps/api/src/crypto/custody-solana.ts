/**
 * Real custody for Solana.
 * Generates real wallets, stores encrypted keys, signs and broadcasts transactions.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import bs58 from "bs58";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

function getEncryptionKey(): Buffer | null {
  const secret =
    process.env.WALLET_ENCRYPTION_KEY ||
    (process.env.NODE_ENV !== "production" ? process.env.JWT_SECRET : null);
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, "kanox-sol-salt", 32);
}

export function isSolanaCustodyEnabled(): boolean {
  return !!getEncryptionKey();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error("Encryption key not configured");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  if (!key) throw new Error("Encryption key not configured");
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/** Generate a new Solana wallet. Returns address and encrypted base58 secret key. */
export function generateSolanaWallet(): { address: string; encryptedPrivateKey: string } {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const secretBase58 = bs58.encode(keypair.secretKey);
  return {
    address,
    encryptedPrivateKey: encrypt(secretBase58),
  };
}

function getKeypair(encryptedSecret: string): Keypair {
  const secretBase58 = decrypt(encryptedSecret);
  const secret = bs58.decode(secretBase58);
  return Keypair.fromSecretKey(secret);
}

/** Get address from encrypted key. */
export function getSolanaAddressFromEncryptedKey(encryptedSecret: string): string {
  return getKeypair(encryptedSecret).publicKey.toBase58();
}

/** Get SOL balance. */
export async function getSolanaBalance(address: string): Promise<string> {
  const connection = new Connection(RPC_URL);
  const pubkey = new PublicKey(address);
  const balance = await connection.getBalance(pubkey);
  return (balance / LAMPORTS_PER_SOL).toFixed(9);
}

/** Sign and broadcast SOL transfer. Returns signature. */
export async function sendSolana(
  encryptedSecret: string,
  toAddress: string,
  amountSol: number
): Promise<string> {
  const keypair = getKeypair(encryptedSecret);
  const connection = new Connection(RPC_URL);
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  if (lamports <= 0) throw new Error("Invalid amount");

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(toAddress),
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return signature;
}
