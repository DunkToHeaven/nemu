import { loginSchema } from "@/lib/api/schemas";
import type { SessionUser } from "@/lib/types";
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import { HttpError, ok, parseBody, requireUser } from "@/mocks/http";
import { CLEAR_SESSION_COOKIE, sessionCookie } from "@/mocks/session";
import {
  createSession,
  data,
  revokeSession,
  sessionFromToken,
  sessionUser,
  store,
} from "@/mocks/store";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

function publicUser(user: {
  id: string;
  code: string;
  name: string;
  role: SessionUser["role"];
  email: string | null;
  shiftEndsAt: string | null;
}): SessionUser {
  return {
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
    email: user.email,
    shiftEndsAt: user.shiftEndsAt,
  };
}

export function login(req: ApiRequest): ApiResponse {
  const input = parseBody(loginSchema, req.body);
  const identifier =
    input.mode === "pin" ? input.code.trim().toUpperCase() : input.email.trim().toLowerCase();
  const key = `${identifier}|${req.ip}`;
  const attempt = store().attempts.get(key);

  if (attempt?.lockedUntil && attempt.lockedUntil > Date.now()) {
    const seconds = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
    throw new HttpError(
      429,
      "LOCKED",
      `Terlalu banyak percobaan. Coba lagi dalam ${seconds} detik.`,
      {
        retryAfter: seconds,
      },
    );
  }

  const user =
    input.mode === "pin"
      ? data().users.find((u) => u.code.toUpperCase() === identifier && u.pin === input.pin)
      : data().users.find(
          (u) => (u.email ?? "").toLowerCase() === identifier && u.password === input.password,
        );

  if (!user?.active) {
    const next = { count: (attempt?.count ?? 0) + 1, lockedUntil: null as number | null };
    if (next.count >= MAX_ATTEMPTS) next.lockedUntil = Date.now() + LOCK_MS;
    store().attempts.set(key, next);
    const remaining = Math.max(0, MAX_ATTEMPTS - next.count);
    throw new HttpError(401, "INVALID_CREDENTIALS", "Kode atau PIN salah.", { remaining });
  }

  store().attempts.delete(key);
  user.lastLoginAt = new Date().toISOString();
  const session = createSession(user);

  return ok({ user: publicUser(user), redirectTo: "/app" }, 200, {
    "Set-Cookie": sessionCookie({ token: session.token, role: user.role, userId: user.id }),
  });
}

export function logout(req: ApiRequest): ApiResponse {
  revokeSession(req.token);
  return ok({ ok: true }, 200, { "Set-Cookie": CLEAR_SESSION_COOKIE });
}

export function currentSession(req: ApiRequest): ApiResponse {
  const session = sessionFromToken(req.token);
  if (!session) throw new HttpError(401, "UNAUTHENTICATED", "Belum masuk.");
  const user = sessionUser(session);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sesi tidak valid.");
  return ok({ user: publicUser(user) });
}

/** Panel dev: ganti role tanpa logout (memakai akun demo role itu). */
export function switchRole(req: ApiRequest): ApiResponse {
  const actor = requireUser(req);
  const body = req.body as { role?: string } | null;
  const role = body?.role;
  if (role !== "worker" && role !== "supervisor" && role !== "admin") {
    throw new HttpError(422, "VALIDATION_ERROR", "Role tidak dikenal.");
  }
  const target = data().users.find((u) => u.role === role && u.active && u.id !== actor.id);
  if (!target) throw new HttpError(404, "NOT_FOUND", "Akun demo untuk role itu tidak tersedia.");
  revokeSession(req.token);
  const session = createSession(target);
  return ok({ user: publicUser(target) }, 200, {
    "Set-Cookie": sessionCookie({ token: session.token, role: target.role, userId: target.id }),
  });
}
