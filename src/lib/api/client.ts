import { z } from "zod";
import {
  type CreateTransactionInput,
  createTransactionResponseSchema,
  custodyEntrySchema,
  itemDetailSchema,
  type LoginInput,
  loginResponseSchema,
  searchResponseSchema,
  sessionUserSchema,
  transactionSchema,
  type VerificationSubmitInput,
  verificationSubmitResponseSchema,
} from "@/lib/api/schemas";
import type {
  CustodyEntry,
  Item,
  LiveEvent,
  Role,
  SessionUser,
  Transaction,
  Verification,
  VerificationPrompt,
} from "@/lib/types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | null | undefined>;
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`/api/v1/${path}${buildQuery(options.query)}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: "same-origin",
  });

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = (
      payload as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    )?.error;
    // Jangan memicu "sesi berakhir" dari pemeriksaan sesi itu sendiri: itu loop
    // (401 -> event -> invalidasi -> GET session -> 401 ...). Hanya permintaan
    // lain yang boleh menyimpulkan sesi sudah habis.
    if (response.status === 401 && typeof window !== "undefined" && path !== "auth/session") {
      window.dispatchEvent(new CustomEvent("nemu:session-expired"));
    }
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? "Terjadi kesalahan. Coba lagi.",
      error?.details,
    );
  }

  return payload as T;
}

function parse<S extends z.ZodTypeAny>(schema: S, payload: unknown, label: string): z.infer<S> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[api] kontrak ${label} tidak cocok`, parsed.error.issues.slice(0, 5));
    }
    throw new ApiError(500, "CONTRACT_MISMATCH", `Respons ${label} tidak sesuai kontrak.`);
  }
  return parsed.data;
}

export interface ConfidenceLike {
  score: number;
  level: "high" | "medium" | "low" | "never";
  lastVerifiedAt: string | null;
  breakdown?: ConfidenceBreakdownLike;
}

export interface ConfidenceBreakdownLike {
  base: number;
  agePenalty: number;
  movementPenalty: number;
  variancePenalty: number;
  reviewPenalty: number;
  daysSinceVerified: number | null;
  txSinceVerified: number;
  cappedNeverCounted: boolean;
}

export interface SearchItem {
  item: Item;
  unit: { id: string; name: string; symbol: string; decimals: number } | null;
  stock: {
    itemId: string;
    locationId: string;
    qty: number;
    version: number;
    updatedAt: string;
    lastVerifiedAt: string | null;
    lastVerifiedQty: number | null;
    txSinceVerified: number;
    lastVarianceRatio: number;
    confidence: ConfidenceLike;
    location: {
      id: string;
      path: string;
      name: string;
      type: string;
      warehouseId: string;
      code: string;
    };
  }[];
  totalQty: number;
  confidence: ConfidenceLike;
  primaryLocation: { id: string; path: string; name: string; code: string } | null;
}

export interface SearchResponse {
  data: SearchItem[];
  nextCursor: string | null;
  total: number;
  tookMs: number;
}

export type ItemListRow = Item & {
  totalQty: number;
  confidence: ConfidenceLike;
  unit?: { id: string; name: string; symbol: string; decimals: number } | null;
  category?: { id: string; name: string; active: boolean } | null;
  primaryLocation?: { id: string; path: string; name: string; code: string } | null;
};

export interface ItemDetailResponse {
  item: Item;
  stock: SearchItem["stock"];
  totalQty: number;
  takenByOthers: number;
  category: { id: string; name: string; active: boolean } | null;
  unit: { id: string; name: string; symbol: string; decimals: number } | null;
  primaryLocation: { id: string; path: string; name: string; code: string } | null;
}

export type { Transaction };

export interface TransactionResponse {
  transaction: Transaction;
  duplicate: boolean;
  stock: SearchItem["stock"][number] | null;
  custody: CustodyEntry | null;
  verificationPrompt: VerificationPrompt | null;
  message: string;
}

