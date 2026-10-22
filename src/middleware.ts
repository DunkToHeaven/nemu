import { type NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import {
  decodeSession,
  isPublicPath,
  ROLE_RANK,
  requiredRoleFor,
  SESSION_COOKIE,
  safeNext,
} from "@/mocks/session";

/**
 * Middleware proteksi rute.
 *
 * Ada dua jenis cookie sesi:
 *
 *  1. Mode mock (DATABASE_ENABLED != "true"): cookie berisi payload base64
 *     hasil `encodeSession`, bisa dibaca langsung di edge runtime.
 *  2. Mode database: cookie hanya berisi id sesi acak. Middleware TIDAK bisa
 *     memverifikasinya di sini karena edge runtime tidak punya akses ke
 *     PostgreSQL.
 *
 * Untuk kasus (2), middleware hanya memeriksa keberadaan cookie, lalu
 * penegakan sesungguhnya dilakukan di server (setiap handler API lewat
 * `requireSession`/`requireRole`). Rute tetap tidak bisa diakses tanpa sesi
 * sah — tanpa cookie sama sekali tetap dialihkan ke /login.
 */
function readRole(request: NextRequest): Role | "opaque" | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  // Mode mock: payload terbaca sehingga peran diketahui di edge.
  const decoded = decodeSession(raw);
  if (decoded) return decoded.role;

  // Mode database: id sesi opaque; verifikasi dilakukan di server.
  return "opaque";
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const role = readRole(request);

  if (!role) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", safeNext(`${pathname}${search}`, "/app"));
    return NextResponse.redirect(url);
  }

  // Peran hanya bisa diperiksa bila payload terbaca (mode mock). Pada mode
  // database, keputusan peran diambil di server yang memverifikasi sesi.
  if (role !== "opaque") {
    const required = requiredRoleFor(pathname);
    if (required && ROLE_RANK[role] < ROLE_RANK[required]) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      url.searchParams.set("denied", "1");
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Jangan pernah menyentuh aset internal Next (`/_next/*`, termasuk HMR dan RSC),
   * favicon, atau API. Middleware yang membajak `/_next/hmr` memutus WebSocket
   * dev dan membuat halaman tidak pernah hidrasi.
   */
  matcher: ["/((?!_next/|api/|favicon.ico|fonts/|manifest.webmanifest).*)"],
};
