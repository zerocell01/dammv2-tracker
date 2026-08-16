import TelegramBot from "node-telegram-bot-api";
import { config } from "../config";
import { addWallet, removeWallet, listWallets, addChat, removeChat, listChats } from "../db";
import { InlineButton } from "./format";

export const bot = new TelegramBot(config.telegram.botToken, { polling: true });

function isAllowed(msg: TelegramBot.Message): boolean {
  if (!config.telegram.adminId) return true;
  return String(msg.from?.id) === config.telegram.adminId;
}

bot.onText(/^\/start$/, (msg) => {
  addChat(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    "DAMM v2 tracker aktif. Kirim /addwallet <address> <label> untuk mulai memantau wallet.\n\nKomando:\n/addwallet <address> <label>\n/removewallet <address>\n/listwallets\n/stop"
  );
});

bot.onText(/^\/stop$/, (msg) => {
  removeChat(msg.chat.id);
  bot.sendMessage(msg.chat.id, "Notifikasi dimatikan untuk chat ini.");
});

bot.onText(/^\/addwallet\s+(\S+)\s+(.+)$/, async (msg, match) => {
  if (!isAllowed(msg)) return bot.sendMessage(msg.chat.id, "Tidak diizinkan.");
  const address = match![1];
  const label = match![2].trim();
  try {
    addWallet(address, label);
    addChat(msg.chat.id);
    bot.sendMessage(msg.chat.id, `Wallet ditambahkan:\n${label} → ${address}`);
  } catch (err: any) {
    bot.sendMessage(msg.chat.id, `Gagal menambahkan wallet: ${err.message}`);
  }
});

bot.onText(/^\/addwallet$/, (msg) => {
  bot.sendMessage(msg.chat.id, "Format: /addwallet <address> <label>");
});

bot.onText(/^\/removewallet\s+(\S+)$/, async (msg, match) => {
  if (!isAllowed(msg)) return bot.sendMessage(msg.chat.id, "Tidak diizinkan.");
  const address = match![1];
  const removed = removeWallet(address);
  if (!removed) return bot.sendMessage(msg.chat.id, "Wallet tidak ditemukan.");
  bot.sendMessage(msg.chat.id, `Wallet dihapus: ${address}`);
});

bot.onText(/^\/listwallets$/, (msg) => {
  const wallets = listWallets();
  if (wallets.length === 0) return bot.sendMessage(msg.chat.id, "Belum ada wallet yang dipantau.");
  const text = wallets.map((w) => `• ${w.label} — ${w.address}`).join("\n");
  bot.sendMessage(msg.chat.id, text);
});

export async function broadcast(text: string, buttons?: InlineButton[]): Promise<void> {
  const chats = listChats();
  const reply_markup = buttons ? { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] } : undefined;
  for (const chatId of chats) {
    try {
      await bot.sendMessage(chatId, text, { disable_web_page_preview: true, reply_markup });
    } catch (err) {
      console.error(`Failed to send to chat ${chatId}:`, err);
    }
  }
}
