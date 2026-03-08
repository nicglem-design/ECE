/**
 * Swap API: quote and execute instant swaps using market prices.
 * Demo mode: simulated execution. Real mode (SWAP_REAL_MONEY=true): executes via order book.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { COIN_TO_PAIR } from "@/lib/orderbook/types";
import { getBinanceSymbol } from "@/lib/coin-symbol";

export const dynamic = "force-dynamic";

const SWAP_FEE_BPS = 50; // 0.5%
const API_BACKEND = process.env.API_BACKEND_URL || "http://localhost:4000";
const API_INTERNAL_KEY = process.env.API_INTERNAL_KEY || "";

async function placeOrderViaApi(
  userId: string,
  pair: string,
  side: "buy" | "sell",
  price: number,
  amount: number,
  authHeader?: string | null
): Promise<{ order: { id: string; filled: number }; trades: unknown[] }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (userId === "mm" && API_INTERNAL_KEY) {
    headers["X-Internal-Key"] = API_INTERNAL_KEY;
  } else if (authHeader) {
    headers["Authorization"] = authHeader;
  }
  const res = await fetch(`${API_BACKEND}/api/v1/market/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify({ userId, pair, side, price, amount }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "Place order failed");
  }
  return res.json();
}
const STABLECOINS = ["tether", "usd-coin", "dai", "first-digital-usd", "true-usd", "paxos-standard", "gemini-dollar", "frax", "liquity-usd"];

function isStablecoin(coinId: string): boolean {
  return STABLECOINS.includes(coinId.toLowerCase());
}

/** Fiat currency ID -> USD rate (1 unit of fiat = X USD) */
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
};

function isFiat(coinId: string): boolean {
  return coinId.toLowerCase() in FIAT_TO_USD;
}

/** Resolve trading pair for any coin (USDT pair). Uses static map first, then CoinGecko. */
async function getPairForCoin(coinId: string): Promise<string | null> {
  const cached = COIN_TO_PAIR[coinId];
  if (cached) return cached;
  return getBinanceSymbol(coinId);
}

async function getPrices(coinIds: string[], currency = "usd"): Promise<Record<string, number>> {
  if (coinIds.length === 0) return {};
  const ids = [...new Set(coinIds)].join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${currency}`;
  try {
    const res = await fetchExternal(url);
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, { [k: string]: number }>;
    const prices: Record<string, number> = {};
    for (const id of coinIds) {
      const p = data[id]?.[currency];
      if (p != null && p > 0) prices[id] = p;
      else if (STABLECOINS.includes(id)) prices[id] = 1;
    }
    return prices;
  } catch {
    return {};
  }
}

/** GET: Get swap quote. ?from=bitcoin&to=ethereum&amount=0.001 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fromId = (searchParams.get("from") || "").trim().toLowerCase();
  const toId = (searchParams.get("to") || "").trim().toLowerCase();
  const amount = parseFloat(searchParams.get("amount") || "0");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();

  if (!fromId || !toId || amount <= 0) {
    return NextResponse.json(
      { error: "from, to, and amount (positive) required" },
      { status: 400 }
    );
  }

  const fromFiat = isFiat(fromId);
  const toFiat = isFiat(toId);
  const cryptoIds = [fromId, toId].filter((id) => !isFiat(id));
  const prices = cryptoIds.length > 0 ? await getPrices(cryptoIds, currency) : {};
  const fromPrice = fromFiat ? FIAT_TO_USD[fromId.toLowerCase()] ?? 1 : prices[fromId];
  const toPrice = toFiat ? FIAT_TO_USD[toId.toLowerCase()] ?? 1 : prices[toId];

  if (!fromPrice || !toPrice) {
    return NextResponse.json(
      { error: "Could not fetch prices for one or both assets" },
      { status: 400 }
    );
  }

  const valueUsd = amount * fromPrice;
  const feeBps = SWAP_FEE_BPS / 10000;
  const feeUsd = valueUsd * feeBps;
  const netUsd = valueUsd - feeUsd;
  const outputAmount = netUsd / toPrice;

  return NextResponse.json({
    fromCoinId: fromId,
    toCoinId: toId,
    fromAmount: amount,
    toAmount: outputAmount,
    fromPrice,
    toPrice,
    rate: fromPrice / toPrice,
    feeBps: SWAP_FEE_BPS,
    feeUsd,
    valueUsd,
    currency,
  });
}

/** Call backend to update wallet balances. Returns { ok: true } or { ok: false, error } */
async function executeWalletSwap(
  authHeader: string | null,
  fromCoinId: string,
  toCoinId: string,
  fromAmount: number,
  toAmount: number
): Promise<{ ok: boolean; error?: string }> {
  if (!authHeader?.startsWith("Bearer ")) return { ok: true };
  try {
    const res = await fetch(`${API_BACKEND}/api/v1/wallet/swap-execution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        fromCoinId,
        toCoinId,
        fromAmount,
        toAmount,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
    if (!res.ok) return { ok: false, error: data.message || "Insufficient balance" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "Wallet update failed" };
  }
}

