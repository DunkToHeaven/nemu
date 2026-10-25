import { type NextRequest, NextResponse } from "next/server";
import { buildRequest, handleRequest } from "@/mocks/api";
import { sim } from "@/mocks/store";
import { pingDatabase } from "@/server/db";
import {
  applyImport,
  getEvents,
  getGoogle,
  getSettings,
  googleAction,
  listImports,
  previewImport,
  syncBatch,
  updateSettings,
} from "@/server/handlers/admin";
import { handleLogin, handleLogout, handleSession, handleSwitchRole } from "@/server/handlers/auth";
import { getDashboard, getReports, getStock } from "@/server/handlers/dashboard";
import {
  bulkItems,
  createItem,
  itemByCode,
  itemById,
  listItems,
  searchItems,
  updateItem,
} from "@/server/handlers/items";
import {
  createLocation,
  createUser,
  getMeta,
  listAudit,
  listCategories,
  listEquipment,
  listLocations,
  listReasons,
  listUnits,
  listUsers,
  updateLocation,
  updateUser,
  upsertCategory,
  upsertEquipment,
  upsertReason,
  upsertUnit,
} from "@/server/handlers/master";
import {
  approveCount,
  createCount,
  listCounts,
  listCustody,
  listVerifications,
  reviewVerification,
  setCountLine,
  settleBatch,
  settleCustody,
  submitVerification,
} from "@/server/handlers/operations";
import {
  forgotInfo,
  handleForgotPassword,
  handleResetPassword,
} from "@/server/handlers/password-reset";
import { getPriceHistory } from "@/server/handlers/price-history";
import { getReportDrill } from "@/server/handlers/report-drill";
import { checkEmail, handleSignup } from "@/server/handlers/signup";
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

/** Ambil sesi atau lempar ApiError 401 (untuk dipakai di dalam router). */
async function requireSessionOrThrow() {
  const { requireSession } = await import("@/server/http");
  return requireSession();
}

async function requireRoleOrThrow(role: "worker" | "supervisor" | "admin") {
  const { requireRole } = await import("@/server/http");
  return requireRole(role);
}

