import { AppShell } from "@/components/app/app-shell";
import { ScanView } from "@/components/scan/scan-view";

export const metadata = { title: "Scan QR", robots: { index: false, follow: false } };

/**
 * `/scan` terdaftar di NAV_ITEMS, jadi pengguna membukanya dari sidebar atau
 * tab bar dan mengharapkan tetap berada di dalam aplikasi. Sebelumnya halaman
 * ini tidak memakai AppShell, sehingga sidebar, top bar, dan tab bar hilang
 * begitu menu Scan diklik — pengguna seperti terlempar keluar aplikasi tanpa
 * jalan kembali selain tombol back browser.
 *
 * PRD WB-08 tetap terpenuhi: rutenya tetap `/scan`, dan area kamera mengisi
 * seluruh ruang konten di dalam shell.
 */
export default function ScanPage() {
  return (
    <AppShell>
      <ScanView />
    </AppShell>
  );
}
