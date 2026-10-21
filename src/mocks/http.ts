import type { z } from "zod";
import type {
  Confidence,
  ConfidenceLevel,
  Item,
  Location,
  Role,
  StockLevel,
  StockWithConfidence,
  Unit,
  User,
} from "@/lib/types";
import { data, type SessionRecord, sessionFromToken, sessionUser } from "@/mocks/store";

export const ROLE_RANK: Record<Role, number> = { worker: 1, supervisor: 2, admin: 3 };

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  token: string | undefined;
  ip: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok(body: unknown, status = 200, headers?: Record<string, string>): ApiResponse {
  return { status, body, headers };
}

export function toResponse(error: unknown): ApiResponse {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }
  const message = error instanceof Error ? error.message : "Terjadi kesalahan tak terduga.";
  return { status: 500, body: { error: { code: "INTERNAL", message } } };
}

export function requireSession(req: ApiRequest): SessionRecord {
  const session = sessionFromToken(req.token);
  if (!session)
    throw new HttpError(401, "UNAUTHENTICATED", "Sesi berakhir. Masuk lagi untuk melanjutkan.");
  const user = sessionUser(session);
  if (!user?.active) throw new HttpError(401, "UNAUTHENTICATED", "Sesi tidak valid.");
  return session;
}

export function requireUser(req: ApiRequest): User {
  const session = requireSession(req);
  const user = sessionUser(session);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sesi tidak valid.");
  return user;
}

export function requireRole(req: ApiRequest, required: Role): User {
  const user = requireUser(req);
  if (ROLE_RANK[user.role] < ROLE_RANK[required]) {
    throw new HttpError(403, "FORBIDDEN", "Role kamu tidak punya akses ke tindakan ini.");
  }
  return user;
}

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "Data yang dikirim belum valid.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function findItem(id: string): Item {
  const item = data().items.find((entry) => entry.id === id);
  if (!item) throw new HttpError(404, "ITEM_NOT_FOUND", "Item tidak ditemukan.");
  return item;
}

export function findItemByCode(code: string): Item {
  const normalized = decodeURIComponent(code).trim().toUpperCase();
  const item = data().items.find((entry) => entry.code.toUpperCase() === normalized);
  if (!item) {
    throw new HttpError(
      404,
      "ITEM_NOT_FOUND",
      "Kode item tidak dikenali. Periksa label atau ketik kode manual.",
    );
  }
  return item;
}

export function findLocation(id: string | null | undefined): Location {
  if (!id) throw new HttpError(422, "LOCATION_REQUIRED", "Lokasi wajib dipilih.");
  const location = data().locations.find((entry) => entry.id === id);
  if (!location) throw new HttpError(404, "LOCATION_NOT_FOUND", "Lokasi tidak ditemukan.");
  return location;
}

export function unitOf(item: Item): Unit | null {
  return data().units.find((unit) => unit.id === item.unitId) ?? null;
}

export function stockLevel(itemId: string, locationId: string): StockLevel | null {
  return (
    data().stock.find((level) => level.itemId === itemId && level.locationId === locationId) ?? null
  );
}

export function stockFor(itemId: string): StockLevel[] {
  return data().stock.filter((level) => level.itemId === itemId);
}

export function withLocation(level: StockLevel): StockWithConfidence | null {
  const location = data().locations.find((entry) => entry.id === level.locationId);
  return location ? { ...level, location } : null;
}

export function totalQty(itemId: string): number {
  return stockFor(itemId).reduce((sum, level) => sum + level.qty, 0);
}

export function worstConfidence(levels: StockLevel[]): Confidence {
  if (levels.length === 0) {
    return {
      score: 0,
      level: "never",
      lastVerifiedAt: null,
      breakdown: {
        base: 100,
        agePenalty: 40,
        movementPenalty: 0,
        variancePenalty: 0,
        reviewPenalty: 0,
        daysSinceVerified: null,
        txSinceVerified: 0,
        cappedNeverCounted: true,
      },
    };
  }
  return levels.reduce<Confidence>(
    (worst, level) => (level.confidence.score < worst.score ? level.confidence : worst),
    levels[0]!.confidence,
  );
}

export function levelRank(level: ConfidenceLevel): number {
  return level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^o:(\d+)$/.exec(raw);
    return match ? Number.parseInt(match[1]!, 10) : 0;
  } catch {
    return 0;
  }
}

export function paginate<T>(rows: T[], cursor: string | null | undefined, limit: number) {
  const offset = decodeCursor(cursor);
  const slice = rows.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return {
    data: slice,
    nextCursor: nextOffset < rows.length ? encodeCursor(nextOffset) : null,
    total: rows.length,
  };
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) out.add(value.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const gram of A) if (B.has(gram)) shared += 1;
  return (2 * shared) / (A.size + B.size);
}

export function searchScore(query: string, item: Item, locationPath: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(item.name);
  const sku = normalize(item.sku);
  const code = normalize(item.code);
  const path = normalize(locationPath);

  let score = 0;
  if (code === q) score = Math.max(score, 120);
  if (sku === q) score = Math.max(score, 110);
  if (name === q) score = Math.max(score, 100);
  if (name.startsWith(q)) score = Math.max(score, 80);
  if (name.includes(q)) score = Math.max(score, 60);
  if (sku.includes(q)) score = Math.max(score, 55);
  if (path.includes(q)) score = Math.max(score, 30);

  const tokens = q.split(" ").filter(Boolean);
  const haystack = `${name} ${sku} ${code} ${path}`;
  const matched = tokens.filter((token) => haystack.includes(token)).length;
  if (tokens.length > 0) score += (matched / tokens.length) * 40;

  if (score < 25) {
    const fuzzy = Math.max(similarity(name, q), similarity(sku, q), similarity(code, q));
    if (fuzzy >= 0.55) score = Math.max(score, fuzzy * 45);
  }
  return score;
}
