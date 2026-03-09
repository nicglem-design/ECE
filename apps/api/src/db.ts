/**
 * Database layer: Supabase (PostgreSQL) or SQLite fallback.
 * Use DATABASE_URL (Supabase connection string) for cloud storage.
 */

import path from "path";
import fs from "fs";
import os from "os";

const connectionString =
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

if (connectionString) {
  // Supabase / PostgreSQL
  const { Pool } = require("pg");

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("supabase") ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  function convertPlaceholders(sql: string): string {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  db = {
    exec: async (sql: string): Promise<void> => {
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    },
    prepare: (sql: string) => {
      const converted = convertPlaceholders(sql);
      return {
        run: async (...params: unknown[]) => {
          const r = await pool.query(converted, params);
          return { changes: r.rowCount ?? 0 };
        },
        get: async (...params: unknown[]) => {
          const r = await pool.query(converted, params);
          return r.rows[0];
        },
        all: async (...params: unknown[]) => {
          const r = await pool.query(converted, params);
          return r.rows;
        },
      };
    },
  };

  // Run schema on startup
  (async () => {
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          email_verified SMALLINT NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS profiles (
          user_id TEXT PRIMARY KEY REFERENCES users(id),
          display_name TEXT DEFAULT '',
          avatar_url TEXT DEFAULT '',
          theme TEXT DEFAULT 'dark',
          preferred_currency TEXT DEFAULT 'usd',
          birth_date TEXT,
          updated_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS addresses (
          user_id TEXT NOT NULL,
          chain_id TEXT NOT NULL,
          address TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, chain_id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS balances (
          user_id TEXT NOT NULL,
          chain_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          name TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL,
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
          created_at BIGINT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS kyc_status (
          user_id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'pending',
          updated_at BIGINT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_user_chain ON transactions(user_id, chain_id);

        CREATE TABLE IF NOT EXISTS fiat_balances (
          user_id TEXT NOT NULL,
          currency TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, currency),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS stripe_payments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          currency TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          stripe_payment_intent_id TEXT,
          created_at BIGINT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS fiat_transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          currency TEXT NOT NULL,
          type TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          status TEXT NOT NULL DEFAULT 'completed',
          method TEXT,
          destination TEXT,
          created_at BIGINT NOT NULL,
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
          created_at BIGINT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_fiat_transactions_user ON fiat_transactions(user_id);

        CREATE TABLE IF NOT EXISTS deposit_sync (
          user_id TEXT NOT NULL,
          chain_id TEXT NOT NULL,
          block_number BIGINT NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, chain_id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS wallet_keys (
          user_id TEXT NOT NULL,
          chain_type TEXT NOT NULL,
          address TEXT NOT NULL,
          encrypted_private_key TEXT NOT NULL,
          created_at BIGINT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS market_orders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          pair TEXT NOT NULL,
          side TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          filled DOUBLE PRECISION NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'open',
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_market_orders_user ON market_orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_market_orders_pair ON market_orders(pair);
        CREATE INDEX IF NOT EXISTS idx_market_orders_status ON market_orders(status);

        CREATE TABLE IF NOT EXISTS market_trades (
          id TEXT PRIMARY KEY,
          pair TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          buy_order_id TEXT NOT NULL,
          sell_order_id TEXT NOT NULL,
          buyer_id TEXT NOT NULL,
          seller_id TEXT NOT NULL,
          timestamp BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_market_trades_pair ON market_trades(pair);

        CREATE TABLE IF NOT EXISTS market_book (
          pair TEXT NOT NULL,
          side TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          PRIMARY KEY (pair, side, price)
        );

        CREATE TABLE IF NOT EXISTS auth_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          token TEXT NOT NULL,
          type TEXT NOT NULL,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_id, type);

        CREATE TABLE IF NOT EXISTS revoked_jwt (
          jti TEXT PRIMARY KEY,
          expires_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_revoked_jwt_expires ON revoked_jwt(expires_at);

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          details TEXT,
          ip TEXT,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
        CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
      `);

      try {
        await db.exec("ALTER TABLE users ADD COLUMN email_verified SMALLINT NOT NULL DEFAULT 0");
      } catch {
        /* column may exist */
      }
      try {
        await db.exec("ALTER TABLE linked_accounts ADD COLUMN stripe_account_id TEXT");
      } catch {
        /* column may exist */
      }
      try {
        await db.exec("ALTER TABLE profiles ADD COLUMN stripe_connect_account_id TEXT");
      } catch {
        /* column may exist */
      }
      try {
        await db.exec("ALTER TABLE users ADD COLUMN tos_accepted_at BIGINT");
      } catch {
        /* column may exist */
      }
    } catch (err) {
      console.error("Supabase schema init error:", err);
    }
  })();
} else {
  // SQLite fallback (local dev)
  const Database = require("better-sqlite3");
  let dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "kanox.db");
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  function runSchema(database: { exec: (sql: string) => void }) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS market_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pair TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      amount REAL NOT NULL,
      filled REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_orders_user ON market_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_market_orders_pair ON market_orders(pair);
    CREATE INDEX IF NOT EXISTS idx_market_orders_status ON market_orders(status);

    CREATE TABLE IF NOT EXISTS market_trades (
      id TEXT PRIMARY KEY,
      pair TEXT NOT NULL,
      price REAL NOT NULL,
      amount REAL NOT NULL,
      buy_order_id TEXT NOT NULL,
      sell_order_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_trades_pair ON market_trades(pair);

    CREATE TABLE IF NOT EXISTS market_book (
      pair TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      amount REAL NOT NULL,
      PRIMARY KEY (pair, side, price)
    );
  `);

    try {
      database.exec("ALTER TABLE linked_accounts ADD COLUMN stripe_account_id TEXT");
    } catch {
      /* column may exist */
    }
    try {
      database.exec("ALTER TABLE profiles ADD COLUMN stripe_connect_account_id TEXT");
    } catch {
      /* column may exist */
    }
    try {
      database.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    } catch {
      /* column may exist */
    }
    try {
      database.exec("ALTER TABLE users ADD COLUMN tos_accepted_at INTEGER");
    } catch {
      /* column may exist */
    }
    database.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL,
      type TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_id, type);

    CREATE TABLE IF NOT EXISTS revoked_jwt (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_revoked_jwt_expires ON revoked_jwt(expires_at);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
  `);
  }

  db = new Database(dbPath);
  try {
    runSchema(db);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "SQLITE_READONLY" || code === "SQLITE_CANTOPEN") {
      db.close();
      const fallbackPath = path.join(os.tmpdir(), "kanox.db");
      console.warn(`Database path not writable (${dbPath}), using fallback: ${fallbackPath}`);
      db = new Database(fallbackPath);
      runSchema(db);
    } else {
      throw err;
    }
  }

  // Wrap SQLite sync API to return Promises (unified async interface)
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    const stmt = origPrepare(sql);
    return {
      run: (...params: unknown[]) => Promise.resolve(stmt.run(...params)),
      get: (...params: unknown[]) => Promise.resolve(stmt.get(...params)),
      all: (...params: unknown[]) => Promise.resolve(stmt.all(...params)),
    };
  };
  const origExec = db.exec.bind(db);
  db.exec = (sql: string) => Promise.resolve(origExec(sql));
}

export { db };
export const isAsync = !!connectionString;
