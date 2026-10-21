import { z } from "zod";
import {
  createTransactionSchema,
  custodySettleSchema,
  verificationSubmitSchema,
} from "@/lib/api/schemas";
import { decidePrompt, nextConsecutiveMatches, varianceFor } from "@/lib/domain/verification";
import type {
  CustodyEntry,
  Item,
  StockLevel,
  Transaction,
  Verification,
  VerificationPrompt,
} from "@/lib/types";
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import {
  findItemByCode,
  findLocation,
  HttpError,
  normalize,
  ok,
  paginate,
  parseBody,
  requireRole,
  requireSession,
  requireUser,
  stockLevel,
  unitOf,
  withLocation,
} from "@/mocks/http";
import {
  addAudit,
  bumpPromptsUsed,
  consecutiveMatches,
  data,
  emit,
  ensureStockLevel,
  nextPromptId,
  promptsUsedThisShift,
  refreshConfidence,
  savePrompt,
  setConsecutiveMatches,
  sim,
} from "@/mocks/store";

function decorate(tx: Transaction): Transaction {
  return {
    ...tx,
    userName: data().users.find((u) => u.id === tx.userId)?.name,
    itemName: data().items.find((i) => i.id === tx.itemId)?.name,
    itemCode: data().items.find((i) => i.id === tx.itemId)?.code,
  };
}

