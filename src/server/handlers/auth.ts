/**
 * Autentikasi: PIN untuk pekerja, email+password untuk supervisor/admin.
 *
 * Rate limit ditegakkan per kode karyawan DAN per IP (PRD bagian 12), karena
 * PIN hanya 4 digit — tanpa pembatas, seluruh ruang PIN bisa dicoba cepat.
 */
import { z } from "zod";
import type { Role } from "@/lib/types";
import {
  clearSessionCookie,
  createSession,
  readSession,
  revokeSession,
  setSessionCookie,
} from "@/server/auth";
import { hashSecret, verifySecret } from "@/server/crypto";
import { sql } from "@/server/db";
import { errors, ok, parseBody } from "@/server/http";
import { checkRateLimit, RATE_RULES } from "@/server/rate-limit";

export const loginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("pin"),
    code: z.string().trim().min(1).max(32),
    pin: z.string().min(4).max(12),
  }),
  z.object({
    mode: z.literal("email"),
    email: z.string().trim().email(),
    password: z.string().min(1).max(200),
  }),
]);

export async function handleLogin(request: Request): Promise<Response> {
  const body = await parseBody(request, loginSchema);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1";

  // Batas per IP lebih longgar; batas per identitas yang menahan brute force.
  const ipLimit = await checkRateLimit({
    bucket: `login:ip:${ip}`,
    ...RATE_RULES.loginPerIp,
  });
  if (!ipLimit.allowed) {
    throw errors.locked(ipLimit.retryAfterSeconds);
  }

  const identity = body.mode === "pin" ? body.code.toUpperCase() : body.email.toLowerCase();
  const idLimit = await checkRateLimit({
    bucket: `login:id:${identity}`,
    ...RATE_RULES.loginPerCode,
  });
  if (!idLimit.allowed) {
    throw errors.locked(idLimit.retryAfterSeconds);
  }

  let userId: string;
  let role: Role;

  let tenant: string;

  if (body.mode === "pin") {
    // Kode login unik per tenant, jadi satu kode bisa ada di beberapa gudang.
    // Login PIN tanpa nama gudang memilih tenant aktif pertama yang cocok;
    // bila sebuah kode dipakai di lebih dari satu gudang, pemiliknya harus
    // memakai email+password agar tidak ambigu.
    const rows = await sql<
      {
        id: string;
        role: Role;
        pin_hash: string | null;
        active: boolean;
        tenant_slug: string | null;
        matches: number;
      }[]
    >`
      SELECT u.id, u.role, u.pin_hash, u.active, u.tenant_slug,
             (SELECT count(*)::int FROM users u2
               WHERE upper(u2.code) = ${body.code.toUpperCase()} AND u2.active) AS matches
      FROM users u
      WHERE upper(u.code) = ${body.code.toUpperCase()} AND u.active
      ORDER BY u.created_at
      LIMIT 1
    `;
    const user = rows[0];
    // Pesan error netral: tidak membocorkan apakah kode ada atau PIN salah.
    // Kodenya INVALID_CREDENTIALS agar UI bisa menampilkan sisa percobaan.
    if (!user?.active || !(await verifySecret(body.pin, user.pin_hash))) {
      throw errors.invalidCredentials(idLimit.remaining);
    }
    userId = user.id;
    role = user.role;
    tenant = user.tenant_slug ?? "";
  } else {
    const rows = await sql<
      {
        id: string;
        role: Role;
        password_hash: string | null;
        active: boolean;
        tenant_slug: string | null;
      }[]
    >`SELECT id, role, password_hash, active, tenant_slug
      FROM users WHERE lower(email) = ${body.email.toLowerCase()} AND active LIMIT 1`;
    const user = rows[0];
    if (!user?.active || !(await verifySecret(body.password, user.password_hash))) {
      throw errors.invalidCredentials(idLimit.remaining);
    }
    userId = user.id;
    role = user.role;
    tenant = user.tenant_slug ?? "";
  }

  // Akun tanpa organisasi tidak boleh masuk: datanya tidak akan ditemukan.
  if (!tenant) {
    throw errors.badRequest("Akun ini belum terhubung ke organisasi mana pun.");
  }

  const sessionId = await createSession(userId, role, tenant);
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${userId}`;

  const me = await sql<
    {
      id: string;
      code: string;
      name: string;
      role: Role;
      email: string | null;
      shift_ends_at: string | null;
    }[]
  >`SELECT id, code, name, role, email, shift_ends_at FROM users WHERE id = ${userId}`;

  const row = me[0];
  if (!row) throw errors.unauthorized();

  const response = ok({
    user: {
      id: row.id,
      code: row.code,
      name: row.name,
      role: row.role,
      email: row.email,
      shiftEndsAt: row.shift_ends_at,
    },
    // Kontrak klien (loginResponseSchema) mewajibkan redirectTo; pekerja selalu
    // diarahkan ke dashboard, rute asal ditangani `?next=` di sisi klien.
    redirectTo: "/app",
  });
  setSessionCookie(response, sessionId, request);
  return response;
}

export async function handleLogout(): Promise<Response> {
  const session = await readSession();
  if (session) await revokeSession(session.sessionId);
  const response = ok({ ok: true });
  clearSessionCookie(response);
  return response;
}

export async function handleSession(): Promise<Response> {
  const session = await readSession();
  if (!session) throw errors.unauthorized();
  return ok({
    user: {
      id: session.user.id,
      code: session.user.code,
      name: session.user.name,
      role: session.user.role,
      email: session.user.email,
      shiftEndsAt: session.user.shiftEndsAt,
    },
  });
}

/**
 * Ganti peran — HANYA di luar produksi.
 *
 * Panel dev frontend memakai ini untuk menguji isolasi peran. Di produksi
 * endpoint ini harus mati: mengganti peran sendiri adalah eskalasi hak akses.
 */
export async function handleSwitchRole(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_ROLE_SWITCH !== "true") {
    throw errors.forbidden();
  }
  const body = await parseBody(
    request,
    z.object({ role: z.enum(["worker", "supervisor", "admin"]) }),
  );
  const session = await readSession();
  if (!session) throw errors.unauthorized();

  await sql`UPDATE sessions SET role = ${body.role} WHERE id = ${session.sessionId}`;
  return ok({ ok: true, role: body.role });
}

/** Utilitas untuk wizard setup: buat admin pertama. */
export async function createFirstAdmin(input: {
  code: string;
  name: string;
  email: string;
  password: string;
}): Promise<{ id: string }> {
  const existing = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM users`;
  if ((existing[0]?.count ?? 0) > 0) {
    throw errors.conflict("SETUP_DONE", "Setup awal sudah pernah dijalankan.");
  }
  const hash = await hashSecret(input.password);
  const id = `usr_admin`;
  await sql`INSERT INTO users (id, code, name, role, email, password_hash)
    VALUES (${id}, ${input.code}, ${input.name}, 'admin', ${input.email}, ${hash})`;
  return { id };
}
