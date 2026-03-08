/**
 * Real custody for EVM chains (Ethereum, BNB, Polygon, Avalanche).
 * Generates real wallets, stores encrypted keys, signs and broadcasts transactions.
 */

import { Wallet, JsonRpcProvider, formatEther, parseEther } from "ethers";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const EVM_CHAINS: Record<string, string> = {
  ethereum: process.env.ETH_RPC_URL || process.env.ETHEREUM_RPC_URL || "https://eth.llamarpc.com",
  binancecoin: process.env.BNB_RPC_URL || "https://bsc-dataseed.binance.org",
  "matic-network": process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
  "avalanche-2": process.env.AVAX_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
};

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const SALT_LEN = 32;
const KEY_LEN = 32;

function getEncryptionKey(): Buffer | null {
  const secret = process.env.WALLET_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  return scryptSync(secret, "kanox-wallet-salt", 32);
}

export function isCustodyEnabled(): boolean {
  const key = getEncryptionKey();
  return !!key && !!EVM_CHAINS.ethereum;
}

export function isEVMChain(chainId: string): boolean {
  return chainId in EVM_CHAINS;
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

/** Generate a new Ethereum wallet. Returns address and encrypted private key. */
export function generateWallet(): { address: string; encryptedPrivateKey: string } {
  const wallet = Wallet.createRandom();
  return {
    address: wallet.address,
    encryptedPrivateKey: encrypt(wallet.privateKey),
  };
}

/** Get wallet from encrypted key. */
function getWallet(encryptedPrivateKey: string): Wallet {
  const privateKey = decrypt(encryptedPrivateKey);
  return new Wallet(privateKey);
}

/** Get address from encrypted key without full wallet. */
export function getAddressFromEncryptedKey(encryptedPrivateKey: string): string {
  return getWallet(encryptedPrivateKey).address;
}

/** Get real balance from chain (in ETH/BNB/etc). */
export async function getChainBalance(chainId: string, address: string): Promise<string> {
  const rpc = EVM_CHAINS[chainId];
  if (!rpc) throw new Error(`No RPC for chain ${chainId}`);
  const provider = new JsonRpcProvider(rpc);
  const balance = await provider.getBalance(address);
  return formatEther(balance);
}

/** Sign and broadcast a native token transfer. Returns tx hash. */
export async function sendNative(
  chainId: string,
  encryptedPrivateKey: string,
  toAddress: string,
  amountWei: bigint
): Promise<string> {
  const rpc = EVM_CHAINS[chainId];
  if (!rpc) throw new Error(`No RPC for chain ${chainId}`);
  const provider = new JsonRpcProvider(rpc);
  const wallet = getWallet(encryptedPrivateKey).connect(provider);
  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: amountWei,
  });
  return tx.hash;
}

/** Get the RPC URL for an EVM chain. */
export function getEVMRpcUrl(chainId: string): string | null {
  return EVM_CHAINS[chainId] || null;
}

/** ERC20 token contract addresses per chain (USDT, USDC). */
export const ERC20_CONTRACTS: Record<string, Record<string, string>> = {
  ethereum: {
    tether: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "usd-coin": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  binancecoin: {
    tether: "0x55d398326f99059fF775485246999027B3197955",
    "usd-coin": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  },
  "matic-network": {
    tether: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    "usd-coin": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  "avalanche-2": {
    tether: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    "usd-coin": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  },
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

/** Get ERC20 token balance (human-readable, e.g. "1000.5"). */
export async function getERC20Balance(
  chainId: string,
  tokenContract: string,
  address: string
): Promise<string> {
  const rpc = EVM_CHAINS[chainId];
  if (!rpc) throw new Error(`No RPC for chain ${chainId}`);
  const provider = new JsonRpcProvider(rpc);
  const contract = new (await import("ethers")).Contract(tokenContract, ERC20_ABI, provider);
  const [balance, decimals] = await Promise.all([
    contract.balanceOf(address),
    contract.decimals(),
  ]);
  const divisor = 10 ** Number(decimals);
  return (Number(balance) / divisor).toFixed(6);
}

/** Estimate gas cost for native transfer (in ETH/BNB/etc). Returns { gasWei, gasPriceGwei, feeEth }. */
export async function estimateGasForNative(
  chainId: string,
  toAddress: string,
  amountWei: bigint
): Promise<{ gasWei: string; gasPriceGwei: string; feeEth: string }> {
  const rpc = EVM_CHAINS[chainId];
  if (!rpc) throw new Error(`No RPC for chain ${chainId}`);
  const provider = new JsonRpcProvider(rpc);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? BigInt(20e9);
  const gasLimit = 21000n;
  const feeWei = gasLimit * gasPrice;
  return {
    gasWei: gasLimit.toString(),
    gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(2),
    feeEth: formatEther(feeWei),
  };
}

/** Estimate gas cost for ERC20 transfer. Returns { gasWei, gasPriceGwei, feeEth }. */
export async function estimateGasForERC20(
  chainId: string,
  tokenContract: string,
  toAddress: string,
  amountHuman: string,
  decimals: number = 6
): Promise<{ gasWei: string; gasPriceGwei: string; feeEth: string }> {
  const rpc = EVM_CHAINS[chainId];
  if (!rpc) throw new Error(`No RPC for chain ${chainId}`);
  const provider = new JsonRpcProvider(rpc);
  const { Contract, formatEther } = await import("ethers");
  const contract = new Contract(tokenContract, ERC20_ABI, provider);
  const amountWei = BigInt(Math.round(parseFloat(amountHuman) * 10 ** decimals));
  const gasLimit = await contract.transfer.estimateGas(toAddress, amountWei);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? BigInt(20e9);
  const feeWei = gasLimit * gasPrice;
  return {
    gasWei: gasLimit.toString(),
    gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(2),
    feeEth: formatEther(feeWei),
  };
}

/** Sign and broadcast ERC20 transfer. Returns tx hash. */
export async function sendERC20(
  chainId: string,
  encryptedPrivateKey: string,
  tokenContract: string,
  toAddress: string,
  amountHuman: string,
  decimals: number = 6
): Promise<string> {
  const rpc = EVM_CHAINS[chainId];
  if (!rpc) throw new Error(`No RPC for chain ${chainId}`);
  const provider = new JsonRpcProvider(rpc);
  const { Contract } = await import("ethers");
  const contract = new Contract(tokenContract, ERC20_ABI, getWallet(encryptedPrivateKey).connect(provider));
  const amountWei = BigInt(Math.round(parseFloat(amountHuman) * 10 ** decimals));
  const tx = await contract.transfer(toAddress, amountWei);
  return tx.hash;
}
