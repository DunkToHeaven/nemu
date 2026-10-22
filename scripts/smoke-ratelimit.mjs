#!/usr/bin/env node
/**
 * Buktikan rate limit login BENAR-BENAR bekerja pada nilai produksi.
 *
 * Penting: E2E menaikkan batas lewat env supaya bisa login puluhan kali.
 * Tanpa uji ini, pelonggaran khusus uji bisa menutupi rate limit yang mati.
 *
 * Jalankan terhadap server dengan batas DEFAULT (tanpa RATE_LIMIT_LOGIN_*).
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

async function tryLogin(code, pin) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code, pin }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  // Bersihkan jendela dulu supaya hitungan mulai dari nol.
  const { execSync } = await import("node:child_process");
  execSync("node scripts/reset-rate-limits.mjs", { stdio: "ignore" });

  console.log("\n== BATAS PER KODE (5 / 5 menit) ==");
  const results = [];
  for (let i = 0; i < 7; i += 1) {
    results.push(await tryLogin("WRK01", "1122"));
  }
  const okCount = results.filter((r) => r.status === 200).length;
  const limited = results.filter((r) => r.status === 429);

  check("5 percobaan pertama diterima", okCount === 5, `${okCount} berhasil`);
  check("percobaan ke-6 dan ke-7 ditolak 429", limited.length === 2, `${limited.length} ditolak`);
  check(
    "429 menyebut waktu tunggu",
    (limited[0]?.json?.error?.details?.retryAfterSeconds ?? 0) > 0,
    `retryAfter ${limited[0]?.json?.error?.details?.retryAfterSeconds}s`,
  );

  console.log("\n== KODE LAIN TIDAK IKUT TERKUNCI ==");
  const other = await tryLogin("SPV01", "1357");
  check("kode lain tetap bisa login", other.status === 200, `status ${other.status}`);

  console.log("\n== PIN SALAH TETAP 401 (bukan 429) SEBELUM BATAS ==");
  execSync("node scripts/reset-rate-limits.mjs", { stdio: "ignore" });
  const wrong = await tryLogin("ADM01", "0000");
  check("PIN salah ditolak 401", wrong.status === 401, `status ${wrong.status}`);

  console.log(`\n${"-".repeat(48)}`);
  console.log(`  lulus ${pass} · gagal ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
