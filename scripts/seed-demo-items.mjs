#!/usr/bin/env node
/** Isi beberapa item contoh supaya UI bisa diuji klik-nya. */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!login.ok) {
  console.error("login gagal", login.status);
  process.exit(1);
}

const call = async (method, path, body) => {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* bukan json */
  }
  return { status: res.status, json };
};

// Kategori & satuan dari seed.
const cats = await call("GET", "/categories");
const catList = cats.json?.data ?? [];
const units = await call("GET", "/units");
const unitList = units.json?.data ?? [];
const locs = await call("GET", "/locations");
const locList = locs.json?.data ?? [];

const catId = catList[0]?.id;
const unitId = unitList[0]?.id;
const locId = locList[0]?.id;
console.log("kategori:", catId, "satuan:", unitId, "lokasi:", locId);
if (!catId || !unitId) {
  console.error("data referensi tidak lengkap");
  process.exit(1);
}

const items = [
  { sku: "BRG-6205", name: "Bearing 6205", min: 5, max: 50, qty: 12 },
  { sku: "OLI-20W50", name: "Oli Mesin 20W-50", min: 10, max: 40, qty: 3 },
  { sku: "SAR-SAFETY", name: "Sarung Tangan Safety", min: 20, max: 200, qty: 240 },
];

for (const it of items) {
  const created = await call("POST", "/items", {
    sku: it.sku,
    name: it.name,
    categoryId: catId,
    unitId,
    minStock: it.min,
    maxStock: it.max,
    primaryLocationId: locId,
  });
  const itemId = created.json?.item?.id;
  console.log(`${it.sku}: ${created.status}`, itemId ?? JSON.stringify(created.json).slice(0, 100));
  if (!itemId || !locId) continue;

  const recv = await call("POST", "/transactions", {
    type: "receive",
    itemId,
    toLocationId: locId,
    qty: it.qty,
    idempotencyKey: `seed-${it.sku}-${Date.now()}`,
  });
  console.log(
    `  stok ${it.qty}:`,
    recv.status,
    JSON.stringify(recv.json?.stock?.qty ?? recv.json?.error?.message ?? "").slice(0, 80),
  );
}
