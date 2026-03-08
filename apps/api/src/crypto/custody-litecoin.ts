/**
 * Real custody for Litecoin.
 * Uses blockstream.info Litecoin API for UTXOs and broadcast.
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const LITECOIN_NETWORK: bitcoin.Network = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const SATOSHI_PER_LTC = 100_000_000;
const FEE_RATE_SAT_PER_VB = 10;
const DUST_LIMIT = 546;

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

const LITECOIN_API = process.env.LITECOIN_API_URL || "https://blockstream.info/litecoin/api";

function getEncryptionKey(): Buffer | null {
  const secret = process.env.WALLET_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, "kanox-ltc-salt", 32);
}

export function isLitecoinCustodyEnabled(): boolean {
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

export function generateLitecoinWallet(): { address: string; encryptedPrivateKey: string } {
  const keyPair = ECPair.makeRandom({ network: LITECOIN_NETWORK });
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey!,
    network: LITECOIN_NETWORK,
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
  return ECPair.fromWIF(wif, LITECOIN_NETWORK);
}

export function getLitecoinAddressFromEncryptedKey(encryptedWif: string): string {
  const keyPair = getKeyPair(encryptedWif);
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey!,
    network: LITECOIN_NETWORK,
  });
  if (!address) throw new Error("Failed to derive address");
  return address;
}

interface Utxo {
  txid: string;
  vout: number;
  value: number;
  status?: { confirmed: boolean };
}

async function fetchUtxos(address: string): Promise<Utxo[]> {
  const res = await fetch(`${LITECOIN_API}/address/${address}/utxo`);
  if (!res.ok) return [];
  const data = (await res.json()) as Utxo[];
  return data.filter((u) => u.status?.confirmed !== false);
}

export async function getLitecoinBalance(address: string): Promise<string> {
  const res = await fetch(`${LITECOIN_API}/address/${address}`);
  if (!res.ok) return "0";
  const data = (await res.json()) as {
    chain_stats?: { funded_txo_sum: number; spent_txo_sum?: number };
    mempool_stats?: { funded_txo_sum: number; spent_txo_sum?: number };
  };
  const funded = (data.chain_stats?.funded_txo_sum ?? 0) + (data.mempool_stats?.funded_txo_sum ?? 0);
  const spent = (data.chain_stats?.spent_txo_sum ?? 0) + (data.mempool_stats?.spent_txo_sum ?? 0);
  const satoshis = Math.max(0, funded - spent);
  return (satoshis / SATOSHI_PER_LTC).toFixed(8);
}

async function fetchTxHex(txid: string): Promise<string> {
  const res = await fetch(`${LITECOIN_API}/tx/${txid}/hex`);
  if (!res.ok) throw new Error(`Failed to fetch tx ${txid}`);
  return res.text();
}

export async function sendLitecoin(
  encryptedWif: string,
  toAddress: string,
  amountLtc: number
): Promise<string> {
  const keyPair = getKeyPair(encryptedWif);
  const fromAddress = getLitecoinAddressFromEncryptedKey(encryptedWif);

  const utxos = await fetchUtxos(fromAddress);
  const amountSat = Math.round(amountLtc * SATOSHI_PER_LTC);
  if (amountSat < DUST_LIMIT) throw new Error("Amount below dust limit");

  let totalInput = 0;
  const inputs: { utxo: Utxo; nonWitnessUtxo?: Buffer }[] = [];

  for (const utxo of utxos) {
    if (totalInput >= amountSat + 50000) break;
    const txHex = await fetchTxHex(utxo.txid);
    const txBuf = Buffer.from(txHex, "hex");
    inputs.push({ utxo, nonWitnessUtxo: txBuf });
    totalInput += utxo.value;
  }

  if (totalInput < amountSat) throw new Error("Insufficient balance");

  const psbt = new bitcoin.Psbt({ network: LITECOIN_NETWORK });

  for (const { utxo, nonWitnessUtxo } of inputs) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2wpkh({
          pubkey: keyPair.publicKey!,
          network: LITECOIN_NETWORK,
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

  const broadcastRes = await fetch(`${LITECOIN_API}/tx`, {
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
