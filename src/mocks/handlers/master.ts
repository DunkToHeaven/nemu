import { locationWriteSchema, reasonWriteSchema } from "@/lib/api/schemas";
import type {
  ImportJob,
  ImportRow,
  OrgSettings,
  StockCount,
  StockCountLine,
  User,
} from "@/lib/types";
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import {
  HttpError,
  normalize,
  ok,
  parseBody,
  requireRole,
  requireSession,
  requireUser,
} from "@/mocks/http";
import { addAudit, data, emit, ensureStockLevel, refreshConfidence } from "@/mocks/store";

/* -------------------------------- lokasi --------------------------------- */

export function listLocations(req: ApiRequest): ApiResponse {
  requireSession(req);
  const warehouseId = req.query.get("warehouseId");
  const type = req.query.get("type");
  const q = normalize(req.query.get("q") ?? "");
  const rows = data()
    .locations.filter((location) => (warehouseId ? location.warehouseId === warehouseId : true))
    .filter((location) => (type ? location.type === type : true))
    .filter((location) =>
      q ? normalize(`${location.name} ${location.code} ${location.path}`).includes(q) : true,
    )
    .map((location) => {
      const levels = data().stock.filter((level) => level.locationId === location.id);
      return {
        ...location,
        itemCount: levels.filter((level) => level.qty > 0).length,
        totalQty: levels.reduce((sum, level) => sum + level.qty, 0),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  return ok({ data: rows, nextCursor: null, total: rows.length, warehouses: data().warehouses });
}

export function createLocation(req: ApiRequest): ApiResponse {
  const actor = requireRole(req, "admin");
  const input = parseBody(locationWriteSchema, req.body);
  const parent = input.parentId ? data().locations.find((l) => l.id === input.parentId) : null;
  if (!parent)
    throw new HttpError(422, "VALIDATION_ERROR", "Induk lokasi wajib untuk lokasi baru.");
  const id = `loc_${Date.now().toString(36)}`;
  const location = {
    id,
    warehouseId: parent.warehouseId,
    parentId: parent.id,
    type: input.type,
    code: input.code,
    name: input.name,
    path: `${parent.path} › ${input.name}`,
    active: input.active ?? true,
  };
  data().locations.push(location);
  addAudit({
    entity: "location",
    entityId: id,
    action: "create",
    before: null,
    after: { name: location.name, path: location.path },
    actorId: actor.id,
  });
  return ok({ location }, 201);
}

export function updateLocation(req: ApiRequest, id: string): ApiResponse {
  const actor = requireRole(req, "admin");
  const location = data().locations.find((l) => l.id === id);
  if (!location) throw new HttpError(404, "NOT_FOUND", "Lokasi tidak ditemukan.");
  const patch = parseBody(locationWriteSchema.partial(), req.body);

  if (patch.active === false) {
    const hasStock = data().stock.some((level) => level.locationId === id && level.qty > 0);
    if (hasStock) {
      location.active = false;
      addAudit({
        entity: "location",
        entityId: id,
        action: "deactivate",
        before: { active: true },
        after: { active: false, reason: "masih berisi stok" },
        actorId: actor.id,
      });
      return ok({
        location,
        message: "Lokasi dinonaktifkan (bukan dihapus) karena masih berisi stok.",
      });
    }
  }

  const before = { name: location.name, code: location.code, active: location.active };
  Object.assign(location, patch);
  if (patch.name) {
    const parent = location.parentId
      ? data().locations.find((l) => l.id === location.parentId)
      : null;
    location.path = parent ? `${parent.path} › ${patch.name}` : patch.name;
  }
  addAudit({
    entity: "location",
    entityId: id,
    action: "update",
    before,
    after: { name: location.name, code: location.code, active: location.active },
    actorId: actor.id,
  });
  return ok({ location });
}

/* --------------------------- kategori & satuan --------------------------- */

export function listCategories(req: ApiRequest): ApiResponse {
  requireSession(req);
  return ok({
    data: data().categories.map((category) => ({
      ...category,
      itemCount: data().items.filter((item) => item.categoryId === category.id).length,
    })),
    nextCursor: null,
    total: data().categories.length,
  });
}

export function upsertCategory(req: ApiRequest, id?: string): ApiResponse {
  requireRole(req, "admin");
  const body = req.body as { name?: string; active?: boolean } | null;
  if (!body?.name || body.name.trim().length < 2) {
    throw new HttpError(422, "VALIDATION_ERROR", "Nama kategori minimal 2 karakter.");
  }
  if (id) {
    const category = data().categories.find((c) => c.id === id);
    if (!category) throw new HttpError(404, "NOT_FOUND", "Kategori tidak ditemukan.");
    category.name = body.name.trim();
    if (typeof body.active === "boolean") category.active = body.active;
    return ok({ category });
  }
  const category = { id: `cat_${Date.now().toString(36)}`, name: body.name.trim(), active: true };
  data().categories.push(category);
  return ok({ category }, 201);
}

export function listUnits(req: ApiRequest): ApiResponse {
  requireSession(req);
  return ok({ data: data().units, nextCursor: null, total: data().units.length });
}

export function upsertUnit(req: ApiRequest, id?: string): ApiResponse {
  requireRole(req, "admin");
  const body = req.body as { name?: string; symbol?: string; decimals?: number } | null;
  if (!body?.name || !body?.symbol)
    throw new HttpError(422, "VALIDATION_ERROR", "Nama dan simbol satuan wajib.");
  if (id) {
    const unit = data().units.find((u) => u.id === id);
    if (!unit) throw new HttpError(404, "NOT_FOUND", "Satuan tidak ditemukan.");
    unit.name = body.name;
    unit.symbol = body.symbol;
    unit.decimals = body.decimals ?? unit.decimals;
    return ok({ unit });
  }
  const unit = {
    id: `un_${Date.now().toString(36)}`,
    name: body.name,
    symbol: body.symbol,
    decimals: body.decimals ?? 0,
  };
  data().units.push(unit);
  return ok({ unit }, 201);
}

export function listReasons(req: ApiRequest): ApiResponse {
  requireSession(req);
  const all = req.query.get("all") === "true";
  const rows = data().reasons.filter((reason) => (all ? true : reason.active));
  return ok({ data: rows, nextCursor: null, total: rows.length });
}

export function upsertReason(req: ApiRequest, id?: string): ApiResponse {
  requireRole(req, "admin");
  const patch = parseBody(reasonWriteSchema.partial(), req.body);
  if (id) {
    const reason = data().reasons.find((r) => r.id === id);
    if (!reason) throw new HttpError(404, "NOT_FOUND", "Alasan tidak ditemukan.");
    Object.assign(reason, patch);
    return ok({ reason });
  }
  if (!patch.name) throw new HttpError(422, "VALIDATION_ERROR", "Nama alasan wajib.");
  const reason = {
    id: `rs_${Date.now().toString(36)}`,
    name: patch.name,
    requiresWo: patch.requiresWo ?? false,
    active: patch.active ?? true,
  };
  data().reasons.push(reason);
  return ok({ reason }, 201);
}

/* --------------------------------- mesin --------------------------------- */

export function listEquipment(req: ApiRequest): ApiResponse {
  requireSession(req);
  return ok({ data: data().equipment, nextCursor: null, total: data().equipment.length });
}

export function upsertEquipment(req: ApiRequest, id?: string): ApiResponse {
  requireRole(req, "admin");
  const body = req.body as {
    code?: string;
    name?: string;
    active?: boolean;
    locationId?: string | null;
  } | null;
  if (id) {
    const equipment = data().equipment.find((e) => e.id === id);
    if (!equipment) throw new HttpError(404, "NOT_FOUND", "Mesin tidak ditemukan.");
    Object.assign(equipment, body ?? {});
    return ok({ equipment });
  }
  if (!body?.code || !body?.name)
    throw new HttpError(422, "VALIDATION_ERROR", "Kode dan nama mesin wajib.");
  const equipment = {
    id: `eq_${Date.now().toString(36)}`,
    code: body.code,
    name: body.name,
    locationId: body.locationId ?? null,
    active: body.active ?? true,
  };
  data().equipment.push(equipment);
  return ok({ equipment }, 201);
}

/* -------------------------------- pengguna ------------------------------- */

function publicUser(user: User) {
  return {
    id: user.id,
    code: user.code,
    name: user.name,
    role: user.role,
    email: user.email,
    active: user.active,
    shiftEndsAt: user.shiftEndsAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function listUsers(req: ApiRequest): ApiResponse {
  requireRole(req, "supervisor");
  return ok({ data: data().users.map(publicUser), nextCursor: null, total: data().users.length });
}

export function createUser(req: ApiRequest): ApiResponse {
  const actor = requireRole(req, "admin");
  const body = req.body as {
    name?: string;
    code?: string;
    role?: string;
    email?: string | null;
  } | null;
  if (!body?.name || !body?.code)
    throw new HttpError(422, "VALIDATION_ERROR", "Nama dan kode karyawan wajib.");
  if (data().users.some((user) => user.code.toLowerCase() === body.code!.toLowerCase())) {
    throw new HttpError(409, "CODE_DUPLICATE", "Kode karyawan sudah dipakai.");
  }
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const user = {
    id: `usr_${Date.now().toString(36)}`,
    code: body.code.toUpperCase(),
    name: body.name,
    role: (body.role === "supervisor" || body.role === "admin" ? body.role : "worker") as
      | "worker"
      | "supervisor"
      | "admin",
    email: body.email ?? null,
    active: true,
    pin,
    password: body.role === "worker" ? undefined : "nemu12345678",
    shiftEndsAt: "16:00",
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
  data().users.push(user);
  addAudit({
    entity: "user",
    entityId: user.id,
    action: "create",
    before: null,
    after: { name: user.name, role: user.role },
    actorId: actor.id,
  });
  return ok({ user: publicUser(user), initialPin: pin }, 201);
}

export function updateUser(req: ApiRequest, id: string): ApiResponse {
  const actor = requireRole(req, "admin");
  const user = data().users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, "NOT_FOUND", "Pengguna tidak ditemukan.");
  const body = req.body as {
    name?: string;
    role?: "worker" | "supervisor" | "admin";
    active?: boolean;
    resetPin?: boolean;
  } | null;
  const before = { name: user.name, role: user.role, active: user.active };
  if (body?.name) user.name = body.name;
  if (body?.role) user.role = body.role;
  if (typeof body?.active === "boolean") user.active = body.active;
  let initialPin: string | undefined;
  if (body?.resetPin) {
    initialPin = String(Math.floor(1000 + Math.random() * 9000));
    user.pin = initialPin;
  }
  addAudit({
    entity: "user",
    entityId: id,
    action: body?.active === false ? "deactivate" : "update",
    before,
    after: { name: user.name, role: user.role, active: user.active },
    actorId: actor.id,
  });
  return ok({ user: publicUser(user), initialPin });
}

/* --------------------------------- audit --------------------------------- */

export function listAudit(req: ApiRequest): ApiResponse {
  requireRole(req, "admin");
  const entity = req.query.get("entity");
  const rows = data().audit.filter((entry) => (entity ? entry.entity === entity : true));
  return ok({ data: rows.slice(0, 300), nextCursor: null, total: rows.length });
}

/* ------------------------------- pengaturan ------------------------------ */

export function getSettings(req: ApiRequest): ApiResponse {
  requireRole(req, "admin");
  return ok({ settings: data().settings });
}

export function updateSettings(req: ApiRequest): ApiResponse {
  const actor = requireRole(req, "admin");
  const before = { ...data().settings };
  const patch = (req.body ?? {}) as Partial<OrgSettings>;
  data().settings = { ...data().settings, ...patch };
  addAudit({
    entity: "settings",
    entityId: "org",
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: data().settings as unknown as Record<string, unknown>,
    actorId: actor.id,
  });
  return ok({ settings: data().settings });
}

/* ------------------------------- integrasi ------------------------------- */

export function getGoogle(req: ApiRequest): ApiResponse {
  requireRole(req, "admin");
  return ok({ integration: data().google });
}

export function googleAction(req: ApiRequest, action: string): ApiResponse {
  const actor = requireRole(req, "admin");
  const google = data().google;
  switch (action) {
    case "connect": {
      google.connected = true;
      google.accountEmail = "gudang@nemu.local";
      google.folderName = `Nemu - ${data().settings.orgName}`;
      google.spreadsheetId = "1NemuDemoSpreadsheetId";
      google.spreadsheetUrl = "https://docs.google.com/spreadsheets/d/1NemuDemoSpreadsheetId/edit";
      google.checkStatus = "ok";
      google.checkMessage = "Tulis dan baca satu sel uji berhasil.";
      google.lastSyncAt = new Date().toISOString();
      addAudit({
        entity: "integration",
        entityId: "google",
        action: "create",
        before: null,
        after: { connected: true },
        actorId: actor.id,
      });
      return ok({ integration: google });
    }
    case "check": {
      google.checkStatus = google.connected ? "ok" : "error";
      google.checkMessage = google.connected
        ? "Skema cocok. 9 proteksi aktif, tidak ada duplikat SKU."
        : "Belum terhubung. Hubungkan Google Drive dulu.";
      return ok({ integration: google });
    }
    case "repair": {
      google.protectedRanges = 9;
      google.checkStatus = "ok";
      google.checkMessage =
        "Header, validasi, dan proteksi dikembalikan tanpa menyentuh data admin.";
      addAudit({
        entity: "integration",
        entityId: "google",
        action: "update",
        before: null,
        after: { repaired: true },
        actorId: actor.id,
      });
      return ok({ integration: google });
    }
    case "sync": {
      google.lastSyncAt = new Date().toISOString();
      google.runs.unshift({
        id: `run_${Date.now()}`,
        direction: "export",
        status: "ok",
        rows: 100,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        message: null,
      });
      emit("sync.status", { status: "ok" });
      return ok({ integration: google });
    }
    case "disconnect": {
      google.connected = false;
      google.checkStatus = "unknown";
      google.checkMessage = null;
      addAudit({
        entity: "integration",
        entityId: "google",
        action: "delete",
        before: { connected: true },
        after: { connected: false },
        actorId: actor.id,
      });
      return ok({ integration: google });
    }
    case "import-preview": {
      const rows = data()
        .items.slice(0, 8)
        .map((item, index) => ({
          row: index + 2,
          status: (index === 3 ? "error" : index % 4 === 0 ? "update" : "new") as
            | "new"
            | "update"
            | "error",
          sku: item.sku,
          name: item.name,
          message: index === 3 ? "Referensi lokasi tidak ditemukan" : null,
          data: { sku: item.sku, name: item.name },
        }));
      return ok({ rows, summary: { newRows: 5, updatedRows: 2, errorRows: 1 } });
    }
    default:
      throw new HttpError(404, "NOT_FOUND", "Aksi integrasi tidak dikenal.");
  }
}

/* --------------------------------- impor --------------------------------- */

export function importPreview(req: ApiRequest): ApiResponse {
  const actor = requireRole(req, "admin");
  const body = req.body as {
    entity?: ImportJob["entity"];
    rows?: Record<string, string>[];
    filename?: string;
  } | null;
  const entity = body?.entity ?? "items";
  const inputRows = body?.rows ?? [];
  const existingSkus = new Set(data().items.map((item) => item.sku.toLowerCase()));
  const seen = new Set<string>();
  const rows: ImportRow[] = inputRows.map((row, index) => {
    const sku = (row.sku ?? "").trim();
    const name = (row.name ?? "").trim();
    let status: ImportRow["status"] = "new";
    let message: string | null = null;
    if (!sku) {
      status = "error";
      message = "SKU kosong";
    } else if (!name) {
      status = "error";
      message = "Nama kosong";
    } else if (seen.has(sku.toLowerCase())) {
      status = "error";
      message = "SKU duplikat di berkas";
    } else if (existingSkus.has(sku.toLowerCase())) {
      status = "update";
    }
    seen.add(sku.toLowerCase());
    return { row: index + 2, status, sku, name, message, data: row };
  });

  const job: ImportJob = {
    id: `imp_${Date.now().toString(36)}`,
    entity,
    filename: body?.filename ?? "import.csv",
    status: "preview",
    createdAt: new Date().toISOString(),
    appliedAt: null,
    totalRows: rows.length,
    newRows: rows.filter((row) => row.status === "new").length,
    updatedRows: rows.filter((row) => row.status === "update").length,
    errorRows: rows.filter((row) => row.status === "error").length,
    rows,
  };
  data().imports.unshift(job);
  addAudit({
    entity: "import",
    entityId: job.id,
    action: "create",
    before: null,
    after: { filename: job.filename, rows: job.totalRows },
    actorId: actor.id,
    source: "csv_import",
  });
  return ok({ job }, 201);
}

export function importApply(req: ApiRequest, id: string): ApiResponse {
  const actor = requireRole(req, "admin");
  const job = data().imports.find((entry) => entry.id === id);
  if (!job) throw new HttpError(404, "NOT_FOUND", "Pekerjaan impor tidak ditemukan.");
  if (job.status !== "preview")
    throw new HttpError(409, "ALREADY_APPLIED", "Impor ini sudah diterapkan.");

  let created = 0;
  let updated = 0;
  for (const row of job.rows) {
    if (row.status === "error") continue;
    const existing = data().items.find((item) => item.sku.toLowerCase() === row.sku.toLowerCase());
    if (existing) {
      existing.name = row.name;
      existing.updatedAt = new Date().toISOString();
      updated += 1;
    } else {
      const category = data().categories[0]!;
      const unit = data().units[0]!;
      data().items.push({
        id: `itm_imp_${Date.now().toString(36)}_${created}`,
        sku: row.sku,
        code: row.data.code ?? `IMP${String(created).padStart(6, "0")}`,
        name: row.name,
        categoryId: category.id,
        unitId: unit.id,
        minStock: 0,
        maxStock: null,
        unitValue: null,
        isBulk: false,
        primaryLocationId:
          data().locations.find((location) => location.type === "rack")?.id ?? null,
        active: true,
        photoUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      created += 1;
    }
  }
  job.status = "applied";
  job.appliedAt = new Date().toISOString();
  addAudit({
    entity: "import",
    entityId: job.id,
    action: "update",
    before: { status: "preview" },
    after: { status: "applied", created, updated },
    actorId: actor.id,
    source: "csv_import",
  });
  return ok({ job, created, updated });
}

export function listImports(req: ApiRequest): ApiResponse {
  requireRole(req, "admin");
  return ok({ data: data().imports.slice(0, 20), nextCursor: null, total: data().imports.length });
}

/* --------------------------------- opname -------------------------------- */

export function listCounts(req: ApiRequest): ApiResponse {
  requireRole(req, "supervisor");
  const rows = data().counts.map((count) => ({
    ...count,
    createdByName: data().users.find((user) => user.id === count.createdBy)?.name,
    locationPath: data().locations.find((location) => location.id === count.zoneId)?.path,
  }));
  return ok({ data: rows, nextCursor: null, total: rows.length });
}

export function createCount(req: ApiRequest): ApiResponse {
  const actor = requireRole(req, "supervisor");
  const body = req.body as {
    zoneId?: string;
    locationId?: string;
    name?: string;
    blind?: boolean;
    source?: "manual" | "needs_count";
  } | null;
  // Lokasi berdiri sendiri (datar): yang dihitung adalah barang di lokasi itu.
  const targetId = body?.locationId ?? body?.zoneId;
  const zone = data().locations.find((location) => location.id === targetId);
  if (!zone) throw new HttpError(422, "VALIDATION_ERROR", "Pilih lokasi untuk opname.");

  const lines: StockCountLine[] = data()
    .stock.filter((level) => level.locationId === zone.id)
    .slice(0, 40)
    .map((level, index) => {
      const item = data().items.find((entry) => entry.id === level.itemId);
      return {
        id: `scl_${Date.now().toString(36)}_${index}`,
        itemId: level.itemId,
        locationId: level.locationId,
        systemQty: level.qty,
        countedQty: null,
        variance: null,
        status: "pending" as const,
        note: null,
        itemName: item?.name,
        itemCode: item?.code,
        locationPath: data().locations.find((location) => location.id === level.locationId)?.path,
        unitSymbol: item ? data().units.find((unit) => unit.id === item.unitId)?.symbol : undefined,
      };
    });

  const count: StockCount = {
    id: `cnt_${Date.now().toString(36)}`,
    name: body?.name ?? `Opname ${zone.name}`,
    warehouseId: zone.warehouseId,
    zoneId: zone.id,
    blind: body?.blind ?? false,
    status: "open",
    createdBy: actor.id,
    createdAt: new Date().toISOString(),
    closedAt: null,
    lines,
    source: body?.source ?? "manual",
  };
  data().counts.unshift(count);
  return ok({ count }, 201);
}

export function updateCountLine(req: ApiRequest, countId: string, lineId: string): ApiResponse {
  requireRole(req, "supervisor");
  const count = data().counts.find((entry) => entry.id === countId);
  if (!count) throw new HttpError(404, "NOT_FOUND", "Sesi opname tidak ditemukan.");
  const line = count.lines.find((entry) => entry.id === lineId);
  if (!line) throw new HttpError(404, "NOT_FOUND", "Baris opname tidak ditemukan.");
  const body = req.body as { countedQty?: number } | null;
  if (
    typeof body?.countedQty !== "number" ||
    body.countedQty < 0 ||
    Number.isNaN(body.countedQty)
  ) {
    throw new HttpError(422, "VALIDATION_ERROR", "Qty fisik harus angka ≥ 0.");
  }
  line.countedQty = body.countedQty;
  line.variance = body.countedQty - line.systemQty;
  line.status = "counted";
  return ok({ line });
}

export function approveCount(req: ApiRequest, countId: string): ApiResponse {
  const actor = requireRole(req, "supervisor");
  const count = data().counts.find((entry) => entry.id === countId);
  if (!count) throw new HttpError(404, "NOT_FOUND", "Sesi opname tidak ditemukan.");
  if (count.status === "closed")
    throw new HttpError(409, "ALREADY_CLOSED", "Sesi opname sudah ditutup.");

  let adjusted = 0;
  for (const line of count.lines) {
    if (line.countedQty === null) continue;
    const level = ensureStockLevel(line.itemId, line.locationId);
    const variance = line.variance ?? 0;

    if (variance !== 0) {
      const item = data().items.find((entry) => entry.id === line.itemId)!;
      level.qty = Math.max(0, level.qty + variance);
      level.version += 1;
      data().transactions.unshift({
        id: `tx_cnt_${Date.now().toString(36)}_${adjusted}`,
        type: "adjust",
        itemId: line.itemId,
        fromLocationId: variance < 0 ? line.locationId : null,
        toLocationId: variance > 0 ? line.locationId : null,
        qty: Math.abs(variance),
        userId: actor.id,
        reasonId: null,
        refNo: null,
        note: `Opname ${count.name}`,
        idempotencyKey: `count-${count.id}-${line.id}`,
        deviceId: null,
        scanMethod: null,
        custodyId: null,
        equipmentId: null,
        outcome: null,
        clientCreatedAt: null,
        createdAt: new Date().toISOString(),
        reversesId: null,
        reviewStatus: "ok",
      });
      adjusted += 1;
      void item;
    }
    level.lastVerifiedAt = new Date().toISOString();
    level.lastVerifiedQty = level.qty;
    level.txSinceVerified = 0;
    level.lastVarianceRatio = 0;
    refreshConfidence(line.itemId, line.locationId);
    line.status = "approved";
  }
  count.status = "closed";
  count.closedAt = new Date().toISOString();
  emit("stock.changed", { source: "opname", countId: count.id });
  return ok({ count, adjusted });
}

/* ---------------------------------- meta --------------------------------- */

export function meta(req: ApiRequest): ApiResponse {
  requireSession(req);
  return ok({
    warehouses: data().warehouses,
    categories: data().categories,
    units: data().units,
    reasons: data().reasons,
    equipment: data().equipment,
    locations: data().locations.map(({ id, name, code, path, type }) => ({
      id,
      name,
      code,
      path,
      type,
    })),
  });
}

export function health(): ApiResponse {
  return ok({ status: "ok", time: new Date().toISOString() });
}

export function version(): ApiResponse {
  return ok({ version: "0.1.0", api: "v1", mode: "mock" });
}

export { requireUser };
