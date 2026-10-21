import type { Item, RankedUsage, StockLevel, Transaction, UsagePoint } from "@/lib/types";
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import {
  normalize,
  ok,
  paginate,
  requireRole,
  requireSession,
  stockFor,
  unitOf,
  worstConfidence,
} from "@/mocks/http";
import { data, recentEvents } from "@/mocks/store";

const DAY = 86_400_000;

function startOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function usageByDay(days: number): UsagePoint[] {
  const out: UsagePoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * DAY);
    const key = date.toISOString().slice(0, 10);
    const rows = data().transactions.filter(
      (tx) => tx.type === "issue" && tx.createdAt.slice(0, 10) === key,
    );
    out.push({ date: key, qty: rows.reduce((sum, tx) => sum + tx.qty, 0), tx: rows.length });
  }
  return out;
}

function topBy(rows: Transaction[], key: "item" | "user" | "reason", limit = 10): RankedUsage[] {
  const map = new Map<string, { qty: number; tx: number }>();
  for (const tx of rows) {
    const id = key === "item" ? tx.itemId : key === "user" ? tx.userId : (tx.reasonId ?? "none");
    const entry = map.get(id) ?? { qty: 0, tx: 0 };
    entry.qty += tx.qty;
    entry.tx += 1;
    map.set(id, entry);
  }
  return [...map.entries()]
    .map(([id, value]) => {
      const label =
        key === "item"
          ? (data().items.find((item) => item.id === id)?.name ?? id)
          : key === "user"
            ? (data().users.find((user) => user.id === id)?.name ?? id)
            : (data().reasons.find((reason) => reason.id === id)?.name ?? "Tanpa alasan");
      return { id, label, qty: value.qty, tx: value.tx };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function dashboard(req: ApiRequest): ApiResponse {
  const session = requireSession(req);
  const { role, userId } = session;
  const today = startOfToday();
  const weekAgo = Date.now() - 7 * DAY;

  const visibleTx =
    role === "worker"
      ? data().transactions.filter((tx) => tx.userId === userId)
      : data().transactions;
  const myCustody = data().custody.filter(
    (entry) => entry.status === "open" && entry.userId === userId,
  );
  const teamCustody = data().custody.filter((entry) => entry.status === "open");
  const overdue = teamCustody.filter(
    (entry) =>
      Date.now() - Date.parse(entry.openedAt) > data().settings.custodyOverdueHours * 3_600_000,
  ).length;

  const lowStock: {
    itemId: string;
    itemName: string;
    sku: string;
    qty: number;
    minStock: number;
    locationPath: string;
    confidence: StockLevel["confidence"];
    unit: string;
  }[] = [];

  for (const level of data().stock) {
    const item = data().items.find((entry) => entry.id === level.itemId);
    if (!item?.active) continue;
    if (level.qty > item.minStock) continue;
    lowStock.push({
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      qty: level.qty,
      minStock: item.minStock,
      locationPath:
        data().locations.find((location) => location.id === level.locationId)?.path ?? "",
      confidence: level.confidence,
      unit: unitOf(item)?.symbol ?? "",
    });
  }
  lowStock.sort((a, b) => a.qty - b.qty);

  const highConfidence = data().stock.filter((level) => level.confidence.level === "high").length;

  const kpis = {
    totalItems: data().items.filter((item) => item.active).length,
    totalQty: data().stock.reduce((sum, level) => sum + level.qty, 0),
    belowMin: lowStock.length,
    transactionsToday: data().transactions.filter((tx) => Date.parse(tx.createdAt) >= today).length,
    needsReview: data().verifications.filter(
      (verification) => verification.reviewStatus === "pending",
    ).length,
    openCounts: data().counts.filter((count) => count.status !== "closed").length,
    highConfidencePct: Math.round((highConfidence / Math.max(1, data().stock.length)) * 100),
    overdueCustody: overdue,
    myCustodyCount: myCustody.length,
    myTx7d: data().transactions.filter(
      (tx) => tx.userId === userId && Date.parse(tx.createdAt) >= weekAgo,
    ).length,
    myPendingQueue: 0,
  };

  const recent = visibleTx.slice(0, 50).map((tx) => ({
    ...tx,
    userName: data().users.find((user) => user.id === tx.userId)?.name,
    itemName: data().items.find((item) => item.id === tx.itemId)?.name,
    itemCode: data().items.find((item) => item.id === tx.itemId)?.code,
  }));

  const lastTaken: {
    itemId: string;
    itemName: string;
    itemCode: string;
    qty: number;
    at: string;
    unit: string;
  }[] = [];
  const seen = new Set<string>();
  for (const tx of data().transactions) {
    if (tx.userId !== userId || tx.type !== "issue" || seen.has(tx.itemId)) continue;
    seen.add(tx.itemId);
    const item = data().items.find((entry) => entry.id === tx.itemId);
    if (!item) continue;
    lastTaken.push({
      itemId: item.id,
      itemName: item.name,
      itemCode: item.code,
      qty: tx.qty,
      at: tx.createdAt,
      unit: unitOf(item)?.symbol ?? "",
    });
    if (lastTaken.length >= 5) break;
  }

  const needsCount: {
    itemId: string;
    itemName: string;
    locationPath: string;
    score: number;
    level: StockLevel["confidence"]["level"];
    qty: number;
    unit: string;
  }[] = [];
  if (role !== "worker") {
    const candidates = data()
      .stock.filter(
        (level) => level.confidence.level === "low" || level.confidence.level === "never",
      )
      .sort((a, b) => a.confidence.score - b.confidence.score)
      .slice(0, 8);
    for (const level of candidates) {
      const item = data().items.find((entry) => entry.id === level.itemId);
      if (!item) continue;
      needsCount.push({
        itemId: item.id,
        itemName: item.name,
        locationPath:
          data().locations.find((location) => location.id === level.locationId)?.path ?? "",
        score: level.confidence.score,
        level: level.confidence.level,
        qty: level.qty,
        unit: unitOf(item)?.symbol ?? "",
      });
    }
  }

  const issues30 = data().transactions.filter(
    (tx) => tx.type === "issue" && Date.parse(tx.createdAt) >= Date.now() - 30 * DAY,
  );

  const system =
    role === "admin"
      ? {
          version: "0.1.0",
          activeUsers: data().users.filter((user) => user.active).length,
          lastBackupAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
          sheetsSync: data().google.connected ? "ok" : "disconnected",
          pendingOutbox: data().google.runs.filter((run) => run.status === "pending").length,
          uptimeHours: 128,
          setupChecklist: [
            { id: "admin", label: "Admin pertama dibuat", done: true },
            { id: "items", label: "Item diimpor", done: true },
            { id: "locations", label: "Lokasi dibuat", done: true },
            { id: "labels", label: "Label QR dicetak", done: false },
            { id: "google", label: "Google Drive terhubung", done: data().google.connected },
          ],
        }
      : null;

  return ok({
    kpis,
    recent,
    lowStock: lowStock.slice(0, 6),
    lastTaken,
    needsCount,
    usage: usageByDay(7),
    topItems: topBy(issues30, "item", 5),
    custody: myCustody,
    teamCustodyCount: teamCustody.length,
    system,
  });
}

export function listStock(req: ApiRequest): ApiResponse {
  requireRole(req, "supervisor");
  const q = normalize(req.query.get("q") ?? "");
  const warehouseId = req.query.get("warehouseId");
  const level = req.query.get("level");
  const limit = Math.min(500, Math.max(1, Number(req.query.get("limit") ?? 100) || 100));

  const rows: {
    level: StockLevel;
    item: Item;
    location: { path: string; warehouseId: string; id: string };
  }[] = [];
  for (const stockLevel of data().stock) {
    const item = data().items.find((entry) => entry.id === stockLevel.itemId);
    const location = data().locations.find((entry) => entry.id === stockLevel.locationId);
    if (!item || !location) continue;
    if (warehouseId && location.warehouseId !== warehouseId) continue;
    if (level && stockLevel.confidence.level !== level) continue;
    if (q && !normalize(`${item.name} ${item.sku} ${location.path}`).includes(q)) continue;
    rows.push({ level: stockLevel, item, location });
  }
  rows.sort((a, b) => a.item.name.localeCompare(b.item.name));

  return ok({
    ...paginate(rows, req.query.get("cursor"), limit),
    data: paginate(rows, req.query.get("cursor"), limit).data.map((entry) => ({
      ...entry.level,
      item: entry.item,
      location: entry.location,
      unit: unitOf(entry.item),
    })),
  });
}

export function reports(req: ApiRequest): ApiResponse {
  requireRole(req, "supervisor");
  const days = Math.min(365, Math.max(1, Number(req.query.get("days") ?? 30) || 30));
  const cutoff = Date.now() - days * DAY;
  const issues = data().transactions.filter(
    (tx) => tx.type === "issue" && Date.parse(tx.createdAt) >= cutoff,
  );

  const buckets = { high: 0, medium: 0, low: 0, never: 0 };
  for (const level of data().stock) buckets[level.confidence.level] += 1;

  const needsCount: {
    itemId: string;
    itemName: string;
    locationPath: string;
    score: number;
    qty: number;
  }[] = [];
  const weak = data()
    .stock.filter((level) => level.confidence.level === "low" || level.confidence.level === "never")
    .sort((a, b) => a.confidence.score - b.confidence.score)
    .slice(0, 50);
  for (const level of weak) {
    const item = data().items.find((entry) => entry.id === level.itemId);
    if (!item) continue;
    needsCount.push({
      itemId: item.id,
      itemName: item.name,
      locationPath:
        data().locations.find((location) => location.id === level.locationId)?.path ?? "",
      score: level.confidence.score,
      qty: level.qty,
    });
  }

  const lastMove = new Map<string, string>();
  for (const tx of data().transactions) {
    if (tx.type !== "issue") continue;
    if (!lastMove.has(tx.itemId)) lastMove.set(tx.itemId, tx.createdAt);
  }
  const deadStock = data()
    .items.filter((item) => item.active)
    .map((item) => {
      const last = lastMove.get(item.id) ?? null;
      const daysIdle = last ? Math.floor((Date.now() - Date.parse(last)) / DAY) : 999;
      return {
        itemId: item.id,
        name: item.name,
        lastMovedAt: last,
        qty: stockFor(item.id).reduce((sum, level) => sum + level.qty, 0),
        daysIdle,
      };
    })
    .filter((row) => row.daysIdle >= 90)
    .sort((a, b) => b.daysIdle - a.daysIdle)
    .slice(0, 30);

  const custodyRows = data().custody;
  const closed = custodyRows.filter((entry) => entry.status === "closed");
  const returned = data().transactions.filter((tx) => tx.type === "return").length;
  const consumed = data().transactions.filter((tx) => tx.type === "consume").length;
  const avgHold =
    closed.length > 0
      ? closed.reduce(
          (sum, entry) =>
            sum +
            (Date.parse(entry.closedAt ?? entry.openedAt) - Date.parse(entry.openedAt)) / 3_600_000,
          0,
        ) / closed.length
      : 0;

  const byEquipment = new Map<string, { qty: number; tx: number }>();
  for (const tx of data().transactions.filter((entry) => entry.type === "consume")) {
    const key = tx.equipmentId ?? "none";
    const entry = byEquipment.get(key) ?? { qty: 0, tx: 0 };
    entry.qty += tx.qty;
    entry.tx += 1;
    byEquipment.set(key, entry);
  }

  const step = days > 60 ? 7 : 1;
  const points = Math.min(30, Math.ceil(days / step));
  const trend: UsagePoint[] = [];
  for (let i = points - 1; i >= 0; i -= 1) {
    const end = new Date(Date.now() - i * step * DAY);
    const start = new Date(end.getTime() - step * DAY);
    const rows = data().transactions.filter(
      (tx) =>
        tx.type === "issue" &&
        Date.parse(tx.createdAt) >= start.getTime() &&
        Date.parse(tx.createdAt) < end.getTime(),
    );
    trend.push({
      date: end.toISOString().slice(0, 10),
      qty: rows.reduce((sum, tx) => sum + tx.qty, 0),
      tx: rows.length,
    });
  }

  return ok({
    rangeDays: days,
    trend,
    topItems: topBy(issues, "item", 10),
    byUser: topBy(issues, "user", 10),
    byReason: topBy(issues, "reason", 10),
    confidence: { ...buckets, total: data().stock.length, needsCount },
    deadStock,
    custody: {
      openEntries: custodyRows.filter((entry) => entry.status === "open").length,
      avgHoldHours: Math.round(avgHold * 10) / 10,
      returnRate: Math.round((returned / Math.max(1, returned + consumed)) * 100),
      overdue: custodyRows.filter(
        (entry) =>
          entry.status === "open" &&
          Date.now() - Date.parse(entry.openedAt) > data().settings.custodyOverdueHours * 3_600_000,
      ).length,
      byEquipment: [...byEquipment.entries()].map(([id, value]) => ({
        id,
        label: data().equipment.find((equipment) => equipment.id === id)?.name ?? "Tanpa mesin",
        qty: value.qty,
        tx: value.tx,
      })),
    },
  });
}

export function events(req: ApiRequest): ApiResponse {
  requireSession(req);
  return ok({ data: recentEvents(50) });
}

export function confidenceOf(itemId: string) {
  return worstConfidence(stockFor(itemId));
}
