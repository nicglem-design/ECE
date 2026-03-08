import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.get("/", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string; email: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = db.prepare(
    "SELECT display_name as displayName, avatar_url as avatarUrl, theme, preferred_currency as preferredCurrency FROM profiles WHERE user_id = ?"
  ).get(user.sub) as { displayName: string; avatarUrl: string; theme: string; preferredCurrency: string } | undefined;
  if (!row) {
    res.json({
      id: user.sub,
      email: user.email,
      displayName: "",
      avatarUrl: "",
      theme: "dark",
      preferredCurrency: "usd",
    });
    return;
  }
  res.json({
    id: user.sub,
    email: user.email,
    displayName: row.displayName || "",
    avatarUrl: row.avatarUrl || "",
    theme: row.theme || "dark",
    preferredCurrency: row.preferredCurrency || "usd",
  });
});

router.patch("/", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { displayName, avatarUrl, theme, preferredCurrency } = req.body;
  const now = Date.now();
  db.prepare(
    `UPDATE profiles SET 
      display_name = COALESCE(?, display_name),
      avatar_url = COALESCE(?, avatar_url),
      theme = COALESCE(?, theme),
      preferred_currency = COALESCE(?, preferred_currency),
      updated_at = ?
    WHERE user_id = ?`
  ).run(
    displayName ?? null,
    avatarUrl ?? null,
    theme ?? null,
    preferredCurrency ?? null,
    now,
    user.sub
  );
  const row = db.prepare(
    "SELECT display_name as displayName, avatar_url as avatarUrl, theme, preferred_currency as preferredCurrency FROM profiles WHERE user_id = ?"
  ).get(user.sub) as { displayName: string; avatarUrl: string; theme: string; preferredCurrency: string };
  res.json({
    id: (req as Request & { user?: { sub: string } }).user!.sub,
    email: (req as Request & { user?: { email: string } }).user!.email,
    displayName: row?.displayName || "",
    avatarUrl: row?.avatarUrl || "",
    theme: row?.theme || "dark",
    preferredCurrency: row?.preferredCurrency || "usd",
  });
});

export default router;