/** Rute database yang sudah diimplementasikan. */
async function dispatchDb(request: NextRequest, segments: string[]): Promise<Response> {
  const [head, second, third] = segments;

  /**
   * Organisasi pemilik sesi. Hampir semua rute data membutuhkannya karena
   * tabel aplikasi ada di schema tenant, bukan di `public`.
   */
  const tenantOf = async (): Promise<string> => (await requireSessionOrThrow()).tenant;
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
    if (second === "signup" && method === "POST") return handleSignup(request);
    if (second === "email" && method === "GET") return checkEmail(request);
    if (second === "forgot" && method === "POST") return handleForgotPassword(request);
    if (second === "forgot" && method === "GET") return forgotInfo();
    if (second === "reset" && method === "POST") return handleResetPassword(request);
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
    if (second && !third && method === "GET") return itemById(request, second);
    if (second && method === "PATCH") return updateItem(request, second);
  }

  if (head === "transactions") {
    if (!second && method === "GET") return listTransactions(request);
    if (!second && method === "POST") return createTransaction(request);
    if (second && third === "reverse" && method === "POST") return reverseTx(request, second);
  }

  // ---- master data ----
  if (head === "meta" && method === "GET") return getMeta(await tenantOf());
  if (head === "locations") {
    if (!second && method === "GET") return listLocations(request, await tenantOf());
    if (!second && method === "POST") return createLocation(request, await tenantOf());
    if (second && method === "PATCH") return updateLocation(request, second, await tenantOf());
  }
  if (head === "categories") {
    if (!second && method === "GET") return listCategories(await tenantOf());
    if (!second && method === "POST") return upsertCategory(request, await tenantOf());
    if (second && method === "PATCH") return upsertCategory(request, await tenantOf(), second);
  }
  if (head === "units") {
    if (!second && method === "GET") return listUnits(await tenantOf());
    if (!second && method === "POST") return upsertUnit(request, await tenantOf());
    if (second && method === "PATCH") return upsertUnit(request, await tenantOf(), second);
  }
  if (head === "reasons") {
    if (!second && method === "GET") return listReasons(request, await tenantOf());
    if (!second && method === "POST") return upsertReason(request, await tenantOf());
    if (second && method === "PATCH") return upsertReason(request, await tenantOf(), second);
  }
  if (head === "equipment") {
    if (!second && method === "GET") return listEquipment(await tenantOf());
    if (!second && method === "POST") return upsertEquipment(request, await tenantOf());
    if (second && method === "PATCH") return upsertEquipment(request, await tenantOf(), second);
  }
  if (head === "users") {
    if (!second && method === "GET") return listUsers(await tenantOf());
    if (!second && method === "POST") return createUser(request, await tenantOf());
    if (second && method === "PATCH") return updateUser(request, second, await tenantOf());
  }

  // ---- dashboard, laporan, stok ----
  if (head === "dashboard" && method === "GET") {
    const s = await requireSessionOrThrow();
    return getDashboard(s.user, s.tenant);
  }
  if (head === "reports" && second === "drill" && method === "GET") {
    return getReportDrill(request, await tenantOf());
  }
  if (head === "reports" && second === "price-history" && method === "GET") {
    return getPriceHistory(request, await tenantOf());
  }
  if (head === "reports" && method === "GET") return getReports(request, await tenantOf());
  if (head === "stock" && method === "GET") return getStock(request, await tenantOf());
  if (head === "events" && method === "GET") return getEvents(await tenantOf());

  // ---- kustodi & verifikasi ----
  if (head === "custody") {
    const s = await requireSessionOrThrow();
    if (!second && method === "GET") return listCustody(request, s.user, await tenantOf());
    if (second === "settle-batch" && method === "POST")
      return settleBatch(request, s.user, s.tenant);
    if (second && third === "settle" && method === "POST") {
      return settleCustody(request, second, s.user, s.tenant);
    }
  }
  if (head === "verifications") {
    if (!second && method === "POST") {
      const s = await requireSessionOrThrow();
      return submitVerification(request, s.user, await tenantOf());
    }
    if (!second && method === "GET") return listVerifications(request, await tenantOf());
    if (second && third === "review" && method === "POST") {
      const s = await requireRoleOrThrow("supervisor");
      return reviewVerification(request, second, s.user, s.tenant);
    }
  }

  // ---- opname ----
  if (head === "stock-counts") {
    if (!second && method === "GET") return listCounts(await tenantOf());
    if (!second && method === "POST") {
      const s = await requireRoleOrThrow("supervisor");
      return createCount(request, s.user, await tenantOf());
    }
    if (second && third === "approve" && method === "POST") {
      const s = await requireRoleOrThrow("supervisor");
      return approveCount(request, second, s.user, s.tenant);
    }
    // /stock-counts/:id/lines/:lineId
    if (second && segments[2] === "lines" && segments[3] && method === "POST") {
      return setCountLine(request, second, segments[3], await tenantOf());
    }
  }

  // ---- admin ----
  if (head === "settings") {
    if (method === "GET") return getSettings(await tenantOf());
    if (method === "PATCH") {
      const s = await requireRoleOrThrow("admin");
      return updateSettings(request, s.user, await tenantOf());
    }
  }
  if (head === "integrations" && second === "google") {
    if (!third && method === "GET") return getGoogle(await tenantOf());
    if (third && method === "POST") {
      const s = await requireRoleOrThrow("admin");
      return googleAction(third, s.user, s.tenant);
    }
  }
  if (head === "imports") {
    const s = await requireRoleOrThrow("admin");
    if (!second && method === "GET") return listImports(await tenantOf());
    if (!second && method === "POST") return previewImport(request, s.user, await tenantOf());
    if (second && third === "apply" && method === "POST") {
      return applyImport(request, second, s.user, s.tenant);
    }
  }
  if (head === "audit" && method === "GET") return listAudit(request, await tenantOf());
  if (head === "sync" && second === "batch" && method === "POST") {
    const s = await requireSessionOrThrow();
    return syncBatch(request, s.user, await tenantOf());
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
  try {
    const response = await dispatchDb(request, segments);
    if (!response.headers.has("X-Nemu-Source")) response.headers.set("X-Nemu-Source", "database");
    return response as NextResponse;
  } catch (error) {
    /**
     * Pooler Supabase (Supavisor) kadang memutus koneksi idle secara diam-diam;
     * permintaan pertama setelah itu gagal dengan ECONNRESET/ETIMEDOUT, bukan
     * karena kredensial atau datanya salah. Pengguna melihat "Terjadi kesalahan
     * pada server" padahal menekan simpan ulang saja sudah berhasil — dan
     * tombol login terasa "selalu gagal" padahal sandinya benar.
     *
     * Untuk kesalahan jaringan murni, ulangi SEKALI. Permintaan yang menyentuh
     * database hanya boleh diulang bila idempoten (login dan pembacaan memang
     * begitu); penulis memakai idempotency key sehingga aman.
     */
    if (!isTransientDbError(error)) throw error;
    console.warn("[api] koneksi pooler terputus, mencoba sekali lagi…");
    const retry = await dispatchDb(request, segments);
    if (!retry.headers.has("X-Nemu-Source")) retry.headers.set("X-Nemu-Source", "database");
    return retry as NextResponse;
  }
}

/** Bedakan kegagalan jaringan (layak diulang) dari kesalahan nyata. */
function isTransientDbError(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  const transient = [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EPIPE",
    "ENOTFOUND",
    "57P01", // admin shutdown
    "57P02", // crash shutdown
    "08", // class/connection excepted
  ];
  return transient.some((t) => code.startsWith(t) || message.includes(t));
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
