# Nemu — frontend WMS berbasis QR

Frontend untuk Nemu, sistem manajemen gudang open source yang bekerja lewat QR di
rak. Repo ini **hanya frontend**: backend, database, dan auth sungguhan belum
dibangun. Semua data berasal dari lapisan mock yang mengikuti kontrak API PRD
bagian 12, sehingga backend nyata nanti cukup menggantikan lapisan itu.

## Menjalankan

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Build produksi:

```bash
pnpm build && pnpm start
```

> Catatan penting: jalankan tes E2E terhadap build produksi. Turbopack dev pada
> kombinasi Next 16 + React 19 di mesin ini tidak selalu menyelesaikan hidrasi,
> sehingga form jatuh ke submit GET native. Build produksi hidrasi normal.

## Akun demo

| Role | Kode | PIN |
| --- | --- | --- |
| Pekerja | `WRK01` | `1122` |
| Supervisor | `SPV01` | `1357` |
| Admin | `ADM01` | `2468` |

Login email juga tersedia untuk supervisor/admin (`spv1@nemu.local` /
`nemu sup123`, `andi@nemu.local` / `nemuadmin123`).

## Gerbang mutu

```bash
pnpm lint        # Biome
pnpm typecheck   # tsc --noEmit
pnpm test        # Vitest (unit)
pnpm e2e         # Playwright (360 / 768 / 1440)
pnpm size        # anggaran JS awal
pnpm lhci        # Lighthouse CI
pnpm gate        # semua di atas
```

`pnpm e2e` terhadap build produksi:

```bash
pnpm build && pnpm start -p 3100
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm e2e
```

## Feature flag

Diatur lewat `NEXT_PUBLIC_FLAGS` (dipisah koma, atau `none` untuk mematikan semua).
Default di mock: semua menyala.

| Flag | Fitur |
| --- | --- |
| `cv` | Konfirmasi sisa saat ambil (Sesuai/Beda) |
| `cf` | Skor keyakinan stok |
| `cu` | Kustodi / barang dibawa + pengingat akhir shift |
| `opname` | Stock opname + antrean selisih |
| `offline` | Antrean offline IndexedDB + `/sync/batch` |

Contoh: `NEXT_PUBLIC_FLAGS=cv,cf pnpm dev`.

## Rute

| Rute | Akses | Isi |
| --- | --- | --- |
| `/` | publik | Landing + login; pengguna login melihat "Buka dashboard" |
| `/login` | publik | Kartu login dua tab, mendukung `?next=` (hanya path internal) |
| `/scan` | worker+ | Scanner dalam aplikasi + input kode manual |
| `/i/[kode]` | worker+ | Hasil scan: info item, form ambil/kembali/masuk |
| `/app` | worker+ | Dashboard sesuai role |
| `/app/cari` | worker+ | Pencarian item |
| `/app/item/[id]` | worker+ | Lokasi item (tanpa form ambil) |
| `/app/riwayat` | worker+ | Riwayat transaksi sendiri |
| `/app/dibawa` | worker+ | Barang yang sedang dibawa (`?scope=tim` untuk supervisor+) |
| `/app/antrean` | worker+ | Antrean offline perangkat |
| `/app/transaksi` | supervisor+ | Log semua transaksi + filter + ekspor |
| `/app/opname` | supervisor+ | Sesi opname, antrean selisih, perlu dihitung |
| `/app/laporan` | supervisor+ | Laporan, keyakinan, kustodi, dead stock |
| `/app/database/*` | supervisor+ (lihat), admin (ubah) | Item, lokasi, kategori, alasan, mesin, pengguna, label, impor |
| `/admin/setup` | admin | Wizard setup awal |
| `/admin/settings` | admin | Pengaturan organisasi, verifikasi, keyakinan, kustodi |
| `/admin/integrations/google` | admin | Status Drive/Sheets, cek skema, repair, sinkron |
| `/admin/audit` | admin | Audit trail master data |

## Mengganti lapisan mock dengan backend nyata

1. Semua akses data lewat `src/lib/api/client.ts`. Tidak ada `fetch` di komponen.
2. Hapus atau lewati Route Handler mock: `src/app/api/v1/[...path]/route.ts` dan
   `src/app/api/v1/stream/route.ts`.
3. Arahkan `request()` di `client.ts` ke `NEXT_PUBLIC_API_BASE` (atau proxy lewat
   `next.config.ts`).
4. Skema Zod di `src/lib/api/schemas.ts` sudah menjadi kontrak bersama: bila
   backend menyimpang, klien langsung melempar `CONTRACT_MISMATCH`.
5. Ganti `src/mocks/session.ts` dengan verifikasi cookie bertanda tangan; rute
   penjaga di `src/middleware.ts` cukup membaca `role` dari cookie itu.

## Struktur

```
src/
├─ app/                 # App Router: rute + route handler mock
├─ components/          # UI, dikelompokkan per area
│  ├─ app/              # shell, top bar, sidebar, tab bar, states
│  ├─ database/         # tabel virtual, label, impor
│  ├─ take/             # form ambil, stepper, konfirmasi
│  ├─ custody/          # dibawa, kembalikan, pengingat shift
│  ├─ opname/ reports/  # supervisor
│  └─ ui/               # primitif shadcn
├─ lib/
│  ├─ api/              # klien bertipe + skema Zod
│  ├─ domain/           # rumus murni: confidence, stock, verification
│  ├─ offline-queue.ts  # IndexedDB
│  └─ flags.ts nav.ts draft.ts format.ts
├─ mocks/               # seed, store, handler, simulasi
└─ i18n/                # id (default) + en
```

## Dokumen

- `docs/MOCKUP_MAP.md` — pemetaan mockup → rute → komponen → ID kebutuhan
- `docs/TRACEABILITY.md` — setiap ID kebutuhan UI → implementasi → tes
- `docs/DECISIONS.md` — keputusan, termasuk konflik mockup vs PRD
- `docs/PROGRESS.md` — catatan ronde + temuan
- `docs/FINDINGS.md` — temuan per critic
- `docs/IDEAS.md` — ide di luar cakupan PRD
- `docs/FINAL_REPORT.md` — laporan akhir
