#!/usr/bin/env node
/**
 * Bukti nyata relasi item - lokasi - kategori.
 *
 * Membuat: kategori -> satuan -> gudang -> lokasi bertingkat -> item ->
 * transaksi masuk di lokasi tertentu, lalu membaca stok per lokasi.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!login.ok) {
  console.error("login gagal:", login.status);
  process.exit(1);
}

async function call(method, path, body) {
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
  return { status: res.status, json, text };
}

console.log("== 1. KATEGORI ==");
// Tenant baru sudah punya "Umum" dari seed; pakai bila sudah ada.
const cat = await call("POST", "/categories", { name: `Bearing ${Date.now().toString(36)}` });
console.log("  buat kategori:", cat.status, JSON.stringify(cat.json).slice(0, 100));

console.log("\n== 2. SATUAN ==");
// `pcs` sudah ada dari seed (units.symbol UNIQUE), jadi pakai yang ada.
const unitList = await call("GET", "/units");
const units = Array.isArray(unitList.json?.data) ? unitList.json.data : [];
const unit = units.find((u) => u.symbol === "pcs")
  ? { json: { unit: units.find((u) => u.symbol === "pcs") } }
  : await call("POST", "/units", { name: "Pcs", symbol: "pcs", decimals: 0 });
console.log("  satuan dipakai:", unit.json?.unit?.symbol ?? unit.json?.data?.symbol);

console.log("\n== 3. LOKASI BERTINGKAT ==");
const locs = await call("GET", "/locations");
const tree = Array.isArray(locs.json?.data) ? locs.json.data : (locs.json?.data?.data ?? []);
console.log("  lokasi awal:", tree.length);
for (const l of tree.slice(0, 8)) {
  console.log(
    `    ${"  ".repeat(l.depth ?? 0)}${l.code} ${l.name} (${l.type}) path=${l.path ?? "-"}`,
  );
}

console.log("\n== 4. ITEM (butuh kategori + satuan + lokasi) ==");
const catId = cat.json?.category?.id ?? cat.json?.data?.id;
const unitId = unit.json?.unit?.id ?? unit.json?.data?.id;
const locId = tree[0]?.id;
console.log("  categoryId:", catId, "unitId:", unitId, "locationId:", locId);

const item = await call("POST", "/items", {
  sku: `BRG-${Date.now().toString(36)}`,
  name: "Bearing 6205",
  categoryId: catId,
  unitId: unitId,
  minStock: 5,
  maxStock: 50,
  primaryLocationId: locId,
});
console.log("  buat item:", item.status, JSON.stringify(item.json).slice(0, 200));

const itemId = item.json?.item?.id;
if (!itemId) {
  console.error("  item gagal dibuat, berhenti");
  process.exit(1);
}

console.log("\n== 5. ITEM DENGAN KATEGORI PALSU (harus ditolak) ==");
const bad = await call("POST", "/items", {
  sku: "BAD-1",
  name: "Item Palsu",
  categoryId: "cat_tidak_ada",
  unitId,
  minStock: 1,
});
console.log("  hasil:", bad.status, JSON.stringify(bad.json).slice(0, 140));

console.log("\n== 6. STOK MASUK DI LOKASI ==");
const receive = await call("POST", "/transactions", {
  type: "receive",
  itemId,
  toLocationId: locId,
  qty: 12,
  note: "Stok awal",
  idempotencyKey: `demo-${Date.now()}`,
});
console.log(
  "  terima 12:",
  receive.status,
  JSON.stringify(receive.json?.stock ?? receive.json).slice(0, 140),
);

console.log("\n== 7. STOK PER LOKASI ==");
const stock = await call("GET", `/items/${itemId}/stock`);
const levels = stock.json?.data ?? stock.json?.stock ?? [];
console.log("  levels:", JSON.stringify(levels).slice(0, 300));

console.log("\n== 8. DETAIL ITEM (relasi lengkap) ==");
const detail = await call("GET", `/items/by-code/${item.json.item.code}`);
// Bentuk respons: { item, category, unit, primaryLocation, stock, totalQty }.
const d = detail.json?.item;
const body = detail.json ?? {};
console.log("  sku:", d?.sku, "| kategori:", body.category?.name, "| satuan:", body.unit?.name);
console.log(
  "  lokasi utama:",
  body.primaryLocation?.code ?? "-",
  "| min:",
  d?.minStock,
  "max:",
  d?.maxStock,
);
console.log(
  "  total qty:",
  body.totalQty,
  "| stok per lokasi:",
  JSON.stringify(body.stock ?? []).slice(0, 200),
);