export const api = {
  auth: {
    session: () =>
      request<{ user: SessionUser }>("auth/session").then((r) =>
        parse(sessionUserSchema, r.user, "session"),
      ),
    /**
     * Pendaftaran organisasi baru. Server membuat schema database sendiri untuk
     * organisasi ini dan langsung menerbitkan sesi admin.
     */
    signup: (input: { orgName: string; name: string; email: string; password: string }) =>
      request<{ user: SessionUser; tenant: { slug: string; name: string }; redirectTo: string }>(
        "auth/signup",
        { method: "POST", body: input },
      ),
    login: (input: LoginInput) =>
      request<{ user: SessionUser; redirectTo: string }>("auth/login", {
        method: "POST",
        body: input,
      }).then((r) => parse(loginResponseSchema, r, "login")),
    /** Minta tautan reset. Server TIDAK mengembalikan token (cegah pengambilalihan). */
    forgot: (email: string) =>
      request<{ message: string; emailSent: boolean }>("auth/forgot", {
        method: "POST",
        body: { email },
      }),
    reset: (token: string, password: string) =>
      request<{ ok: boolean; message: string }>("auth/reset", {
        method: "POST",
        body: { token, password },
      }),
    logout: () => request<{ ok: boolean }>("auth/logout", { method: "POST" }),
    switchRole: (role: Role) =>
      request<{ user: SessionUser }>("auth/role", { method: "POST", body: { role } }).then((r) =>
        parse(sessionUserSchema, r.user, "switchRole"),
      ),
  },

  items: {
    search: (
      q: string,
      options: { limit?: number; cursor?: string | null; signal?: AbortSignal } = {},
    ) =>
      request<unknown>("items/search", {
        query: { q, limit: options.limit ?? 20, cursor: options.cursor },
        signal: options.signal,
      }).then((payload) => parse(searchResponseSchema, payload, "items.search") as SearchResponse),
    byCode: (code: string) =>
      request<unknown>(`items/by-code/${encodeURIComponent(code)}`).then(
        (payload) => parse(itemDetailSchema, payload, "items.byCode") as ItemDetailResponse,
      ),
    byId: (id: string) =>
      request<unknown>(`items/${id}`).then(
        (payload) => parse(itemDetailSchema, payload, "items.byId") as ItemDetailResponse,
      ),
    list: (query: Record<string, string | number | boolean | null | undefined>) =>
      request<{ data: ItemListRow[]; nextCursor: string | null; total: number }>("items", {
        query,
      }),
    create: (body: unknown) => request<{ item: Item }>("items", { method: "POST", body }),
    update: (id: string, body: unknown) =>
      request<{ item: Item }>(`items/${id}`, { method: "PATCH", body }),
    bulk: (body: { ids: string[]; action: string; locationId?: string | null }) =>
      request<{ affected: string[] }>("items/bulk", { method: "POST", body }),
    transactions: (id: string) => request<{ data: Transaction[] }>(`items/${id}/transactions`),
  },

  tx: {
    create: (body: CreateTransactionInput) =>
      request<unknown>("transactions", { method: "POST", body }).then(
        (payload) =>
          parse(
            createTransactionResponseSchema,
            payload,
            "transactions.create",
          ) as TransactionResponse,
      ),
    list: (query: Record<string, string | number | null | undefined>) =>
      request<{ data: Transaction[]; nextCursor: string | null; total: number }>("transactions", {
        query,
      }),
    reverse: (id: string) =>
      request<{ transaction: Transaction; reversal: Transaction }>(`transactions/${id}/reverse`, {
        method: "POST",
      }),
  },

  verify: {
    submit: (body: VerificationSubmitInput) =>
      request<unknown>("verifications", { method: "POST", body }).then((payload) =>
        parse(verificationSubmitResponseSchema, payload, "verifications.submit"),
      ),
    list: (status?: string) =>
      request<{ data: Verification[]; total: number }>("verifications", { query: { status } }),
    review: (id: string, decision: "approved" | "rejected", note?: string) =>
      request<{ verification: Verification }>(`verifications/${id}/review`, {
        method: "POST",
        body: { decision, note },
      }),
  },

  custody: {
    list: (scope?: "team") =>
      request<{ data: CustodyEntry[]; total: number }>("custody", { query: { scope } }),
    settle: (
      id: string,
      body: {
        outcome: "used" | "returned" | "damaged_lost";
        qty: number;
        equipmentId?: string | null;
        equipmentText?: string | null;
        refNo?: string | null;
        toLocationId?: string | null;
        idempotencyKey: string;
        scanMethod?: "qr_camera" | "in_app_scanner" | "manual_code";
      },
    ) =>
      request<{ custody: CustodyEntry; transaction: Transaction }>(`custody/${id}/settle`, {
        method: "POST",
        body,
      }).then((payload) => parse(custodySettleResponse, payload, "custody.settle")),
    settleBatch: (
      entries: { id: string; outcome: "used" | "returned" | "damaged_lost"; qty: number }[],
    ) =>
      request<{ results: { id: string; ok: boolean; message: string }[] }>("custody/settle-batch", {
        method: "POST",
        body: { entries },
      }),
  },

  sync: {
    /** OF-02…04: kirim antrean offline. Idempoten per `idempotencyKey`. */
    batch: (transactions: CreateTransactionInput[]) =>
      request<{
        results: {
          idempotencyKey: string;
          status: "ok" | "duplicate" | "needs_review" | "rejected";
          message: string;
          transactionId: string | null;
        }[];
        ok: number;
        duplicate: number;
        needsReview: number;
        rejected: number;
      }>("sync/batch", { method: "POST", body: { transactions } }),
  },

  stock: {
    list: (query: Record<string, string | number | null | undefined>) =>
      request<{ data: unknown[]; nextCursor: string | null; total: number }>("stock", { query }),
  },

  dashboard: () => request<DashboardResponse>("dashboard"),
  reports: (days: number) => request<ReportsResponse>("reports", { query: { days } }),
  reportDrill: (query: Record<string, string | number>) =>
    request<ReportDrillResponse>("reports/drill", { query }),
  priceHistory: (query: Record<string, string | number> = {}) =>
    request<PriceHistoryResponse>("reports/price-history", { query }),
  events: () => request<{ data: LiveEvent[] }>("events"),

  master: {
    meta: () => request<MasterMeta>("meta"),
    locations: (query: Record<string, string | number | boolean | null | undefined> = {}) =>
      request<{ data: LocationRow[]; total: number }>("locations", { query }),
    categories: () => request<{ data: CategoryRow[]; total: number }>("categories"),
    units: () => request<{ data: UnitRow[]; total: number }>("units"),
    reasons: (all?: boolean) =>
      request<{ data: ReasonRow[]; total: number }>("reasons", { query: { all } }),
    equipment: () => request<{ data: EquipmentRow[]; total: number }>("equipment"),
    users: () => request<{ data: UserRow[]; total: number }>("users"),
  },

  admin: {
    audit: (entity?: string) =>
      request<{ data: AuditRow[]; total: number }>("audit", { query: { entity } }),
    settings: () => request<{ settings: OrgSettings }>("settings"),
    updateSettings: (patch: Partial<OrgSettings>) =>
      request<{ settings: OrgSettings }>("settings", { method: "PATCH", body: patch }),
    google: () => request<{ integration: GoogleIntegration }>("integrations/google"),
    googleAction: (action: string) =>
      request<{ integration?: GoogleIntegration; rows?: unknown[]; summary?: unknown }>(
        `integrations/google/${action}`,
        {
          method: "POST",
        },
      ),
    imports: () => request<{ data: ImportJobRow[] }>("imports"),
    previewImport: (body: { entity: string; rows: Record<string, string>[]; filename: string }) =>
      request<{ job: ImportJobRow }>("imports", { method: "POST", body }),
    applyImport: (id: string) =>
      request<{ job: ImportJobRow; created: number; updated: number }>(`imports/${id}/apply`, {
        method: "POST",
      }),
    createUser: (body: { name: string; code: string; role: string; email?: string | null }) =>
      request<{ user: UserRow; initialPin: string }>("users", { method: "POST", body }),
    updateUser: (id: string, body: Record<string, unknown>) =>
      request<{ user: UserRow; initialPin?: string }>(`users/${id}`, { method: "PATCH", body }),
    upsertCategory: (body: { name: string }, id?: string) =>
      request<{ category: CategoryRow }>(id ? `categories/${id}` : "categories", {
        method: id ? "PATCH" : "POST",
        body,
      }),
    upsertUnit: (body: { name: string; symbol: string; decimals?: number }, id?: string) =>
      request<{ unit: UnitRow }>(id ? `units/${id}` : "units", {
        method: id ? "PATCH" : "POST",
        body,
      }),
    upsertReason: (body: { name?: string; requiresWo?: boolean; active?: boolean }, id?: string) =>
      request<{ reason: ReasonRow }>(id ? `reasons/${id}` : "reasons", {
        method: id ? "PATCH" : "POST",
        body,
      }),
    upsertEquipment: (body: { code?: string; name?: string; active?: boolean }, id?: string) =>
      request<{ equipment: EquipmentRow }>(id ? `equipment/${id}` : "equipment", {
        method: id ? "PATCH" : "POST",
        body,
      }),
    createLocation: (body: {
      name: string;
      code: string;
      parentId: string | null;
      type: string;
      active: boolean;
    }) => request<{ location: LocationRow }>("locations", { method: "POST", body }),
    updateLocation: (id: string, body: Record<string, unknown>) =>
      request<{ location: LocationRow; message?: string }>(`locations/${id}`, {
        method: "PATCH",
        body,
      }),
  },

  counts: {
    list: () => request<{ data: StockCountRow[] }>("stock-counts"),
    create: (body: { locationId: string; name?: string }) =>
      request<{ count: StockCountRow }>("stock-counts", { method: "POST", body }),
    setLine: (countId: string, lineId: string, countedQty: number) =>
      request<{ line: StockCountLineRow }>(`stock-counts/${countId}/lines/${lineId}`, {
        method: "POST",
        body: { countedQty },
      }),
    approve: (countId: string) =>
      request<{ count: StockCountRow; adjusted: number }>(`stock-counts/${countId}/approve`, {
        method: "POST",
      }),
  },

  dev: {
    simulation: () => request<{ simulation: SimulationState }>("__mock/simulation"),
    setSimulation: (patch: Partial<SimulationState>) =>
      request<{ simulation: SimulationState }>("__mock/simulation", {
        method: "PATCH",
        body: patch,
      }),
    reset: () => request<{ ok: boolean }>("__mock/reset", { method: "POST" }),
  },
};

