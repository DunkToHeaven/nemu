/**
 * Penjaga rute sisi server untuk mode database.
 *
 * Middleware tidak bisa memverifikasi sesi database (edge runtime tanpa akses
 * PostgreSQL), jadi keputusan "boleh masuk atau tidak" HARUS diambil di sini.
 * Tanpa ini, siapa pun yang punya cookie apa pun bisa membuka /admin.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/types";
import { hasAtLeast, readSession, SESSION_COOKIE } from "@/server/auth";

export function dbMode(): boolean {
  return process.env.DATABASE_ENABLED === "true";
}

/**
 * Wajib login.
 *
 * Dua kasus ditangani berbeda:
 *  - Tamu murni (tidak ada cookie sesi): wajar dialihkan ke /login dengan
 *    `next` supaya setelah masuk ia kembali ke halaman yang dituju.
 *  - Cookie ada tapi mati (sesi kedaluwarsa/dicabut): diarahkan ke BERANDA,
 *    tanpa `next`. Membawa `next` ke halaman tujuan adalah sumber "loop sesi
 *    habis" — halaman itu membuka guard lagi, dan kalau ada satu permintaan
 *    yang masih memakai id sesi lama, alur berputar login -> next -> login.
 *    Beranda tidak terlindungi, jadi loop tidak mungkin terbentuk.
 */
export async function requirePageSession(nextPath: string) {
  if (!dbMode()) return null;

  const session = await readSession();
  if (!session) {
    const jar = await cookies();
    const hasCookie = Boolean(jar.get(SESSION_COOKIE)?.value);
    redirect(hasCookie ? "/" : `/login?next=${encodeURIComponent(nextPath)}`);
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