export function createTransaction(req: ApiRequest): ApiResponse {
  const actor = requireUser(req);
  const input = parseBody(createTransactionSchema, req.body);

  if (sim().forceError)
    throw new HttpError(500, "INTERNAL", "Server sedang bermasalah (simulasi).");

  const duplicateId = data().idempotency[input.idempotencyKey];
  if (duplicateId) {
    const existing = data().transactions.find((tx) => tx.id === duplicateId);
    if (existing) {
      const level = existing.fromLocationId
        ? stockLevel(existing.itemId, existing.fromLocationId)
        : null;
      return ok({
        transaction: decorate(existing),
        duplicate: true,
        stock: level ? withLocation(level) : null,
        custody: data().custody.find((c) => c.issueTxId === existing.id) ?? null,
        verificationPrompt: null,
        message: "Transaksi ini sudah tercatat sebelumnya.",
      });
    }
  }

  const item = findItemByCode(input.itemCode);
  if (!item.active)
    throw new HttpError(410, "ITEM_INACTIVE", "Item ini nonaktif. Lapor ke supervisor.");
  const location = findLocation(input.locationId);
  const unit = unitOf(item);
  const symbol = unit?.symbol ?? "";

  if (input.type === "issue") {
    const level = stockLevel(item.id, location.id);
    if (!level) {
      throw new HttpError(
        409,
        "INSUFFICIENT_STOCK",
        `Tidak ada stok ${item.name} di ${location.name}.`,
        {
          available: 0,
          itemName: item.name,
          locationPath: location.path,
          unit: symbol,
        },
      );
    }

    // Simulasi balapan: stok berubah sebelum permintaan diproses.
    if (sim().raceOnVerify || sim().force409) {
      const drained = Math.max(0, level.qty - 1);
      level.qty = drained;
      level.version += 1;
    }

    if (input.qty > level.qty) {
      throw new HttpError(
        409,
        "INSUFFICIENT_STOCK",
        `Stok di rak ini tinggal ${level.qty} ${symbol}.`,
        {
          available: level.qty,
          maxQty: level.qty,
          stockVersion: level.version,
          itemName: item.name,
          locationPath: location.path,
          unit: symbol,
        },
      );
    }

    level.qty -= input.qty;
    level.version += 1;
    level.txSinceVerified += 1;
    level.updatedAt = new Date().toISOString();

    const tx = pushTransaction({
      type: "issue",
      item,
      fromLocationId: location.id,
      toLocationId: null,
      qty: input.qty,
      userId: actor.id,
      reasonId: input.reasonId ?? null,
      refNo: input.refNo ?? null,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey,
      scanMethod: input.scanMethod,
      equipmentId: input.equipmentId ?? null,
    });

    let custody: CustodyEntry | null = null;
    if (data().settings.custodyEnabled) {
      custody = {
        id: `cus_${Date.now().toString(36)}`,
        issueTxId: tx.id,
        userId: actor.id,
        itemId: item.id,
        qtyTaken: input.qty,
        qtyOpen: input.qty,
        status: "open",
        openedAt: tx.createdAt,
        closedAt: null,
        lastRemindedAt: null,
        equipmentId: input.equipmentId ?? null,
        refNo: input.refNo ?? null,
        fromLocationId: location.id,
      };
      data().custody.unshift(custody);
      tx.custodyId = custody.id;
    }

    refreshConfidence(item.id, location.id);
    const prompt = maybePrompt({ item, level, userId: actor.id, tx });

    emit("tx.created", {
      id: tx.id,
      type: tx.type,
      itemName: item.name,
      itemCode: item.code,
      qty: tx.qty,
      userName: actor.name,
      locationPath: location.path,
    });
    emit("stock.changed", {
      itemId: item.id,
      locationId: location.id,
      qty: level.qty,
      version: level.version,
    });
    if (custody)
      emit("custody.changed", { custodyId: custody.id, status: "open", userName: actor.name });

    return ok({
      transaction: decorate(tx),
      duplicate: false,
      stock: withLocation(level),
      custody,
      verificationPrompt: prompt,
      message: `${input.qty} ${symbol} ${item.name} diambil. Sisa ${level.qty}.`,
    });
  }

  if (input.type === "return" || input.type === "receive") {
    const target = input.toLocationId ? findLocation(input.toLocationId) : location;
    const level = ensureStockLevel(item.id, target.id);
    level.qty += input.qty;
    level.version += 1;
    level.updatedAt = new Date().toISOString();

    const tx = pushTransaction({
      type: input.type,
      item,
      fromLocationId: null,
      toLocationId: target.id,
      qty: input.qty,
      userId: actor.id,
      reasonId: input.reasonId ?? null,
      refNo: input.refNo ?? null,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey,
      scanMethod: input.scanMethod,
    });

    emit("tx.created", {
      id: tx.id,
      type: tx.type,
      itemName: item.name,
      qty: tx.qty,
      userName: actor.name,
      locationPath: target.path,
    });
    emit("stock.changed", {
      itemId: item.id,
      locationId: target.id,
      qty: level.qty,
      version: level.version,
    });

    return ok({
      transaction: decorate(tx),
      duplicate: false,
      stock: withLocation(level),
      custody: null,
      verificationPrompt: null,
      message: `${input.qty} ${symbol} ${item.name} masuk ke ${target.name}.`,
    });
  }

  // transfer
  const from = location;
  const to = findLocation(input.toLocationId ?? null);
  const fromLevel = stockLevel(item.id, from.id);
  if (!fromLevel || fromLevel.qty < input.qty) {
    throw new HttpError(409, "INSUFFICIENT_STOCK", `Stok di ${from.name} tidak cukup.`, {
      available: fromLevel?.qty ?? 0,
    });
  }
  fromLevel.qty -= input.qty;
  fromLevel.version += 1;
  const toLevel = ensureStockLevel(item.id, to.id);
  toLevel.qty += input.qty;
  toLevel.version += 1;

  const tx = pushTransaction({
    type: "transfer",
    item,
    fromLocationId: from.id,
    toLocationId: to.id,
    qty: input.qty,
    userId: actor.id,
    reasonId: input.reasonId ?? null,
    refNo: input.refNo ?? null,
    note: input.note ?? null,
    idempotencyKey: input.idempotencyKey,
    scanMethod: input.scanMethod,
  });

  emit("tx.created", {
    id: tx.id,
    type: tx.type,
    itemName: item.name,
    qty: tx.qty,
    userName: actor.name,
  });
  return ok({
    transaction: decorate(tx),
    duplicate: false,
    stock: withLocation(toLevel),
    custody: null,
    verificationPrompt: null,
    message: `Transfer ${input.qty} ${symbol} tercatat.`,
  });
}

