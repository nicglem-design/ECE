/**
 * Real custody for Bitcoin.
 * Generates real wallets, stores encrypted keys, signs and broadcasts transactions.
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const NETWORK = bitcoin.networks.bitcoin;
const SATOSHI_PER_BTC = 100_000_000;
const FEE_RATE_SAT_PER_VB = 10; // conservative fee
const DUST_LIMIT = 546;

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

const MEMPOOL_API = process.env.BITCOIN_API_URL || "https://mempool.space/api";

function getEncryptionKey(): Buffer | null {
  const secret = process.env.WALLET_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, "kanox-btc-salt", 32);
}

export function isBitcoinCustodyEnabled(): boolean {
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

/** Generate a new Bitcoin wallet. Returns address (native segwit) and encrypted WIF. */
export function generateBitcoinWallet(): { address: string; encryptedPrivateKey: string } {
  const keyPair = ECPair.makeRandom({ network: NETWORK });
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey!,
    network: NETWORK,
  });
  if (!address) throw new Error("Failed to derive address");
  const wif = keyPair.toWIF();
  return {
    address,
    encryptedPrivateKey: encrypt(wif),
  };
}

function getKeyPair(encryptedWif: string): ReturnType<typeof ECPair.fromWIF> {
  const wif = decrypt(encryptedWif);
  return ECPair.fromWIF(wif, NETWORK);
}

/** Get address from encrypted WIF. */
export function getBitcoinAddressFromEncryptedKey(encryptedWif: string): string {
  const keyPair = getKeyPair(encryptedWif);
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey!,
    network: NETWORK,
  });
  if (!address) throw new Error("Failed to derive address");
  return address;
}

interface Utxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

/** Fetch UTXOs for an address from mempool.space. */
async function fetchUtxos(address: string): Promise<Utxo[]> {
  const res = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
  if (!res.ok) return [];
  const data = (await res.json()) as Utxo[];
  return data.filter((u) => u.status?.confirmed);
}

/** Get balance in BTC. */
export async function getBitcoinBalance(address: string): Promise<string> {
  const res = await fetch(`${MEMPOOL_API}/address/${address}`);
  if (!res.ok) return "0";
  const data = (await res.json()) as {
    chain_stats?: { funded_txo_sum: number; spent_txo_sum?: number };
    mempool_stats?: { funded_txo_sum: number; spent_txo_sum?: number };
  };
  const funded = (data.chain_stats?.funded_txo_sum ?? 0) + (data.mempool_stats?.funded_txo_sum ?? 0);
  const spent = (data.chain_stats?.spent_txo_sum ?? 0) + (data.mempool_stats?.spent_txo_sum ?? 0);
  const satoshis = Math.max(0, funded - spent);
  return (satoshis / SATOSHI_PER_BTC).toFixed(8);
}

/** Fetch raw transaction hex for an input. */
async function fetchTxHex(txid: string): Promise<string> {
  const res = await fetch(`${MEMPOOL_API}/tx/${txid}/hex`);
  if (!res.ok) throw new Error(`Failed to fetch tx ${txid}`);
  return res.text();
}

/** Sign and broadcast a Bitcoin transaction. Returns txid. */
export async function sendBitcoin(
  encryptedWif: string,
  toAddress: string,
  amountBtc: number
): Promise<string> {
  const keyPair = getKeyPair(encryptedWif);
  const fromAddress = getBitcoinAddressFromEncryptedKey(encryptedWif);

  const utxos = await fetchUtxos(fromAddress);
  const amountSat = Math.round(amountBtc * SATOSHI_PER_BTC);
  if (amountSat < DUST_LIMIT) throw new Error("Amount below dust limit");

  let totalInput = 0;
  const inputs: { utxo: Utxo; nonWitnessUtxo?: Buffer }[] = [];

  for (const utxo of utxos) {
    if (totalInput >= amountSat + 50000) break; // leave room for fee
    const txHex = await fetchTxHex(utxo.txid);
    const txBuf = Buffer.from(txHex, "hex");
    inputs.push({ utxo, nonWitnessUtxo: txBuf });
    totalInput += utxo.value;
  }

  if (totalInput < amountSat) throw new Error("Insufficient balance");

  const psbt = new bitcoin.Psbt({ network: NETWORK });

  for (const { utxo, nonWitnessUtxo } of inputs) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2wpkh({
          pubkey: keyPair.publicKey!,
          network: NETWORK,
        }).output!,
        value: BigInt(utxo.value),
      },
      nonWitnessUtxo,
    });
  }

  psbt.addOutput({
    address: toAddress,
    value: BigInt(amountSat),
  });

  const change = totalInput - amountSat;
  const estimatedVsize = 10 + inputs.length * 68 + 31 + 32;
  const fee = Math.ceil(estimatedVsize * FEE_RATE_SAT_PER_VB);
  const changeAfterFee = change - fee;

  if (changeAfterFee >= DUST_LIMIT) {
    psbt.addOutput({
      address: fromAddress,
      value: BigInt(changeAfterFee),
    });
  }

  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  const txHex = tx.toHex();

  const broadcastRes = await fetch(`${MEMPOOL_API}/tx`, {
    method: "POST",
    body: txHex,
    headers: { "Content-Type": "text/plain" },
  });
  if (!broadcastRes.ok) {
    const err = await broadcastRes.text();
    throw new Error(err || "Broadcast failed");
  }
  return broadcastRes.text();
}
