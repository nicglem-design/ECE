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
| Order book + matching engine | `apps/web/src/lib/orderbook/` | Price-time priority, in-memory |
| Market prices API | `apps/web/src/app/api/market/prices/route.ts` | Our book → consensus fallback |
| Place order API | `apps/web/src/app/api/market/orders/route.ts` | POST to place limit orders |
| Order book API | `apps/web/src/app/api/market/orderbook/[pair]/route.ts` | GET bids/asks |
| Trades API | `apps/web/src/app/api/market/trades/[pair]/route.ts` | GET trade history |

## When You Launch Trading

1. **Wire the Swap UI** – Call `POST /api/market/orders` when users place orders (with `userId` from auth).
2. **Add persistence** – Replace in-memory storage in `engine.ts` with DB/Redis for production.
3. **No price changes** – The price flow already prefers your order book when it has data.

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
