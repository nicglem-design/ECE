# Production Deployment Guide

This guide covers configuring ECE for production as a fully functional crypto wallet and exchange.

## Architecture

- **Web app** (Next.js): Deploy to Vercel or similar
- **API** (Express): Deploy to Railway, Render, Fly.io, or a VPS
- **Database**: PostgreSQL (Supabase recommended)
- **Cron**: Vercel Cron for deposit sync and market maker

---

## 1. Database (PostgreSQL)

Use Supabase or any PostgreSQL provider.

1. Create a project at [supabase.com](https://supabase.com)
2. Get the **connection pooler** URL from Settings → Database (port 6543)
3. Set in API env:

```bash
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Or use `SUPABASE_DB_URL`. See [docs/SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

---

## 2. RPC URLs (Blockchain)

Replace public RPCs with paid providers for reliability and rate limits.

| Chain | Provider | Env var |
|-------|----------|---------|
| Ethereum | [Alchemy](https://alchemy.com) / [Infura](https://infura.io) | `ETH_RPC_URL` or `ETHEREUM_RPC_URL` |
| BNB Chain | [QuickNode](https://quicknode.com) / BSC public | `BNB_RPC_URL` |
| Polygon | Alchemy / Infura | `POLYGON_RPC_URL` |
| Avalanche | Alchemy / Avalanche | `AVAX_RPC_URL` |
| Bitcoin | [Mempool.space](https://mempool.space) (free) | `BITCOIN_API_URL` |
| Solana | [Helius](https://helius.dev) / [QuickNode](https://quicknode.com) | `SOLANA_RPC_URL` |
| Litecoin | Blockstream (free) | `LITECOIN_API_URL` |
| Dogecoin | BlockCypher (free, rate-limited) | `DOGECOIN_API_URL` |

**Etherscan** (for EVM deposit sync): Get an API key from [etherscan.io](https://etherscan.io) and set `ETHERSCAN_API_KEY` or `ETHEREUM_ETHERSCAN_API_KEY`.

---

## 3. Braintree (card, Apple Pay, Google Pay)

### Deposits

1. Create a [Braintree](https://www.braintreepayments.com/) (PayPal) account
2. Get your API credentials from the Braintree Control Panel
3. Set in API env:

```bash
BRAINTREE_MERCHANT_ID=your_merchant_id
BRAINTREE_PUBLIC_KEY=your_public_key
BRAINTREE_PRIVATE_KEY=your_private_key
BRAINTREE_ENVIRONMENT=production
```

4. For **Apple Pay** and **Google Pay**, enable them in the Braintree Control Panel and configure your domains. For Google Pay, set `NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID` in the web app env.

### Withdrawals

Bank withdrawals are not supported with Braintree. A separate payout provider would need to be integrated for fiat withdrawals.

---

## 4. Email (Resend)

For verification, password reset, support form, and withdrawal confirmations:

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain
3. Set in API env:

```bash
RESEND_API_KEY=re_...
EMAIL_FROM=ECE <noreply@yourdomain.com>
SUPPORT_EMAIL=support@yourdomain.com
APP_URL=https://yoursite.com
FRONTEND_URL=https://yoursite.com
APP_NAME=ECE
```

When `RESEND_API_KEY` is set, deposits and withdrawals require email verification. Support form messages are sent to `SUPPORT_EMAIL` (falls back to address in `EMAIL_FROM` if unset).

---

## 5. KYC (Sumsub)

When configured, deposits and withdrawals require KYC approval.

1. Sign up at [sumsub.com](https://sumsub.com)
2. Create an app and get credentials
3. Set in API env:

```bash
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...
SUMSUB_BASE_URL=https://api.sumsub.com
```

4. **Webhook**: In Sumsub Dashboard, add webhook URL:
   - `https://your-api-domain.com/api/v1/kyc/webhook`
   - Event: `applicantReviewed`

---

## 6. Cron Jobs

### Vercel Cron (when web is on Vercel)

Set in Vercel project env:

```bash
CRON_SECRET=your-random-secret
API_BACKEND_URL=https://your-api-domain.com
API_INTERNAL_KEY=your-internal-key  # optional, for market maker
```

**Scheduled jobs** (see `vercel.json`):

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/sync-deposits` | Every 15 min | Sync blockchain deposits for all users |
| `/api/cron/daily-crypto-sync` | Daily 00:00 UTC | Cache warm + deposit sync + market maker seed + expired token cleanup |

> **Note**: Vercel Hobby plan may limit cron frequency. Pro plan supports custom schedules.

### Alternative: External cron

If not using Vercel Cron, call from GitHub Actions, cron on a server, or a service like cron-job.org:

```bash
# Every 15 min – deposit sync
curl -X POST https://your-api-domain.com/api/v1/cron/sync-deposits \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Daily – full sync + market maker
curl https://yoursite.com/api/cron/daily-crypto-sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 7. API Environment Summary

```bash
# Required
JWT_SECRET=min-32-chars-random-string
NODE_ENV=production

# Database
DATABASE_URL=postgresql://...

# Custody (optional but recommended)
WALLET_ENCRYPTION_KEY=separate-16-char-key
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
BNB_RPC_URL=...
POLYGON_RPC_URL=...
AVAX_RPC_URL=...
SOLANA_RPC_URL=...
ETHERSCAN_API_KEY=...

# Braintree (deposits)
BRAINTREE_MERCHANT_ID=...
BRAINTREE_PUBLIC_KEY=...
BRAINTREE_PRIVATE_KEY=...
BRAINTREE_ENVIRONMENT=production

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=...
SUPPORT_EMAIL=support@yourdomain.com
APP_URL=...
FRONTEND_URL=...

# KYC (optional)
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...
SUMSUB_WEBHOOK_SECRET=...  # From Sumsub webhook config; verifies webhook signatures

# Cron
CRON_SECRET=...
API_INTERNAL_KEY=...

# Limits
WITHDRAWAL_LIMIT_DAILY=10000
SEND_LIMIT_DAILY=20

# Security
ALLOW_MANUAL_DEPOSIT=  # Set to true only for demo/test; manual deposit disabled in prod by default
CORS_ORIGINS=https://yoursite.com  # Comma-separated; empty = allow all (dev only)

# Market
SEED_MARKET_MAKER_ON_START=true
SWAP_REAL_MONEY=true  # in web app env
```

---

## 8. Web App Environment (Vercel)

```bash
API_BACKEND_URL=https://your-api-domain.com
CRON_SECRET=...
SWAP_REAL_MONEY=true
NEXT_PUBLIC_APP_URL=https://yoursite.com
```

---

## 9. Health Checks

- **GET /health** – Liveness (always 200 when process is up)
- **GET /health/ready** – Readiness: checks DB connectivity, reports Braintree config status. Returns 503 if DB unreachable.

Use `/health/ready` for Kubernetes readiness probes or load balancer health checks. Add `?deep=true` to probe external services (Braintree, Sumsub, Resend, RPC).

**GET /metrics** – Simple JSON metrics (deposits, withdrawals, swaps, errors). In production, protected: requires `Authorization: Bearer <CRON_SECRET|API_INTERNAL_KEY>` or request from internal IP.

---

## 10. E2E Test (Fiat Flow)

Run the end-to-end test to verify deposit → buy → sell → withdraw:

```bash
# Start API first (in another terminal)
npm run start:api

# Run test
npm run test:e2e-fiat
```

The test: signs up a user, deposits 100 USD, swaps 10 USD → BTC, swaps half the BTC back to USD, and attempts withdraw (expects WITHDRAWALS_NOT_CONFIGURED since bank withdrawals are not available). Users with email `*@test.local` are auto-verified so the test passes even when `RESEND_API_KEY` is set.

---

## 11. Deployment Checklist

- [ ] PostgreSQL database configured
- [ ] API deployed with all env vars
- [ ] Web app deployed with `API_BACKEND_URL` pointing to API
- [ ] Braintree credentials configured for card deposits
- [ ] Sumsub webhook URL set (if using KYC)
- [ ] Cron jobs configured (Vercel or external)
- [ ] Production RPC URLs set (not public defaults)
- [ ] `JWT_SECRET` and `WALLET_ENCRYPTION_KEY` are strong and unique
- [ ] `SWAP_REAL_MONEY=true` in web app for real swaps
- [ ] `SEED_MARKET_MAKER_ON_START=true` in API for order book liquidity
- [ ] `SUPPORT_EMAIL` set (for support form)
