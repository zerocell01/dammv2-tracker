# dammv2-tracker

Bot Telegram yang memantau wallet Solana tertentu dan mengirim alert saat wallet tersebut
**membuka** atau **menutup posisi** di Meteora **DAMM v2** (program `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`).

## Cara kerja

1. **Deteksi on-chain**: proses ini membuka koneksi **WebSocket** ke `wss://mainnet.helius-rpc.com`
   dan subscribe (`logsSubscribe`) ke semua transaksi yang menyentuh program DAMM v2. Tidak perlu
   domain/URL publik — koneksinya keluar dari VPS kamu ke Helius, bukan sebaliknya.
2. **Parsing**: saat ada notifikasi log, signature transaksinya di-batch lalu dikirim ke REST API
   Helius (`/v0/transactions`) untuk diubah jadi "enhanced transaction" (data terstruktur:
   balance changes, instruksi, dst). Transaksi diperiksa untuk instruksi program DAMM v2:
   `create_position` dianggap **OPEN**, `close_position` dianggap **CLOSE**. Instruksi
   `add_liquidity` / `remove_liquidity` murni (tanpa create/close) diabaikan karena itu bukan
   open/close posisi. Wallet pemilik posisi dicocokkan ke daftar wallet yang ditrack di database
   — kalau tidak cocok, event diabaikan. Account layout diambil langsung dari IDL resmi `cp_amm`
   (lihat `src/helius/idl.ts`).
3. **Perubahan saldo**: dihitung dari `accountData[].nativeBalanceChange` /
   `tokenBalanceChanges` milik wallet pada transaksi tersebut (data ini sudah disediakan Helius,
   sudah netted).
4. **Harga**: harga USD token diambil dari Jupiter Price API (`lite-api.jup.ag/price/v2`, tanpa
   API key). Simbol token diambil dari Jupiter token metadata API, fallback ke alamat mint
   dipersingkat jika token tidak dikenal.
5. **PnL saat close**: saat OPEN, total USD yang keluar dari wallet dicatat sebagai *deposit
   basis* per alamat posisi (di SQLite). Saat CLOSE, PnL = total USD yang diterima − deposit
   basis.
6. **Notifikasi**: dikirim ke semua chat Telegram yang sudah `/start` bot ini, dengan 3 tombol
   inline (GMGN, Pool, LPAgent).

Contoh alert:

```
🔷 OPEN : MADS -> SILVERINU-SOL
💵 Deposit : ($96.00) = 1.0000 SOL ($76.00) + 1.0000 SILVERINU ($20.00)
[ GMGN ] [ Pool ] [ LPAgent ]
```

```
🔶 CLOSE : MADS -> SILVERINU-SOL
💵 Remove : 1.0000 SOL ($76.00) + 1.0000 SILVERINU ($20.00) = $96.00
📊 PnL: 🟢 +$56.45 (+2099.36%)
[ GMGN ] [ Pool ] [ LPAgent ]
```

> **Kenapa tidak ada baris "fee" terpisah**: kalau *claim fee* dan *remove liquidity* terjadi
> dalam satu transaksi close dan menghasilkan token yang sama, Solana/Helius sudah menggabungkan
> keduanya jadi satu angka net balance change per token — tidak ada cara andal untuk memisahkan
> mana "principal" dan mana "fee" dari data on-chain tanpa mensimulasikan state pool. Daripada
> menampilkan angka fee yang ditebak (berisiko salah/duplikat dengan PnL), baris "Remove"
> menampilkan total gabungan apa adanya.
>
> URL "Porto"/"LPAgent" dan link pool masih berupa template tebakan (`PORTO_URL_TEMPLATE`,
> `POOL_URL_TEMPLATE` di `.env`) karena format URL asli lpAgent.io tidak bisa dipastikan
> otomatis — cek manual dan sesuaikan template-nya di `.env`.

## Setup

### 1. Requirements

- Node.js 20+
- Sebuah bot Telegram (buat via [@BotFather](https://t.me/BotFather), ambil token)
- API key [Helius](https://helius.dev) (free tier cukup untuk mulai)
- **Tidak perlu domain atau HTTPS publik** — bot ini hanya butuh koneksi outbound (WebSocket +
  HTTPS REST) dari server ke Helius/Jupiter/Telegram, bisa jalan di VPS mana pun tanpa DNS/proxy.

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
- `HELIUS_WS_URL` / `HELIUS_PARSE_TX_URL` — biasanya tidak perlu diubah dari default

### 3. Jalankan

```bash
npm run dev     # development (tsx watch)
# atau
npm run build && npm start   # production
```

### 4. Pakai bot di Telegram

- `/start` — daftarkan chat ini untuk menerima notifikasi
- `/addwallet <address> <label>` — mulai memantau wallet
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
  db/index.ts             SQLite: wallets, chats, positions
  helius/
    idl.ts                 discriminator & account layout instruksi cp_amm (dari IDL resmi)
    ws.ts                   koneksi WebSocket ke Helius (logsSubscribe) + fetch enhanced tx
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
  server.ts                 Express app (health check saja)
  index.ts                  entrypoint
```

## Keterbatasan yang perlu diketahui

- Deposit basis PnL hanya tersedia untuk posisi yang **dibuka setelah bot ini berjalan**
  (karena disimpan di SQLite lokal saat event OPEN terdeteksi). Posisi yang sudah ada sebelum
  bot dijalankan akan tetap memicu alert CLOSE, tapi tanpa baris PnL/deposit/fee (karena basis
  tidak diketahui).
- Koneksi WebSocket akan otomatis reconnect kalau putus (retry setiap 5 detik), tapi transaksi
  yang lewat saat koneksi putus bisa terlewat — jalankan dengan process manager (pm2/systemd)
  yang auto-restart agar downtime minimal.
- Subscription bersifat program-wide (semua transaksi DAMM v2 di seluruh Solana), lalu difilter
  di aplikasi berdasarkan wallet yang ditrack di database — jadi menambah/menghapus wallet via
  `/addwallet` / `/removewallet` tidak perlu resubscribe apa pun, langsung berlaku.
