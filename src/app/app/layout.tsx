import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/server/guards";

/**
 * Semua rute /app wajib punya sesi. Di mode database pemeriksaan dilakukan di
 * sini (server) karena middleware tidak bisa membaca sesi Postgres. Di mode mock
 * middleware sudah menanganinya, sehingga guard ini tidak melakukan apa-apa.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession("/app");
  return <AppShell>{children}</AppShell>;
}
