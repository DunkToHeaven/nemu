# TRACEABILITY

Setiap ID kebutuhan UI → implementasi → tes. Baris tanpa implementasi atau tes
adalah temuan terbuka (lihat `FINDINGS.md`).

Keterangan tes:
- **U** = `tests/unit/*` (Vitest)
- **E** = `tests/e2e/*` (Playwright)
- **A** = axe-core di `tests/e2e/a11y.spec.ts`

## Scan & transaksi (SC / TX)

| ID | Implementasi | Tes |
| --- | --- | --- |
| SC-01 Kamera & unggah | `scan/scan-view.tsx` | E `core-flow` |
| SC-02 Input kode manual | `scan/scan-view.tsx` (`scan-manual-input`) | E `core-flow` |
| SC-10 Pencarian dashboard | `app/search-preview.tsx`, `search/search-box.tsx` | E `core-flow`, U `search-scoring` |
| SC-11 Hasil: nama, qty, lokasi, keyakinan | `search/result-row.tsx` | E `core-flow` |
| SC-12 Halaman lokasi item tanpa form ambil | `item/item-location-page.tsx` | E `core-flow` |
| SC-13 Bandingkan cari vs pindai | `lib/draft.ts` (`setLastSearched`) | E `edge-cases` |
| TX-01 Form ambil fokus qty | `take/take-form.tsx` (`qty-input`) | E `core-flow` |
| TX-02 Stepper +1/+5/+10 | `take/qty-stepper.tsx` | E `core-flow` |
| TX-03 Alasan wajib | `take/take-form.tsx` | E `core-flow` |
| TX-04 WO wajib bila alasan menuntut | `take/take-form.tsx` (`wo-input`) | E `edge-cases` |
| TX-05 409 stok kurang | `take/take-form.tsx` | E `edge-cases` |
| TX-06 Idempotensi | `lib/utils.ts` `uuidv7` + mock `idempotency` | U `idempotency` |
| TX-07 Alasan nonaktif disembunyikan | `mocks/handlers/master.ts` | U `master-filters` |
| TX-08 Optimistic UI < 100 ms | `take/take-form.tsx` | E `core-flow` |

## Konfirmasi & keyakinan (CV / CF)

| ID | Implementasi | Tes |
| --- | --- | --- |
| CV-01 Pertanyaan setelah tercatat | `take/verification-prompt.tsx` | E `core-flow` |
| CV-02 Sesuai = 1 ketukan | `verification-prompt.tsx` (`verify-match`) | E `core-flow` |
| CV-03 Beda ≤ 3 ketukan | `verification-prompt.tsx` (`verify-different`) | E `edge-cases` |
| CV-04 Selisih → antrean supervisor | `opname/opname-view.tsx` tab Selisih | E `supervisor` |
| CV-05 Setujui → adjust | `api.verify.review` | E `supervisor` |
| CV-09 Kuota per shift | `mocks/store.ts` `promptsUsedThisShift` | U `verification` |
| CV-10 Mode buta | `verification-prompt.tsx` | U `verification` |
| CF-01…CF-06 Skor keyakinan | `lib/domain/confidence.ts` | U `confidence` |
| CF-07 Keyakinan di laporan | `reports/reports-view.tsx` | E `supervisor` |
| CF-08 Ikon + teks + warna | `confidence-badge.tsx` | A |

## Kustodi (CU)

| ID | Implementasi | Tes |
| --- | --- | --- |
| CU-01 Barang dibawa tercatat | `take/take-confirmation.tsx` | E `core-flow` |
| CU-02 Terpakai satu ketukan | `custody/settle-dialog.tsx` | E `worker-custody` |
| CU-03 Kembalikan + scan rak | `custody/return-dialog.tsx` | E `worker-custody` |
| CU-05 Pengingat akhir shift | `custody/custody-reminder.tsx` | E `worker-custody` |
| CU-06 Papan dibawa supervisor | `custody/custody-view.tsx?scope=team` | E `supervisor` |

