# IDEAS

Ide di luar cakupan PRD. **Tidak diimplementasikan** — hanya dicatat supaya tidak
memperluas cakupan secara diam-diam.

| Ide | Nilai | Alasan ditunda |
| --- | --- | --- |
| Ekspor XLSX selain CSV | Format yang diminta akuntan | PRD hanya menyebut CSV; menambah SheetJS = +90 KB |
| PWA service worker penuh (Serwist) | Aset & shell offline | Risiko R-03 PRD: Serwist belum pasti kompatibel Next 16 + Turbopack |
| Barcode 1D (Code128) selain QR | Sebagian rak lama hanya punya barcode | PRD memilih QR; menambah `bwip-js` memperbesar bundle |
| Suara saat scan berhasil | Umpan balik tanpa melihat layar | Perlu keputusan aksesibilitas & preferensi per gudang |
| Papan Kanban pemindahan rak | Perencanaan tata letak | Tidak ada di PRD |
| Mode kiosk tablet di rak | Scan tanpa login per pekerja | Bertentangan dengan jejak audit per pengguna |
| Grafik prakiraan konsumsi | Reorder lebih awal | Butuh data historis panjang; di luar v0.1 |
| Integrasi Telegram bot untuk notifikasi | Admin sudah memakai Telegram | PRD hanya menandai preferensi notifikasi, bukan kanal |
| Audit diff visual (sebelum/sesudah berwarna) | Mempercepat review | Nice-to-have; audit sudah menampilkan entitas + aksi |
| Latihan onboarding interaktif | Pekerja baru lebih cepat mahir | Di luar cakupan rilis |
