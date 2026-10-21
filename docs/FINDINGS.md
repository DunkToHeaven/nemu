# FINDINGS

Format: `ID | critic | severitas | bukti | langkah reproduksi | kebutuhan PRD`.

Severitas: **blocker** (alur inti rusak / P0 dilanggar / gerbang gagal),
**major** (menyimpang nyata dari PRD/mockup, a11y gagal), **minor** (polesan), **nit**.

## Terbuka

| ID | Critic | Severitas | Bukti | Reproduksi | PRD |
| --- | --- | --- | --- | --- | --- |
| F-011 | C4 (perf) | major | Lighthouse **performa** belum ≥ 90 secara konsisten di bawah throttling 4G. Median 5 run: `/` 86 (rentang 79–95), `/login` 90 (84–93). Aksesibilitas 100 di semua run; LCP 1,03–1,34 s (target ≤ 2,0 s **lulus**); CLS 0 (**lulus**). Penyebab: Total Blocking Time 186–374 ms — biaya hidrasi React 19, bukan kode aplikasi (JS aplikasi sudah turun ke 131 KB). | `pnpm build && pnpm start -p 3100` lalu `CHROME_PATH=… LHCI_BASE_URL=http://127.0.0.1:3100 pnpm lhci` | Bagian 4: skor Lighthouse performa ≥ 90 |
| F-012 | C1 (mockup) | major | 16 dari 19 layar berstatus `ASSUMED`; berkas mockup hanya memuat home, login, scan | `docs/MOCKUP_MAP.md` | Kriteria selesai #1 |
| F-013 | C2 (PRD) | minor | Impor dari Sheets dua arah belum ada (hanya CSV) | Buka `/app/database/impor` | PRD: memang v0.2, bukan cacat |
| F-014 | C5 (break-it) | minor | `expireSession` pada panel dev mengakhiri semua sesi, termasuk sesi admin yang sedang menguji | Panel dev → Sesi habis | Alat uji, bukan perilaku produk |

## Ditutup

| ID | Critic | Severitas | Temuan | Perbaikan | Bukti regresi |
| F-010 | C4 (perf) | blocker → **ditutup** | Anggaran JS awal melewati PRD bagian 4 | Anggaran dipecah dua (total + kode aplikasi) dan keduanya ditegakkan; lima kebocoran bundel diperbaiki: beranda jadi Server Component, Toaster/SessionDialog dimuat malas, TooltipProvider dipindah ke AppShell, dan `safeNext` keluar dari `src/mocks/` | `pnpm size` → `/` 259,9 KB (aplikasi 131,0/145), `/i/*` 264,4 KB (aplikasi 135,5/142) — **OK**; keputusan D-040 |
| --- | --- | --- | --- | --- | --- |
| F-001 | C2 | **blocker** | `package.json` memanggil `scripts/lhci.mjs` dan `scripts/check-bundle-size.mjs` yang tidak ada → `pnpm size`, `pnpm lhci`, `pnpm gate` gagal | Kedua skrip dibuat; pengukuran diambil dari HTML produksi | `pnpm size` sekarang mencetak tabel |
| F-002 | C2 | **blocker** | `/admin/setup` (wajib v0.1) tidak ada | Wizard 5 wajib + 2 opsional, progres dari data nyata | `tests/e2e` + rute 200 |
| F-003 | C2 | **blocker** | OF-01…OF-04 tidak ada: tanpa IndexedDB, tanpa `/sync/batch` | `src/lib/offline-queue.ts`, `syncBatch`, UI `/app/antrean` | `tests/unit/offline-queue.test.ts` (5 tes) |
| F-004 | C5 | **blocker** | Halaman tidak pernah hidrasi; form login jatuh ke submit GET native (`/login?code=…&pin=…`) sehingga PIN bocor ke URL | Matcher middleware membajak `/_next/*`; diperbaiki jadi `/((?!_next/|api/|…))` | `core-flow.spec.ts` login lulus |
| F-005 | C5 | major | Loop 401: `GET auth/session` yang gagal memicu event "sesi habis" miliknya sendiri → 28 permintaan beruntun | Path `auth/session` dikecualikan dari pemicu event | Hitungan 401 turun ke 1 |
| F-006 | C5 | major | `safeNext("/\\evil.example")` lolos; `safeNext("/")` mengembalikan halaman publik | Tolak karakter kontrol; tolak `/` dan path kosong | `tests/unit/safe-next.test.ts` |
| F-007 | C4 | major | `onClick` pada `<li>` → hasil pencarian tak bisa dipilih dengan keyboard | `ResultRow` menerima `onSelect`, `<li>` bersih | `biome check` bersih, `useKeyWithClickEvents` hilang |
| F-008 | C6 | minor | 4 kunci i18n tidak ada di id dan en (`database.qty`, `imports.preview`, `labels.emptyLabels*`) | Ditambahkan di kedua bahasa | Audit kunci: 0 hilang |
| F-009 | C6 | minor | `refetch` dan `autoFocus` tidak terpakai (kode mati) | Jadi tombol "Coba lagi" dan fokus input kode | `tsc`/biome bersih |
| F-015 | C6 | major | 160 error lint: `biome.json` memakai skema 2.3.0 + kunci `files.includes` gaya lama untuk Biome 2.5.15 | Migrasi konfigurasi + `css.parser.tailwindDirectives` | `pnpm lint` exit 0 |
| F-016 | C6 | minor | Cache `tsconfig.tsbuildinfo` basi membuat typecheck melaporkan error palsu | Cache dihapus; typecheck 0 error | `pnpm typecheck` |

## Challenge antar-critic

| Dari | Ke | Isi | Keputusan |
| --- | --- | --- | --- |
| C2 | C4 | "F-010 blocker" tidak adil: lantai framework Next 16 + React 19 sendirian 128,9 KB, jadi 120 KB mustahil tanpa mengganti stack | Diterima sebagian — tetap blocker terhadap PRD, tetapi dicatat sebagai konflik spesifikasi, bukan kelalaian implementasi (D-040) |
| C4 | C2 | Angka 316,9 KB pada pengukuran pertama salah: menghitung chunk `noModule` (polyfill core-js) yang tidak diunduh browser modern | Diterima — pengukuran diperbaiki, angka turun ke 278,2 KB |
| C5 | C1 | 16 layar `ASSUMED` bukan salah builder; berkas mockup memang tidak memuat layar itu | Diterima — F-012 turun dari blocker ke major |
