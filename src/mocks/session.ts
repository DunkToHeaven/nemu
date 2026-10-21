import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "nemu_session";
export const LOCALE_COOKIE = "nemu_locale";

export interface SessionCookiePayload {
  token: string;
  role: Role;
  userId: string;
}

/**
 * Cookie mock menyimpan id sesi + role agar middleware bisa memeriksa akses
 * tanpa menyentuh store (edge runtime). Di backend nyata cookie ditandatangani.
 */
export function encodeSession(value: SessionCookiePayload): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeSession(raw: string | undefined | null): SessionCookiePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<SessionCookiePayload>;
    if (!parsed.token || !parsed.userId) return null;
    if (parsed.role !== "worker" && parsed.role !== "supervisor" && parsed.role !== "admin")
      return null;
    return { token: parsed.token, role: parsed.role, userId: parsed.userId };
  } catch {
    return null;
  }
}

export function sessionCookie(payload: SessionCookiePayload): string {
  return `${SESSION_COOKIE}=${encodeSession(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${8 * 3600}`;
}

export const CLEAR_SESSION_COOKIE = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export const ROLE_RANK: Record<Role, number> = { worker: 1, supervisor: 2, admin: 3 };

export function canAccess(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Rute yang butuh role minimal. Urutan tidak penting: yang paling ketat menang. */
export const ROUTE_GUARDS: { pattern: RegExp; required: Role }[] = [
  { pattern: /^\/admin(\/.*)?$/, required: "admin" },
  {
    pattern: /^\/app\/database\/(lokasi|kategori|alasan|mesin|pengguna|label|impor)(\/.*)?$/,
    required: "admin",
  },
  { pattern: /^\/app\/database(\/.*)?$/, required: "supervisor" },
  { pattern: /^\/app\/(transaksi|opname|laporan)(\/.*)?$/, required: "supervisor" },
  { pattern: /^\/app(\/.*)?$/, required: "worker" },
  { pattern: /^\/scan(\/.*)?$/, required: "worker" },
  { pattern: /^\/i\/.*$/, required: "worker" },
];

export function requiredRoleFor(pathname: string): Role | null {
  let required: Role | null = null;
  for (const guard of ROUTE_GUARDS) {
    if (!guard.pattern.test(pathname)) continue;
    if (!required || ROLE_RANK[guard.required] > ROLE_RANK[required]) required = guard.required;
  }
  return required;
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/docs" ||
    pathname === "/privacy" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest"
  );
}

/** Kontrol karakter (NUL..US, DEL) bisa dipakai untuk header injection. */
/**
 * `safeNext` pindah ke `src/lib/safe-next.ts` supaya komponen klien tidak
 * perlu mengimpor modul mock. Diekspor ulang di sini agar pemanggil lama
 * (middleware, tes) tetap jalan.
 */
export { safeNext } from "@/lib/safe-next";
