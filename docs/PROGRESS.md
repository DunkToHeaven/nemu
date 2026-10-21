# PROGRESS

Catatan ronde. Angka diambil dari keluaran gerbang yang benar-benar dijalankan.

## Ronde 0 — persiapan

| Item | Status | Bukti |
| --- | --- | --- |
| Baca PRD + inventaris mockup | selesai | `MOCKUP_MAP.md` |
| Traceability | selesai | `TRACEABILITY.md` |
| Keputusan | selesai | `DECISIONS.md` (34 entri) |
| Scaffold Next 16 + Tailwind v4 + shadcn | selesai | `src/app`, `src/components/ui` |
| Token desain OKLCH | selesai | `src/app/globals.css` |
| Lapisan mock + kontrak Zod | selesai | `src/mocks/*`, `src/lib/api/*` |
| i18n id/en | selesai | `src/i18n/messages/{id,en}.json` |

Gerbang ronde 0: `pnpm dev` menampilkan halaman login. **Lulus** (HTTP 200, hidrasi
terverifikasi di build produksi).

## Ronde 1 — fondasi, auth, alur pekerja

Dibangun: shell responsif (tab bar <640, rail 640–1023, sidebar ≥1024), login dua
tab + penguncian + `next` aman, dashboard per role, `/app/cari`, `/app/item/[id]`,
`/scan`, `/i/[kode]`, form ambil + stepper, konfirmasi Sesuai/Beda, kustodi, riwayat.

| Gerbang | Hasil |
| --- | --- |
| `pnpm lint` | 0 error (1 info deprecation Biome) |
| `pnpm typecheck` | 0 error |
| `pnpm test` | 56 lulus / 7 file |
| `pnpm build` | sukses, 28 rute |
| `pnpm e2e` (desktop) | 5/5 alur inti, 7/7 isolasi role |

## Ronde 2 — supervisor, admin, offline

Dibangun: opname (sesi/selisih/perlu dihitung), laporan, tabel transaksi, modul
Database lengkap (item virtual, lokasi, kategori, alasan, mesin, pengguna, label
PDF, impor CSV), pengaturan, integrasi Google, audit, wizard `/admin/setup`,
antrean offline IndexedDB + `POST /api/v1/sync/batch`.

| Gerbang | Hasil |
| --- | --- |
| `pnpm size` | **GAGAL**: `/` 278,2 KB vs 120 KB; `/i/*` 264,9 KB vs 150 KB |
| `pnpm lhci` | belum dijalankan (butuh Chrome headless stabil) |

## Temuan yang sudah ditutup

| ID | Severitas | Temuan | Perbaikan | Bukti |
| --- | --- | --- | --- | --- |
| F-001 | blocker | `scripts/` tidak ada; `pnpm size` & `pnpm lhci` mustahil jalan | Kedua skrip dibuat | `scripts/check-bundle-size.mjs`, `scripts/lhci.mjs` |
| F-002 | blocker | `/admin/setup` tidak ada padahal wajib v0.1 | Wizard 5+2 langkah dari data nyata | `src/app/admin/setup/page.tsx` |
| F-003 | blocker | Tidak ada antrean offline (OF-01…04) | IndexedDB + `/sync/batch` + UI `/app/antrean` | `src/lib/offline-queue.ts` |
| F-004 | blocker | Halaman tidak pernah hidrasi | Penyebab: matcher middleware membajak `/_next/*` (termasuk HMR/RSC) | `src/middleware.ts` |
| F-005 | major | Loop 401: `auth/session` memicu event "sesi habis" miliknya sendiri | Pengecualian path di klien API | `src/lib/api/client.ts` |
| F-006 | major | `safeNext` menerima `/\evil` dan `/` (halaman publik) | Tolak karakter kontrol, tolak `/` | `src/mocks/session.ts` + tes |
| F-007 | major | `onClick` pada `<li>` (keyboard tak bisa memilih hasil) | `ResultRow` menerima `onSelect` eksplisit | `src/components/search/*` |
| F-008 | minor | 4 kunci i18n hilang di kedua bahasa | Ditambahkan | `src/i18n/messages/*.json` |
| F-009 | minor | `refetch` dan `autoFocus` tidak terpakai | Dipakai sebagai tombol coba lagi / fokus input | `item-location-page.tsx`, `login-card.tsx` |

## Temuan terbuka

| ID | Severitas | Temuan | Status |
| --- | --- | --- | --- |
| F-010 | blocker | Anggaran bundle PRD (120/150 KB) tidak tercapai: lantai framework Next 16 + React 19 sendirian 128,9 KB | Terbuka — butuh keputusan produk (lihat `DECISIONS.md` D-040) |
| F-011 | major | `pnpm lhci` belum menghasilkan angka | Terbuka |
| F-012 | major | C1 (kesetiaan mockup) belum bisa membandingkan layar yang tidak ada di berkas mockup | Terbuka — 16 layar berstatus ASSUMED |

## Catatan pengukuran

`pnpm size` mengukur dari HTML produksi yang sebenarnya: server dijalankan
sementara, HTML rute diambil, lalu setiap `<script>` muatan awal dijumlahkan
setelah gzip. Script `noModule` (polyfill core-js untuk browser lama) tidak
dihitung karena browser modern tidak pernah mengunduhnya — menghitungnya membuat
angka membengkak 38,7 KB secara palsu.