function pushTransaction(input: {
  type: Transaction["type"];
  item: Item;
  fromLocationId: string | null;
  toLocationId: string | null;
  qty: number;
  userId: string;
  reasonId: string | null;
  refNo: string | null;
  note: string | null;
  idempotencyKey: string;
  scanMethod: Transaction["scanMethod"];
  equipmentId?: string | null;
  custodyId?: string | null;
  outcome?: Transaction["outcome"];
  reviewStatus?: Transaction["reviewStatus"];
  reversesId?: string | null;
}): Transaction {
  const tx: Transaction = {
    id: `tx_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`,
    type: input.type,
    itemId: input.item.id,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    qty: input.qty,
    userId: input.userId,
    reasonId: input.reasonId,
    refNo: input.refNo,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
    deviceId: null,
    scanMethod: input.scanMethod,
    custodyId: input.custodyId ?? null,
    equipmentId: input.equipmentId ?? null,
    outcome: input.outcome ?? null,
    clientCreatedAt: null,
    createdAt: new Date().toISOString(),
    reversesId: input.reversesId ?? null,
    reviewStatus: input.reviewStatus ?? "ok",
  };
  data().transactions.unshift(tx);
  data().idempotency[input.idempotencyKey] = tx.id;
  return tx;
}

function maybePrompt(args: {
  item: Item;
  level: StockLevel;
  userId: string;
  tx: Transaction;
}): VerificationPrompt | null {
  const { item, level, userId, tx } = args;
  const settings = data().settings;
  if (!settings.verifyPromptEnabled) return null;

  const asked = promptsUsedThisShift(userId);
  const decision = decidePrompt(
    {
      confidenceScore: level.confidence.score,
      neverCounted: level.lastVerifiedAt === null,
      unitValueHigh: (item.unitValue ?? 0) >= 85_000,
      hadVariance90d: data().verifications.some(
        (v) =>
          v.itemId === item.id &&
          v.locationId === level.locationId &&
          v.result === "mismatch" &&
          Date.now() - Date.parse(v.createdAt) < 90 * 86_400_000,
      ),
      qtyAfterIssue: level.qty,
      isBulk: item.isBulk,
      askedThisShift: asked,
      lastVerifiedAt: level.lastVerifiedAt,
      hasOpenVariance: data().verifications.some(
        (v) =>
          v.itemId === item.id &&
          v.locationId === level.locationId &&
          v.result === "mismatch" &&
          v.reviewStatus === "pending",
      ),
      consecutiveMatches: consecutiveMatches(userId),
      now: new Date(),
      seed: tx.idempotencyKey,
    },
    {
      pMin: settings.verifyPMin,
      pMax: settings.verifyPMax,
      bonusValue: 0.15,
      bonusVariance: 0.15,
      mustAskBelow: 30,
      quotaPerShift: settings.verifyMaxPerShift,
      cooldownHours: 4,
      countThreshold: settings.verifyCountThreshold,
      blindEveryN: settings.blindEveryN,
      blindStreakTrigger: 10,
      blindStreakLength: 3,
    },
  );

  if (!decision.ask && !sim().forcePrompt) return null;
  const mode = sim().forceBlind ? "blind" : decision.mode;

  const promptId = nextPromptId();
  savePrompt({
    id: promptId,
    userId,
    itemId: item.id,
    locationId: level.locationId,
    systemQty: level.qty,
    stockVersion: level.version,
    mode,
    probability: sim().forcePrompt ? 1 : decision.probability,
    createdAt: new Date().toISOString(),
    answered: false,
  });
  bumpPromptsUsed(userId);
  emit("verification.created", { promptId, itemId: item.id, mode });

  return {
    promptId,
    locationId: level.locationId,
    expectedQty: mode === "blind" ? null : level.qty,
    stockVersion: level.version,
    mode,
    unitSymbol: unitOf(item)?.symbol ?? "",
    itemName: item.name,
    locationPath: data().locations.find((l) => l.id === level.locationId)?.path ?? "",
  };
}

