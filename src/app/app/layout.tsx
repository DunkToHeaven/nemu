import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { requiredRoleForPath } from "@/lib/nav";
import { hasRole } from "@/lib/types";
import { requirePageSession } from "@/server/guards";

/**
 * Semua rute /app wajib punya sesi, dan rute yang memerlukan peran lebih
 * tinggi ditolak di sini.
 *
 * Kenapa di layout, bukan per halaman: middleware tidak bisa membaca sesi
 * Postgres (edge runtime tanpa koneksi database), jadi pemeriksaan harus
 * terjadi di server. Menaruhnya di layout berarti setiap rute baru otomatis
 * ikut terjaga lewat peta `requiredRoleForPath()` — sebelumnya tiga rute
 * (/app/opname, /app/transaksi, /app/laporan) lolos tanpa penjaga.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession("/app");

  const pathname = (await headers()).get("x-nemu-pathname") ?? "";
  const required = pathname ? requiredRoleForPath(pathname) : null;
  if (required && session && !hasRole(session.user.role, required)) {
    redirect("/app?denied=1");
  }

  return <AppShell>{children}</AppShell>;
}
