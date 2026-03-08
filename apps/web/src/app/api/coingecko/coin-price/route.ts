import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const BINANCE_COIN_IDS = new Set(["bitcoin", "ethereum", "binancecoin", "solana"]);

/** Get price and 24h change for any CoinGecko coin. Used for swap currency conversion and chart fallback. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();

  if (!coinId) {
    return NextResponse.json({ error: "coinId required" }, { status: 400 });
  }

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${currency}&include_24hr_change=true`;
    const res = await fetchExternal(url);
    if (res.ok) {
      const data = (await res.json()) as Record<string, { [key: string]: number } | undefined>;
      const coin = data[coinId];
      if (coin) {
        const price = coin[currency];
        const priceChange24h = coin[`${currency}_24h_change`] ?? null;
        if (price != null && price > 0) {
          return NextResponse.json(
            { price, priceChange24h },
            {
              headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                Pragma: "no-cache",
              },
            }
          );
        }
      }
    }
    // Fallback: Binance for BTC, ETH, BNB, SOL when CoinGecko fails or rate-limited
    if (BINANCE_COIN_IDS.has(coinId)) {
      const SYMBOLS: Record<string, string> = {
        bitcoin: "BTCUSDT",
        ethereum: "ETHUSDT",
        binancecoin: "BNBUSDT",
        solana: "SOLUSDT",
      };
      const symbol = SYMBOLS[coinId];
      if (symbol) {
        try {
          const binanceRes = await fetchExternal(
            `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
            { timeoutMs: 5000 }
          );
          if (binanceRes.ok) {
            const ticker = (await binanceRes.json()) as { lastPrice?: string; priceChangePercent?: string };
            const price = parseFloat(ticker.lastPrice || "0");
            const rate = { usd: 1, eur: 1.08, gbp: 1.27, sek: 0.09, nok: 0.09, dkk: 0.14 }[currency] ?? 1;
            if (price > 0) {
              return NextResponse.json(
                {
                  price: price / rate,
                  priceChange24h: parseFloat(ticker.priceChangePercent || "0") || null,
                },
                {
                  headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    Pragma: "no-cache",
                  },
                }
              );
            }
          }
        } catch {
          // ignore
        }
      }
    }
    return NextResponse.json({ price: null, priceChange24h: null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
