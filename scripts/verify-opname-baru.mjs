#!/usr/bin/env node
/**
 * Alur opname baru, end-to-end lewat API (UI memakai API yang sama):
 *  1. Buat lokasi datar (tanpa induk)
 *  2. Terima barang ke lokasi itu
 *  3. Sesi baru pilih lokasi -> baris otomatis muncul
 *  4. Isi hitungan fisik yang BEDA -> selisih tercatat
 *  5. Selesai & koreksi -> stok berubah + tercatat sebagai transaksi adjust
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "OK   " : "GAGAL"} ${n}${d ? `  (${d})` : ""}`); };

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
if (!login.ok) { console.error("login gagal", login.status); process.exit(1); }
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

const call = async (m, p, b) => {
  const r = await fetch(`${BASE}/api/v1${p}`, {
    method: m, headers: { "Content-Type": "application/json", Cookie: cookie },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, j };
};

console.log("\n== 1. LOKASI DATAR BARU ==");
const code = `OP${Date.now().toString(36).slice(-4).toUpperCase()}`;
const loc = await call("POST", "/locations", { name: "Rak Opname", code, type: "bin", parentId: null, active: true });
check("buat lokasi tanpa induk", loc.status === 201 || loc.status === 200, JSON.stringify(loc.j).slice(0, 80));
const locId = loc.j?.location?.id;

console.log("\n== 2. TERIMA BARANG DI SITU ==");
const cats = await call("GET", "/categories"); const catId = (cats.j?.data ?? [])[0]?.id;
const units = await call("GET", "/units"); const unitId = (units.j?.data ?? [])[0]?.id;
const item = await call("POST", "/items", { sku: `OP-${code}`, name: "Barang Opname", categoryId: catId, unitId, minStock: 2, primaryLocationId: locId });
const itemId = item.j?.item?.id;
check("item dibuat", item.status === 201 && !!itemId, itemId ?? JSON.stringify(item.j).slice(0, 80));
const recv = await call("POST", "/transactions", { type: "receive", itemId, toLocationId: locId, qty: 10, idempotencyKey: `oprecv-${Date.now()}` });
check("terima 10", recv.status === 201, JSON.stringify(recv.j?.stock?.qty ?? recv.j).slice(0, 60));

console.log("\n== 3. SESI BARU -> BARIS MUNCUL ==");
const cnt = await call("POST", "/stock-counts", { locationId: locId, name: "Hitung Rak Opname" });
check("sesi dibuat", cnt.status === 201, JSON.stringify(cnt.j).slice(0, 90));
const counts = await call("GET", "/stock-counts");
const session = (counts.j?.data ?? []).find((c) => c.id === (cnt.j?.count?.id ?? cnt.j?.count?.id));
check("sesi ada di daftar", !!session, session?.name ?? "-");
check("baris otomatis terisi", (session?.lines ?? []).length >= 1, `${session?.lines?.length ?? 0} baris`);
const line = session?.lines?.[0];
check("baris menunjuk item & stok 10", line?.itemName === "Barang Opname" && line?.systemQty === 10, `qty=${line?.systemQty}`);

console.log("\n== 4. ISI FISIK 7 -> SELISIH -3 ==");
const set = await call("POST", `/stock-counts/${session.id}/lines/${line.id}`, { countedQty: 7 });
check("baris tersimpan", set.status === 200, JSON.stringify(set.j).slice(0, 70));
const counts2 = await call("GET", "/stock-counts");
const s2 = (counts2.j?.data ?? []).find((c) => c.id === session.id);
check("selisih terbaca -3", s2?.lines?.[0]?.variance === -3, `variance=${s2?.lines?.[0]?.variance}`);

console.log("\n== 5. SELESAI & KOREKSI ==");
const ap = await call("POST", `/stock-counts/${session.id}/approve`);
check("disetujui", ap.status === 200 && ap.j?.adjusted === 1, `adjusted=${ap.j?.adjusted}`);
// Stok dibaca lewat detail item (rute /items/:id/stock tidak ada).
const det = await call("GET", `/items/by-code/${item.j?.item?.code}`);
const total = (det.j?.stock ?? []).reduce((a, l) => a + l.qty, 0);
check("stok jadi 7", total === 7, `total=${total}`);
const tx = await call("GET", `/items/${itemId}/transactions`);
const adjust = (tx.j?.data ?? []).find((r) => r.type === "adjust");
check("koreksi tercatat sebagai transaksi adjust", !!adjust, adjust ? `${adjust.qty} ${adjust.note ?? ""}` : "-");

console.log("\n== 6. LAYAR LAMA TIDAK ADA LAGI ==");
const meta = await call("GET", "/meta");
const locsMeta = meta.j?.locations ?? [];
check("meta.locations kirim code", locsMeta.every((l) => "code" in l), `${locsMeta.length} lokasi`);

console.log(`\n${"-".repeat(46)}\n  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
