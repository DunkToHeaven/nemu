/**
 * Sesi & otorisasi.
 *
 * Sesi disimpan di database (bukan cookie bertanda tangan saja) supaya bisa
 * dicabut seketika — persyaratan keamanan yang tidak bisa dipenuhi token
 * stateless. Cookie hanya membawa id sesi acak.
 *
 * Peran SELALU dibaca dari database, tidak pernah dipercaya dari cookie:
 * kalau peran pengguna diturunkan, sesi lamanya langsung kehilangan akses.
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";
import { sql } from "@/server/db";

export const SESSION_COOKIE = "nemu_session";
const SESSION_TTL_HOURS = 12;

export interface AuthUser {
  id: string;
  code: string;
  name: string;
  role: Role;
  email: string | null;
  shiftEndsAt: string | null;
}

export interface AuthSession {
  sessionId: string;
  user: AuthUser;
}

const ROLE_RANK: Record<Role, number> = { worker: 1, supervisor: 2, admin: 3 };

export function hasAtLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export async function createSession(userId: string, role: Role): Promise<string> {
  const id = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000);
  await sql`
    INSERT INTO sessions (id, user_id, role, expires_at)
    VALUES (${id}, ${userId}, ${role}, ${expires})
  `;
  return id;
}

/** Baca sesi dari cookie. Peran diambil dari tabel users, bukan dari cookie. */
export async function readSession(): Promise<AuthSession | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const rows = await sql<
    {
      session_id: string;
      user_id: string;
      code: string;
      name: string;
      role: Role;
      email: string | null;
      shift_ends_at: string | null;
    }[]
  >`
    SELECT s.id AS session_id, u.id AS user_id, u.code, u.name, u.role,
           u.email, u.shift_ends_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${raw}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.active
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      code: row.code,
      name: row.name,
      role: row.role,
      email: row.email,
      shiftEndsAt: row.shift_ends_at,
    },
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}`;
}

/** Bersihkan sesi kedaluwarsa. Dipanggil berkala, bukan di jalur permintaan. */
export async function pruneSessions(): Promise<void> {
  await sql`DELETE FROM sessions WHERE expires_at < now() OR revoked_at IS NOT NULL`;
}

export function setSessionCookie(response: Response, sessionId: string): void {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
      SESSION_TTL_HOURS * 3600
    }${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}

export function clearSessionCookie(response: Response): void {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}
