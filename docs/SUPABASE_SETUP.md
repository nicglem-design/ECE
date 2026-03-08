# Supabase Setup for KanoXchange

KanoXchange uses Supabase (PostgreSQL) for secure, scalable cloud storage. Your user data is stored in Supabase with encryption at rest and automatic backups.

## Quick Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com)

2. **Get your connection string** from Supabase Dashboard → **Settings** → **Database**:
   - Use the **Connection pooling** URL (Session mode, port 6543) for serverless/Vercel
   - Format: `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

3. **Add to your environment**:
   ```bash
   DATABASE_URL=postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```

4. **Start the API** – the schema is created automatically on first run.

## Security

- **Encryption at rest**: Supabase encrypts all data with AES-256
- **TLS in transit**: All connections use SSL/TLS
- **Wallet keys**: Still encrypted with `WALLET_ENCRYPTION_KEY` before storage
- **Backups**: Supabase provides point-in-time recovery (PITR) on paid plans

## Local Development

Without `DATABASE_URL` or `SUPABASE_DB_URL`, the API falls back to SQLite in `./data/kanox.db`. Set the Supabase URL when you want to test against the cloud database.
