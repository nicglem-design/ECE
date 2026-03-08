# KanoX API Backend

Express backend for auth, wallet, profile, KYC, accounts, and AI chat.

## Setup

```bash
npm install
npm run build
```

## Run

```bash
npm run start
# or with dev (rebuilds first)
npm run dev
```

## Environment

Copy `.env.example` to `.env` and configure:

- `JWT_SECRET` – **Required in production.** Auth tokens. App exits if unset when `NODE_ENV=production`.
- `OPENAI_API_KEY` – for AI chat (optional)
- `SUMSUB_*` – for KYC (optional, stub mode without)
- `DATABASE_PATH` – SQLite path (default: `./data/kanox.db`)

## Production

1. Set `NODE_ENV=production`
2. Set a strong `JWT_SECRET` (32+ random chars)
3. Rate limiting: 100 req/min (API), 10 attempts/15min (auth)
4. Request body limit: 100kb
5. KYC webhook: Configure Sumsub to POST to `https://your-api/api/v1/kyc/webhook` for `applicantReviewed` events

## Endpoints

| Path | Method | Auth | Description |
|------|--------|------|-------------|
| `/api/v1/auth/login` | POST | No | Login |
| `/api/v1/auth/signup` | POST | No | Register |
| `/api/v1/profile` | GET, PATCH | Yes | Profile |
| `/api/v1/wallet/chains` | GET | No | Supported chains |
| `/api/v1/wallet/addresses` | GET | Yes | User addresses |
| `/api/v1/wallet/balances` | GET | Yes | User balances |
| `/api/v1/wallet/send` | POST | Yes | Send crypto (simulated) |
| `/api/v1/wallet/transactions/:chainId` | GET | Yes | Transaction history |
| `/api/v1/wallet/swap-execution` | POST | Yes | Update balances after swap |
| `/api/v1/accounts/fiat` | GET | Yes | Fiat balances |
| `/api/v1/accounts/deposit` | POST | Yes | Deposit fiat |
| `/api/v1/accounts/withdraw` | POST | Yes | Withdraw fiat |
| `/api/v1/accounts/linked` | GET, POST | Yes | Linked bank/card |
| `/api/v1/kyc/status` | GET | Yes | KYC status |
| `/api/v1/kyc/access-token` | POST | Yes | Sumsub access token |
| `/api/v1/kyc/webhook` | POST | No | Sumsub webhook (applicantReviewed) |
| `/api/v1/ai/chat` | POST | Yes | AI chat |
| `/health` | GET | No | Health check |

## Database

SQLite at `./data/kanox.db` (or `DATABASE_PATH`). Schema is created on first run.
