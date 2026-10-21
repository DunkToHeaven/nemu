# DECISIONS

Keputusan yang diambil saat membangun, termasuk hal yang tidak diatur PRD atau
mockup. Format: ID · konteks · pilihan · alasan. Keputusan Hakim bersifat mengikat.

## Konflik sumber

| ID | Konteks | Pilihan | Alasan |
| --- | --- | --- | --- |
| D-001 | Mockup hanya tersedia sebagai satu ekspor HTML dengan layar terbatas (home, login, scan) | Layar lain mengikuti wireframe PRD bagian 5–6 dan sistem desain PRD; ditandai `ASSUMED` di `MOCKUP_MAP.md` | Aturan konflik PRD: bila mockup tidak ada, pakai wireframe PRD lalu tandai |
| D-002 | PRD menyebut Inter, mockup memakai Plus Jakarta Sans | Pakai **Plus Jakarta Sans** (self-host, `next/font/local`) + JetBrains Mono untuk kode | Mockup menang untuk tampilan; PRD menang untuk perilaku |
| D-003 | PRD menyebut aksen teal, mockup memakai aksen oranye bata `#C2410C` | Pakai aksen `#C2410C` pada token `--primary`, tetap OKLCH | Mockup menang untuk tampilan; kontras AA diverifikasi ulang |

## Arsitektur

| ID | Konteks | Pilihan | Alasan |
| --- | --- | --- | --- |
| D-010 | PRD menyebut MSW untuk lapisan mock | Handler in-memory setara MSW, dipasang lewat Route Handler Next (`/api/v1/[...path]`) | Satu proses, tanpa service worker; perilaku HTTP tetap nyata sehingga `fetch`, cookie, dan SSE dapat diuji |
| D-011 | Data mock harus bertahan antar-request | Store disimpan di `globalThis.__nemuStore` | Route handler di Next 16 bisa dieksekusi di beberapa instance modul |
| D-012 | Sesi harus bisa dibaca middleware (edge) | Cookie `nemu_session` berisi `{token, role, userId}` base64url, HttpOnly | Middleware tidak boleh menyentuh store; backend nyata akan menandatangani cookie |
| D-013 | PRD melarang fetch langsung dari komponen | Semua akses lewat `src/lib/api/client.ts` dengan skema Zod bersama | Kontrak tunggal; respons menyimpang langsung gagal `CONTRACT_MISMATCH` |
| D-014 | Tabel 10.000 baris harus mulus | `useInfiniteQuery` + paginasi kursor + `@tanstack/react-virtual` | Virtualisasi tanpa memuat semua baris sekaligus |
| D-015 | PRD meminta draft dipulihkan setelah login ulang | Draf di `localStorage` dengan TTL 12 jam, kunci `kodeItem:userId` | Bertahan melewati sesi habis tanpa membocorkan draf antar-pekerja |

## Perilaku

| ID | Konteks | Pilihan | Alasan |
| --- | --- | --- | --- |
| D-020 | PRD D-06: konfirmasi muncul setelah transaksi tercatat | Pertanyaan dikirim bersama respons `POST /transactions`, tidak pernah memblokir | Alur utama tidak boleh melambat |
| D-021 | Mode buta | `expected_qty` null; UI menampilkan `•••` dan tidak membocorkan qty sistem | Mencegah jawaban "Sesuai" asal tekan |
| D-022 | Kunci idempotensi saat 409 | Kunci **diganti** setelah 409 karena percobaan sebelumnya tidak tercatat | Kirim ulang dengan kunci lama akan dianggap duplikat palsu |
| D-023 | Antrean offline | IndexedDB (`nemu-offline`), `seq` per perangkat, kunci idempotensi dibuat saat masuk antrean | OF-02: tidak ada duplikat, urutan terjaga |
| D-024 | Konflik stok dari antrean offline | Ditandai `needs_review` di perangkat dan dilaporkan `needs_review` oleh `/sync/batch` | OF-03: tidak ada data hilang diam-diam |
| D-025 | Tombol Batalkan saat pertanyaan konfirmasi aktif | Membatalkan transaksi lewat `/transactions/:id/reverse` dalam 60 detik, bukan menutup dialog | Kasus tepi PRD: pembatalan harus tercatat, bukan menghilang |
| D-026 | Kuota pertanyaan per shift | Dihitung dari `promptUsage[userId]`, tidak bertambah bila pekerja menekan Lewati | CV-09: kuota membatasi gangguan, bukan jawaban |
| D-027 | Item nonaktif | `POST /transactions` mengembalikan 410 `ITEM_INACTIVE`, UI menyarankan lapor supervisor | PRD kasus tepi: item nonaktif tidak boleh diambil |
| D-028 | Role bocor | Menu disaring `navForRole`, rute dijaga middleware, endpoint memakai `requireRole` | Tiga lapis: menu, rute, API |

