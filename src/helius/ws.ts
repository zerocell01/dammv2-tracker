import WebSocket from "ws";
import { config, DAMM_V2_PROGRAM_ID } from "../config";
import { HeliusEnhancedTransaction } from "./parser";
import { handleHeliusTransactions } from "../handler";

const RECONNECT_DELAY_MS = 5_000;
const BATCH_WINDOW_MS = 1_500;
const MAX_BATCH_SIZE = 100; // Helius parse-transactions API limit per request

let pendingSignatures = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

function queueSignature(signature: string): void {
  pendingSignatures.add(signature);
  if (!flushTimer) {
    flushTimer = setTimeout(flushQueue, BATCH_WINDOW_MS);
  }
}

async function flushQueue(): Promise<void> {
  flushTimer = null;
  const signatures = Array.from(pendingSignatures);
  pendingSignatures = new Set();
  if (signatures.length === 0) return;

  for (let i = 0; i < signatures.length; i += MAX_BATCH_SIZE) {
    const batch = signatures.slice(i, i + MAX_BATCH_SIZE);
    try {
      await parseAndHandle(batch);
    } catch (err) {
      console.error("Failed to parse/handle transaction batch:", err);
    }
  }
}

async function parseAndHandle(signatures: string[]): Promise<void> {
  const res = await fetch(`${config.helius.parseTxUrl}?api-key=${config.helius.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions: signatures }),
  });
  if (!res.ok) {
    console.error(`Helius parse-transactions failed: ${res.status} ${await res.text()}`);
    return;
  }
  const txs = (await res.json()) as HeliusEnhancedTransaction[];
  await handleHeliusTransactions(txs);
}

function connect(): void {
  const url = `${config.helius.wsUrl}/?api-key=${config.helius.apiKey}`;
  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("Helius WebSocket connected, subscribing to DAMM v2 program logs...");
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "logsSubscribe",
        params: [{ mentions: [DAMM_V2_PROGRAM_ID] }, { commitment: "confirmed" }],
      })
    );
  });

  ws.on("message", (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.method !== "logsNotification") return;
    const value = msg.params?.result?.value;
    if (!value || value.err) return; // skip failed transactions
    const signature = value.signature;
    if (signature) queueSignature(signature);
  });

  ws.on("error", (err) => {
    console.error("Helius WebSocket error:", err.message);
  });

  ws.on("close", () => {
    console.warn(`Helius WebSocket closed, reconnecting in ${RECONNECT_DELAY_MS}ms...`);
    setTimeout(connect, RECONNECT_DELAY_MS);
  });
}

export function startHeliusListener(): void {
  connect();
}