export function submitVerification(req: ApiRequest): ApiResponse {
  const session = requireSession(req);
  const input = parseBody(verificationSubmitSchema, req.body);
  const prompt = data().prompts[input.promptId];
  if (!prompt)
    throw new HttpError(
      404,
      "PROMPT_NOT_FOUND",
      "Pertanyaan sudah kedaluwarsa atau tidak ditemukan.",
    );
  if (prompt.userId !== session.userId)
    throw new HttpError(403, "FORBIDDEN", "Pertanyaan ini milik pengguna lain.");
  if (prompt.answered) throw new HttpError(409, "PROMPT_ANSWERED", "Pertanyaan ini sudah dijawab.");

  const level = stockLevel(prompt.itemId, prompt.locationId);
  if (!level) throw new HttpError(404, "STOCK_NOT_FOUND", "Saldo rak tidak ditemukan.");

  if (sim().raceOnVerify) {
    level.qty = Math.max(0, level.qty - 1);
    level.version += 1;
  }

  prompt.answered = true;
  const racy = level.version !== input.stockVersion;

  if (racy) {
    const verification = pushVerification({
      prompt,
      userId: session.userId,
      result: "inconclusive",
      countedQty: input.countedQty ?? null,
      variance: null,
      stockVersion: input.stockVersion,
    });
    emit("verification.created", { id: verification.id, result: "inconclusive" });
    return ok({ status: "inconclusive", verification, confidence: level.confidence });
  }

  const counted =
    input.result === "match"
      ? prompt.systemQty
      : input.result === "mismatch"
        ? (input.countedQty ?? 0)
        : null;
  const variance = counted === null ? null : varianceFor(counted, prompt.systemQty);
  const verification = pushVerification({
    prompt,
    userId: session.userId,
    result: input.result,
    countedQty: counted,
    variance,
    stockVersion: input.stockVersion,
  });

  setConsecutiveMatches(
    session.userId,
    nextConsecutiveMatches(consecutiveMatches(session.userId), input.result),
  );

  if (input.result === "match") {
    level.lastVerifiedAt = new Date().toISOString();
    level.lastVerifiedQty = level.qty;
    level.txSinceVerified = 0;
    level.lastVarianceRatio = 0;
  } else if (input.result === "mismatch") {
    level.lastVarianceRatio = Math.abs((variance ?? 0) / Math.max(1, prompt.systemQty));
  }
  refreshConfidence(prompt.itemId, prompt.locationId);
  emit("verification.created", {
    id: verification.id,
    result: input.result,
    itemId: prompt.itemId,
  });
  emit("stock.changed", { itemId: prompt.itemId, locationId: prompt.locationId, qty: level.qty });

  return ok({ status: "recorded", verification, confidence: level.confidence });
}

function pushVerification(input: {
  prompt: {
    itemId: string;
    locationId: string;
    systemQty: number;
    stockVersion: number;
    mode: "confirm" | "blind";
    probability: number;
  };
  userId: string;
  result: Verification["result"];
  countedQty: number | null;
  variance: number | null;
  stockVersion: number;
}): Verification {
  const verification: Verification = {
    id: `ver_${Date.now().toString(36)}`,
    itemId: input.prompt.itemId,
    locationId: input.prompt.locationId,
    userId: input.userId,
    source: "pick_prompt",
    mode: input.prompt.mode,
    systemQty: input.prompt.systemQty,
    stockVersion: input.stockVersion,
    countedQty: input.countedQty,
    variance: input.variance,
    result: input.result,
    triggerTxId: null,
    promptProbability: input.prompt.probability,
    createdAt: new Date().toISOString(),
    reviewStatus: input.result === "mismatch" ? "pending" : "none",
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    adjustTxId: null,
  };
  data().verifications.unshift(verification);
  return verification;
}

