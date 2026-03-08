import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { CHAINS } from "../chains";
import { getOrCreateAddress, getAddress, getEncryptedPrivateKey } from "../crypto/addresses";
import {
  isCustodyEnabled,
  isEVMChain,
  getChainBalance,
  sendNative,
  ERC20_CONTRACTS,
  getERC20Balance,
  sendERC20,
  estimateGasForNative,
  estimateGasForERC20,
} from "../crypto/custody";
import {
  isBitcoinCustodyEnabled,
  getBitcoinBalance,
  sendBitcoin,
} from "../crypto/custody-bitcoin";
import {
  isSolanaCustodyEnabled,
  getSolanaBalance,
  sendSolana,
} from "../crypto/custody-solana";
import {
  isLitecoinCustodyEnabled,
  getLitecoinBalance,
  sendLitecoin,
} from "../crypto/custody-litecoin";
import {
  isDogecoinCustodyEnabled,
  getDogecoinBalance,
  sendDogecoin,
} from "../crypto/custody-dogecoin";
import { syncDepositsForUser } from "../crypto/depositSync";
import { validateAddress } from "../crypto/addressValidation";
import { syncBitcoinDepositsForUser } from "../crypto/depositSync-bitcoin";
import { syncSolanaDepositsForUser } from "../crypto/depositSync-solana";
import { syncLitecoinDepositsForUser } from "../crypto/depositSync-litecoin";
import { syncDogecoinDepositsForUser } from "../crypto/depositSync-dogecoin";
import { getTxStatus } from "../crypto/txStatus";
import { require2FAIfEnabled } from "../crypto/twofaVerify";
import { parseEther } from "ethers";

const SWAP_COINS = [
  { id: "tether", symbol: "USDT", name: "Tether" },
  { id: "usd-coin", symbol: "USDC", name: "USD Coin" },
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
];

const FIAT_CURRENCIES = ["usd", "eur", "gbp", "sek"];

function isFiat(coinId: string): boolean {
  return FIAT_CURRENCIES.includes(coinId.toLowerCase());
}
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.get("/chains", (_req: Request, res: Response) => {
  res.json({ chains: CHAINS });
});

router.get("/addresses", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const addresses = await Promise.all(
    CHAINS.map(async (c) => {
      const address = await getOrCreateAddress(user.sub, c.id);
      return { chainId: c.id, address, name: c.name, symbol: c.symbol };
    })
  );
  res.json({ addresses });
});

async function ensureBalances(userId: string): Promise<void> {
  const existing = (await db.prepare("SELECT chain_id FROM balances WHERE user_id = ?").all(userId)) as { chain_id: string }[];
  if (existing.length > 0) return;
  const now = Date.now();
  const insert = db.prepare(
    "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const c of CHAINS) {
    const initialAmount = ["ethereum", "bitcoin", "solana"].includes(c.id) ? 0.01 : 0;
    await insert.run(userId, c.id, c.symbol, c.name, initialAmount, now);
  }
  await insert.run(userId, "tether", "USDT", "Tether", 1000, now);
}

router.get("/balances", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  await ensureBalances(user.sub);
  const rows = (await db.prepare(
    "SELECT chain_id as chainId, symbol, name, amount FROM balances WHERE user_id = ?"
  ).all(user.sub)) as { chainId: string; symbol: string; name: string; amount: number }[];

  if (isCustodyEnabled()) {
    const addr = await getOrCreateAddress(user.sub, "ethereum");
    for (const c of ["ethereum", "binancecoin", "matic-network", "avalanche-2"]) {
      syncDepositsForUser(user.sub, c, addr).catch(() => {});
    }
  }
  if (isBitcoinCustodyEnabled()) {
    const addr = await getOrCreateAddress(user.sub, "bitcoin");
    syncBitcoinDepositsForUser(user.sub, addr).catch(() => {});
  }
  if (isSolanaCustodyEnabled()) {
    const addr = await getOrCreateAddress(user.sub, "solana");
    syncSolanaDepositsForUser(user.sub, addr).catch(() => {});
  }
  if (isLitecoinCustodyEnabled()) {
    const addr = await getOrCreateAddress(user.sub, "litecoin");
    syncLitecoinDepositsForUser(user.sub, addr).catch(() => {});
  }
  if (isDogecoinCustodyEnabled()) {
    const addr = await getOrCreateAddress(user.sub, "dogecoin");
    syncDogecoinDepositsForUser(user.sub, addr).catch(() => {});
  }

  const assets = rows.map((r) => ({
    chainId: r.chainId,
    symbol: r.symbol,
    name: r.name,
    amount: String(r.amount),
  }));
  res.json({ assets });
});

