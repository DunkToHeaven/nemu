# Deploy ke Vercel + Supabase

Dokumen ini mencatat apa yang **sudah diuji** dan apa yang masih perlu Anda
lakukan sendiri. Jangan anggap selesai sebelum bagian "Yang belum diuji"
dibaca.

## Kenapa pooler, bukan koneksi langsung

Free plan Supabase **tidak memberi alamat IPv4** untuk `db.<ref>.supabase.co` —
hanya IPv6. Vercel keluar lewat IPv4 saja, jadi koneksi langsung tidak akan
pernah tersambung (gejalanya `ENOTFOUND` atau `ENETUNREACH`).

Yang dipakai: **Supavisor transaction pooler** (port `6543`), satu-satunya jalur
yang punya IPv4.

```
postgresql://postgres.<ref>:<password-ter-encode>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

Dua konsekuensi yang sudah ditangani di kode:

- `prepare: false` — transaction pooler memakai ulang koneksi antar transaksi,
  prepared statement bernama bisa bertabrakan (`prepared statement already
  exists`).
- Pool kecil (`DATABASE_POOL_MAX=5`, `TENANT_POOL_MAX=2`) — Supabase membatasi
  koneksi, dan setiap tenant punya pool sendiri.

## Variabel lingkungan di Vercel

Set di **Project → Settings → Environment Variables** (Production + Preview):

| Nama | Nilai |
| --- | --- |
| `DATABASE_ENABLED` | `true` |
| `DATABASE_URL` | connection string pooler di atas |
| `DATABASE_POOL_MAX` | `5` |
| `TENANT_POOL_MAX` | `2` |
| `APP_SECRET` | `openssl rand -base64 32` |

**Jangan** set `ALLOW_ROLE_SWITCH` di produksi — itu membuka ganti peran untuk
panel dev.

Password berisi `@`, jadi **wajib** percent-encode menjadi `%40`. Tanpa itu
URL terpotong di `@` dan koneksi gagal dengan pesan yang membingungkan.

## Isolasi tenant di Supabase — sudah diverifikasi

Schema-per-tenant tetap bekerja di transaction pooler. Diuji langsung:

```
OK  tabel dibuat                    19 tabel
OK  view dibuat (stock_levels)       2 view
OK  materialized view dibuat         1 matview
OK  trigger integritas dibuat        2 trigger
OK  FK user_id menunjuk public.users
OK  terima 10 -> saldo 10
OK  ambil 3 -> saldo 7
OK  UPDATE transaksi ditolak (append-only)
OK  tenant kedua tidak melihat baris tenant pertama
OK  tenant pertama tetap melihat datanya
```

Uji kebocoran `search_path` juga lulus: koneksi baru **tidak** mewarisi
`search_path` koneksi sebelumnya.

## Migrasi

```bash
SUPABASE_PASSWORD='...' node scripts/supabase-migrate.mjs
```

Migrasi 006/007 dilewati karena 008 menggantikannya (replay migrasi, bukan
salin objek). Yang wajib ada setelah migrasi:

```
24 tabel public, 4 baris migration_sources, fungsi create_tenant_schema
```

## Yang belum diuji — baca sebelum mengumumkan siap

- **Deploy Vercel belum dijalankan.** CLI ada di mesin ini tetapi belum login
  (`vercel login`), jadi build di infrastruktur Vercel belum pernah dicoba.
  Yang sudah diuji hanya aplikasi yang sama berjalan lokal terhadap Supabase.
- **Serverless + pool per tenant.** Vercel membuat instance fungsi baru saat
  lalu lintas naik. Setiap instance membuka pool sendiri, jadi jumlah koneksi =
  instance × tenant aktif × 2. Pada free plan Supabase (~60 koneksi), ini bisa
  terlampaui bila banyak tenant aktif bersamaan. Bila terjadi, gejalanya
  `too many connections`. Mitigasi: naikkan paket Supabase, atau pindahkan
  koneksi tenant ke satu pool bersama dengan `SET search_path` per transaksi.
- **Region.** Supabase project ada di `ap-northeast-2` (Seoul). Pilih region
  fungsi Vercel yang dekat (mis. `sin1`/Singapore atau `hnd1`/Tokyo) supaya
  latensi ke database tidak besar.
- **Backup.** Free plan Supabase menyediakan backup terbatas. Untuk data
  sungguhan, atur jadwal ekspor sendiri.
