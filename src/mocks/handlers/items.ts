import { itemWriteSchema } from "@/lib/api/schemas";
import type { Item } from "@/lib/types";
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import {
  findItem,
  findItemByCode,
  HttpError,
  normalize,
  ok,
  paginate,
  parseBody,
  requireRole,
  requireSession,
  searchScore,
  stockFor,
  totalQty,
  unitOf,
  withLocation,
  worstConfidence,
} from "@/mocks/http";
import { createRng, crockfordCode } from "@/mocks/random";
import { data } from "@/mocks/store";

function itemSummary(item: Item) {
  const levels = stockFor(item.id);
  const unit = unitOf(item);
  return {
    item,
    unit,
    totalQty: totalQty(item.id),
    confidence: worstConfidence(levels),
    primaryLocation: data().locations.find((l) => l.id === item.primaryLocationId) ?? null,
  };
}

export function searchItems(req: ApiRequest): ApiResponse {
  requireSession(req);
  const q = (req.query.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.get("limit") ?? 20) || 20));
  const started = Date.now();

  const activeItems = data().items.filter((item) => item.active);
  const scored = activeItems
    .map((item) => {
      const level = stockFor(item.id)[0];
      const path =
        data().locations.find((l) => l.id === (level?.locationId ?? item.primaryLocationId))
          ?.path ?? "";
      return { item, score: q ? searchScore(q, item, path) : 1 };
    })
    .filter((row) => (q ? row.score >= 25 : true))
    .sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.item.name.localeCompare(b.item.name),
    );

  const page = paginate(scored, req.query.get("cursor"), limit);

  return ok({
    data: page.data.map(({ item }) => {
      const levels = stockFor(item.id)
        .map((level) => withLocation(level))
        .filter((level): level is NonNullable<typeof level> => level !== null);
      return {
        item,
        unit: unitOf(item),
        stock: levels,
        totalQty: levels.reduce((sum, level) => sum + level.qty, 0),
        confidence: worstConfidence(levels),
        primaryLocation: data().locations.find((l) => l.id === item.primaryLocationId) ?? null,
      };
    }),
    nextCursor: page.nextCursor,
    total: page.total,
    tookMs: Date.now() - started,
  });
}

export function itemByCode(req: ApiRequest, code: string): ApiResponse {
  requireSession(req);
  const item = findItemByCode(decodeURIComponent(code));
  if (!item.active) {
    throw new HttpError(410, "ITEM_INACTIVE", "Item ini sudah dinonaktifkan. Lapor ke supervisor.");
  }
  return ok(itemDetail(item, req));
}

export function itemById(req: ApiRequest, id: string): ApiResponse {
  const session = requireSession(req);
  const item = findItem(id);
  return ok(itemDetail(item, req, session.userId));
}

function itemDetail(item: Item, req: ApiRequest, viewerId?: string) {
  const levels = stockFor(item.id)
    .map((level) => withLocation(level))
    .filter((level): level is NonNullable<typeof level> => level !== null);
  const viewer = viewerId ?? requireSession(req).userId;
  const takenByOthers = data()
    .custody.filter(
      (entry) => entry.status === "open" && entry.itemId === item.id && entry.userId !== viewer,
    )
    .reduce((sum, entry) => sum + entry.qtyOpen, 0);

  return {
    item,
    stock: levels,
    totalQty: levels.reduce((sum, level) => sum + level.qty, 0),
    takenByOthers,
    category: data().categories.find((c) => c.id === item.categoryId) ?? null,
    unit: unitOf(item),
    primaryLocation: data().locations.find((l) => l.id === item.primaryLocationId) ?? null,
  };
}

export function listItems(req: ApiRequest): ApiResponse {
  requireSession(req);
  const q = normalize(req.query.get("q") ?? "");
  const categoryId = req.query.get("categoryId");
  const activeOnly = req.query.get("active") !== "false";
  const limit = Math.min(200, Math.max(1, Number(req.query.get("limit") ?? 50) || 50));

  const rows = data()
    .items.filter((item) => (activeOnly ? item.active : true))
    .filter((item) => (categoryId ? item.categoryId === categoryId : true))
    .filter((item) => (q ? normalize(`${item.name} ${item.sku} ${item.code}`).includes(q) : true))
    .sort((a, b) => a.name.localeCompare(b.name));

  const page = paginate(rows, req.query.get("cursor"), limit);
  return ok({
    ...page,
    data: page.data.map((item) => ({ ...item, ...itemSummary(item) })),
  });
}

