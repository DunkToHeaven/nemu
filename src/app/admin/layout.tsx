import { AppShell } from "@/components/app/app-shell";
import { requirePageRole } from "@/server/guards";

/**
 * Rute /admin hanya untuk admin. Diperiksa di server (bukan hanya middleware)
 * karena middleware tidak bisa membaca sesi database.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageRole("admin", "/admin");
  return <AppShell>{children}</AppShell>;
}