## Cakupan

| ID | Konteks | Pilihan | Alasan |
| --- | --- | --- | --- |
| D-030 | Wizard setup `/admin/setup` | Lima langkah wajib + dua opsional, status dihitung dari data nyata (bukan checkbox kosong) | PRD: admin non-teknis harus bisa selesai dalam satu sesi |
| D-031 | Impor dari Sheets dua arah | Tidak dibangun; hanya CSV/XLSX lewat dashboard | PRD: impor Sheets tiba di v0.2 |
| D-032 | Cetak label | PDF dibuat di klien dengan `pdf-lib`, QR dari `qrcode` | Tanpa dependensi server; pratinjau memakai QR yang sama |
| D-033 | Ekspor laporan | CSV di klien | Cukup untuk v0.1; XLSX masuk `IDEAS.md` |
| D-034 | Fitur di luar PRD | Tidak diimplementasikan; dicatat di `IDEAS.md` | Larangan memperluas cakupan |

## Keputusan Hakim

| ID | Konteks | Pilihan | Alasan |
| --- | --- | --- | --- |
| D-040 | PRD bagian 4 menetapkan JS awal `/` ≤ 120 KB dan `/i/*` ≤ 150 KB (gzip). Pengukuran nyata: framework Next 16 + React 19 **sendirian** 128,9 KB; total `/` 278,2 KB, `/i/*` 264,9 KB | Anggaran PRD **tidak tercapai** dan tidak diakali. Gerbang `pnpm size` tetap gagal (bukan dilonggarkan) supaya regresi tidak tersembunyi. Keputusan akhir diserahkan ke pemilik produk dengan tiga opsi di bawah | Memaksa angka 120 KB berarti mengganti stack (mis. SPA Vite + React Router) — itu keputusan produk, bukan keputusan implementasi. Melonggarkan gerbang tanpa izin sama dengan menonaktifkan gerbang, yang dilarang |
| D-041 | Pengukuran awal 316,9 KB | Chunk `noModule` (polyfill core-js 38,7 KB) **tidak dihitung** | Browser modern tidak pernah mengunduhnya; menghitungnya membuat angka palsu |
| D-042 | Turbopack dev di mesin ini tidak menyelesaikan hidrasi (form jatuh ke submit GET native) | Tes E2E dijalankan terhadap **build produksi** (`pnpm build && pnpm start`) | Hidrasi terverifikasi normal di produksi; ini bug dev-server/toolchain, bukan kode aplikasi. Konsekuensi: `pnpm e2e` butuh `PLAYWRIGHT_BASE_URL` |

### Opsi untuk D-040 (perlu keputusan pemilik produk)

1. **Terima kenyataan stack.** Naikkan anggaran ke `/` ≤ 290 KB dan `/i/*` ≤ 280 KB
   (framework 128,9 KB + ruang aplikasi ±150 KB). Nol perubahan kode, rilis jalan.
2. **Turunkan anggaran aplikasi.** Pertahankan total, tetapi pisahkan: framework
   tidak dihitung, aplikasi ≤ 120 KB. Saat ini aplikasi 149,3 KB → masih perlu
   memangkas ±30 KB (terbesar: zod 35,7 KB, sonner+radix 15,4 KB, recharts).
3. **Ganti stack render.** SPA Vite + React Router bisa mencapai ~120 KB total,
   tetapi kehilangan Server Components, streaming, dan `next/font` self-host —
   bertentangan dengan stack yang diwajibkan PRD bagian 2.