export function listVerifications(req: ApiRequest): ApiResponse {
  requireRole(req, "supervisor");
  const status = req.query.get("status");
  const rows = data()
    .verifications.filter((v) => (status === "pending" ? v.reviewStatus === "pending" : true))
    .slice(0, 200)
    .map((v) => ({
      ...v,
      userName: data().users.find((u) => u.id === v.userId)?.name,
      itemName: data().items.find((i) => i.id === v.itemId)?.name,
      locationPath: data().locations.find((l) => l.id === v.locationId)?.path,
    }));
  return ok({ data: rows, nextCursor: null, total: rows.length });
}

export function reviewVerification(req: ApiRequest, id: string): ApiResponse {
  const actor = requireRole(req, "supervisor");
  const verification = data().verifications.find((v) => v.id === id);
  if (!verification) throw new HttpError(404, "NOT_FOUND", "Verifikasi tidak ditemukan.");
  if (verification.reviewStatus !== "pending")
    throw new HttpError(409, "ALREADY_REVIEWED", "Selisih ini sudah ditinjau.");

  const body = req.body as { decision?: "approved" | "rejected"; note?: string } | null;
  const decision = body?.decision;
  if (decision !== "approved" && decision !== "rejected") {
    throw new HttpError(422, "VALIDATION_ERROR", "Keputusan harus approved atau rejected.");
  }
  if (decision === "rejected" && !body?.note) {
    throw new HttpError(422, "VALIDATION_ERROR", "Alasan wajib diisi bila menolak selisih.");
  }

  verification.reviewStatus = decision;
  verification.reviewNote = body?.note ?? null;
  verification.reviewedBy = actor.id;
  verification.reviewedAt = new Date().toISOString();

  if (decision === "approved" && verification.variance !== null) {
    const item = data().items.find((i) => i.id === verification.itemId)!;
    const level = ensureStockLevel(verification.itemId, verification.locationId);
    const delta = verification.variance;
    level.qty = Math.max(0, level.qty + delta);
    level.version += 1;
    level.updatedAt = new Date().toISOString();
    level.lastVerifiedAt = new Date().toISOString();
    level.lastVerifiedQty = level.qty;
    level.txSinceVerified = 0;
    level.lastVarianceRatio = 0;
    const tx = pushTransaction({
      type: "adjust",
      item,
      fromLocationId: delta < 0 ? verification.locationId : null,
      toLocationId: delta > 0 ? verification.locationId : null,
      qty: Math.abs(delta),
      userId: actor.id,
      reasonId: null,
      refNo: null,
      note: `Koreksi selisih ${verification.id}`,
      idempotencyKey: `adjust-${verification.id}`,
      scanMethod: null,
    });
    verification.adjustTxId = tx.id;
    emit("tx.created", { id: tx.id, type: "adjust", qty: Math.abs(delta) });
    emit("stock.changed", {
      itemId: verification.itemId,
      locationId: verification.locationId,
      qty: level.qty,
    });
  }
  refreshConfidence(verification.itemId, verification.locationId);
  emit("verification.created", { id: verification.id, reviewed: decision });
  return ok({ verification });
}

/* -------------------------------- kustodi -------------------------------- */

function custodyView(entry: CustodyEntry): CustodyEntry {
  const item = data().items.find((i) => i.id === entry.itemId);
  const ageHours = Math.round(((Date.now() - Date.parse(entry.openedAt)) / 3_600_000) * 10) / 10;
  return {
    ...entry,
    userName: data().users.find((u) => u.id === entry.userId)?.name,
    itemName: item?.name,
    itemCode: item?.code,
    itemUnit: item ? unitOf(item)?.symbol : undefined,
    ageHours,
    overdue: ageHours > data().settings.custodyOverdueHours,
  };
}

