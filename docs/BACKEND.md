# Backend & Database Nemu

Dokumen ini menjelaskan cara menjalankan backend sungguhan (PostgreSQL) yang
menggantikan lapisan mock. Frontend tidak berubah: ia tetap memanggil
`/api/v1/*`, dan router memilih sumber data.

## Ringkasan arsitektur

```
Browser
  └─ Next.js App Router
       ├─ /api/v1/*  ──► src/app/api/v1/[...path]/route.ts
       │                    ├─ DATABASE_ENABLED=true  ──► src/server/handlers/*
       │                    └─ selain itu            ──► src/mocks/*  (demo)
       │
       └─ PostgreSQL 18
            ├─ transactions   (append-only, sumber kebenaran stok)
            ├─ stock_levels   (VIEW: saldo = agregasi log)
            ├─ issue_stock()  (fungsi atomik: cek + tulis, anti-oversell)
            └─ trigger enforce_no_negative_stock (jaring pengaman)
```

## Prinsip yang ditegakkan database

| Aturan | Cara ditegakkan |
| --- | --- |
| Stok tidak bisa diedit langsung | Tidak ada kolom `qty` di tabel item. Saldo = `SUM(delta)` dari `transactions` lewat view `stock_levels`. |
| Log tidak bisa diubah/dihapus | Trigger `transactions_immutable` menolak `UPDATE`/`DELETE`. Koreksi = transaksi pembalik. |
| Kiriman ulang tidak menggandakan | `UNIQUE (user_id, idempotency_key)`. |
| Arah transaksi harus masuk akal | `CHECK transactions_direction` per jenis. |
| Stok tidak pernah negatif | `issue_stock()` mengunci item + trigger `enforce_no_negative_stock`. |
| Mode buta tidak bocor | `CHECK verify_blind_hides_expected`. |
| Kredensial tidak plaintext | scrypt (PIN & password), sesi acak di tabel `sessions`. |

### Kenapa `issue_stock()` dan bukan cek-lalu-tulis di TypeScript

`SELECT ... FOR UPDATE` saja **tidak cukup**. Sudah diuji: dua pengambilan
bersamaan dari stok 7 dengan qty 5 keduanya lolos dan saldo menjadi -3, karena
lock hanya menserialkan pembacaan, bukan menolak penulisan yang membuat saldo
negatif.

Perbaikannya berlapis:
1. `issue_stock()` — cek dan tulis dalam satu transaksi dengan item terkunci
2. trigger `enforce_no_negative_stock` — menolak baris apa pun yang membuat
   saldo lokasi negatif, termasuk tulis langsung via SQL

Uji HTTP 20 permintaan paralel pada stok 5: **2 berhasil, 18 ditolak 409, saldo
akhir 1**. Tidak ada oversell.

## Menjalankan

### 1. PostgreSQL

```bash
# Windows (scoop)
scoop install postgresql
pg_ctl -D "$(scoop prefix postgresql)/data" -l pg.log start

# Docker
docker run -d --name nemu-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nemu postgres:18
```

### 2. Konfigurasi

```bash
cp .env.example .env.local
```

Isi `.env.local`:

```env
DATABASE_ENABLED=true
DATABASE_URL=postgres://postgres@127.0.0.1:5432/nemu
APP_SECRET=<openssl rand -base64 32>
ALLOW_ROLE_SWITCH=true        # JANGAN di produksi
```

### 3. Migrasi & seed

```bash
pnpm db:migrate    # terapkan migrasi yang belum jalan (idempoten)
pnpm db:seed       # 300 item, ~3.900 transaksi, 16 pengguna
pnpm db:reset      # drop + migrate + seed (destruktif)
```

### 4. Jalankan

```bash
pnpm build && DATABASE_ENABLED=true pnpm start -p 3100
```

## Akun seed

| Peran | Kode | PIN | Email / password |
| --- | --- | --- | --- |
| worker | WRK01 | 1122 | — |
| supervisor | SPV01 | 1357 | spv1@nemu.local / nemusup123 |
| admin | ADM01 | 2468 | andi@nemu.local / nemuadmin123 |

SPV02 dan SPV03 ada di seed tapi **nonaktif** — untuk menguji penolakan akun
nonaktif.

## Uji

```bash
node scripts/smoke-api.mjs          # auth, izin, transaksi, idempotency, 409
node scripts/smoke-concurrency.mjs  # 20 permintaan paralel, anti-oversell
node scripts/smoke-ui.mjs           # login lewat UI, dashboard, item, admin
npx tsx scripts/check-contract.ts   # respons API vs skema Zod klien
```

`check-contract.ts` penting: ia menangkap ketidakcocokan bentuk respons lebih
cepat daripada menebak dari pesan error UI.

## Status cakupan

Rute yang **sudah** memakai PostgreSQL:

- `auth/login`, `auth/logout`, `auth/session`, `auth/role`
- `items/search`, `items/by-code/:code`, `items`, `items/:id` (PATCH), `items/bulk`
- `transactions`, `transactions/:id/reverse`
- `health`, `version`

Rute yang **masih** dilayani mock (header `X-Nemu-Source: mock-fallback`):
dashboard, categories, units, locations, reasons, equipment, users, custody,
verifications, stock, stock-counts, reports, imports, integrations/google,
audit, settings, sync/batch, events, meta.

Frontend tetap berfungsi penuh karena bentuk respons mock identik. Sesi
database didaftarkan ke store mock lewat `src/server/mock-bridge.ts` supaya
rute fallback tidak membalas 401.

## Yang belum ada

- Worker/outbox untuk ekspor ke Google Sheets
- OAuth Google sungguhan + enkripsi token AES-256-GCM (kolom ada, fungsi belum)
- Docker Compose
- `/api/v1/openapi.json`
- Backup otomatis
- Uji beban dan uji rate limit berulang

## Catatan keamanan

- Sesi disimpan di database sehingga bisa dicabut seketika. Cookie hanya
  membawa id acak; peran **selalu** dibaca dari `users`, tidak dipercaya dari
  cookie.
- Middleware tidak bisa memverifikasi sesi database (edge runtime tanpa akses
  Postgres), jadi ia hanya memeriksa keberadaan cookie. Penegakan sebenarnya
  ada di `src/server/guards.ts` (dipanggil `app/layout.tsx` dan
  `admin/layout.tsx`) serta di setiap handler API.
- `ALLOW_ROLE_SWITCH` mematikan/menghidupkan ganti peran untuk panel dev.
  Default di produksi: mati.