const custodySettleResponse = z.object({
  custody: custodyEntrySchema,
  transaction: transactionSchema,
});

/* ------------------------------- tipe respons ----------------------------- */

export interface SimulationState {
  latencyMs: number;
  force409: boolean;
  raceOnVerify: boolean;
  offline: boolean;
  expireSession: boolean;
  forcePrompt: boolean;
  forceBlind: boolean;
  forceError: boolean;
}

export interface DashboardResponse {
  kpis: {
    totalItems: number;
    totalQty: number;
    belowMin: number;
    transactionsToday: number;
    needsReview: number;
    openCounts: number;
    highConfidencePct: number;
    overdueCustody: number;
    myCustodyCount: number;
    myTx7d: number;
    myPendingQueue: number;
  };
  recent: Transaction[];
  lowStock: {
    itemId: string;
    itemName: string;
    sku: string;
    qty: number;
    minStock: number;
    locationPath: string;
    confidence: SearchItem["confidence"];
    unit: string;
  }[];
  lastTaken: {
    itemId: string;
    itemName: string;
    itemCode: string;
    qty: number;
    at: string;
    unit: string;
  }[];
  needsCount: {
    itemId: string;
    itemName: string;
    locationPath: string;
    score: number;
    level: SearchItem["confidence"]["level"];
    qty: number;
    unit: string;
  }[];
  usage: { date: string; qty: number; tx: number }[];
  topItems: { id: string; label: string; qty: number; tx: number }[];
  custody: CustodyEntry[];
  teamCustodyCount: number;
}