export function listCustody(req: ApiRequest): ApiResponse {
  const session = requireSession(req);
  const scope = req.query.get("scope");
  if (scope === "team") requireRole(req, "supervisor");
  const rows = data()
    .custody.filter((c) => c.status === "open")
    .filter((c) => (scope === "team" ? true : c.userId === session.userId))
    .map(custodyView)
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  return ok({ data: rows, nextCursor: null, total: rows.length });
}

export function settleCustody(req: ApiRequest, id: string): ApiResponse {
  const session = requireSession(req);
  const actor = requireUser(req);
  const input = parseBody(custodySettleSchema, req.body);
  const entry = data().custody.find((c) => c.id === id);
  if (!entry) throw new HttpError(404, "NOT_FOUND", "Entri dibawa tidak ditemukan.");
  if (entry.status !== "open")
    throw new HttpError(409, "ALREADY_CLOSED", "Entri ini sudah ditutup.");
  if (entry.userId !== session.userId && session.role === "worker") {
    throw new HttpError(403, "FORBIDDEN", "Kamu hanya bisa menutup barang yang kamu bawa.");
  }
  if (input.qty > entry.qtyOpen) {
    throw new HttpError(409, "QTY_EXCEEDS_CUSTODY", `Kamu hanya membawa ${entry.qtyOpen}.`, {
      remaining: entry.qtyOpen,
    });
  }
  if (input.outcome === "returned" && !input.toLocationId) {
    throw new HttpError(422, "SCAN_REQUIRED", "Scan QR rak tujuan untuk mengembalikan barang.");
  }

  const item = data().items.find((i) => i.id === entry.itemId)!;
  let toLocationId: string | null = null;

  if (input.outcome === "returned") {
    const location = findLocation(input.toLocationId ?? null);
    const level = ensureStockLevel(entry.itemId, location.id);
    level.qty += input.qty;
    level.version += 1;
    level.updatedAt = new Date().toISOString();
    toLocationId = location.id;
    emit("stock.changed", { itemId: entry.itemId, locationId: location.id, qty: level.qty });
  }

  const tx = pushTransaction({
    type: input.outcome === "returned" ? "return" : "consume",
    item,
    fromLocationId: input.outcome === "returned" ? null : entry.fromLocationId,
    toLocationId,
    qty: input.qty,
    userId: entry.userId,
    reasonId: null,
    refNo: input.refNo ?? entry.refNo ?? null,
    note: input.equipmentText ?? null,
    idempotencyKey: input.idempotencyKey,
    scanMethod: input.scanMethod ?? (input.outcome === "returned" ? "in_app_scanner" : null),
    custodyId: entry.id,
    equipmentId: input.equipmentId ?? entry.equipmentId ?? null,
    outcome:
      input.outcome === "returned"
        ? null
        : input.outcome === "damaged_lost"
          ? "damaged_lost"
          : "used",
    reviewStatus: input.outcome === "damaged_lost" ? "needs_review" : "ok",
  });

  entry.qtyOpen -= input.qty;
  if (entry.qtyOpen === 0) {
    entry.status = "closed";
    entry.closedAt = new Date().toISOString();
  }
  emit("custody.changed", { custodyId: entry.id, status: entry.status, qtyOpen: entry.qtyOpen });
  emit("tx.created", {
    id: tx.id,
    type: tx.type,
    qty: tx.qty,
    itemName: item.name,
    userName: actor.name,
  });

  return ok({ custody: custodyView(entry), transaction: decorate(tx) });
}

