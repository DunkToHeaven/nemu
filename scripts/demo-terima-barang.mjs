#!/usr/bin/env node
/**
 * Bukti: menambah stok karena barang datang.
 *
 * Skenario nyata: cek stok -> barang datang -> catat penerimaan -> cek stok lagi.
 * Juga membuktikan kiriman ganda tidak menambah stok dua kali.
 */
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

// Cari item yang punya stok.
const list = await call("GET", "/items?limit=20");
const items = list.json?.data ?? [];
const item = items.find((i) => i.totalQty > 0) ?? items[0];
if (!item) {
  console.error("tidak ada item");
  process.exit(1);
}

const stockOf = async (id) => {
  const r = await call("GET", `/items/${id}/stock`);
  const levels = r.json?.data ?? [];
  return { levels, total: levels.reduce((s, l) => s + l.qty, 0) };
};

console.log(`Barang: ${item.name} (${item.sku})`);
const before = await stockOf(item.id);
console.log(`\n1. STOK SEKARANG`);
console.log(`   total ${before.total}`);
for (const l of before.levels) console.log(`     ${l.location?.path ?? l.locationId}: ${l.qty}`);

const locId = before.levels[0]?.locationId ?? item.primaryLocationId;
if (!locId) {
  console.error("item tidak punya lokasi; tidak bisa menerima barang");
  process.exit(1);
}

const QTY = 50;
const key = `terima-${Date.now()}`;
console.log(`\n2. BARANG DATANG: catat penerimaan ${QTY} ke lokasi ${locId}`);
const recv = await call("POST", "/transactions", {
  type: "receive",
  itemId: item.id,
  toLocationId: locId,
  qty: QTY,
  note: "Kiriman supplier, surat jalan SJ-001",
  idempotencyKey: key,
});
console.log(`   status ${recv.status} — ${recv.json?.message ?? recv.json?.error?.message ?? ""}`);
console.log(`   stok di respons: ${recv.json?.stock?.qty ?? "(tidak dikirim)"}`);

const after = await stockOf(item.id);
console.log(`\n3. STOK SESUDAH`);
console.log(
  `   total ${after.total}  (sebelumnya ${before.total}, selisih ${after.total - before.total})`,
);
for (const l of after.levels) console.log(`     ${l.location?.path ?? l.locationId}: ${l.qty}`);

console.log(`\n4. KIRIM ULANG DENGAN KUNCI SAMA (jaringan putus lalu dicoba lagi)`);
const dup = await call("POST", "/transactions", {
  type: "receive",
  itemId: item.id,
  toLocationId: locId,
  qty: QTY,
  idempotencyKey: key,
});
const dupStock = await stockOf(item.id);
console.log(`   status ${dup.status} — duplicate=${dup.json?.duplicate}`);
console.log(
  `   total ${dupStock.total} → ${dupStock.total === after.total ? "TIDAK bertambah (benar)" : "BERTAMBAH (bug!)"}`,
);

console.log(`\n5. RIWAYAT GERAKAN BARANG INI`);
const tx = await call("GET", `/items/${item.id}/transactions`);
const rows = tx.json?.data ?? [];
for (const t of rows.slice(0, 5)) {
  console.log(
    `   ${new Date(t.createdAt).toISOString().slice(0, 16)}  ${t.type.padEnd(8)} ${String(t.qty).padStart(4)}  ${t.userName ?? ""}  ${t.note ?? ""}`,
  );
}
