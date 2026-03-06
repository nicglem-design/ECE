/**
 * CoinGecko coins/markets - paginated list of coins with prices.
 * Used for the full crypto list in KanoExchange.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCached, getStaleCached, setCached } from "@/lib/coingecko-cache";
import { COINGECKO_IMAGE_URLS } from "@/lib/coin-images";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

/** Fallback when CoinGecko is rate-limited - top 50 by market cap, with logos */
const FALLBACK_COINS = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", image: COINGECKO_IMAGE_URLS.bitcoin, market_cap_rank: 1, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "ethereum", symbol: "eth", name: "Ethereum", image: COINGECKO_IMAGE_URLS.ethereum, market_cap_rank: 2, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "tether", symbol: "usdt", name: "Tether", image: COINGECKO_IMAGE_URLS.tether, market_cap_rank: 3, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "binancecoin", symbol: "bnb", name: "BNB", image: COINGECKO_IMAGE_URLS.binancecoin, market_cap_rank: 4, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "solana", symbol: "sol", name: "Solana", image: COINGECKO_IMAGE_URLS.solana, market_cap_rank: 5, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "usd-coin", symbol: "usdc", name: "USDC", image: COINGECKO_IMAGE_URLS["usd-coin"], market_cap_rank: 6, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "ripple", symbol: "xrp", name: "XRP", image: COINGECKO_IMAGE_URLS.ripple, market_cap_rank: 7, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin", image: COINGECKO_IMAGE_URLS.dogecoin, market_cap_rank: 8, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "cardano", symbol: "ada", name: "Cardano", image: COINGECKO_IMAGE_URLS.cardano, market_cap_rank: 9, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "tron", symbol: "trx", name: "TRON", image: COINGECKO_IMAGE_URLS.tron, market_cap_rank: 10, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche", image: COINGECKO_IMAGE_URLS["avalanche-2"], market_cap_rank: 11, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "chainlink", symbol: "link", name: "Chainlink", image: COINGECKO_IMAGE_URLS.chainlink, market_cap_rank: 12, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "polkadot", symbol: "dot", name: "Polkadot", image: COINGECKO_IMAGE_URLS.polkadot, market_cap_rank: 13, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "bitcoin-cash", symbol: "bch", name: "Bitcoin Cash", image: COINGECKO_IMAGE_URLS["bitcoin-cash"], market_cap_rank: 14, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "polygon", symbol: "matic", name: "Polygon", image: COINGECKO_IMAGE_URLS.polygon, market_cap_rank: 15, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "shiba-inu", symbol: "shib", name: "Shiba Inu", image: COINGECKO_IMAGE_URLS["shiba-inu"], market_cap_rank: 16, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "litecoin", symbol: "ltc", name: "Litecoin", image: COINGECKO_IMAGE_URLS.litecoin, market_cap_rank: 17, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "dai", symbol: "dai", name: "Dai", image: COINGECKO_IMAGE_URLS.dai, market_cap_rank: 18, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "uniswap", symbol: "uni", name: "Uniswap", image: COINGECKO_IMAGE_URLS.uniswap, market_cap_rank: 19, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "wrapped-bitcoin", symbol: "wbtc", name: "Wrapped Bitcoin", image: COINGECKO_IMAGE_URLS["wrapped-bitcoin"], market_cap_rank: 20, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "stellar", symbol: "xlm", name: "Stellar", image: COINGECKO_IMAGE_URLS.stellar, market_cap_rank: 21, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "true-usd", symbol: "tusd", name: "TrueUSD", image: COINGECKO_IMAGE_URLS["true-usd"], market_cap_rank: 22, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "leo-token", symbol: "leo", name: "LEO Token", image: COINGECKO_IMAGE_URLS["leo-token"], market_cap_rank: 23, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "cosmos", symbol: "atom", name: "Cosmos", image: COINGECKO_IMAGE_URLS.cosmos, market_cap_rank: 24, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "ethereum-classic", symbol: "etc", name: "Ethereum Classic", image: COINGECKO_IMAGE_URLS["ethereum-classic"], market_cap_rank: 25, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "aptos", symbol: "apt", name: "Aptos", image: COINGECKO_IMAGE_URLS.aptos, market_cap_rank: 26, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "filecoin", symbol: "fil", name: "Filecoin", image: COINGECKO_IMAGE_URLS.filecoin, market_cap_rank: 27, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "hedera-hashgraph", symbol: "hbar", name: "Hedera", image: COINGECKO_IMAGE_URLS["hedera-hashgraph"], market_cap_rank: 28, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "arbitrum", symbol: "arb", name: "Arbitrum", image: COINGECKO_IMAGE_URLS.arbitrum, market_cap_rank: 29, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "crypto-com-chain", symbol: "cro", name: "Cronos", image: COINGECKO_IMAGE_URLS["crypto-com-chain"], market_cap_rank: 30, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "monero", symbol: "xmr", name: "Monero", image: COINGECKO_IMAGE_URLS.monero, market_cap_rank: 31, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "optimism", symbol: "op", name: "Optimism", image: COINGECKO_IMAGE_URLS.optimism, market_cap_rank: 32, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "immutable-x", symbol: "imx", name: "Immutable X", image: COINGECKO_IMAGE_URLS["immutable-x"], market_cap_rank: 33, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "near", symbol: "near", name: "NEAR Protocol", image: COINGECKO_IMAGE_URLS.near, market_cap_rank: 34, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "injective-protocol", symbol: "inj", name: "Injective", image: COINGECKO_IMAGE_URLS["injective-protocol"], market_cap_rank: 35, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "sui", symbol: "sui", name: "Sui", image: COINGECKO_IMAGE_URLS.sui, market_cap_rank: 36, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "maker", symbol: "mkr", name: "Maker", image: COINGECKO_IMAGE_URLS.maker, market_cap_rank: 37, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "the-graph", symbol: "grt", name: "The Graph", image: COINGECKO_IMAGE_URLS["the-graph"], market_cap_rank: 38, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "render-token", symbol: "rndr", name: "Render", image: COINGECKO_IMAGE_URLS["render-token"], market_cap_rank: 39, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "bittensor", symbol: "tao", name: "Bittensor", image: COINGECKO_IMAGE_URLS.bittensor, market_cap_rank: 40, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "fetch-ai", symbol: "fet", name: "Fetch.ai", image: COINGECKO_IMAGE_URLS["fetch-ai"], market_cap_rank: 41, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "vechain", symbol: "vet", name: "VeChain", image: COINGECKO_IMAGE_URLS.vechain, market_cap_rank: 42, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "kaspa", symbol: "kas", name: "Kaspa", image: COINGECKO_IMAGE_URLS.kaspa, market_cap_rank: 43, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "first-digital-usd", symbol: "fdusd", name: "First Digital USD", image: COINGECKO_IMAGE_URLS["first-digital-usd"], market_cap_rank: 44, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "mantle", symbol: "mnt", name: "Mantle", image: COINGECKO_IMAGE_URLS.mantle, market_cap_rank: 45, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "lido-dao", symbol: "ldo", name: "Lido DAO", image: COINGECKO_IMAGE_URLS["lido-dao"], market_cap_rank: 46, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "celestia", symbol: "tia", name: "Celestia", image: COINGECKO_IMAGE_URLS.celestia, market_cap_rank: 47, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "rocket-pool-eth", symbol: "reth", name: "Rocket Pool ETH", image: COINGECKO_IMAGE_URLS["rocket-pool-eth"], market_cap_rank: 48, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "aave", symbol: "aave", name: "Aave", image: COINGECKO_IMAGE_URLS.aave, market_cap_rank: 49, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
  { id: "algorand", symbol: "algo", name: "Algorand", image: COINGECKO_IMAGE_URLS.algorand, market_cap_rank: 50, current_price: null, price_change_percentage_24h_in_currency: null, price_change_percentage_24h: null },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = Math.min(250, Math.max(50, parseInt(searchParams.get("per_page") || "250", 10)));
  const sparkline = searchParams.get("sparkline") === "true";
  const order = searchParams.get("order") || "market_cap_desc";
  const params = `markets:${currency}:${page}:${perPage}:${sparkline}:${order}`;

  const cached = getCached<unknown>("coins-markets", params);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=60", "X-Cache": "HIT" },
    });
  }

  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&order=${order}&per_page=${perPage}&page=${page}&sparkline=${sparkline}&price_change_percentage=24h`;
    const res = await fetchExternal(url);
    if (!res.ok) {
      const stale = getStaleCached<unknown>("coins-markets", params);
      if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
      // Rate limited or error - return fallback so market page still shows coins
      const fallback = page === 1 ? FALLBACK_COINS : [];
      return NextResponse.json(fallback, {
        headers: { "Cache-Control": "public, max-age=60", "X-Cache": "FALLBACK" },
      });
    }
    const data = await res.json();
    // CoinGecko can return { error: "..." } on rate limit - ensure we have an array
    const safeData = Array.isArray(data) && data.length > 0 ? data : (page === 1 ? FALLBACK_COINS : []);
    setCached("coins-markets", params, safeData);
    return NextResponse.json(safeData, {
      headers: { "Cache-Control": "public, max-age=60", Pragma: "no-cache" },
    });
  } catch (err) {
    const stale = getStaleCached<unknown>("coins-markets", params);
    if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
    // Network error - return fallback so market page still shows coins
    const fallback = page === 1 ? FALLBACK_COINS : [];
    return NextResponse.json(fallback, {
      headers: { "Cache-Control": "public, max-age=60", "X-Cache": "FALLBACK" },
    });
  }
}
