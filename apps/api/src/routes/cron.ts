/**
 * Internal cron endpoints. Protected by CRON_SECRET or API_INTERNAL_KEY.
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { seedMarketMaker } from "../lib/marketMaker";
import { isEVMChain } from "../crypto/custody";
import { syncDepositsForUser } from "../crypto/depositSync";
import { syncBitcoinDepositsForUser } from "../crypto/depositSync-bitcoin";
import { syncSolanaDepositsForUser } from "../crypto/depositSync-solana";
import { syncLitecoinDepositsForUser } from "../crypto/depositSync-litecoin";
import { syncDogecoinDepositsForUser } from "../crypto/depositSync-dogecoin";

const router = Router();

function isCronAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const internalKey = process.env.API_INTERNAL_KEY;
  const authHeader = req.headers.authorization;
  const internalHeader = req.headers["x-internal-key"] as string | undefined;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (internalKey && internalHeader === internalKey) return true;
  return false;
}

/** POST /sync-deposits - Sync deposits for ALL users. Call from cron. */
router.post("/sync-deposits", async (req: Request, res: Response) => {
  if (!isCronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const rows = (await db.prepare(
      "SELECT DISTINCT user_id as userId, chain_id as chainId, address FROM addresses"
    ).all()) as { userId: string; chainId: string; address: string }[];

    let totalNewDeposits = 0;
    const errors: string[] = [];

    for (const r of rows) {
      try {
        if (isEVMChain(r.chainId)) {
          totalNewDeposits += await syncDepositsForUser(r.userId, r.chainId, r.address);
        } else if (r.chainId === "bitcoin") {
          totalNewDeposits += await syncBitcoinDepositsForUser(r.userId, r.address);
        } else if (r.chainId === "solana") {
          totalNewDeposits += await syncSolanaDepositsForUser(r.userId, r.address);
        } else if (r.chainId === "litecoin") {
          totalNewDeposits += await syncLitecoinDepositsForUser(r.userId, r.address);
        } else if (r.chainId === "dogecoin") {
          totalNewDeposits += await syncDogecoinDepositsForUser(r.userId, r.address);
        }
      } catch (err) {
        errors.push(`${r.userId}/${r.chainId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    res.json({
      success: true,
      usersProcessed: new Set(rows.map((x) => x.userId)).size,
      addressChecks: rows.length,
      newDeposits: totalNewDeposits,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (err) {
    console.error("Cron sync-deposits error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Sync failed",
    });
  }
});

/** POST /seed-market-maker - Seed order book with MM liquidity for instant swaps. */
router.post("/seed-market-maker", async (req: Request, res: Response) => {
  if (!isCronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await seedMarketMaker();
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Cron seed-market-maker error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Seed failed",
    });
  }
});

export default router;
