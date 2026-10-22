/**
 * Penjaga rute sisi server untuk mode database.
 *
 * Middleware tidak bisa memverifikasi sesi database (edge runtime tanpa akses
 * PostgreSQL), jadi keputusan "boleh masuk atau tidak" HARUS diambil di sini.
 * Tanpa ini, siapa pun yang punya cookie apa pun bisa membuka /admin.
 */
import { redirect } from "next/navigation";
import type { Role } from "@/lib/types";
import { hasAtLeast, readSession } from "@/server/auth";

export function dbMode(): boolean {
  return process.env.DATABASE_ENABLED === "true";
}

/** Wajib login; alihkan ke /login bila belum. */
export async function requirePageSession(nextPath: string) {
  if (!dbMode()) return null;

  const session = await readSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}

/** Wajib login dengan peran minimal tertentu. */
export async function requirePageRole(required: Role, nextPath: string) {
  const session = await requirePageSession(nextPath);
  if (!session) return null;

  if (!hasAtLeast(session.user.role, required)) {
    // Pekerja yang mencoba membuka rute supervisor diarahkan ke dashboard,
    // bukan ditampilkan halaman kosong.
    redirect("/app?denied=1");
  }
  return session;
}