## Opname & offline (OP / OF)

| ID | Implementasi | Tes |
| --- | --- | --- |
| OP-01 Sesi opname | `opname/opname-view.tsx` | E `supervisor` |
| OP-02 Persetujuan selisih → adjust | `opname-view.tsx` `VarianceRow` | E `supervisor` |
| OP-03 Mode buta opname | `opname-view.tsx` (`count.blind`) | U `counts` |
| OP-04 Opname terarah | `reports` tab `needs` | E `supervisor` |
| OF-01 Antrean perangkat | `lib/offline-queue.ts` | U `offline-queue` |
| OF-02 Kirim otomatis, tanpa duplikat | `api.sync.batch` | U `offline-queue` |
| OF-03 Konflik → needs_review | `mocks/handlers/tx.ts` `syncBatch` | U `offline-queue` |
| OF-04 Verifikasi/kustodi ikut antrean | `offline-queue-view.tsx` | E `worker-custody` |

## Master data, label, impor (MD / LB)

| ID | Implementasi | Tes |
| --- | --- | --- |
| MD-01 CRUD item | `database/items-table.tsx` | E `admin-database` |
| MD-02 CRUD lokasi berjenjang | `database/locations-table.tsx` | E `admin-database` |
| MD-03 Impor CSV pratinjau + dry-run | `database/imports-view.tsx` | E `admin-database`, U `import-parse` |
| MD-04 Kategori & satuan | `database/simple-tables.tsx` | E `admin-database` |
| MD-05 Audit trail | `admin/audit-view.tsx` | E `admin-database` |
| MD-06 Alasan & mesin | `database/simple-tables.tsx` | E `admin-database` |
| MD-07 Pengguna & PIN | `database/simple-tables.tsx` `UsersTable` | E `admin-database` |
| LB-01 Label QR preset ukuran | `database/labels-view.tsx` | E `admin-database` |
| LB-02 Pratinjau label | `labels-view.tsx` (`label-preview`) | E `admin-database` |
| LB-03 Riwayat sendiri | `history/history-view.tsx` | E `worker-custody` |
| LB-04 Log semua transaksi + filter | `transactions/transactions-view.tsx` | E `supervisor` |
| LB-05 Ekspor | `transactions-view.tsx`, `reports-view.tsx` | E `supervisor` |
| LB-06…08 Laporan dasar | `reports/reports-view.tsx` | E `supervisor` |

## Role, tema, bahasa, koneksi (RT / WB / AU)

| ID | Implementasi | Tes |
| --- | --- | --- |
| AU-01 Login PIN | `landing/login-card.tsx` | E `auth` |
| AU-02 Login email | `login-card.tsx` | E `auth` |
| AU-03 Penguncian setelah gagal | `mocks/store.ts` `attempts` | E `auth` |
| AU-04 `next` hanya path internal | `mocks/session.ts` `safeNext` | U `safe-next`, E `auth` |
| AU-05 Sesi habis → draf dipulihkan | `session-expired-dialog.tsx` | E `edge-cases` |
| RT-01 Home + login | `app/page.tsx` | E `auth` |
| RT-02 Dashboard per role | `app/dashboard-view.tsx` | E `auth` |
| RT-03 Ganti tema | `theme-locale.tsx` | E `auth` |
| RT-04 Ganti bahasa id/en | `theme-locale.tsx` | E `auth` |
| RT-05 Pengaturan | `admin/settings-view.tsx` | E `admin-database` |
| RT-06 Indikator Live/Menyambung/Offline | `connection-status.tsx` | E `auth` |
| WB-01…WB-08 Integrasi Google | `admin/google-view.tsx` | E `admin-database` |
| WB-05 Menu per role | `lib/nav.ts` `navForRole` | U `nav-roles`, E `roles` |
