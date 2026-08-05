import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { config } from "../config";

const dir = path.dirname(config.db.path);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.db.path);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS wallets (
  address TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  porto_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  chat_id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  position_address TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  deposit_usd REAL NOT NULL,
  open_tx_signature TEXT NOT NULL,
  opened_at INTEGER NOT NULL
);
`);

export interface Wallet {
  address: string;
  label: string;
  porto_url: string | null;
  created_at: number;
}

export function addWallet(address: string, label: string, portoUrl?: string): void {
  db.prepare(
    `INSERT INTO wallets (address, label, porto_url, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET label = excluded.label, porto_url = excluded.porto_url`
  ).run(address, label, portoUrl ?? null, Date.now());
}

export function removeWallet(address: string): boolean {
  const res = db.prepare(`DELETE FROM wallets WHERE address = ?`).run(address);
  return res.changes > 0;
}

export function listWallets(): Wallet[] {
  return db.prepare(`SELECT * FROM wallets ORDER BY created_at ASC`).all() as Wallet[];
}

export function getWallet(address: string): Wallet | undefined {
  return db.prepare(`SELECT * FROM wallets WHERE address = ?`).get(address) as Wallet | undefined;
}

export function addChat(chatId: number): void {
  db.prepare(`INSERT OR IGNORE INTO chats (chat_id, created_at) VALUES (?, ?)`).run(chatId, Date.now());
}

export function removeChat(chatId: number): void {
  db.prepare(`DELETE FROM chats WHERE chat_id = ?`).run(chatId);
}

export function listChats(): number[] {
  return (db.prepare(`SELECT chat_id FROM chats`).all() as { chat_id: number }[]).map((r) => r.chat_id);
}

export interface Position {
  position_address: string;
  wallet_address: string;
  pool_address: string;
  deposit_usd: number;
  open_tx_signature: string;
  opened_at: number;
}

export function savePositionOpen(pos: Position): void {
  db.prepare(
    `INSERT INTO positions (position_address, wallet_address, pool_address, deposit_usd, open_tx_signature, opened_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(position_address) DO UPDATE SET
       deposit_usd = excluded.deposit_usd,
       open_tx_signature = excluded.open_tx_signature,
       opened_at = excluded.opened_at`
  ).run(pos.position_address, pos.wallet_address, pos.pool_address, pos.deposit_usd, pos.open_tx_signature, pos.opened_at);
}

export function getPosition(positionAddress: string): Position | undefined {
  return db.prepare(`SELECT * FROM positions WHERE position_address = ?`).get(positionAddress) as Position | undefined;
}

export function deletePosition(positionAddress: string): void {
  db.prepare(`DELETE FROM positions WHERE position_address = ?`).run(positionAddress);
}
