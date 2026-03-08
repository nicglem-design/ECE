/**
 * File-based persistence for order book state.
 * Skips in serverless (Vercel). Uses ./data/orderbook.json for local/dev.
 */

import path from "path";
import fs from "fs";
import type { Order, Trade } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "orderbook.json");

export interface PersistedState {
  orderIdCounter: number;
  tradeIdCounter: number;
  orders: Order[];
  tradesByPair: Record<string, Trade[]>;
  bidsByPair: Record<string, Record<string, number>>;
  asksByPair: Record<string, Record<string, number>>;
}

function canPersist(): boolean {
  return typeof process !== "undefined" && process.env.VERCEL !== "1";
}

export function loadState(): PersistedState | null {
  if (!canPersist()) return null;
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, "utf-8");
      return JSON.parse(raw) as PersistedState;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveState(state: PersistedState): void {
  if (!canPersist()) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(state, null, 0), "utf-8");
  } catch {
    // ignore
  }
}
