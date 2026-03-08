import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { CHAINS, deriveAddress } from "../chains";

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

router.get("/addresses", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const rows = db.prepare("SELECT chain_id as chainId, address FROM addresses WHERE user_id = ?").all(user.sub) as { chainId: string; address: string }[];
  if (rows.length === 0) {
    const addresses = CHAINS.map((c) => ({
      chainId: c.id,
      address: deriveAddress(user.sub, c.id),
      name: c.name,
      symbol: c.symbol,
    }));
    const insert = db.prepare("INSERT OR IGNORE INTO addresses (user_id, chain_id, address, created_at) VALUES (?, ?, ?, ?)");
    const now = Date.now();
    for (const a of addresses) {
      insert.run(user.sub, a.chainId, a.address, now);
    }
    res.json({ addresses });
    return;
  }
  const addresses = rows.map((r) => {
    const chain = CHAINS.find((c) => c.id === r.chainId);
    return {
      chainId: r.chainId,
      address: r.address,
      name: chain?.name || r.chainId,
      symbol: chain?.symbol || r.chainId,
    };
  });
  res.json({ addresses });
});

function ensureBalances(userId: string): void {
  const existing = db.prepare("SELECT chain_id FROM balances WHERE user_id = ?").all(userId) as { chain_id: string }[];
  if (existing.length > 0) return;
  const now = Date.now();
  const insert = db.prepare(
    "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const c of CHAINS) {
    const initialAmount = ["ethereum", "bitcoin", "solana"].includes(c.id) ? 0.01 : 0;
    insert.run(userId, c.id, c.symbol, c.name, initialAmount, now);
  }
  insert.run(userId, "tether", "USDT", "Tether", 1000, now);
}

router.get("/balances", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  ensureBalances(user.sub);
  const rows = db.prepare(
    "SELECT chain_id as chainId, symbol, name, amount FROM balances WHERE user_id = ?"
  ).all(user.sub) as { chainId: string; symbol: string; name: string; amount: number }[];
  const assets = rows.map((r) => ({
    chainId: r.chainId,
    symbol: r.symbol,
    name: r.name,
    amount: String(r.amount),
  }));
  res.json({ assets });
});

router.post("/send", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { chainId, toAddress, amount } = req.body;
  if (!chainId || !toAddress || !amount) {
    res.status(400).json({ message: "chainId, toAddress, and amount required" });
    return;
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ message: "Invalid amount" });
    return;
  }
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) {
    res.status(400).json({ message: "Unsupported chain" });
    return;
  }
  ensureBalances(user.sub);
  const balance = db.prepare(
    "SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?"
  ).get(user.sub, chainId) as { amount: number } | undefined;
  if (!balance || balance.amount < numAmount) {
    res.status(400).json({ message: "Insufficient balance" });
    return;
  }
  const txId = `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
  const txHash = `0x${Buffer.from(txId).toString("hex").slice(0, 64)}`;
  const now = Date.now();
  const myAddress = deriveAddress(user.sub, chainId);
  db.prepare(
    "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
  ).run(numAmount, now, user.sub, chainId);
  db.prepare(
    "INSERT INTO transactions (id, user_id, chain_id, type, amount, from_address, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, chainId, "sent", String(numAmount), myAddress, toAddress.trim(), txHash, now);
  res.json({ success: true, txHash });
});

router.get("/transactions/:chainId", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { chainId } = req.params;
  const rows = db.prepare(
    "SELECT type, amount, from_address as fromAddress, to_address as toAddress, tx_hash as txHash, created_at as createdAt FROM transactions WHERE user_id = ? AND chain_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(user.sub, chainId) as { type: string; amount: string; fromAddress: string; toAddress: string; txHash: string; createdAt: number }[];
  const transactions = rows.map((r) => ({
    type: r.type as "sent" | "received",
    amount: r.amount,
    from: r.fromAddress,
    to: r.toAddress,
    txHash: r.txHash,
    timestamp: new Date(r.createdAt).toISOString(),
  }));
  const explorerTx = chainId === "ethereum" ? "https://etherscan.io/tx/" : chainId === "bitcoin" ? "https://mempool.space/tx/" : "";
  res.json({ transactions, explorerTx });
});

router.post("/deposit", authMiddleware, (req: Request, res: Response) => {
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
  ensureBalances(user.sub);
  const chain = CHAINS.find((c) => c.id === chainId) || SWAP_COINS.find((c) => c.id === chainId);
  if (!chain) {
    res.status(400).json({ message: "Unsupported chain" });
    return;
  }
  const now = Date.now();
  const row = db.prepare("SELECT amount FROM balances WHERE user_id = ? AND chain_id = ?").get(user.sub, chainId) as { amount: number } | undefined;
  if (row) {
    db.prepare("UPDATE balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND chain_id = ?").run(numAmount, now, user.sub, chainId);
  } else {
    db.prepare(
      "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(user.sub, chainId, chain.symbol, chain.name, numAmount, now);
  }
  const txId = `dep_${Date.now()}_${uuidv4().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO transactions (id, user_id, chain_id, type, amount, to_address, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(txId, user.sub, chainId, "received", String(numAmount), deriveAddress(user.sub, chainId), `0x${txId}`, now);
  res.json({ success: true, amount: numAmount });
});

