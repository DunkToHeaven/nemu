import { type NextRequest, NextResponse } from "next/server";
import { buildRequest, handleRequest } from "@/mocks/api";
import { sim } from "@/mocks/store";
import { pingDatabase } from "@/server/db";
import { handleLogin, handleLogout, handleSession, handleSwitchRole } from "@/server/handlers/auth";
import {
  bulkItems,
  createItem,
  itemByCode,
  listItems,
  searchItems,
  updateItem,
} from "@/server/handlers/items";
import {
  createTransaction,
  itemTransactions,
  listTransactions,
  reverseTx,
} from "@/server/handlers/transactions";
import { handle } from "@/server/http";
import { bridgeSessionToMock } from "@/server/mock-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sumber data dipilih di sini, bukan di komponen:
 *   DATABASE_ENABLED=true -> PostgreSQL
 *   selain itu            -> lapisan mock (demo tanpa DB)
 * Frontend selalu memanggil `/api/v1/*` yang sama.
 */
function dbEnabled(): boolean {
  return process.env.DATABASE_ENABLED === "true";
}

/**
 * Endpoint kendali simulasi (`__mock/*`) harus selalu bisa dihubungi. Tanpa
 * pengecualian ini, menyalakan simulasi "offline" mengunci panel dev sendiri:
 * semua API 503 termasuk permintaan untuk mematikannya lagi.
 */
function isControlPath(segments: string[]): boolean {
  return segments[0] === "__mock";
}

async function dispatchMock(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const state = sim();
  if (state.offline && !isControlPath(segments)) {
    return NextResponse.json(
      { error: { code: "OFFLINE", message: "Koneksi terputus. Periksa sinyal lalu coba lagi." } },
      { status: 503 },
    );
  }

  if (state.latencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, state.latencyMs));
  }

  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "DELETE") {
    try {
      body = await request.json();
    } catch {
      body = null;
    }
  }

  const req = buildRequest({
    method: request.method,
    url: `http://nemu.local/api/v1/${segments.join("/")}${request.nextUrl.search}`,
    body,
    cookie: request.headers.get("cookie") ?? undefined,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
  });

  const result = await handleRequest(req);
  const response = NextResponse.json(result.body, { status: result.status });
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) response.headers.set(key, value);
  }
  return response;
}

type Context = { params: Promise<{ path: string[] }> };

/** Rute database yang sudah diimplementasikan. */
async function dispatchDb(request: NextRequest, segments: string[]): Promise<Response> {
  const [head, second, third] = segments;
  const method = request.method;

  if (head === "health") {
    const db = await pingDatabase();
    return NextResponse.json(
      { ok: db, database: db ? "up" : "down", version: "0.2.0" },
      { status: db ? 200 : 503 },
    );
  }
  if (head === "version") return NextResponse.json({ version: "0.2.0", api: "v1" });

  if (head === "auth") {
    if (second === "login" && method === "POST") return handleLogin(request);
    if (second === "logout" && method === "POST") return handleLogout();
    if (second === "session" && method === "GET") return handleSession();
    if (second === "role" && method === "POST") return handleSwitchRole(request);
  }

  if (head === "items") {
    if (!second && method === "GET") return listItems(request);
    if (!second && method === "POST") return createItem(request);
    if (second === "search" && method === "GET") return searchItems(request);
    if (second === "bulk" && method === "POST") return bulkItems(request);
    if (second === "by-code" && third && method === "GET") return itemByCode(request, third);
    if (second && third === "transactions" && method === "GET") {
      return itemTransactions(request, second);
    }
    if (second && method === "PATCH") return updateItem(request, second);
  }

  if (head === "transactions") {
    if (!second && method === "GET") return listTransactions(request);
    if (!second && method === "POST") return createTransaction(request);
    if (second && third === "reverse" && method === "POST") return reverseTx(request, second);
  }

  // Belum dipetakan ke database: pakai mock supaya UI tetap berfungsi, dan
  // tandai jelas di header agar tidak dikira sudah nyata.
  //
  // Sesi database didaftarkan dulu ke store mock, kalau tidak rute fallback
  // akan membalas 401 dan aplikasi tampak logout di tengah jalan.
  await bridgeSessionToMock();
  const fallback = await dispatchMock(request, segments);
  fallback.headers.set("X-Nemu-Source", "mock-fallback");
  return fallback;
}

async function dispatch(request: NextRequest, segments: string[]): Promise<NextResponse> {
  if (!dbEnabled() || isControlPath(segments)) return dispatchMock(request, segments);
  const response = await dispatchDb(request, segments);
  if (!response.headers.has("X-Nemu-Source")) response.headers.set("X-Nemu-Source", "database");
  return response as NextResponse;
}

const wrapped = handle(async (request: NextRequest, context: Context) => {
  const { path } = await context.params;
  return dispatch(request, path);
});

export async function GET(request: NextRequest, context: Context) {
  return wrapped(request, context);
}

export async function POST(request: NextRequest, context: Context) {
  return wrapped(request, context);
}

export async function PATCH(request: NextRequest, context: Context) {
  return wrapped(request, context);
}

export async function DELETE(request: NextRequest, context: Context) {
  return wrapped(request, context);
}
