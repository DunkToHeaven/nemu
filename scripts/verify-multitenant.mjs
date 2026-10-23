#!/usr/bin/env node
/**
 * Uji alur multi-tenant dari ujung ke ujung:
 *
 *   1. Sign up publik membuat admin + organisasi (schema sendiri)
 *   2. Admin membuat akun worker (PIN)
 *   3. Worker login dan HANYA melihat data gudangnya sendiri
 *   4. Organisasi kedua tidak bisa melihat data organisasi pertama
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  OK    ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  GAGAL ${name}${detail ? `  (${detail})` : ""}`);
  }
}

async function post(path, body, cookie) {
  const res = await fetch(`${BASE}/api/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  const setCookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json, cookie: setCookie };
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}/api/v1/${path}`, { headers: cookie ? { cookie } : {} });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const stamp = Date.now().toString(36);
  const emailA = `admin-${stamp}@uji.local`;
  const emailB = `admin2-${stamp}@uji.local`;

  console.log("\n== 1. SIGN UP PUBLIK ==");
  const a = await post("auth/signup", {
    orgName: "Gudang A",
    name: "Admin A",
    email: emailA,
    password: "rahasia12345",
  });
  check("signup membuat akun admin", a.status === 201, `status ${a.status}`);
  check("signup langsung memberi sesi", Boolean(a.cookie), a.cookie ? "cookie ada" : "TIDAK ADA");
  check("signup membuat organisasi", Boolean(a.json?.tenant?.slug), a.json?.tenant?.slug);
  const slugA = a.json?.tenant?.slug;

  const dup = await post("auth/signup", {
    orgName: "Gudang A2",
    name: "Admin A2",
    email: emailA,
    password: "rahasia12345",
  });
  check("email sama ditolak 409", dup.status === 409, `status ${dup.status}`);

  const weak = await post("auth/signup", {
    orgName: "Gudang C",
    name: "Admin C",
    email: `c-${stamp}@uji.local`,
    password: "123",
  });
  check("password terlalu pendek ditolak", weak.status === 400, `status ${weak.status}`);

  console.log("\n== 2. ADMIN MEMBUAT AKUN WORKER ==");
  const worker = await post(
    "users",
    { name: "Budi Pekerja", code: `WRK${stamp.slice(-3).toUpperCase()}`, role: "worker" },
    a.cookie,
  );
  check("admin bisa membuat worker", worker.status === 201, `status ${worker.status}`);
  const pin = worker.json?.initialPin;
  const workerCode = worker.json?.user?.code;
  check("PIN awal dibuat", /^\d{4}$/.test(pin ?? ""), "4 digit");

  console.log("\n== 3. WORKER LOGIN ==");
  const w = await post("auth/login", { mode: "pin", code: workerCode, pin });
  check("worker login dengan PIN", w.status === 200, `status ${w.status}`);

  const sess = await get("auth/session", w.cookie);
  check("worker dapat sesi", sess.status === 200, `peran ${sess.json?.user?.role}`);
  check("worker perannya worker", sess.json?.user?.role === "worker");

  console.log("\n== 4. ISOLASI DATA ==");
  // Admin A membuat kategori; worker A harus melihatnya.
  const catA = await post("categories", { name: `Kat-${stamp}` }, a.cookie);
  check("admin A membuat kategori", catA.status === 201, `status ${catA.status}`);

  const wCats = await get("categories", w.cookie);
  const seenByWorker = (wCats.json?.data ?? []).some((c) => c.name === `Kat-${stamp}`);
  check("worker melihat data gudangnya sendiri", seenByWorker);

  // Organisasi B tidak boleh melihat kategori A.
  const b = await post("auth/signup", {
    orgName: "Gudang B",
    name: "Admin B",
    email: emailB,
    password: "rahasia12345",
  });
  check("signup organisasi kedua berhasil", b.status === 201, b.json?.tenant?.slug);
  check(
    "slug organisasi berbeda",
    b.json?.tenant?.slug !== slugA,
    `${slugA} vs ${b.json?.tenant?.slug}`,
  );

  const bCats = await get("categories", b.cookie);
  const leaked = (bCats.json?.data ?? []).some((c) => c.name === `Kat-${stamp}`);
  check(
    "organisasi B TIDAK melihat data organisasi A",
    !leaked,
    `${(bCats.json?.data ?? []).length} kategori`,
  );

  const bDash = await get("dashboard", b.cookie);
  check(
    "dashboard B kosong (gudang baru)",
    (bDash.json?.kpis?.totalItems ?? -1) === 0,
    `${bDash.json?.kpis?.totalItems} item`,
  );

  // Worker A tidak boleh melihat daftar pengguna (rute admin).
  const forbidden = await get("users", w.cookie);
  check(
    "worker tidak boleh melihat daftar pengguna",
    forbidden.status === 403,
    `status ${forbidden.status}`,
  );

  console.log("\n" + "-".repeat(50));
  console.log(`  lulus ${pass} · gagal ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