router.post("/swap-execution", authMiddleware, (req: Request, res: Response) => {
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
  ensureBalances(user.sub);
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
    const fiatRow = db.prepare(
      "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
    ).get(user.sub, fiatCurrency) as { amount: number } | undefined;
    if (!fiatRow || fiatRow.amount < fromAmt) {
      res.status(400).json({ message: "Insufficient fiat balance" });
      return;
    }
    db.prepare(
      "UPDATE fiat_balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND currency = ?"
    ).run(fromAmt, now, user.sub, fiatCurrency);
  } else {
    const fromBal = getBalance.get(user.sub, fromChain.id) as { amount: number } | undefined;
    if (fromBal && fromBal.amount < fromAmt) {
      res.status(400).json({ message: "Insufficient balance" });
      return;
    }
    if (fromBal) {
      db.prepare(
        "UPDATE balances SET amount = amount - ?, updated_at = ? WHERE user_id = ? AND chain_id = ?"
      ).run(fromAmt, now, user.sub, fromChain.id);
    } else {
      db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(user.sub, fromChain.id, fromChain.symbol, fromChain.name, -fromAmt, now);
    }
  }
  const toFiat = isFiat(toCoinId);
  const toFiatCurrency = toFiat ? toCoinId.toUpperCase() : null;

  if (toFiat) {
    const fiatRow = db.prepare(
      "SELECT amount FROM fiat_balances WHERE user_id = ? AND currency = ?"
    ).get(user.sub, toFiatCurrency) as { amount: number } | undefined;
    if (fiatRow) {
      db.prepare(
        "UPDATE fiat_balances SET amount = amount + ?, updated_at = ? WHERE user_id = ? AND currency = ?"
      ).run(toAmt, now, user.sub, toFiatCurrency);
    } else {
      db.prepare(
        "INSERT INTO fiat_balances (user_id, currency, amount, updated_at) VALUES (?, ?, ?, ?)"
      ).run(user.sub, toFiatCurrency, toAmt, now);
    }
  } else {
    const toBal = getBalance.get(user.sub, toChain.id) as { amount: number } | undefined;
    if (toBal) {
      updateBalance.run(toAmt, now, user.sub, toChain.id);
    } else {
      db.prepare(
        "INSERT INTO balances (user_id, chain_id, symbol, name, amount, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(user.sub, toChain.id, toChain.symbol, toChain.name, toAmt, now);
    }
  }
  res.json({ success: true });
});

export default router;
