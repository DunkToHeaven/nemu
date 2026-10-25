# Nemu

> WMS berbasis QR untuk gudang yang bergerak cepat. Satu scan, rekam jejak permanen, angka stok yang bisa dipercaya.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Status](https://img.shields.io/badge/status-live-brightgreen)](https://nemu-free.my.id)

**Live:** https://nemu-free.my.id

## Kenapa Nemu ada

Gudang kehilangan barang bukan karena pekerjanya jahat — biasanya karena catatan
stok bisa diubah siapa saja tanpa jejak. Nemu menutup celah itu: setiap mutasi
stok jadi transaksi yang tidak bisa diedit, terikat ke satu orang dan satu rak,
dan bisa diaudit kapan pun.

## Fitur inti

| Fitur | Yang diselesaikan |
| --- | --- |
| Ledger immutable | Transaksi stok tidak bisa diubah atau dihapus setelah tercatat |
| Scan QR per rak | Pekerja cukup scan kode rak dari browser HP, tanpa alat khusus |
| Mode offline | Sinyal hilang di sudut gudang: input masuk antrean lokal, terkirim saat sinyal kembali |
| Multi-tenant | Satu instalasi melayani banyak organisasi, tiap organisasi punya schema Postgres sendiri |
| Laporan tren harga | Harga perolehan per tanggal, lengkap dengan delta dan persentase perubahan |
| Opname & kustodi | Sesi hitung fisik, antrean selisih, dan barang yang sedang dibawa pekerja |

## Coba sekarang

Buka https://nemu-free.my.id dan daftar organisasi baru lewat tombol
**Mulai Gratis Sekarang** — akun admin pertama dibuat otomatis untuk organisasi
itu. Tidak perlu kartu kredit.

Akun yang tersedia di instance demo:

| Peran | Cara login | Kredensial |
| --- | --- | --- |
| Admin | Email + kata sandi | `admin@nemu.local` / `nemuadmin123` |
| Supervisor | PIN | `SPV01` / `8820` |
| Pekerja | PIN | `WRK01` / `1982` |

> Pekerja hanya bisa scan dan mencatat mutasi. Supervisor membuka laporan dan
> opname. Admin mengelola master data dan pengguna.

## Jalankan lokal

**Prasyarat:** Node.js 20+ dan pnpm 10+.

```bash
git clone <url-repo-ini> nemu
cd nemu
pnpm install
cp .env.example .env.local
pnpm dev
```

Buka http://localhost:3000.

Tanpa database pun bisa jalan: `.env.local` dengan `DATABASE_ENABLED=false`
memakai lapisan mock berisi data contoh, jadi kamu bisa melihat seluruh UI
sebelum menyiapkan Postgres.

### Pakai PostgreSQL

```bash
# isi DATABASE_URL di .env.local, lalu:
pnpm db:migrate    # terapkan db/migrations/*.sql
pnpm db:seed       # isi data contoh
pnpm dev
```

Migrasi idempoten: yang sudah tercatat di tabel `schema_migrations` dilewati.
`pnpm db:reset` melakukan drop + migrate + seed dari nol.

## Konfigurasi

Semua variabel dibaca di server. Salin `.env.example` menjadi `.env.local`.

| Variabel | Wajib | Default | Keterangan |
| --- | --- | --- | --- |
| `DATABASE_ENABLED` | tidak | `false` | `true` memakai PostgreSQL, kosong memakai mock |
| `DATABASE_URL` | saat DB aktif | — | Connection string PostgreSQL |
| `DATABASE_POOL_MAX` | tidak | `5` | Koneksi maksimum pool global |
| `TENANT_POOL_MAX` | tidak | `2` | Koneksi maksimum per tenant |
| `APP_SECRET` | produksi | — | Kunci enkripsi token integrasi (AES-256-GCM). Buat: `openssl rand -base64 32` |
| `ALLOW_ROLE_SWITCH` | tidak | `true` | Panel ganti peran untuk dev. **Matikan di produksi.** |
| `NEXT_PUBLIC_FLAGS` | tidak | semua aktif | Feature flag, dipisah koma |

### Feature flag

| Flag | Fitur |
| --- | --- |
| `cv` | Konfirmasi sisa saat ambil (Sesuai/Beda) |
| `cf` | Skor keyakinan stok |
| `cu` | Kustodi: barang dibawa + pengingat akhir shift |
| `opname` | Stock opname + antrean selisih |
| `offline` | Antrean offline IndexedDB + `/sync/batch` |

Contoh: `NEXT_PUBLIC_FLAGS=cv,cf pnpm dev`

## Rute

| Rute | Akses | Isi |
| --- | --- | --- |
| `/` | publik | Landing + login |
| `/signup` | publik | Daftar organisasi baru |
| `/support` | publik | Dukung kreator & kanal kontak |
| `/i/[kode]` | worker+ | Hasil scan: info item + form ambil/kembali/masuk |
| `/app` | worker+ | Dashboard sesuai peran |
| `/app/cari` | worker+ | Pencarian item |
| `/app/riwayat` | worker+ | Riwayat transaksi sendiri |
| `/app/dibawa` | worker+ | Barang yang sedang dibawa |
| `/app/antrean` | worker+ | Antrean offline perangkat |
| `/app/transaksi` | supervisor+ | Log semua transaksi + filter + ekspor |
| `/app/opname` | supervisor+ | Sesi opname dan antrean selisih |
| `/app/laporan` | supervisor+ | Laporan, tren harga, keyakinan, dead stock |
| `/app/database/*` | supervisor+ (lihat), admin (ubah) | Item, lokasi, kategori, alasan, mesin, pengguna, label, impor |
| `/admin/settings` | admin | Pengaturan organisasi, verifikasi, keyakinan |
| `/admin/audit` | admin | Audit trail master data |

## API

Semua endpoint di bawah `/api/v1`. Respons selalu camelCase dan berbentuk
`{ data: ... }` atau `{ error: { code, message } }`.

| Method | Endpoint | Akses |
| --- | --- | --- |
| `POST` | `/auth/login` | publik — `{mode:"pin",code,pin}` atau `{mode:"email",email,password}` |
| `POST` | `/auth/logout` | sesi aktif |
| `POST` | `/signup` | publik — buat organisasi + admin pertama |
| `GET` | `/items` | worker+ |
| `POST` `PATCH` | `/items`, `/items/:id` | supervisor+ / admin |
| `GET` | `/items/by-code/:kode` | worker+ |
| `POST` | `/transactions` | worker+ — `issue`, `return`, `receive`, `transfer` |
| `GET` | `/transactions` | worker+ (riwayat sendiri), supervisor+ (semua) |
| `GET` | `/dashboard` | worker+ |
| `GET` | `/reports` | supervisor+ |
| `GET` | `/reports/drill` | supervisor+ |
| `GET` | `/reports/price-history` | supervisor+ |
| `GET` | `/stock` | worker+ |
| `GET` `POST` `PATCH` | `/users` | admin |
| `GET` | `/health` | publik |

Contoh memindahkan stok:

```bash
curl -X POST https://nemu-free.my.id/api/v1/transactions \
  -H 'content-type: application/json' \
  -b cookie.txt \
  -d '{"itemCode":"44F0EVQHJ","locationId":"loc_8fb37365","type":"issue","qty":2,"reasonId":"rsn_pakai","idempotencyKey":"demo-1"}'
```

`idempotencyKey` wajib: request yang diulang dengan key sama tidak mencatat
transaksi dua kali, jadi aman untuk antrean offline.

## Gerbang mutu

```bash
pnpm lint        # Biome
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest (unit)
pnpm e2e         # Playwright (360 / 768 / 1440)
pnpm size        # anggaran ukuran JS awal
pnpm gate        # semua di atas
```

Jalankan E2E terhadap build produksi, bukan dev server:

```bash
pnpm build && pnpm start -p 3100
PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm e2e
```

## Deploy

Produksi berjalan di Vercel dengan PostgreSQL Supabase.

```bash
vercel link
vercel env add DATABASE_URL production   # connection string Supabase
vercel env add APP_SECRET production
vercel env add DATABASE_ENABLED production   # true
vercel deploy --prod
```

Untuk Supabase free plan, pakai **transaction pooler** (port `6543`), bukan
koneksi langsung `db.<ref>.supabase.co` — host itu IPv6-only dan gagal resolve
dari Vercel. Detail lengkap ada di [`docs/DEPLOY_VERCEL_SUPABASE.md`](docs/DEPLOY_VERCEL_SUPABASE.md).

## Struktur

```
src/
├─ app/                 # App Router: rute + route handler API
├─ components/          # UI per area
│  ├─ app/              # shell, top bar, sidebar, tab bar
│  ├─ database/         # tabel virtual, label, impor
│  ├─ take/             # form ambil, stepper, konfirmasi
│  ├─ custody/ opname/ reports/
│  └─ ui/               # primitif shadcn
├─ lib/
│  ├─ api/              # klien bertipe + skema Zod
│  ├─ domain/           # rumus murni: confidence, stock, verification
│  ├─ offline-queue.ts  # IndexedDB
│  └─ flags.ts nav.ts draft.ts format.ts
├─ server/
│  ├─ handlers/         # satu file per domain endpoint
│  ├─ services/         # logika stok & transaksi
│  ├─ db.ts             # pool global + pool per tenant
│  └─ tenant.ts guards.ts crypto.ts rate-limit.ts
├─ mocks/               # seed, store, handler (mode tanpa DB)
└─ i18n/                # id (default) + en
db/migrations/          # 001–013, idempoten
```

## Arsitektur singkat

- **Isolasi tenant di level database.** Satu organisasi = satu schema Postgres
  (`tenant_<slug>`). Kode aplikasi tidak menambahkan `WHERE tenant_id`; ia hanya
  memilih koneksi lewat `tenantPool(slug)`. Organisasi baru dibuat dengan
  memutar ulang migrasi ke schema kosong, bukan menyalin template.
- **Ledger tidak bisa diubah.** Trigger database menolak `UPDATE` dan `DELETE`
  pada `transactions`. Koreksi dilakukan dengan transaksi pembalik, bukan edit.
- **Dua sumber data, satu kontrak.** Mode mock dan mode database memakai skema
  Zod yang sama, jadi UI tidak tahu (dan tidak perlu tahu) mana yang aktif.

## Dokumen

- [`docs/BACKEND.md`](docs/BACKEND.md) — model data, fungsi stok, aturan trigger
- [`docs/DEPLOY_VERCEL_SUPABASE.md`](docs/DEPLOY_VERCEL_SUPABASE.md) — deploy produksi
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — keputusan teknis dan alasannya
- [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) — kebutuhan → implementasi → tes

## Lisensi

MIT © [Muhamad Fillah Alifan](https://github.com/Dunktoheaven)
