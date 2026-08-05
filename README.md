# dammv2-tracker

Bot Telegram yang memantau wallet Solana tertentu dan mengirim alert saat wallet tersebut
**membuka** atau **menutup posisi** di Meteora **DAMM v2** (program `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`).

## Cara kerja

1. **Deteksi on-chain**: setiap wallet yang ditrack didaftarkan sebagai `accountAddresses` di
   sebuah [Helius](https://helius.dev) enhanced webhook. Setiap transaksi yang menyentuh wallet
   tersebut dikirim real-time ke endpoint `POST /webhook/helius`.
2. **Parsing**: transaksi diperiksa untuk instruksi program DAMM v2. Instruksi `create_position`
   dianggap **OPEN**, instruksi `close_position` dianggap **CLOSE**. Instruksi `add_liquidity` /
   `remove_liquidity` murni (tanpa create/close) diabaikan karena itu bukan open/close posisi.
   Account layout diambil langsung dari IDL resmi `cp_amm` (lihat `src/helius/idl.ts`).
3. **Perubahan saldo**: dihitung dari `accountData[].nativeBalanceChange` /
   `tokenBalanceChanges` milik wallet pada transaksi tersebut (data ini sudah disediakan Helius,
   sudah netted).
4. **Harga**: harga USD token diambil dari Jupiter Price API (`lite-api.jup.ag/price/v2`, tanpa
   API key). Simbol token diambil dari Jupiter token metadata API, fallback ke alamat mint
   dipersingkat jika token tidak dikenal.
5. **PnL saat close**: saat OPEN, total USD yang keluar dari wallet dicatat sebagai *deposit
   basis* per alamat posisi (di SQLite). Saat CLOSE, PnL = total USD yang diterima − deposit
   basis − estimasi fee jaringan.
6. **Notifikasi**: dikirim ke semua chat Telegram yang sudah `/start` bot ini.

> **Catatan penting soal akurasi PnL/fee**: DAMM v2 tidak mengekspos satu angka "fee" tunggal
> on-chain yang siap pakai. Nilai `fee` pada alert ini adalah estimasi biaya jaringan Solana
> (bukan model proprietary seperti yang dipakai lpAgent/GMGN), sehingga angka PnL bisa sedikit
> berbeda dari yang ditampilkan situs lain. Sesuaikan `recordClose` di `src/positions/pnl.ts`
> bila kamu punya formula fee yang lebih akurat.
>
> URL "Porto" (lpAgent portfolio) dan link pool masih berupa template tebakan
> (`PORTO_URL_TEMPLATE`, `POOL_URL_TEMPLATE` di `.env`) karena format URL asli lpAgent.io tidak
> bisa dipastikan otomatis — cek manual dan sesuaikan template-nya di `.env`.

## Setup

### 1. Requirements

- Node.js 20+
- Sebuah bot Telegram (buat via [@BotFather](https://t.me/BotFather), ambil token)
- API key [Helius](https://helius.dev) (free tier cukup untuk mulai)
- Domain/URL publik HTTPS yang bisa diakses Helius untuk mengirim webhook (contoh: deploy ke
  Railway/Render/VPS, atau gunakan tunnel seperti `ngrok`/`cloudflared` untuk testing lokal)

### 2. Install

```bash
npm install
cp .env.example .env
```

Isi `.env`:

- `TELEGRAM_BOT_TOKEN` — token dari BotFather
- `TELEGRAM_ADMIN_ID` — (opsional) Telegram user ID kamu, supaya hanya kamu yang bisa
  `/addwallet` / `/removewallet`. Kosongkan untuk mengizinkan siapa saja yang chat bot.
- `HELIUS_API_KEY` — API key Helius
- `PUBLIC_WEBHOOK_URL` — URL publik ke endpoint `/webhook/helius` (mis. `https://xxx.com/webhook/helius`)
- `HELIUS_WEBHOOK_SECRET` — string random buatan sendiri, dipakai sebagai `Authorization` header
  yang divalidasi di endpoint webhook

### 3. Jalankan

```bash
npm run dev     # development (tsx watch)
# atau
npm run build && npm start   # production
```

### 4. Pakai bot di Telegram

- `/start` — daftarkan chat ini untuk menerima notifikasi
- `/addwallet <address> <label>` — mulai memantau wallet (otomatis daftar ke webhook Helius)
- `/removewallet <address>` — berhenti memantau wallet
- `/listwallets` — lihat semua wallet yang dipantau
- `/stop` — berhenti menerima notifikasi di chat ini

Contoh:

```
/addwallet 7xKX...abcd CUANSINO
```

## Struktur proyek

```
src/
  config.ts              env vars + konstanta program DAMM v2
  db/index.ts             SQLite: wallets, chats, positions, kv
  helius/
    idl.ts                 discriminator & account layout instruksi cp_amm (dari IDL resmi)
    client.ts               create/update Helius webhook sesuai daftar wallet
    parser.ts               parsing payload enhanced-transaction → DammEvent
  pricing/
    jupiter.ts               harga USD (Jupiter Price API)
    metadata.ts              simbol token (Jupiter token metadata API)
  positions/
    pnl.ts                    deposit basis & kalkulasi PnL
  telegram/
    bot.ts                    command handler + broadcast
    format.ts                  format pesan alert OPEN/CLOSE
  handler.ts                orkestrasi: parse → price → pnl → notify
  server.ts                 Express app + endpoint webhook
  index.ts                  entrypoint
```

## Keterbatasan yang perlu diketahui

- Deposit basis PnL hanya tersedia untuk posisi yang **dibuka setelah bot ini berjalan**
  (karena disimpan di SQLite lokal saat event OPEN terdeteksi). Posisi yang sudah ada sebelum
  bot dijalankan akan tetap memicu alert CLOSE, tapi tanpa baris PnL/deposit/fee (karena basis
  tidak diketahui).
- Satu proses Helius webhook mencakup semua wallet yang ditrack; setiap `/addwallet` /
  `/removewallet` akan mem-PUT ulang seluruh daftar address ke webhook yang sama.