export function settleCustodyBatch(req: ApiRequest): ApiResponse {
  requireSession(req);
  const body = req.body as {
    entries?: {
      id: string;
      outcome: "used" | "returned" | "damaged_lost";
      qty: number;
      toLocationId?: string | null;
    }[];
  } | null;
  const entries = body?.entries ?? [];
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const [index, entry] of entries.entries()) {
    try {
      settleCustody(
        {
          ...req,
          body: {
            outcome: entry.outcome,
            qty: entry.qty,
            toLocationId: entry.toLocationId ?? null,
            idempotencyKey: `batch-${entry.id}-${Date.now()}-${index}`,
          },
        },
        entry.id,
      );
      results.push({ id: entry.id, ok: true, message: "ok" });
    } catch (error) {
      results.push({
        id: entry.id,
        ok: false,
        message: error instanceof Error ? error.message : "gagal",
      });
    }
  }
  return ok({ results });
}

export function reverseTransaction(req: ApiRequest, id: string): ApiResponse {
  const session = requireSession(req);
  const actor = requireUser(req);
  const original = data().transactions.find((tx) => tx.id === id);
  if (!original) throw new HttpError(404, "NOT_FOUND", "Transaksi tidak ditemukan.");
  if (original.type === "reversal")
    throw new HttpError(409, "ALREADY_REVERSED", "Transaksi pembalik tidak bisa dibalik.");
  if (data().transactions.some((tx) => tx.reversesId === id)) {
    throw new HttpError(409, "ALREADY_REVERSED", "Transaksi ini sudah dibatalkan.");
  }
  if (session.role === "worker") {
    if (original.userId !== session.userId) {
      throw new HttpError(403, "FORBIDDEN", "Kamu hanya bisa membatalkan transaksimu sendiri.");
    }
    if (Date.now() - Date.parse(original.createdAt) > 60_000) {
      throw new HttpError(409, "REVERSAL_EXPIRED", "Batas waktu pembatalan 60 detik sudah lewat.");
    }
  }

  const item = data().items.find((i) => i.id === original.itemId)!;
  let level: StockLevel | null = null;
  if (original.type === "issue" && original.fromLocationId) {
    level = ensureStockLevel(original.itemId, original.fromLocationId);
    level.qty += original.qty;
    level.version += 1;
    level.updatedAt = new Date().toISOString();
  }

  const reversal = pushTransaction({
    type: "reversal",
    item,
    fromLocationId: original.toLocationId,
    toLocationId: original.fromLocationId,
    qty: original.qty,
    userId: actor.id,
    reasonId: null,
    refNo: null,
    note: `Pembatalan ${original.id}`,
    idempotencyKey: `rev-${original.id}`,
    scanMethod: null,
    custodyId: original.custodyId,
    reversesId: original.id,
  });

  if (original.custodyId) {
    const entry = data().custody.find((c) => c.id === original.custodyId);
    if (entry) {
      entry.qtyOpen = Math.max(0, entry.qtyOpen - original.qty);
      if (entry.qtyOpen === 0) {
        entry.status = "closed";
        entry.closedAt = new Date().toISOString();
      }
      emit("custody.changed", { custodyId: entry.id, status: entry.status });
    }
  }
  // CV-09: pertanyaan yang belum dijawab hilang saat transaksi dibatalkan.
  for (const prompt of Object.values(data().prompts)) {
    if (
      !prompt.answered &&
      prompt.userId === original.userId &&
      prompt.itemId === original.itemId
    ) {
      prompt.answered = true;
    }
  }
  emit("tx.created", { id: reversal.id, type: "reversal", qty: reversal.qty });
  if (level)
    emit("stock.changed", {
      itemId: original.itemId,
      locationId: level.locationId,
      qty: level.qty,
    });

  addAudit({
    entity: "transaction",
    entityId: original.id,
    action: "update",
    before: { type: original.type, qty: original.qty },
    after: { reversal: reversal.id },
    actorId: actor.id,
    source: "system",
  });

  return ok({
    transaction: decorate(original),
    reversal: decorate(reversal),
    stock: level ? withLocation(level) : null,
  });
}

