/**
 * SQLite database setup and schema.
 * Stores users, profiles, wallet addresses, balances, transactions.
 */

import Database from "better-sqlite3";
import path from "path";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "kanox.db");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    display_name TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    theme TEXT DEFAULT 'dark',
    preferred_currency TEXT DEFAULT 'usd',
    birth_date TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS addresses (
    user_id TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    address TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, chain_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS balances (
    user_id TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, chain_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount TEXT NOT NULL,
    from_address TEXT,
    to_address TEXT,
    tx_hash TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS kyc_status (
    user_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user_chain ON transactions(user_id, chain_id);

  CREATE TABLE IF NOT EXISTS fiat_balances (
    user_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, currency),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS stripe_payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS fiat_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    method TEXT,
    destination TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS linked_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    last_four TEXT,
    currency TEXT,
    stripe_account_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_fiat_transactions_user ON fiat_transactions(user_id);

  CREATE TABLE IF NOT EXISTS deposit_sync (
    user_id TEXT NOT NULL,
    chain_id TEXT NOT NULL,
    block_number INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, chain_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wallet_keys (
    user_id TEXT NOT NULL,
    chain_type TEXT NOT NULL,
    address TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, chain_type),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_2fa (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    totp_secret TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try {
  db.exec("ALTER TABLE linked_accounts ADD COLUMN stripe_account_id TEXT");
} catch {
  // Column may already exist
}
try {
  db.exec("ALTER TABLE profiles ADD COLUMN stripe_connect_account_id TEXT");
} catch {
  // Column may already exist
}
