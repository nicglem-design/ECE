# KanoX API Backend

Express backend for auth, wallet, profile, KYC, and AI chat.

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

- `OPENAI_API_KEY` – for AI chat (optional)
- `JWT_SECRET` – for auth tokens (required in production)
- `SUMSUB_*` – for KYC (optional, stub mode without)

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
| `/api/v1/kyc/status` | GET | Yes | KYC status |
| `/api/v1/kyc/access-token` | POST | Yes | Sumsub access token |
| `/api/v1/ai/chat` | POST | Yes | AI chat |
| `/health` | GET | No | Health check |

## Database

SQLite at `./data/kanox.db` (or `DATABASE_PATH`). Schema is created on first run.
