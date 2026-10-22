/**
 * Utilitas HTTP untuk API v1.
 *
 * Bentuk error seragam sesuai PRD bagian 12:
 *   { error: { code, message, details? } }
 */
import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { type AuthSession, hasAtLeast, readSession } from "@/server/auth";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const errors = {
  unauthorized: () => new ApiError(401, "UNAUTHORIZED", "Sesi tidak valid atau sudah berakhir."),
  /**
   * Kredensial salah. Kode dan bentuk details mengikuti kontrak UI
   * (`login-card.tsx` mengharapkan `INVALID_CREDENTIALS` + `remaining`).
   */
  invalidCredentials: (remaining: number) =>
    new ApiError(401, "INVALID_CREDENTIALS", "Kode atau PIN salah.", { remaining }),
  /** Terlalu banyak percobaan login. UI mengharapkan `LOCKED` + `retryAfter`. */
  locked: (retryAfter: number) =>
    new ApiError(429, "LOCKED", `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`, {
      retryAfter,
    }),
  forbidden: (role?: Role) =>
    new ApiError(
      403,
      "FORBIDDEN",
      role ? `Peran ${role} tidak boleh mengakses sumber ini.` : "Akses ditolak.",
    ),
  notFound: (what = "Sumber") => new ApiError(404, "NOT_FOUND", `${what} tidak ditemukan.`),
  conflict: (code: string, message: string, details?: unknown) =>
    new ApiError(409, code, message, details),
  badRequest: (message: string, details?: unknown) =>
    new ApiError(400, "BAD_REQUEST", message, details),
  rateLimited: (retryAfter: number) =>
    new ApiError(
      429,
      "RATE_LIMITED",
      `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`,
      { retryAfterSeconds: retryAfter },
    ),
  tooMany: (message: string) => new ApiError(422, "UNPROCESSABLE", message),
};

export function ok<T>(body: T, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

/** Bungkus handler: tangkap ApiError dan jadikan respons seragam. */
export function handle<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        const headers: Record<string, string> = {};
        if (error.status === 429 && typeof error.details === "object" && error.details) {
          const retry = (error.details as { retryAfter?: number }).retryAfter;
          if (retry) headers["Retry-After"] = String(retry);
        }
        return NextResponse.json(
          { error: { code: error.code, message: error.message, details: error.details } },
          { status: error.status, headers },
        );
      }
      // Jangan bocorkan detail internal ke klien, tetapi catat di server.
      console.error("[api] unhandled:", error);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Terjadi kesalahan pada server." } },
        { status: 500 },
      );
    }
  };
}

/** Wajib punya sesi; kembalikan sesi bertipe. */
export async function requireSession(): Promise<AuthSession> {
  const session = await readSession();
  if (!session) throw errors.unauthorized();
  return session;
}

/** Wajib punya peran minimal tertentu (worker < supervisor < admin). */
export async function requireRole(required: Role): Promise<AuthSession> {
  const session = await requireSession();
  if (!hasAtLeast(session.user.role, required)) {
    throw errors.forbidden(session.user.role);
  }
  return session;
}

/** Validasi body JSON dengan skema Zod. */
export async function parseBody<T>(
  request: Request,
  schema: { parse: (v: unknown) => T },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw errors.badRequest("Body harus JSON yang valid.");
  }
  try {
    return schema.parse(raw);
  } catch (error) {
    const issues =
      typeof error === "object" && error !== null && "issues" in error
        ? (error as { issues: unknown }).issues
        : undefined;
    throw errors.badRequest("Data tidak valid.", issues);
  }
}

/** Paginasi kursor sederhana: kursor = offset terenkode base64. */
export function paginate<T>(rows: T[], cursor: string | null, limit: number) {
  const offset = cursor ? Number(Buffer.from(cursor, "base64url").toString("utf8")) || 0 : 0;
  const slice = rows.slice(offset, offset + limit);
  const next =
    offset + limit < rows.length ? Buffer.from(String(offset + limit)).toString("base64url") : null;
  return { data: slice, nextCursor: next };
}
