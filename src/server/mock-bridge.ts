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
import { readSession } from "@/server/auth";

export async function bridgeSessionToMock(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;

  const user = data().users.find((entry) => entry.code === session.user.code);
  if (!user) return null;

  // Token yang dipakai mock = id sesi database. Tidak perlu membuat token baru,
  // supaya cookie yang sama berlaku di kedua jalur.
  const token = session.sessionId;
  const existing = store().sessions.get(token);
  if (!existing) {
    const record: SessionRecord = {
      token,
      userId: user.id,
      role: session.user.role,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 12 * 3_600_000,
    };
    store().sessions.set(token, record);
  }

  return token;
}
