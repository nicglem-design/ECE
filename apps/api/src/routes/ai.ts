import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";
import { logger } from "../lib/logger";

const router = Router();

router.post("/chat", authMiddleware, async (req: Request, res: Response) => {
  if (!config.openaiApiKey) {
    res.status(503).json({ reply: "AI chat is not configured. Set OPENAI_API_KEY." });
    return;
  }
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ reply: "Messages required" });
    return;
  }
  try {
    const openai = new OpenAI({ apiKey: config.openaiApiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      max_tokens: 500,
    });
    const reply = completion.choices[0]?.message?.content || "I couldn't generate a response.";
    res.json({ reply });
  } catch (err) {
    logger.error({ err }, "OpenAI error");
    res.status(500).json({ reply: "Sorry, I encountered an error. Please try again." });
  }
});

export default router;
