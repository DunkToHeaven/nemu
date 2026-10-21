import { currentSession, login, logout, switchRole } from "@/mocks/handlers/auth";
import {
  bulkItems,
  createItem,
  itemByCode,
  itemById,
  itemTransactions,
  listItems,
  searchItems,
  updateItem,
} from "@/mocks/handlers/items";
import {
  approveCount,
  createCount,
  createLocation,
  createUser,
  getGoogle,
  getSettings,
  googleAction,
  health,
  importApply,
  importPreview,
  listAudit,
  listCategories,
  listCounts,
  listEquipment,
  listImports,
  listLocations,
  listReasons,
  listUnits,
  listUsers,
  meta,
  updateCountLine,
  updateLocation,
  updateSettings,
  updateUser,
  upsertCategory,
  upsertEquipment,
  upsertReason,
  upsertUnit,
  version,
} from "@/mocks/handlers/master";
import { dashboard, events, listStock, reports } from "@/mocks/handlers/read";
import {
  createTransaction,
  listCustody,
  listTransactions,
  listVerifications,
  reverseTransaction,
  reviewVerification,
  settleCustody,
  settleCustodyBatch,
  submitVerification,
  syncBatch,
} from "@/mocks/handlers/tx";
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import { toResponse } from "@/mocks/http";
import { decodeSession } from "@/mocks/session";
import {
  expireAllSessions,
  resetStore,
  sessionFromToken,
  sim,
  updateSimulation,
} from "@/mocks/store";

type Params = Record<string, string>;
type Handler = (req: ApiRequest, params: Params) => ApiResponse;

interface Route {
  method: string;
  pattern: string;
  handler: Handler;
}