/** GET /estimate-gas - Estimate gas fee for EVM send (native or ERC20). */
router.get("/estimate-gas", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { chainId, toAddress, amount, tokenId, evmChainId } = req.query;
  const chain = String(chainId || "");
  const to = String(toAddress || "").trim();
  const amt = parseFloat(String(amount || "0"));
  const effectiveTokenId = tokenId ? String(tokenId) : (["tether", "usd-coin"].includes(chain) ? chain : null);
  const effectiveEvmChain = (evmChainId as string) || "ethereum";

  if (!chain || !to || !isFinite(amt) || amt <= 0) {
    res.status(400).json({ message: "chainId, toAddress, and amount required" });
    return;
  }
  if (!isEVMChain(chain) && !effectiveTokenId) {
    res.json({ supported: false });
    return;
  }

  try {
    if (effectiveTokenId && ERC20_CONTRACTS[effectiveEvmChain]?.[effectiveTokenId]) {
      const contract = ERC20_CONTRACTS[effectiveEvmChain][effectiveTokenId];
      const est = await estimateGasForERC20(effectiveEvmChain, contract, to, String(amt));
      const symbol = effectiveEvmChain === "ethereum" ? "ETH" : effectiveEvmChain === "binancecoin" ? "BNB" : effectiveEvmChain === "matic-network" ? "MATIC" : "AVAX";
      res.json({ ...est, feeSymbol: symbol, supported: true });
    } else if (isEVMChain(chain)) {
      const amountWei = parseEther(String(amt));
      const est = await estimateGasForNative(chain, to, amountWei);
      const symbol = chain === "ethereum" ? "ETH" : chain === "binancecoin" ? "BNB" : chain === "matic-network" ? "MATIC" : "AVAX";
      res.json({ ...est, feeSymbol: symbol, supported: true });
    } else {
      res.json({ supported: false });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Estimation failed";
    res.status(400).json({ message: msg });
  }
});