/** POST: Execute swap. Demo: simulated. Real (SWAP_REAL_MONEY=true): executes via order book. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromCoinId, toCoinId, fromAmount, userId } = body;
    const authHeader = request.headers.get("authorization");

    if (!fromCoinId || !toCoinId || !fromAmount || fromAmount <= 0) {
      return NextResponse.json(
        { error: "fromCoinId, toCoinId, and fromAmount (positive) required" },
        { status: 400 }
      );
    }

    const fromFiat = isFiat(fromCoinId);
    const toFiat = isFiat(toCoinId);
    const cryptoIds = [fromCoinId, toCoinId].filter((id) => !isFiat(id));
    const prices = cryptoIds.length > 0 ? await getPrices(cryptoIds, "usd") : {};
    const fromPrice = fromFiat ? FIAT_TO_USD[fromCoinId.toLowerCase()] ?? 1 : prices[fromCoinId];
    const toPrice = toFiat ? FIAT_TO_USD[toCoinId.toLowerCase()] ?? 1 : prices[toCoinId];

    if (!fromPrice || !toPrice) {
      return NextResponse.json(
        { error: "Could not fetch prices" },
        { status: 400 }
      );
    }

    const valueUsd = fromAmount * fromPrice;
    const feeBps = SWAP_FEE_BPS / 10000;
    const feeUsd = valueUsd * feeBps;
    const netUsd = valueUsd - feeUsd;
    const toAmount = netUsd / toPrice;

    const useRealMoney = process.env.SWAP_REAL_MONEY === "true" || process.env.SWAP_REAL_MONEY === "1";

    if (useRealMoney) {
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "Authentication required for real execution. Please log in." },
          { status: 401 }
        );
      }
      const uid = userId ?? undefined;
      const fromStable = isStablecoin(fromCoinId);
      const toStable = isStablecoin(toCoinId);

      if (fromFiat && !toFiat) {
        const walletResult = await executeWalletSwap(authHeader, fromCoinId, toCoinId, fromAmount, toAmount);
        if (!walletResult.ok) {
          return NextResponse.json({ error: walletResult.error }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          swapId: `swap_${Date.now()}`,
          fromCoinId,
          toCoinId,
          fromAmount,
          toAmount,
          fromPrice,
          toPrice,
          feeUsd,
          valueUsd,
          userId: uid,
          realExecution: true,
        });
      }

      if (!fromFiat && toFiat) {
        const walletResult = await executeWalletSwap(authHeader, fromCoinId, toCoinId, fromAmount, toAmount);
        if (!walletResult.ok) {
          return NextResponse.json({ error: walletResult.error }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          swapId: `swap_${Date.now()}`,
          fromCoinId,
          toCoinId,
          fromAmount,
          toAmount,
          fromPrice,
          toPrice,
          feeUsd,
          valueUsd,
          userId: uid,
          realExecution: true,
        });
      }

      if (fromStable && !toStable) {
        const pair = await getPairForCoin(toCoinId);
        if (!pair) {
          return NextResponse.json(
            { error: `Could not resolve trading pair for ${toCoinId}` },
            { status: 400 }
          );
        }
        const walletResult = await executeWalletSwap(authHeader, fromCoinId, toCoinId, fromAmount, toAmount);
        if (!walletResult.ok) {
          return NextResponse.json({ error: walletResult.error }, { status: 400 });
        }
        const execPrice = Math.ceil(toPrice * 1.001);
        await placeOrderViaApi("mm", pair, "sell", execPrice, toAmount, authHeader);
        const { order } = await placeOrderViaApi(uid, pair, "buy", execPrice, toAmount, authHeader);
        const filled = order.filled;
        return NextResponse.json({
          ok: true,
          swapId: order.id,
          fromCoinId,
          toCoinId,
          fromAmount,
          toAmount: filled,
          fromPrice,
          toPrice,
          feeUsd,
          valueUsd,
          userId: uid,
          realExecution: true,
          orderId: order.id,
        });
      }

      if (!fromStable && toStable) {
        const pair = await getPairForCoin(fromCoinId);
        if (!pair) {
          return NextResponse.json(
            { error: `Could not resolve trading pair for ${fromCoinId}` },
            { status: 400 }
          );
        }
        const execPrice = Math.floor(fromPrice * 0.999);
        const receivedTokens = (fromAmount * execPrice) / toPrice;
        const walletResult = await executeWalletSwap(authHeader, fromCoinId, toCoinId, fromAmount, receivedTokens);
        if (!walletResult.ok) {
          return NextResponse.json({ error: walletResult.error }, { status: 400 });
        }
        await placeOrderViaApi("mm", pair, "buy", execPrice, fromAmount, authHeader);
        const { order } = await placeOrderViaApi(uid, pair, "sell", execPrice, fromAmount, authHeader);
        const filled = order.filled;
        return NextResponse.json({
          ok: true,
          swapId: order.id,
          fromCoinId,
          toCoinId,
          fromAmount: filled,
          toAmount: receivedTokens,
          fromPrice,
          toPrice,
          feeUsd,
          valueUsd,
          userId: uid,
          realExecution: true,
          orderId: order.id,
        });
      }

      if (!fromStable && !toStable) {
        const [fromPair, toPair] = await Promise.all([
          getPairForCoin(fromCoinId),
          getPairForCoin(toCoinId),
        ]);
        if (!fromPair || !toPair) {
          return NextResponse.json(
            { error: "Could not resolve trading pairs for one or both assets" },
            { status: 400 }
          );
        }
        const sellPrice = Math.floor(fromPrice * 0.999);
        const usdtReceived = fromAmount * sellPrice;
        const toBuy = usdtReceived / toPrice;
        const walletResult = await executeWalletSwap(authHeader, fromCoinId, toCoinId, fromAmount, toBuy);
        if (!walletResult.ok) {
          return NextResponse.json({ error: walletResult.error }, { status: 400 });
        }
        await placeOrderViaApi("mm", fromPair, "buy", sellPrice, fromAmount, authHeader);
        const { order: sellOrder } = await placeOrderViaApi(uid, fromPair, "sell", sellPrice, fromAmount, authHeader);
        const actualUsdt = sellOrder.filled * sellPrice;
        const actualToBuy = actualUsdt / toPrice;
        const buyPrice = Math.ceil(toPrice * 1.001);
        await placeOrderViaApi("mm", toPair, "sell", buyPrice, actualToBuy, authHeader);
        const { order: buyOrder } = await placeOrderViaApi(uid, toPair, "buy", buyPrice, actualToBuy, authHeader);
        return NextResponse.json({
          ok: true,
          swapId: `swap_${sellOrder.id}_${buyOrder.id}`,
          fromCoinId,
          toCoinId,
          fromAmount: sellOrder.filled,
          toAmount: buyOrder.filled,
          fromPrice,
          toPrice,
          feeUsd,
          valueUsd,
          userId: uid,
          realExecution: true,
          orderIds: [sellOrder.id, buyOrder.id],
        });
      }
    }

    const swapId = `swap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return NextResponse.json({
      ok: true,
      swapId,
      fromCoinId,
      toCoinId,
      fromAmount,
      toAmount,
      fromPrice,
      toPrice,
      feeUsd,
      valueUsd,
      userId: userId || "guest",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Swap failed" },
      { status: 500 }
    );
  }
}
