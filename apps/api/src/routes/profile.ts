import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { validateBody } from "../middleware/validate";

const router = Router();

const dashboardLayoutSchema = z.array(z.string().max(50)).max(20).optional();
export const profilePatchSchema = z.object({
  displayName: z.string().max(100).optional(),
  avatarUrl: z.union([z.string().url().max(500), z.literal("")]).optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
  preferredCurrency: z.enum(["usd", "eur", "gbp", "sek"]).optional(),
  preferredTerminology: z.enum(["simple", "pro"]).optional(),
  dashboardLayout: dashboardLayoutSchema,
}).strict();

router.get("/", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string; email: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = (await db.prepare(
    "SELECT display_name as displayName, avatar_url as avatarUrl, theme, preferred_currency as preferredCurrency, preferred_terminology as preferredTerminology, dashboard_layout as dashboardLayout FROM profiles WHERE user_id = ?"
  ).get(user.sub)) as { displayName: string; avatarUrl: string; theme: string; preferredCurrency: string; preferredTerminology?: string; dashboardLayout?: string } | undefined;
  if (!row) {
    res.json({
      id: user.sub,
      email: user.email,
      displayName: "",
      avatarUrl: "",
      theme: "dark",
      preferredCurrency: "usd",
      preferredTerminology: "simple",
      dashboardLayout: null,
    });
    return;
  }
  let dashboardLayout: string[] | null = null;
  if (row.dashboardLayout) {
    try {
      const parsed = JSON.parse(row.dashboardLayout) as unknown;
      dashboardLayout = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
    } catch {
      /* ignore */
    }
  }
  res.json({
    id: user.sub,
    email: user.email,
    displayName: row.displayName || "",
    avatarUrl: row.avatarUrl || "",
    theme: row.theme || "dark",
    preferredCurrency: row.preferredCurrency || "usd",
    preferredTerminology: row.preferredTerminology === "pro" ? "pro" : "simple",
    dashboardLayout,
  });
});

router.patch("/", authMiddleware, validateBody(profilePatchSchema), async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { displayName, avatarUrl, theme, preferredCurrency, preferredTerminology, dashboardLayout } = req.body;
  const now = Date.now();
  const layoutJson = dashboardLayout != null ? JSON.stringify(dashboardLayout) : null;

  const existing = await db.prepare("SELECT 1 FROM profiles WHERE user_id = ?").get(user.sub);
  if (!existing) {
    await db.prepare(
      `INSERT INTO profiles (user_id, display_name, avatar_url, theme, preferred_currency, preferred_terminology, dashboard_layout, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.sub,
      displayName ?? "",
      avatarUrl ?? "",
      theme ?? "dark",
      preferredCurrency ?? "usd",
      preferredTerminology ?? "simple",
      layoutJson,
      now
    );
  } else {
    await db.prepare(
      `UPDATE profiles SET 
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        theme = COALESCE(?, theme),
        preferred_currency = COALESCE(?, preferred_currency),
        preferred_terminology = COALESCE(?, preferred_terminology),
        dashboard_layout = COALESCE(?, dashboard_layout),
        updated_at = ?
      WHERE user_id = ?`
    ).run(
      displayName ?? null,
      avatarUrl ?? null,
      theme ?? null,
      preferredCurrency ?? null,
      preferredTerminology ?? null,
      layoutJson,
      now,
      user.sub
    );
  }

  const row = (await db.prepare(
    "SELECT display_name as displayName, avatar_url as avatarUrl, theme, preferred_currency as preferredCurrency, preferred_terminology as preferredTerminology, dashboard_layout as dashboardLayout FROM profiles WHERE user_id = ?"
  ).get(user.sub)) as { displayName: string; avatarUrl: string; theme: string; preferredCurrency: string; preferredTerminology?: string; dashboardLayout?: string };
  let outLayout: string[] | null = null;
  if (row?.dashboardLayout) {
    try {
      const parsed = JSON.parse(row.dashboardLayout) as unknown;
      outLayout = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
    } catch {
      /* ignore */
    }
  }
  res.json({
    id: (req as Request & { user?: { sub: string } }).user!.sub,
    email: (req as Request & { user?: { email: string } }).user!.email,
    displayName: row?.displayName || "",
    avatarUrl: row?.avatarUrl || "",
    theme: row?.theme || "dark",
    preferredCurrency: row?.preferredCurrency || "usd",
    preferredTerminology: row?.preferredTerminology === "pro" ? "pro" : "simple",
    dashboardLayout: outLayout,
  });
});

export default router;
