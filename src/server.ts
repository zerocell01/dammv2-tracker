import express from "express";
import { config } from "./config";
import { handleHeliusTransactions } from "./handler";
import { HeliusEnhancedTransaction } from "./helius/parser";

export function createServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.post("/webhook/helius", async (req, res) => {
    const auth = req.header("Authorization");
    if (auth !== config.helius.webhookSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const body = req.body;
    const txs: HeliusEnhancedTransaction[] = Array.isArray(body) ? body : [body];

    res.status(200).json({ ok: true });

    handleHeliusTransactions(txs).catch((err) => console.error("Error handling webhook payload:", err));
  });

  return app;
}
