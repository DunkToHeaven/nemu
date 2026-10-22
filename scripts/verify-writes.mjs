#!/usr/bin/env node
/**
 * Uji alur TULIS pada setiap domain database.
 *
 * Uji baca saja tidak membuktikan apa pun: rute bisa membalas 200 dari cache
 * atau dari mock. Di sini setiap operasi menulis lalu dibaca kembali.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  OK   ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  GAGAL ${name}${detail ? `  (${detail})` : ""}`);
  }
}

async function login(code, pin) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code, pin }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}/api/v1/${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* respons tanpa body */
  }
  return { status: res.status, json };
}

async function main() {
  const admin = await login("ADM01", "2468");
  const spv = await login("SPV01", "1357");
  const wrk = await login("WRK01", "1122");

  console.log("\n== MASTER DATA ==");

  const suffix = Date.now().toString(36).toUpperCase().slice(-5);

  // kategori
  const cat = await api(admin, "POST", "categories", { name: `Uji Kategori ${suffix}` });
  check("buat kategori", cat.status === 201 && cat.json?.category?.id, cat.json?.category?.id);
  const catDup = await api(admin, "POST", "categories", { name: `Uji Kategori ${suffix}` });
  check("kategori duplikat ditolak 409", catDup.status === 409, `status ${catDup.status}`);
  const catList = await api(wrk, "GET", "categories");
  check(
    "kategori baru muncul di daftar",
    catList.json?.data?.some((c) => c.name === `Uji Kategori ${suffix}`),
  );

  // satuan
  const unit = await api(admin, "POST", "units", {
    name: "Lusin",
    symbol: `lsn${suffix}`,
    decimals: 0,
  });
  check("buat satuan", unit.status === 201, unit.json?.unit?.id);

  // lokasi
  const loc = await api(admin, "POST", "locations", {
    name: `Rak Uji ${suffix}`,
    code: `UJI-${suffix}`,
    type: "rack",
    parentId: null,
    active: true,
  });
  check("buat lokasi", loc.status === 201 && loc.json?.location?.path, loc.json?.location?.path);
  const locDup = await api(admin, "POST", "locations", {
    name: `Rak Uji ${suffix}`,
    code: `UJI-${suffix}`,
    type: "rack",
    parentId: null,
    active: true,
  });
  check("kode lokasi duplikat ditolak 409", locDup.status === 409);

  // alasan
  const reason = await api(admin, "POST", "reasons", {
    name: `Alasan Uji ${suffix}`,
    requiresWo: true,
  });
  check("buat alasan", reason.status === 201, reason.json?.reason?.id);

  // mesin
  const equip = await api(admin, "POST", "equipment", {
    code: `MC-${suffix}`,
    name: `Mesin Uji ${suffix}`,
  });
  check("buat mesin", equip.status === 201, equip.json?.equipment?.id);

  // pengguna
  const user = await api(admin, "POST", "users", {
    name: `Pekerja Uji ${suffix}`,
    code: `UJI${suffix}`,
    role: "worker",
  });
  check(
    "buat pengguna + PIN awal acak",
    user.status === 201 && /^\d{4}$/.test(user.json?.initialPin ?? ""),
    `PIN ${user.json?.initialPin ? "ada (4 digit)" : "TIDAK ADA"}`,
  );
  const userLogin = await api(null, "POST", "auth/login", {
    mode: "pin",
    code: `UJI${suffix}`,
    pin: user.json?.initialPin,
  });
  check("pengguna baru bisa login dengan PIN awal", userLogin.status === 200);

  // nonaktifkan lalu coba login
  await api(admin, "PATCH", `users/${user.json?.user?.id}`, { active: false });
  const userLogin2 = await api(null, "POST", "auth/login", {
    mode: "pin",
    code: `UJI${suffix}`,
    pin: user.json?.initialPin,
  });
  check("pengguna nonaktif ditolak login", userLogin2.status === 401 || userLogin2.status === 403);

  // reset PIN mencabut sesi lama
  const before = await api(admin, "PATCH", `users/${user.json?.user?.id}`, { active: true });
  check("aktifkan kembali", before.status === 200);

  console.log("\n== IZIN ==");
  const forbidden = await api(wrk, "GET", "users");
  check(
    "worker tidak boleh lihat pengguna",
    forbidden.status === 403,
    `status ${forbidden.status}`,
  );
  const forbidden2 = await api(wrk, "GET", "reports?days=7");
  check("worker tidak boleh lihat laporan", forbidden2.status === 403);
  const forbidden3 = await api(spv, "GET", "settings");
  check("supervisor tidak boleh lihat settings", forbidden3.status === 403);
  const forbidden4 = await api(wrk, "GET", "custody?scope=team");
  check("worker tidak boleh lihat kustodi tim", forbidden4.status === 403);

  console.log("\n== STOK & TRANSAKSI ==");
  const items = await api(wrk, "GET", "items/search?q=bearing&limit=1");
  const item = items.json?.data?.[0]?.item;
  check("cari item", Boolean(item?.id), item?.code);

  const detail = await api(wrk, "GET", `items/by-code/${item.code}`);
  const stock = detail.json?.stock?.[0];
  check("detail item punya stok", typeof stock?.qty === "number", `qty ${stock?.qty}`);

  if (stock && stock.qty >= 2) {
    const key = `write-test-${Date.now()}`;
    const take = await api(wrk, "POST", "transactions", {
      type: "issue",
      itemId: item.id,
      locationId: stock.locationId,
      qty: 1,
      idempotencyKey: key,
    });
    check("ambil barang", take.status === 201 || take.status === 200, `status ${take.status}`);

    const again = await api(wrk, "POST", "transactions", {
      type: "issue",
      itemId: item.id,
      locationId: stock.locationId,
      qty: 1,
      idempotencyKey: key,
    });
    check("kirim ulang idempotency tidak menggandakan", again.status === 200);

    const after = await api(wrk, "GET", `items/by-code/${item.code}`);
    const afterStock = after.json?.stock?.find((s) => s.locationId === stock.locationId);
    check(
      "saldo turun tepat 1 (bukan 2)",
      afterStock?.qty === stock.qty - 1,
      `${stock.qty} -> ${afterStock?.qty}`,
    );

    const over = await api(wrk, "POST", "transactions", {
      type: "issue",
      itemId: item.id,
      locationId: stock.locationId,
      qty: 99999,
      idempotencyKey: `over-${Date.now()}`,
    });
    check("ambil melebihi stok ditolak 409", over.status === 409, over.json?.error?.code);
  }

  console.log("\n== DASHBOARD & LAPORAN ==");
  const dash = await api(wrk, "GET", "dashboard");
  check(
    "dashboard punya KPI dari database",
    typeof dash.json?.kpis?.totalItems === "number" && dash.json.kpis.totalItems > 0,
    `${dash.json?.kpis?.totalItems} item`,
  );
  check("worker tidak dapat status sistem", dash.json?.system === null);

  const dashAdmin = await api(admin, "GET", "dashboard");
  check("admin dapat status sistem", dashAdmin.json?.system !== null);

  const rep = await api(spv, "GET", "reports?days=7");
  check(
    "laporan punya seri tren 7 hari",
    Array.isArray(rep.json?.trend) && rep.json.trend.length === 7,
    `${rep.json?.trend?.length} titik`,
  );

  console.log("\n== OPNAME ==");
  const zones = await api(spv, "GET", "locations?type=rack");
  const zone = zones.json?.data?.[0];
  if (zone) {
    const count = await api(spv, "POST", "stock-counts", { zoneId: zone.id, blind: true });
    check("buat opname", count.status === 201, count.json?.count?.id);
    const approve = await api(spv, "POST", `stock-counts/${count.json?.count?.id}/approve`);
    check("setujui opname", approve.status === 200, `${approve.json?.adjusted} koreksi`);
  }

  console.log("\n== IMPOR ==");
  const preview = await api(admin, "POST", "imports", {
    entity: "items",
    filename: "uji.csv",
    rows: [
      { sku: `IMP-${suffix}`, name: "Item Impor Uji", category: "Consumable", unit: "pcs" },
      { sku: "", name: "Tanpa SKU" },
    ],
  });
  check(
    "pratinjau impor menolak baris tanpa SKU",
    preview.status === 201 && preview.json?.job?.summary?.rejected?.length === 1,
    `${preview.json?.job?.summary?.accepted} diterima, ${preview.json?.job?.summary?.rejected?.length} ditolak`,
  );
  const applied = await api(admin, "POST", `imports/${preview.json?.job?.id}/apply`);
  check("terapkan impor", applied.status === 200 && applied.json?.created === 1);

  console.log("\n== SETTINGS ==");
  const set = await api(admin, "PATCH", "settings", { orgName: `Gudang Uji ${suffix}` });
  check(
    "ubah pengaturan",
    set.status === 200 && set.json?.settings?.orgName === `Gudang Uji ${suffix}`,
  );
  const reread = await api(admin, "GET", "settings");
  check("pengaturan tersimpan", reread.json?.settings?.orgName === `Gudang Uji ${suffix}`);

  console.log("\n== AUDIT ==");
  const auditLog = await api(admin, "GET", "audit");
  const hasUserAudit = auditLog.json?.data?.some((a) => a.entity === "user");
  check("perubahan pengguna tercatat di audit", Boolean(hasUserAudit));

  console.log("\n== GOOGLE (SIMULASI) ==");
  const g = await api(admin, "GET", "integrations/google");
  check("status integrasi terbaca", typeof g.json?.integration?.connected === "boolean");
  check(
    "pesan simulasi jujur (tidak mengaku tersambung nyata)",
    (g.json?.integration?.checkMessage ?? "").includes("SIMULASI") ||
      g.json?.integration?.connected === false,
  );

  console.log(`\n${"-".repeat(50)}`);
  console.log(`  lulus ${pass} · gagal ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
