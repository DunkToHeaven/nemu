import { type NextRequest, NextResponse } from "next/server";
import {
  decodeSession,
  isPublicPath,
  ROLE_RANK,
  requiredRoleFor,
  SESSION_COOKIE,
  safeNext,
} from "@/mocks/session";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", safeNext(`${pathname}${search}`, "/app"));
    return NextResponse.redirect(url);
  }

  const required = requiredRoleFor(pathname);
  if (required && ROLE_RANK[session.role] < ROLE_RANK[required]) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    url.searchParams.set("denied", "1");
    return NextResponse.redirect(url);
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