export interface InventoryHealth {
  total: number;
  /** Item yang stoknya di bawah batas minimum. */
  belowMin: number;
  /** Item yang stoknya melebihi batas maksimum (stok menumpuk). */
  overMax: number;
  /** Item yang stoknya dalam rentang wajar. */
  healthy: number;
  /** Item tanpa batas min maupun max — tidak bisa dinilai. */
  noThreshold: number;
  neverCounted: number;
  zeroStock: number;
  /** Nilai persediaan (qty x harga satuan), 0 bila harga tidak diisi. */
  stockValue: number;
  /** Nilai item yang tidak bergerak > 60 hari. */
  deadValue: number;
  deadCount: number;
  /** Sebaran umur pencatatan terakhir. */
  ageBuckets: { d30: number; d90: number; d180: number; older: number; never: number };
}

export interface ReportsResponse {
  rangeDays: number;
  inventoryHealth: InventoryHealth;
  trend: { date: string; qty: number; tx: number }[];
  topItems: { id: string; label: string; qty: number; tx: number }[];
  byUser: { id: string; label: string; qty: number; tx: number }[];
  byReason: { id: string; label: string; qty: number; tx: number }[];
  confidence: {
    high: number;
    medium: number;
    low: number;
    never: number;
    total: number;
    needsCount: {
      itemId: string;
      itemName: string;
      locationPath: string;
      score: number;
      qty: number;
    }[];
  };
  deadStock: {
    itemId: string;
    name: string;
    lastMovedAt: string | null;
    qty: number;
    daysIdle: number;
  }[];
  custody: {
    openEntries: number;
    avgHoldHours: number;
    returnRate: number;
    overdue: number;
    byEquipment: { id: string; label: string; qty: number; tx: number }[];
  };
}