export function createItem(req: ApiRequest): ApiResponse {
  const actor = requireRole(req, "admin");
  const input = parseBody(itemWriteSchema, req.body);
  if (data().items.some((item) => item.sku.toLowerCase() === input.sku.toLowerCase())) {
    throw new HttpError(409, "SKU_DUPLICATE", "SKU sudah dipakai item lain.", { field: "sku" });
  }
  const item: Item = {
    id: `itm_${Date.now().toString(36)}`,
    sku: input.sku,
    code: crockfordCode(createRng(Date.now()), 8),
    name: input.name,
    categoryId: input.categoryId,
    unitId: input.unitId,
    minStock: input.minStock,
    maxStock: null,
    unitValue: input.unitValue ?? null,
    isBulk: input.isBulk ?? false,
    primaryLocationId: input.primaryLocationId ?? null,
    active: input.active ?? true,
    photoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data().items.push(item);
  data().audit.unshift({
    id: `aud_${Date.now()}`,
    entity: "item",
    entityId: item.id,
    action: "create",
    before: null,
    after: { name: item.name, sku: item.sku },
    actorId: actor.id,
    actorName: actor.name,
    source: "dashboard",
    createdAt: new Date().toISOString(),
  });
  return ok({ item }, 201);
}

export function updateItem(req: ApiRequest, id: string): ApiResponse {
  const actor = requireRole(req, "admin");
  const item = findItem(id);
  const input = parseBody(itemWriteSchema.partial(), req.body);
  if (
    input.sku &&
    data().items.some(
      (other) => other.id !== id && other.sku.toLowerCase() === input.sku!.toLowerCase(),
    )
  ) {
    throw new HttpError(409, "SKU_DUPLICATE", "SKU sudah dipakai item lain.", { field: "sku" });
  }
  const before = { name: item.name, sku: item.sku, minStock: item.minStock, active: item.active };
  Object.assign(item, input, { updatedAt: new Date().toISOString() });
  data().audit.unshift({
    id: `aud_${Date.now()}`,
    entity: "item",
    entityId: item.id,
    action: input.active === false ? "deactivate" : "update",
    before,
    after: { name: item.name, sku: item.sku, minStock: item.minStock, active: item.active },
    actorId: actor.id,
    actorName: actor.name,
    source: "dashboard",
    createdAt: new Date().toISOString(),
  });
  return ok({ item });
}

export function bulkItems(req: ApiRequest): ApiResponse {
  const actor = requireRole(req, "admin");
  const body = req.body as { ids?: string[]; action?: string; locationId?: string | null } | null;
  const ids = body?.ids ?? [];
  const action = body?.action ?? "";
  if (ids.length === 0) throw new HttpError(422, "VALIDATION_ERROR", "Pilih minimal satu item.");
  const affected: string[] = [];
  for (const id of ids) {
    const item = data().items.find((i) => i.id === id);
    if (!item) continue;
    if (action === "deactivate") item.active = false;
    else if (action === "activate") item.active = true;
    else if (action === "move" && body?.locationId) item.primaryLocationId = body.locationId;
    else if (action !== "print") continue;
    item.updatedAt = new Date().toISOString();
    affected.push(id);
  }
  data().audit.unshift({
    id: `aud_${Date.now()}`,
    entity: "item",
    entityId: affected.join(","),
    action: action === "deactivate" ? "deactivate" : "update",
    before: null,
    after: { action, count: affected.length },
    actorId: actor.id,
    actorName: actor.name,
    source: "dashboard",
    createdAt: new Date().toISOString(),
  });
  return ok({ affected, action });
}

export function itemTransactions(req: ApiRequest, id: string): ApiResponse {
  requireSession(req);
  const rows = data()
    .transactions.filter((tx) => tx.itemId === id)
    .slice(0, 100)
    .map((tx) => ({
      ...tx,
      userName: data().users.find((u) => u.id === tx.userId)?.name,
      itemName: data().items.find((i) => i.id === tx.itemId)?.name,
      itemCode: data().items.find((i) => i.id === tx.itemId)?.code,
    }));
  return ok({ data: rows, nextCursor: null, total: rows.length });
}
