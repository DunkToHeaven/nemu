/**
 * Jembatan sesi database -> lapisan mock.
 *
 * Saat `DATABASE_ENABLED=true`, login menghasilkan sesi di tabel `sessions`
 * dengan cookie `nemu_session`. Tetapi sebagian rute (dashboard, kategori,
 * lokasi, opname, ...) belum dipetakan ke database dan masih dilayani mock.
 * Mock punya penyimpanan sesi sendiri, sehingga cookie database tidak dikenali
 * dan semua rute fallback membalas 401 — aplikasi tampak logout.
 *
 * Solusi: setelah sesi database terbaca, daftarkan juga ke store mock supaya
 * rute fallback melihat pengguna yang sama. Ini hanya jembatan transisi; saat
 * semua rute sudah pindah ke database, modul ini bisa dihapus.
 */

import { data, type SessionRecord, store } from "@/mocks/store";
import { type AuthSession, readSession } from "@/server/auth";

export async function bridgeSessionToMock(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;

  // Token yang dipakai mock = id sesi database. Tidak perlu membuat token baru,
  // supaya cookie yang sama berlaku di kedua jalur.
  const token = session.sessionId;
  if (!store().sessions.has(token)) {
    const record: SessionRecord = {
      token,
      userId: ensureMockUser(session),
      role: session.user.role,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 12 * 3_600_000,
    };
    store().sessions.set(token, record);
  }

  return token;
}

/**
 * Pastikan pengguna sesi database ada di store mock, lalu return id mock-nya.
 *
 * Jangan mencocokkan lewat `code`: kode login DB dan seed mock bisa beda
 * (admin DB berkode `ADMIN`, seed mock `ADM01`), dan kecocokan yang salah
 * membuat jembatan mati diam-diam -> fallback 401 -> "Sesi berakhir" palsu.
 * Kalau tidak ada, sintesiskan user dari data sesi — cukup untuk rute
 * transisi (mock handler hanya butuh identitas + role).
 */
function ensureMockUser(session: AuthSession): string {
  const db = data();
  const byEmail = session.user.email
    ? db.users.find((entry) => entry.email?.toLowerCase() === session.user.email?.toLowerCase())
    : undefined;
  const found = byEmail ?? db.users.find((entry) => entry.code === session.user.code);
  if (found) return found.id;

  const synthetic = {
    id: `db_${session.user.id}`,
    code: session.user.code,
    name: session.user.name,
    role: session.user.role,
    email: session.user.email,
    active: true,
    shiftEndsAt: session.user.shiftEndsAt,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.users.push(synthetic);
  return synthetic.id;
}
