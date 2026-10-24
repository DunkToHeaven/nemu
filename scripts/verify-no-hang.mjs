#!/usr/bin/env node
/**
 * Uji tahan-banting: penyebab "load terus" adalah koneksi yang ditinggalkan
 * klien. Di sini request sengaja DIBATALKAN di tengah jalan berulang kali,
 * lalu dipastikan permintaan berikutnya tetap cepat.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

const timed = async (path) => {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(20_000),
    });
    await res.text();
    return { status: res.status, ms: Date.now() - t0 };
  } catch (error) {
    return { status: 0, ms: Date.now() - t0, err: error.name };
  }
};

console.log("== 1. BASELINE ==");
for (const p of ["/items?limit=5", "/dashboard", "/reports?days=30"]) {
  const r = await timed(p);
  console.log(`  ${p.padEnd(18)} ${r.status} ${r.ms}ms`);
}

console.log("\n== 2. BATALKAN 12 REQUEST DI TENGAH JALAN ==");
let aborted = 0;
for (let i = 0; i < 12; i += 1) {
  const controller = new AbortController();
  const req = fetch(`${BASE}/api/v1/reports?days=30`, {
    headers: { Cookie: cookie },
    signal: controller.signal,
  }).catch(() => null);
  // Batalkan setelah 60-140ms: cukup untuk memulai query, belum selesai.
  await new Promise((r) => setTimeout(r, 60 + (i % 5) * 20));
  controller.abort();
  await req;
  aborted += 1;
}
console.log(`  ${aborted} request dibatalkan`);

console.log("\n== 3. APAKAH MASIH CEPAT SETELAH DIBATALKAN? ==");
await new Promise((r) => setTimeout(r, 3000));
let allFast = true;
for (const p of ["/items?limit=5", "/dashboard", "/reports?days=30", "/locations"]) {
  const r = await timed(p);
  const ok = r.status === 200 && r.ms < 12_000;
  if (!ok) allFast = false;
  console.log(`  ${ok ? "OK   " : "GAGAL"} ${p.padEnd(18)} ${r.status} ${r.ms}ms`);
}

console.log("\n== 4. TIGA PUTARAN BERURUTAN ==");
let roundsOk = true;
for (let round = 1; round <= 3; round += 1) {
  const r = await timed("/reports?days=30");
  const ok = r.status === 200 && r.ms < 12_000;
  if (!ok) roundsOk = false;
  console.log(`  putaran ${round}: ${r.status} ${r.ms}ms`);
}

console.log(`\n${"-".repeat(46)}`);
console.log(
  `  ${allFast && roundsOk ? "LULUS" : "GAGAL"} — sistem ${allFast && roundsOk ? "tidak" : "MASIH"} macet setelah request dibatalkan`,
);
process.exit(allFast && roundsOk ? 0 : 1);
