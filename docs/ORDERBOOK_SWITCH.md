# Switching to Own Order Book Prices

When your app has users trading, prices will automatically come from your own order book instead of external feeds.

## How It Works

1. **`/api/market/prices`** – Single price endpoint that:
   - Uses **your order book** when you have trades or depth (last trade price or mid price)
   - Falls back to **external consensus** (Binance, CoinGecko, etc.) when the book is empty

2. **`fetchTop5LivePricesFast()`** – Already calls `/api/market/prices` first. No frontend change needed.

3. **Automatic switch** – As soon as users place orders and trades execute, your displayed prices will come from your own data.

## What’s Built

| Component | Location | Purpose |
|-----------|----------|---------|
| Order book + matching engine | `apps/api/src/orderbook/engine.ts` | Price-time priority, **persisted** (SQLite/Postgres) |
| Order book persistence | `apps/api/src/orderbook/db.ts` | `market_orders`, `market_trades`, `market_book` tables |
| Market prices API | `apps/web/src/app/api/market/prices/route.ts` | Our book → consensus fallback |
| Place order API | Proxied to `API_BACKEND/api/v1/market/orders` | POST to place limit orders |
| Order book API | Proxied to `API_BACKEND/api/v1/market/orderbook/:pair` | GET bids/asks |
| Trades API | Proxied to `API_BACKEND/api/v1/market/trades/:pair` | GET trade history |

## Persistence (Production Ready)

The order book is **fully persisted** in the database:

- **`market_orders`** – All limit orders (open, filled, cancelled)
- **`market_trades`** – Executed trades for price history
- **`market_book`** – Aggregated price levels (bids/asks)

Data survives API restarts. No in-memory state. Set `SEED_MARKET_MAKER_ON_START=true` to seed liquidity on startup when the book is empty.

## When You Launch Trading

1. **Enable real swap execution** – Set `SWAP_REAL_MONEY=true` in your env. The swap UI will then execute via the order book instead of simulating.
2. **Wire the Swap UI** – Call `POST /api/market/orders` when users place orders (with `userId` from auth).
3. **Persistence** – Already implemented. Orders, trades, and book levels are stored in SQLite/Postgres.
4. **No price changes** – The price flow already prefers your order book when it has data.

### Real-money swap mode

When `SWAP_REAL_MONEY=true`:

- **USDT → crypto** (e.g. USDT → BTC): Places a buy order on the order book; market maker provides liquidity for instant fill.
- **Crypto → USDT** (e.g. SOL → USDT): Places a sell order; market maker provides liquidity.
- **Crypto → crypto** (e.g. SOL → BTC): Executes two orders (sell SOL for USDT, buy BTC with USDT).

Supported pairs: BTC, ETH, BNB, SOL, DOGE, PEPE, BONK, SHIB (vs USDT). Other pairs fall back to simulated or return an error.

## To Force Own Prices Only (Optional)

If you want to use only your order book and never external feeds:

1. In `apps/web/src/app/api/market/prices/route.ts`, remove the consensus fallback and return `null` or a clear error when the book is empty.
2. Or add an env var `USE_OWN_PRICES_ONLY=true` and branch on it.

## Testing the Order Book

```bash
# Place a buy order
curl -X POST http://localhost:3000/api/market/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","pair":"BTCUSDT","side":"buy","price":95000,"amount":0.001}'

# Get order book
curl http://localhost:3000/api/market/orderbook/BTCUSDT

# Get trades
curl http://localhost:3000/api/market/trades/BTCUSDT

# Get prices (will use our book when we have data)
curl http://localhost:3000/api/market/prices?currency=usd
```
