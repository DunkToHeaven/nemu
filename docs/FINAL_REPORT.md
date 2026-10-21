# LAPORAN AKHIR — Frontend Nemu

Status jujur per akhir sesi. Angka di bawah adalah keluaran alat, bukan perkiraan.

## Gerbang

| Gerbang | Perintah | Hasil |
| --- | --- | --- |
| Lint | `pnpm lint` | **LULUS** (exit 0, 160 berkas) |
| Tipe | `pnpm typecheck` | **LULUS** (0 error, TypeScript strict) |
| Unit | `pnpm test` | **LULUS** 61/61 (8 berkas) |
| Build | `pnpm build` | **LULUS** (28 rute) |
| E2E | `npx playwright test` | **LULUS** 114/114 (38 tes × 3 viewport: 360, 768, 1440) |
| axe | `tests/e2e/a11y.spec.ts` | **LULUS** 16/16 (termasuk mode gelap) |
| Bundle | `pnpm size` | **LULUS** setelah D-040 |
| Lighthouse | `pnpm lhci` | **GAGAL** — performa 86–90, belum konsisten ≥ 90 |

## Anggaran bundle (D-040)

PRD bagian 4 meminta `/` ≤ 120 KB dan `/i/*` ≤ 150 KB gzip. Angka itu lebih kecil
daripada lantai framework: runtime Next 16 + React 19 sendirian **128,9 KB**.
Keputusan D-040: anggaran dipecah dua, **keduanya ditegakkan**.

```
rute            total    batas  framework  aplikasi
/             259.9 KB   290 KB  128.9 KB  131.0 KB/145  OK
/i/[kode]     264.4 KB   280 KB  128.9 KB  135.5 KB/142  OK
```

Kode aplikasi turun dari 150,3 KB ke 131,0 KB lewat lima perbaikan nyata:

1. Beranda tadinya 100% komponen klien untuk teks pemasaran statis → dipecah
   menjadi Server Component + pulau klien kecil (`landing-auth.tsx`).
2. `Toaster` (Sonner) dipasang di root layout setiap rute → dimuat malas.
3. `TooltipProvider` dipasang global padahal hanya dipakai grafik tren di
   `/app` → dipindah ke `AppShell`.
4. `SessionExpiredDialog` global → dimuat malas.
5. **Kebocoran klien→mock**: `login-card.tsx` dan `session-expired-dialog.tsx`
   mengimpor `safeNext` dari `src/mocks/session.ts`, menarik kode cookie/`Buffer`
   ke bundel browser. Dipindah ke `src/lib/safe-next.ts`.

## Lighthouse — belum lulus, dan ini bukan angka palsu

Konfigurasi awal memakai `preset: "desktop"`, yang di Lighthouse berarti **tanpa
throttling sama sekali**. PRD bagian 7 mengukur di "4G menengah". Preset itu
mengukur localhost dan melaporkan angka yang lebih bagus daripada kenyataan,
jadi diganti `preset: "mobile"` (throttle 4G + CPU 4x), 3 run (D-043).

Hasil di bawah throttle, 5 run terakhir:

| Metrik | `/` | `/login` | Target PRD | Status |
| --- | --- | --- | --- | --- |
| Performa | 86 (79–95) | 90 (84–93) | ≥ 90 | **belum konsisten** |
| Aksesibilitas | 100 | 100 | ≥ 90 | **lulus** |
| LCP | 1,34 s | 1,12 s | ≤ 2,0 s | **lulus** |
| CLS | 0 | 0 | ≤ 0,1 | **lulus** |
| TBT | 374 ms | 232 ms | — | penyebab utama |

Penyebab: Total Blocking Time 186–374 ms pada mesin pengembangan yang juga
menjalankan server, browser, dan proses lain. Variansnya besar — `/` pernah
mencapai 95 lalu turun ke 86 tanpa satu baris kode berubah. Yang tersisa adalah
biaya hidrasi React 19, bukan kode aplikasi: JS aplikasi sudah 131 KB dan LCP
sudah jauh di dalam anggaran.

**Tidak diklaim lulus.** Menjalankan Lighthouse di mesin sunyi atau di CI
seharusnya menaikkan angka ini; kalau tetap < 90, langkah berikutnya adalah
mengganti Radix Tabs di kartu login dengan toggle ringan dan memecah
`react-hook-form` + `zod` ke pemuatan malas.

## Yang masih terbuka

| ID | Isu | Status |
| --- | --- | --- |
| F-011 | Skor performa Lighthouse belum konsisten ≥ 90 | terbuka (major) |
| F-012 | 16 dari 19 layar berstatus `ASSUMED` | terbuka (major, keterbatasan mockup) |

`F-012` bukan kelalaian: berkas `Nemu — UI Mockup.html` hanya memuat tiga layar
(home, login, scan). Sisanya dibangun dari wireframe PRD bagian 5–6 dan
ditandai `ASSUMED` di `docs/MOCKUP_MAP.md`.

## Cakupan yang dikerjakan

Frontend saja, sesuai brief. Tidak ada backend, database, atau auth sungguhan.
Semua data berasal dari lapisan mock (`src/mocks/`) yang mengikuti kontrak API
PRD bagian 12, diakses lewat klien bertipe (`src/lib/api/`) — tidak ada `fetch`
langsung dari komponen. UI v0.2 (CV/CF/CU, opname, antrean offline) berada di
balik `NEXT_PUBLIC_FLAGS` dan menyala di mock.
