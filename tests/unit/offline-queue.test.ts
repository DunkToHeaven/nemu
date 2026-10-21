import { describe, expect, it } from "vitest";
import { buildSeed } from "@/mocks/seed";
import { syncBatch } from "@/mocks/handlers/tx";
import { store } from "@/mocks/store";
import type { ApiRequest } from "@/mocks/http";

function request(body: unknown, token?: string): ApiRequest {
  return {
    method: "POST",
    path: "sync/batch",
    query: new URLSearchParams(),
    body,
    token,
    ip: "127.0.0.1",
  };
}

function loginToken(): string {
  const db = store().db;
  const user = db.users.find((entry) => entry.code === "WRK01");
  if (!user) throw new Error("worker tidak ada di seed");
  const token = "tok_test_sync";
  store().sessions.set(token, {
    token,
    userId: user.id,
    role: user.role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3_600_000,
  });
  return token;
}

function sampleTx(itemCode: string, locationId: string, key: string) {
  return {
    itemCode,
    locationId,
    type: "issue" as const,
    qty: 1,
    reasonId: null,
    refNo: null,
    note: null,
    idempotencyKey: key,
    scanMethod: "in_app_scanner" as const,
  };
}

describe("antrean offline (OF-02…OF-04)", () => {
  it("mengirim antrean berurutan dan melaporkan hasil per entri", () => {
    const token = loginToken();
    const db = store().db;
    const level = db.stock.find((entry) => entry.qty > 5);
    if (!level) throw new Error("butuh stok");
    const item = db.items.find((entry) => entry.id === level.itemId);
    if (!item) throw new Error("butuh item");

    const response = syncBatch(
      request({ transactions: [sampleTx(item.code, level.locationId, "offline-key-0001")] }, token),
    );
    const body = response.body as { results: { status: string }[]; ok: number };
    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.status).toBe("ok");
    expect(body.ok).toBe(1);
  });

  it("kiriman ulang dengan kunci sama dilaporkan duplicate, bukan transaksi baru", () => {
    const token = loginToken();
    const db = store().db;
    const level = db.stock.find((entry) => entry.qty > 5);
    const item = db.items.find((entry) => entry.id === level?.itemId);
    if (!level || !item) throw new Error("butuh stok");

    const payload = { transactions: [sampleTx(item.code, level.locationId, "offline-key-dup")] };
    syncBatch(request(payload, token));
    const before = db.transactions.length;
    const second = syncBatch(request(payload, token));
    const body = second.body as { results: { status: string }[]; duplicate: number };

    expect(body.results[0]?.status).toBe("duplicate");
    expect(body.duplicate).toBe(1);
    expect(db.transactions.length).toBe(before);
  });

  it("stok kurang ditandai needs_review, tidak hilang diam-diam", () => {
    const token = loginToken();
    const db = store().db;
    const level = db.stock.find((entry) => entry.qty === 0) ?? db.stock[0];
    const item = db.items.find((entry) => entry.id === level?.itemId);
    if (!level || !item) throw new Error("butuh stok");

    const response = syncBatch(
      request(
        { transactions: [{ ...sampleTx(item.code, level.locationId, "offline-key-409"), qty: 99_999 }] },
        token,
      ),
    );
    const body = response.body as { results: { status: string }[]; needsReview: number };
    expect(body.results[0]?.status).toBe("needs_review");
    expect(body.needsReview).toBe(1);
  });

  it("batch kosong tidak error", () => {
    const token = loginToken();
    const response = syncBatch(request({ transactions: [] }, token));
    expect(response.status).toBe(200);
  });

  it("tanpa sesi ditolak", () => {
    expect(() => syncBatch(request({ transactions: [] }))).toThrow();
  });
});

describe("seed", () => {
  it("fixture memenuhi anggaran PRD", () => {
    const db = buildSeed();
    expect(db.items.length).toBeGreaterThanOrEqual(300);
    expect(db.transactions.length).toBe(5000);
    expect(db.users.filter((user) => user.role === "worker").length).toBe(12);
    expect(new Set(db.items.map((item) => item.code)).size).toBe(db.items.length);
    expect(db.warehouses.length).toBe(3);
    expect(db.users.length).toBe(15);
  });
});