const routes: Route[] = [
  { method: "POST", pattern: "auth/login", handler: login },
  { method: "POST", pattern: "auth/logout", handler: logout },
  { method: "GET", pattern: "auth/session", handler: currentSession },
  { method: "POST", pattern: "auth/role", handler: switchRole },

  { method: "GET", pattern: "items/search", handler: searchItems },
  {
    method: "GET",
    pattern: "items/by-code/:code",
    handler: (req, params) => itemByCode(req, params.code!),
  },
  {
    method: "GET",
    pattern: "items/:id/transactions",
    handler: (req, params) => itemTransactions(req, params.id!),
  },
  { method: "GET", pattern: "items/:id", handler: (req, params) => itemById(req, params.id!) },
  { method: "GET", pattern: "items", handler: listItems },
  { method: "POST", pattern: "items/bulk", handler: bulkItems },
  { method: "POST", pattern: "items", handler: createItem },
  { method: "PATCH", pattern: "items/:id", handler: (req, params) => updateItem(req, params.id!) },

  { method: "POST", pattern: "transactions", handler: createTransaction },
  { method: "POST", pattern: "sync/batch", handler: syncBatch },
  { method: "GET", pattern: "transactions", handler: listTransactions },
  {
    method: "POST",
    pattern: "transactions/:id/reverse",
    handler: (req, params) => reverseTransaction(req, params.id!),
  },

  { method: "POST", pattern: "verifications", handler: submitVerification },
  { method: "GET", pattern: "verifications", handler: listVerifications },
  {
    method: "POST",
    pattern: "verifications/:id/review",
    handler: (req, params) => reviewVerification(req, params.id!),
  },

  { method: "GET", pattern: "custody", handler: listCustody },
  { method: "POST", pattern: "custody/settle-batch", handler: settleCustodyBatch },
  {
    method: "POST",
    pattern: "custody/:id/settle",
    handler: (req, params) => settleCustody(req, params.id!),
  },

  { method: "GET", pattern: "stock", handler: listStock },
  { method: "GET", pattern: "dashboard", handler: dashboard },
  { method: "GET", pattern: "reports", handler: reports },
  { method: "GET", pattern: "events", handler: events },

  { method: "GET", pattern: "locations", handler: listLocations },
  { method: "POST", pattern: "locations", handler: createLocation },
  {
    method: "PATCH",
    pattern: "locations/:id",
    handler: (req, params) => updateLocation(req, params.id!),
  },

  { method: "GET", pattern: "categories", handler: listCategories },
  { method: "POST", pattern: "categories", handler: (req) => upsertCategory(req) },
  {
    method: "PATCH",
    pattern: "categories/:id",
    handler: (req, params) => upsertCategory(req, params.id),
  },

  { method: "GET", pattern: "units", handler: listUnits },
  { method: "POST", pattern: "units", handler: (req) => upsertUnit(req) },
  { method: "PATCH", pattern: "units/:id", handler: (req, params) => upsertUnit(req, params.id) },

  { method: "GET", pattern: "reasons", handler: listReasons },
  { method: "POST", pattern: "reasons", handler: (req) => upsertReason(req) },
  {
    method: "PATCH",
    pattern: "reasons/:id",
    handler: (req, params) => upsertReason(req, params.id),
  },

  { method: "GET", pattern: "equipment", handler: listEquipment },
  { method: "POST", pattern: "equipment", handler: (req) => upsertEquipment(req) },
  {
    method: "PATCH",
    pattern: "equipment/:id",
    handler: (req, params) => upsertEquipment(req, params.id),
  },

  { method: "GET", pattern: "users", handler: listUsers },
  { method: "POST", pattern: "users", handler: createUser },
  { method: "PATCH", pattern: "users/:id", handler: (req, params) => updateUser(req, params.id!) },

  { method: "GET", pattern: "audit", handler: listAudit },
  { method: "GET", pattern: "settings", handler: getSettings },
  { method: "PATCH", pattern: "settings", handler: updateSettings },

  { method: "GET", pattern: "integrations/google", handler: getGoogle },
  {
    method: "POST",
    pattern: "integrations/google/:action",
    handler: (req, params) => googleAction(req, params.action!),
  },

  { method: "GET", pattern: "imports", handler: listImports },
  { method: "POST", pattern: "imports", handler: importPreview },
  {
    method: "POST",
    pattern: "imports/:id/apply",
    handler: (req, params) => importApply(req, params.id!),
  },

  { method: "GET", pattern: "stock-counts", handler: listCounts },
  { method: "POST", pattern: "stock-counts", handler: createCount },
  {
    method: "POST",
    pattern: "stock-counts/:countId/lines/:lineId",
    handler: (req, params) => updateCountLine(req, params.countId!, params.lineId!),
  },
  {
    method: "POST",
    pattern: "stock-counts/:id/approve",
    handler: (req, params) => approveCount(req, params.id!),
  },

  { method: "GET", pattern: "meta", handler: meta },
  { method: "GET", pattern: "health", handler: () => health() },
  { method: "GET", pattern: "version", handler: () => version() },

  {
    method: "GET",
    pattern: "__mock/simulation",
    handler: (req) => {
      if (req.method !== "GET") return { status: 405, body: null };
      return { status: 200, body: { simulation: sim() } };
    },
  },
  {
    method: "PATCH",
    pattern: "__mock/simulation",
    handler: (req) => {
      const patch = (req.body ?? {}) as Record<string, unknown>;
      const allowed: Record<string, "number" | "boolean"> = {
        latencyMs: "number",
        force409: "boolean",
        raceOnVerify: "boolean",
        offline: "boolean",
        expireSession: "boolean",
        forcePrompt: "boolean",
        forceBlind: "boolean",
        forceError: "boolean",
      };
      const clean: Record<string, number | boolean> = {};
      for (const [key, type] of Object.entries(allowed)) {
        const value = patch[key];
        if (value === undefined) continue;
        if (type === "number" && typeof value === "number" && value >= 0 && value <= 3000)
          clean[key] = value;
        if (type === "boolean" && typeof value === "boolean") clean[key] = value;
      }
      const next = updateSimulation(clean);
      if (next.expireSession) expireAllSessions();
      return { status: 200, body: { simulation: next } };
    },
  },
  {
    method: "POST",
    pattern: "__mock/reset",
    handler: () => {
      resetStore();
      return { status: 200, body: { ok: true } };
    },
  },
];

function match(pattern: string, path: string): Params | null {
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");
  if (patternParts.length !== pathParts.length) return null;
  const params: Params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;
    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}

export async function handleRequest(req: ApiRequest): Promise<ApiResponse> {
  const path = req.path.replace(/^\/+|\/+$/g, "");
  let methodNotAllowed = false;

  for (const route of routes) {
    const params = match(route.pattern, path);
    if (!params) continue;
    if (route.method !== req.method) {
      methodNotAllowed = true;
      continue;
    }
    try {
      return route.handler(req, params);
    } catch (error) {
      return toResponse(error);
    }
  }

  if (methodNotAllowed) {
    return {
      status: 405,
      body: { error: { code: "METHOD_NOT_ALLOWED", message: "Metode tidak didukung." } },
    };
  }
  return {
    status: 404,
    body: { error: { code: "NOT_FOUND", message: `Endpoint /api/v1/${path} tidak ada.` } },
  };
}

export function buildRequest(input: {
  method: string;
  url: string;
  body: unknown;
  cookie: string | undefined;
  ip: string;
}): ApiRequest {
  const url = new URL(input.url, "http://nemu.local");
  const path = url.pathname.replace(/^\/api\/v1\/?/, "");
  const rawCookie = input.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("nemu_session="))
    ?.slice("nemu_session=".length);
  const token = decodeSession(rawCookie)?.token ?? rawCookie;
  return {
    method: input.method,
    path,
    query: url.searchParams,
    body: input.body,
    token,
    ip: input.ip,
  };
}

export { sessionFromToken };
