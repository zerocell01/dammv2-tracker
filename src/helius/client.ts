import { config } from "../config";
import { db } from "../db";

const BASE = "https://api.helius.xyz/v0";

db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`);

function getKv(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value;
}

function setKv(key: string, value: string): void {
  db.prepare(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

interface HeliusWebhook {
  webhookID: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
  authHeader?: string;
}

async function heliusFetch(path: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}?api-key=${config.helius.apiKey}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Helius API ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function createWebhook(addresses: string[]): Promise<HeliusWebhook> {
  const wh = await heliusFetch("/webhooks", "POST", {
    webhookURL: config.helius.publicWebhookUrl,
    transactionTypes: ["Any"],
    accountAddresses: addresses,
    webhookType: "enhanced",
    authHeader: config.helius.webhookSecret,
  });
  setKv("helius_webhook_id", wh.webhookID);
  return wh;
}

async function editWebhook(webhookId: string, addresses: string[]): Promise<HeliusWebhook> {
  return heliusFetch(`/webhooks/${webhookId}`, "PUT", {
    webhookURL: config.helius.publicWebhookUrl,
    transactionTypes: ["Any"],
    accountAddresses: addresses,
    webhookType: "enhanced",
    authHeader: config.helius.webhookSecret,
  });
}

async function getWebhookId(): Promise<string | undefined> {
  return getKv("helius_webhook_id");
}

/**
 * Ensures the Helius webhook exists and is watching exactly the given set of wallet addresses.
 * Called whenever a wallet is added or removed via the Telegram bot.
 */
export async function syncWebhookAddresses(addresses: string[]): Promise<void> {
  const existingId = await getWebhookId();
  if (!existingId) {
    if (addresses.length === 0) return;
    await createWebhook(addresses);
    return;
  }
  await editWebhook(existingId, addresses);
}