router.post("/send", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { chainId, toAddress, amount, tokenId, evmChainId, totpCode } = req.body;
  const twofaCheck = await require2FAIfEnabled(user.sub, totpCode);
  if (!twofaCheck.ok) {
    res.status(400).json({ message: twofaCheck.error, code: "2FA_REQUIRED" });
    return;
  }
  if (!chainId || !toAddress || !amount) {
    res.status(400).json({ message: "chainId, toAddress, and amount required" });
    return;
  }
  const effectiveTokenId = tokenId || (["tether", "usd-coin"].includes(chainId) ? chainId : null);
  const effectiveEvmChain = evmChainId || "ethereum";
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ message: "Invalid amount" });
    return;
  }
  const chain = CHAINS.find((c) => c.id === chainId) || SWAP_COINS.find((c) => c.id === chainId);
  const validation = validateAddress(chainId, toAddress);
  if (!validation.valid) {
    res.status(400).json({ message: validation.error || "Invalid address" });
    return;
  }
  if (!chain) {
    res.status(400).json({ message: "Unsupported chain" });
    return;
  }
  const myAddress = await getOrCreateAddress(user.sub, effectiveEvmChain);

  if (effectiveTokenId && ERC20_CONTRACTS[effectiveEvmChain]?.[effectiveTokenId] && isCustodyEnabled()) {
    const encKey = await getEncryptedPrivateKey(user.sub, "evm");
    if (!encKey) {
      res.status(400).json({ message: "Wallet not initialized" });
      return;
    }
    const tokenContract = ERC20_CONTRACTS[effectiveEvmChain][effectiveTokenId];
    try {
      const chainBal = await getERC20Balance(effectiveEvmChain, tokenContract, myAddress);
      if (parseFloat(chainBal) < numAmount) {
        res.status(400).json({ message: "Insufficient balance" });
        return;
      }
      const txHash = await sendERC20(effectiveEvmChain, encKey, tokenContract, toAddress.trim(), String(numAmount));
      const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const now = Date.now();
      await db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(numAmount, now, user.sub, chainId);
      await db.prepare(
        "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(txId, user.sub, chainId, "sent", String(numAmount), myAddress, toAddress.trim(), txHash, now);
      res.json({ success: true, txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      res.status(400).json({ message: msg });
    }
    return;
  }

  const useEvmCustody = isEVMChain(chainId) && isCustodyEnabled();
  const useBtcCustody = chainId === "bitcoin" && isBitcoinCustodyEnabled();
  const useSolCustody = chainId === "solana" && isSolanaCustodyEnabled();
  const useLtcCustody = chainId === "litecoin" && isLitecoinCustodyEnabled();
  const useDogeCustody = chainId === "dogecoin" && isDogecoinCustodyEnabled();

  if (useEvmCustody) {
    const encKey = await getEncryptedPrivateKey(user.sub, "evm");
    if (!encKey) {
      res.status(400).json({ message: "Wallet not initialized" });
      return;
    }
    try {
      const chainBal = await getChainBalance(chainId, myAddress);
      if (parseFloat(chainBal) < numAmount) {
        res.status(400).json({ message: "Insufficient balance" });
        return;
      }
      const amountWei = parseEther(String(numAmount));
      const txHash = await sendNative(chainId, encKey, toAddress.trim(), amountWei);
      const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const now = Date.now();
      await db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(numAmount, now, user.sub, chainId);
      await db.prepare(
        "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(txId, user.sub, chainId, "sent", String(numAmount), myAddress, toAddress.trim(), txHash, now);
      res.json({ success: true, txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      res.status(400).json({ message: msg });
    }
    return;
  }

  if (useBtcCustody) {
    const encKey = await getEncryptedPrivateKey(user.sub, "bitcoin");
    if (!encKey) {
      res.status(400).json({ message: "Wallet not initialized" });
      return;
    }
    try {
      const chainBal = await getBitcoinBalance(myAddress);
      if (parseFloat(chainBal) < numAmount) {
        res.status(400).json({ message: "Insufficient balance" });
        return;
      }
      const txHash = await sendBitcoin(encKey, toAddress.trim(), numAmount);
      const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const now = Date.now();
      await db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(numAmount, now, user.sub, chainId);
      await db.prepare(
        "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(txId, user.sub, chainId, "sent", String(numAmount), myAddress, toAddress.trim(), txHash, now);
      res.json({ success: true, txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      res.status(400).json({ message: msg });
    }
    return;
  }

  if (useSolCustody) {
    const encKey = await getEncryptedPrivateKey(user.sub, "solana");
    if (!encKey) {
      res.status(400).json({ message: "Wallet not initialized" });
      return;
    }
    try {
      const chainBal = await getSolanaBalance(myAddress);
      if (parseFloat(chainBal) < numAmount) {
        res.status(400).json({ message: "Insufficient balance" });
        return;
      }
      const txHash = await sendSolana(encKey, toAddress.trim(), numAmount);
      const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const now = Date.now();
      await db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(numAmount, now, user.sub, chainId);
      await db.prepare(
        "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(txId, user.sub, chainId, "sent", String(numAmount), myAddress, toAddress.trim(), txHash, now);
      res.json({ success: true, txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      res.status(400).json({ message: msg });
    }
    return;
  }

  if (useLtcCustody) {
    const encKey = await getEncryptedPrivateKey(user.sub, "litecoin");
    if (!encKey) {
      res.status(400).json({ message: "Wallet not initialized" });
      return;
    }
    const ltcAddr = await getOrCreateAddress(user.sub, "litecoin");
    try {
      const chainBal = await getLitecoinBalance(ltcAddr);
      if (parseFloat(chainBal) < numAmount) {
        res.status(400).json({ message: "Insufficient balance" });
        return;
      }
      const txHash = await sendLitecoin(encKey, toAddress.trim(), numAmount);
      const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const now = Date.now();
      await db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(numAmount, now, user.sub, chainId);
      await db.prepare(
        "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(txId, user.sub, chainId, "sent", String(numAmount), ltcAddr, toAddress.trim(), txHash, now);
      res.json({ success: true, txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      res.status(400).json({ message: msg });
    }
    return;
  }

  if (useDogeCustody) {
    const encKey = await getEncryptedPrivateKey(user.sub, "dogecoin");
    if (!encKey) {
      res.status(400).json({ message: "Wallet not initialized" });
      return;
    }
    const dogeAddr = await getOrCreateAddress(user.sub, "dogecoin");
    try {
      const chainBal = await getDogecoinBalance(dogeAddr);
      if (parseFloat(chainBal) < numAmount) {
        res.status(400).json({ message: "Insufficient balance" });
        return;
      }
      const txHash = await sendDogecoin(encKey, toAddress.trim(), numAmount);
      const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
      const now = Date.now();
      await db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(numAmount, now, user.sub, chainId);
      await db.prepare(
        "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(txId, user.sub, chainId, "sent", String(numAmount), dogeAddr, toAddress.trim(), txHash, now);
      res.json({ success: true, txHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      res.status(400).json({ message: msg });
    }
    return;
  }

  await ensureBalances(user.sub);
  const balance = (await db.prepare(
    "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
  ).get(user.sub, chainId)) as { amount: number } | undefined;
  if (!balance || balance.amount < numAmount) {
    res.status(400).json({ message: "Insufficient balance" });
    return;
  }
  const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
  const txHash = `0x${Buffer.from(txId).toString("hex").slice(0, 64)}`;
  const now = Date.now();
  await db.prepare(
    "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
  ).run(numAmount, now, user.sub, chainId);
  await db.prepare(
    "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, chainId, "sent", String(numAmount), myAddress, toAddress.trim(), txHash, now);
  res.json({ success: true, txHash });
});

/** POST /sync-deposits - Sync incoming deposits from chain. Call periodically (cron). */
router.post("/sync-deposits", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  let total = 0;
  const rows = (await db.prepare(
    "SELECT chain_id as chainId, address FROM addresses WHERE user_id = ?"
  ).all(user.sub)) as { chainId: string; address: string }[];
  for (const r of rows) {
    if (isEVMChain(r.chainId)) {
      total += await syncDepositsForUser(user.sub, r.chainId, r.address);
    }
    if (r.chainId === "bitcoin") {
      total += await syncBitcoinDepositsForUser(user.sub, r.address);
    }
    if (r.chainId === "solana") {
      total += await syncSolanaDepositsForUser(user.sub, r.address);
    }
    if (r.chainId === "litecoin") {
      total += await syncLitecoinDepositsForUser(user.sub, r.address);
    }
    if (r.chainId === "dogecoin") {
      total += await syncDogecoinDepositsForUser(user.sub, r.address);
    }
  }
  res.json({ success: true, newDeposits: total });
});

/** GET /transactions/:chainId/status/:txHash - Poll tx confirmation status */
router.get("/transactions/:chainId/status/:txHash", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { chainId, txHash } = req.params;
  if (!chainId || !txHash) {
    res.status(400).json({ message: "chainId and txHash required" });
    return;
  }
  const row = await db.prepare(
    "SELECT 1 FROM transactions WHERE user_id = ? AND chain_id = ? AND tx_hash = ?"
  ).get(user.sub, chainId, txHash);
  if (!row) {
    res.status(404).json({ message: "Transaction not found" });
    return;
  }
  try {
    const status = await getTxStatus(chainId, txHash);
    res.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch status";
    res.status(500).json({ status: "unknown", error: msg });
  }
});

router.get("/transactions/:chainId", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { chainId } = req.params;
  const rows = (await db.prepare(
    "SELECT type, amount, from_address as fromAddress, to_address as toAddress, tx_hash as txHash, created_at as createdAt FROM transactions WHERE user_id = ? AND chain_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(user.sub, chainId)) as { type: string; amount: string; fromAddress: string; toAddress: string; txHash: string; createdAt: number }[];
  const transactions = rows.map((r) => ({
    type: r.type as "sent" | "received",
    amount: r.amount,
    from: r.fromAddress,
    to: r.toAddress,
    txHash: r.txHash,
    timestamp: new Date(r.createdAt).toISOString(),
  }));
  const explorerTx =
    chainId === "ethereum"
      ? "https://etherscan.io/tx/"
      : chainId === "bitcoin"
        ? "https://mempool.space/tx/"
        : chainId === "solana"
          ? "https://solscan.io/tx/"
          : chainId === "binancecoin"
            ? "https://bscscan.com/tx/"
            : chainId === "matic-network"
              ? "https://polygonscan.com/tx/"
              : chainId === "avalanche-2"
                ? "https://snowtrace.io/tx/"
                : chainId === "litecoin"
                  ? "https://blockstream.info/litecoin/tx/"
                  : chainId === "dogecoin"
                    ? "https://blockchair.com/dogecoin/transaction/"
                    : "";
  res.json({ transactions, explorerTx });
});

router.post("/deposit", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { chainId, amount } = req.body;
  if (!chainId || !amount) {
    res.status(400).json({ message: "chainId and amount required" });
    return;
  }
  const numAmount = parseFloat(String(amount));
  if (isNaN(numAmount) || numAmount <= 0 || numAmount > 10000) {
    res.status(400).json({ message: "Amount must be between 0 and 10000" });
    return;
  }
  await ensureBalances(user.sub);
  const chain = CHAINS.find((c) => c.id === chainId) || SWAP_COINS.find((c) => c.id === chainId);
  if (!chain) {
    res.status(400).json({ message: "Unsupported chain" });
    return;
  }
  const now = Date.now();
  const row = (await db.prepare("SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?").get(user.sub, chainId)) as { amount: number } | undefined;
  if (row) {
    await db.prepare("UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?").run(numAmount, now, user.sub, chainId);
  } else {
    await db.prepare(
      "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(user.sub, chainId, chain.symbol, chain.name, numAmount, now);
  }
  const txId = `dep_${Date.now()}_${uuidv4().slice(0, 8)}`;
  const addr = await getOrCreateAddress(user.sub, chainId);
  await db.prepare(
    "INSERT INTO transactions (id, user_id, chain_id, type, amount, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, chainId, "received", String(numAmount), addr, `0x${txId}`, now);
  res.json({ success: true, amount: numAmount });
});

router.post("/swap-execution", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { fromCoinId, toCoinId, fromAmount, toAmount } = req.body;
  if (!fromCoinId || !toCoinId || fromAmount == null || toAmount == null) {
    res.status(400).json({ message: "fromCoinId, toCoinId, fromAmount, toAmount required" });
    return;
  }
  const fromAmt = parseFloat(String(fromAmount));
  const toAmt = parseFloat(String(toAmount));
  if (isNaN(fromAmt) || isNaN(toAmt) || fromAmt < 0 || toAmt < 0) {
    res.status(400).json({ message: "Invalid amounts" });
    return;
  }
  await ensureBalances(user.sub);
  if (isCustodyEnabled()) {
    const addr = await getOrCreateAddress(user.sub, "ethereum");
    for (const c of ["ethereum", "binancecoin", "matic-network", "avalanche-2"]) {
      syncDepositsForUser(user.sub, c, addr).catch(() => {});
    }
  }
  if (isBitcoinCustodyEnabled()) {
    syncBitcoinDepositsForUser(user.sub, await getOrCreateAddress(user.sub, "bitcoin")).catch(() => {});
  }
  if (isSolanaCustodyEnabled()) {
    syncSolanaDepositsForUser(user.sub, await getOrCreateAddress(user.sub, "solana")).catch(() => {});
  }
  if (isLitecoinCustodyEnabled()) {
    syncLitecoinDepositsForUser(user.sub, await getOrCreateAddress(user.sub, "litecoin")).catch(() => {});
  }
  if (isDogecoinCustodyEnabled()) {
    syncDogecoinDepositsForUser(user.sub, await getOrCreateAddress(user.sub, "dogecoin")).catch(() => {});
  }
  const fromChain = CHAINS.find((c) => c.id === fromCoinId) || SWAP_COINS.find((c) => c.id === fromCoinId) || { id: fromCoinId, symbol: fromCoinId.toUpperCase().slice(0, 4), name: fromCoinId };
  const toChain = CHAINS.find((c) => c.id === toCoinId) || SWAP_COINS.find((c) => c.id === toCoinId) || { id: toCoinId, symbol: toCoinId.toUpperCase().slice(0, 4), name: toCoinId };
  const now = Date.now();
  const updateBalance = db.prepare(
    "UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
  );
  const getBalance = db.prepare(
    "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
  );

  const fromFiat = isFiat(fromCoinId);
  const fiatCurrency = fromFiat ? fromCoinId.toUpperCase() : null;

  if (fromFiat) {
    const fiatRow = (await db.prepare(
      "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
    ).get(user.sub, fiatCurrency)) as { amount: number } | undefined;
    if (!fiatRow || fiatRow.amount < fromAmt) {
      res.status(400).json({ message: "Insufficient fiat balance" });
      return;
    }
    await db.prepare(
      "UPDATE fiat_balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND currency = ?"
    ).run(fromAmt, now, user.sub, fiatCurrency);
  } else {
    const fromBal = (await getBalance.get(user.sub, fromChain.id)) as { amount: number } | undefined;
    if (fromBal && fromBal.amount < fromAmt) {
      res.status(400).json({ message: "Insufficient balance" });
      return;
    }
    if (fromBal) {
      await db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(fromAmt, now, user.sub, fromChain.id);
    } else {
      await db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(user.sub, fromChain.id, fromChain.symbol, fromChain.name, -fromAmt, now);
    }
  }
  const toFiat = isFiat(toCoinId);
  const toFiatCurrency = toFiat ? toCoinId.toUpperCase() : null;

  if (toFiat) {
    const fiatRow = (await db.prepare(
      "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
    ).get(user.sub, toFiatCurrency)) as { amount: number } | undefined;
    if (fiatRow) {
      await db.prepare(
        "UPDATE fiat_balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND currency = ?"
      ).run(toAmt, now, user.sub, toFiatCurrency);
    } else {
      await db.prepare(
        "INSERT INTO fiat_balances (user_id, currency, amount, updated_at) VALUES (?, ?, ?, ?)"
      ).run(user.sub, toFiatCurrency, toAmt, now);
    }
  } else {
    const toBal = (await getBalance.get(user.sub, toChain.id)) as { amount: number } | undefined;
    if (toBal) {
      await updateBalance.run(toAmt, now, user.sub, toChain.id);
    } else {
      await db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(user.sub, toChain.id, toChain.symbol, toChain.name, toAmt, now);
    }
  }
  res.json({ success: true });
});

export default router;
