# MOCKUP_MAP

Sumber tampilan: `Nemu — UI Mockup.html` (satu berkas ekspor, 172.905 byte).
Berkas itu membungkus konten di dalam bundel JavaScript, sehingga hanya sebagian
layar yang dapat dibaca langsung sebagai HTML. Layar yang tidak ada di mockup
mengikuti wireframe PRD bagian 5–6 dan ditandai **ASSUMED**.

## Layar yang ada di mockup

| Mockup | Rute | Komponen | Kebutuhan PRD |
| --- | --- | --- | --- |
| Home/landing (hero, fitur, langkah) | `/` | `src/app/page.tsx`, `src/components/landing/landing-view.tsx` | RT-01, RT-02 |
| Kartu login dua tab (PIN / email) | `/`, `/login` | `src/components/landing/login-card.tsx` | AU-01…AU-05 |
| Scanner dalam aplikasi | `/scan` | `src/components/scan/scan-view.tsx`, `src/components/item/scan-page.tsx` | SC-01, SC-02, TX-01 |

## Layar ASSUMED (tidak ada di mockup)

Mengikuti wireframe PRD bagian 5 dan 6, sistem desain PRD (token OKLCH, slate +
aksen, Inter→Plus Jakarta Sans per D-002).

| Rute | Komponen | Kebutuhan PRD | Status |
| --- | --- | --- | --- |
| `/app` (dashboard per role) | `src/components/app/dashboard-view.tsx` | DB-01…DB-08 | ASSUMED |
| `/app/cari` | `src/components/search/search-page.tsx` | SC-10…SC-13 | ASSUMED |
| `/app/item/[id]` | `src/components/item/item-location-page.tsx` | SC-11, SC-12 | ASSUMED |
| `/i/[kode]` | `src/components/item/scan-page.tsx`, `take-form.tsx` | TX-01…TX-08, CV-01…CV-03 | ASSUMED |
| `/app/riwayat` | `src/components/history/history-view.tsx` | LB-01, LB-02 | ASSUMED |
| `/app/dibawa` | `src/components/custody/custody-view.tsx` | CU-01…CU-06, DB-07 | ASSUMED |
| `/app/antrean` | `src/components/app/offline-queue-view.tsx` | OF-01…OF-04 | ASSUMED |
| `/app/transaksi` | `src/components/transactions/transactions-view.tsx` | LB-03…LB-05 | ASSUMED |
| `/app/opname` | `src/components/opname/opname-view.tsx` | OP-01…OP-04, CV-04, CV-05 | ASSUMED |
| `/app/laporan` | `src/components/reports/reports-view.tsx` | LB-06…LB-08, CF-07, DB-08 | ASSUMED |
| `/app/database/*` | `src/components/database/*` | MD-01…MD-07 | ASSUMED |
| `/admin/setup` | `src/components/admin/setup-wizard.tsx` | RT-01, MD-03 | ASSUMED |
| `/admin/settings` | `src/components/admin/settings-view.tsx` | RT-03…RT-05 | ASSUMED |
| `/admin/integrations/google` | `src/components/admin/google-view.tsx` | WB-01…WB-08 | ASSUMED |
| `/admin/audit` | `src/components/admin/audit-view.tsx` | MD-05 | ASSUMED |
| `/app/menu` | `src/components/app/menu-page.tsx` | WB-05, RT-06 | ASSUMED |

## Primitif desain

| Elemen | Sumber | Catatan |
| --- | --- | --- |
| Warna | mockup | slate + aksen `#C2410C`, token OKLCH di `src/app/globals.css` |
| Tipografi | mockup | Plus Jakarta Sans (self-host), JetBrains Mono untuk kode/SKU |
| Radius | mockup | kartu 16–24 px, tombol pil penuh |
| Tab bar bawah + Scan menonjol | mockup | `src/components/app/tab-bar.tsx` |
| Rail ikon / sidebar | PRD | `src/components/app/sidebar.tsx` |