export function listTransactions(req: ApiRequest): ApiResponse {
  const session = requireSession(req);
  const type = req.query.get("type");
  const userId = req.query.get("userId");
  const itemId = req.query.get("itemId");
  const q = normalize(req.query.get("q") ?? "");
  const from = req.query.get("from");
  const to = req.query.get("to");
  const limit = Math.min(200, Math.max(1, Number(req.query.get("limit") ?? 50) || 50));

  let rows = data().transactions;
  if (session.role === "worker") rows = rows.filter((tx) => tx.userId === session.userId);
  if (type) rows = rows.filter((tx) => tx.type === type);
  if (userId) rows = rows.filter((tx) => tx.userId === userId);
  if (itemId) rows = rows.filter((tx) => tx.itemId === itemId);
  if (from) rows = rows.filter((tx) => Date.parse(tx.createdAt) >= Date.parse(from));
  if (to) rows = rows.filter((tx) => Date.parse(tx.createdAt) <= Date.parse(to));

  const decorated = rows.map(decorate);
  const filtered = q
    ? decorated.filter((tx) =>
        normalize(
          `${tx.itemName ?? ""} ${tx.itemCode ?? ""} ${tx.userName ?? ""} ${tx.refNo ?? ""}`,
        ).includes(q),
      )
    : decorated;

  return ok(paginate(filtered, req.query.get("cursor"), limit));
}

/* ---------------------------- sinkron offline ---------------------------- */

const syncBatchSchema = z.object({
  transactions: z.array(createTransactionSchema).max(500).default([]),
});

/**
 * POST /api/v1/sync/batch (OF-02…04).
 * Menerima antrean per perangkat dan memprosesnya berurutan. Kunci idempotensi
 * membuat kiriman ulang aman: transaksi yang sudah tercatat dilaporkan `duplicate`,
 * bukan dibuat dua kali. Stok yang sudah berubah menghasilkan `needs_review`.
 */
export function syncBatch(req: ApiRequest): ApiResponse {
  const actor = requireUser(req);
  const input = parseBody(syncBatchSchema, req.body ?? {});
  const results: {
    idempotencyKey: string;
    status: "ok" | "duplicate" | "needs_review" | "rejected";
    message: string;
    transactionId: string | null;
  }[] = [];

  for (const payload of input.transactions) {
    const duplicateId = data().idempotency[payload.idempotencyKey];
    if (duplicateId) {
      results.push({
        idempotencyKey: payload.idempotencyKey,
        status: "duplicate",
        message: "Sudah tercatat sebelumnya.",
        transactionId: duplicateId,
      });
      continue;
    }
    try {
      const response = createTransaction({
        ...req,
        body: payload,
      });
      const body = response.body as { transaction?: { id: string }; message?: string };
      results.push({
        idempotencyKey: payload.idempotencyKey,
        status: "ok",
        message: body.message ?? "Tercatat.",
        transactionId: body.transaction?.id ?? null,
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        // Konflik stok dari antrean offline tidak boleh hilang diam-diam (OF-03).
        results.push({
          idempotencyKey: payload.idempotencyKey,
          status: "needs_review",
          message: error.message,
          transactionId: null,
        });
        continue;
      }
      results.push({
        idempotencyKey: payload.idempotencyKey,
        status: "rejected",
        message: error instanceof Error ? error.message : "Ditolak.",
        transactionId: null,
      });
    }
  }

  addAudit({
    entity: "settings",
    entityId: `sync:${actor.id}`,
    action: "update",
    before: null,
    after: { synced: results.length },
    actorId: actor.id,
    source: "system",
  });

  return ok({
    results,
    ok: results.filter((r) => r.status === "ok").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    needsReview: results.filter((r) => r.status === "needs_review").length,
    rejected: results.filter((r) => r.status === "rejected").length,
  });
}