/** Isi Sheet drill-down laporan — item ATAU transaksi, tergantung `kind`. */
export interface ReportDrillResponse {
  kind: string;
  items: {
    itemId: string;
    name: string;
    code: string;
    qty: number;
    minStock: number;
    maxStock: number | null;
    locationPath: string;
    unit: string;
    lastCountedAt: string | null;
    lastMovedAt: string | null;
  }[];
  tx: {
    txId: string;
    itemId: string;
    itemName: string;
    itemCode: string;
    userName: string;
    type: string;
    qty: number;
    createdAt: string;
    note: string | null;
    refNo: string | null;
  }[];
}

/** Tren harga perolehan per item — satu titik data per tanggal receive. */
export interface PriceHistoryPoint {
  date: string;
  price: number;
  prevPrice: number | null;
  delta: number | null;
  deltaPct: number | null;
  qty: number;
  tx: number;
}

export interface PriceHistoryEntry {
  itemId: string;
  name: string;
  code: string;
  unit: string;
  firstPrice: number;
  lastPrice: number;
  minPrice: number;
  maxPrice: number;
  changePct: number;
  points: PriceHistoryPoint[];
}

export interface PriceHistoryResponse {
  rangeDays: number;
  items: PriceHistoryEntry[];
  totalItems: number;
}

export interface MasterMeta {
  warehouses: { id: string; code: string; name: string }[];
  categories: CategoryRow[];
  units: UnitRow[];
  reasons: ReasonRow[];
  equipment: EquipmentRow[];
  locations: { id: string; name: string; code: string; path: string; type: string }[];
}

export interface LocationRow {
  id: string;
  warehouseId: string;
  parentId: string | null;
  type: "warehouse" | "zone" | "rack" | "bin";
  code: string;
  name: string;
  path: string;
  active: boolean;
  itemCount?: number;
  totalQty?: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
  itemCount?: number;
}
export interface UnitRow {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
}
export interface ReasonRow {
  id: string;
  name: string;
  requiresWo: boolean;
  active: boolean;
}
export interface EquipmentRow {
  id: string;
  code: string;
  name: string;
  locationId: string | null;
  active: boolean;
}
export interface UserRow {
  id: string;
  code: string;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
  shiftEndsAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}
export interface AuditRow {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorId: string;
  actorName: string;
  source: string;
  createdAt: string;
}
export interface OrgSettings {
  orgName: string;
  timezone: string;
  locale: string;
  shiftEndsAt: string[];
  verifyPromptEnabled: boolean;
  verifyMaxPerShift: number;
  verifyCountThreshold: number;
  verifyPMin: number;
  verifyPMax: number;
  confidenceDecayDays: number;
  custodyEnabled: boolean;
  custodyOverdueHours: number;
  defaultMinStock: number;
  blindEveryN: number;
  notifications: { telegram: boolean; email: boolean };
  branding: { accent: string; logoText: string };
}
export interface GoogleIntegration {
  connected: boolean;
  accountEmail: string | null;
  folderName: string | null;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  schemaVersion: string;
  appSchemaVersion: string;
  lastSyncAt: string | null;
  scopes: string[];
  protectedRanges: number;
  checkStatus: "ok" | "warning" | "error" | "unknown";
  checkMessage: string | null;
  runs: {
    id: string;
    direction: string;
    status: string;
    rows: number;
    startedAt: string;
    finishedAt: string | null;
    message: string | null;
  }[];
}
export interface ImportJobRow {
  id: string;
  entity: string;
  filename: string;
  status: "preview" | "applied" | "failed";
  createdAt: string;
  appliedAt: string | null;
  totalRows: number;
  newRows: number;
  updatedRows: number;
  errorRows: number;
  rows: {
    row: number;
    status: "new" | "update" | "error";
    sku: string;
    name: string;
    message: string | null;
    data: Record<string, string>;
  }[];
}
export interface StockCountLineRow {
  id: string;
  itemId: string;
  locationId: string;
  systemQty: number;
  countedQty: number | null;
  variance: number | null;
  status: string;
  note: string | null;
  itemName?: string;
  itemCode?: string;
  locationPath?: string;
  unitSymbol?: string;
}
export interface StockCountRow {
  id: string;
  name: string;
  warehouseId: string;
  zoneId: string | null;
  blind: boolean;
  status: "open" | "review" | "closed";
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
  lines: StockCountLineRow[];
  source: string;
  createdByName?: string;
  locationPath?: string;
}
