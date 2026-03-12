/**
 * Real custody for Dogecoin.
 * Uses BlockCypher API for UTXOs and broadcast.
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const DOGECOIN_NETWORK: bitcoin.Network = {
  messagePrefix: "\x19Dogecoin Signed Message:\n",
  bech32: "doge",
  bip32: { public: 0x02facafd, private: 0x02fac398 },
  pubKeyHash: 0x1e,
  scriptHash: 0x16,
  wif: 0x9e,
};

const SATOSHI_PER_DOGE = 100_000_000;
const FEE_RATE_SAT_PER_VB = 1000; // ~0.001 DOGE per vB
const DUST_LIMIT = 1000000; // 0.01 DOGE

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

const DOGECOIN_API = process.env.DOGECOIN_API_URL || "https://api.blockcypher.com/v1/doge/main";

function getEncryptionKey(): Buffer | null {
  const secret =
    process.env.WALLET_ENCRYPTION_KEY ||
    (process.env.NODE_ENV !== "production" ? process.env.JWT_SECRET : null);
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, "kanox-doge-salt", 32);
}

export function isDogecoinCustodyEnabled(): boolean {
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

export function generateDogecoinWallet(): { address: string; encryptedPrivateKey: string } {
  const keyPair = ECPair.makeRandom({ network: DOGECOIN_NETWORK });
  const { address } = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey!,
    network: DOGECOIN_NETWORK,
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
  return ECPair.fromWIF(wif, DOGECOIN_NETWORK);
}

export function getDogecoinAddressFromEncryptedKey(encryptedWif: string): string {
  const keyPair = getKeyPair(encryptedWif);
  const { address } = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey!,
    network: DOGECOIN_NETWORK,
  });
  if (!address) throw new Error("Failed to derive address");
  return address;
}

interface BlockCypherTxRef {
  tx_hash: string;
  tx_output_n: number;
  value: number;
  confirmations?: number;
  double_spend?: boolean;
}

interface BlockCypherAddress {
  txrefs?: BlockCypherTxRef[];
}

async function fetchUtxos(address: string): Promise<BlockCypherTxRef[]> {
  const res = await fetch(`${DOGECOIN_API}/addrs/${address}?unspentOnly=true`);
  if (!res.ok) return [];
  const data = (await res.json()) as BlockCypherAddress;
  const refs = data.txrefs ?? [];
  return refs.filter((r) => (r.confirmations ?? 0) > 0 && !r.double_spend);
}

export async function getDogecoinBalance(address: string): Promise<string> {
  const res = await fetch(`${DOGECOIN_API}/addrs/${address}/balance`);
  if (!res.ok) return "0";
  const data = (await res.json()) as { balance: number };
  const satoshis = data.balance ?? 0;
  return (satoshis / SATOSHI_PER_DOGE).toFixed(8);
}

async function fetchTxHex(txHash: string): Promise<string> {
  const res = await fetch(`${DOGECOIN_API}/txs/${txHash}?includeHex=true`);
  if (!res.ok) throw new Error(`Failed to fetch tx ${txHash}`);
  const data = (await res.json()) as { hex?: string };
  return data.hex ?? "";
}

export async function sendDogecoin(
  encryptedWif: string,
  toAddress: string,
  amountDoge: number
): Promise<string> {
  const keyPair = getKeyPair(encryptedWif);
  const fromAddress = getDogecoinAddressFromEncryptedKey(encryptedWif);

  const refs = await fetchUtxos(fromAddress);
  const amountSat = Math.round(amountDoge * SATOSHI_PER_DOGE);
  if (amountSat < DUST_LIMIT) throw new Error("Amount below dust limit (min 0.01 DOGE)");

  let totalInput = 0;
  const inputs: { ref: BlockCypherTxRef; nonWitnessUtxo?: Buffer }[] = [];

  for (const ref of refs) {
    if (totalInput >= amountSat + 10000000) break;
    const txHex = await fetchTxHex(ref.tx_hash);
    if (!txHex) continue;
    const txBuf = Buffer.from(txHex, "hex");
    inputs.push({ ref, nonWitnessUtxo: txBuf });
    totalInput += ref.value;
  }

  if (totalInput < amountSat) throw new Error("Insufficient balance");

  const psbt = new bitcoin.Psbt({ network: DOGECOIN_NETWORK });

  for (const { ref, nonWitnessUtxo } of inputs) {
    psbt.addInput({
      hash: ref.tx_hash,
      index: ref.tx_output_n,
      witnessUtxo: {
        script: bitcoin.payments.p2pkh({
          pubkey: keyPair.publicKey!,
          network: DOGECOIN_NETWORK,
        }).output!,
        value: BigInt(ref.value),
      },
      nonWitnessUtxo,
    });
  }

  psbt.addOutput({
    address: toAddress,
    value: BigInt(amountSat),
  });

  const change = totalInput - amountSat;
  const estimatedVsize = 10 + inputs.length * 148 + 34 + 34;
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

  const broadcastRes = await fetch(`${DOGECOIN_API}/txs/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx: txHex }),
  });
  if (!broadcastRes.ok) {
    const err = await broadcastRes.text();
    throw new Error(err || "Broadcast failed");
  }
  const result = (await broadcastRes.json()) as { tx?: { hash?: string }; hash?: string };
  const hash = result.tx?.hash ?? result.hash;
  if (hash) return hash;
  throw new Error("Failed to get transaction hash from explorer");
}
