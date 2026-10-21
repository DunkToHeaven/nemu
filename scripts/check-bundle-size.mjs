#!/usr/bin/env node
/**
 * Anggaran ukuran JS awal (PRD bagian 4):
 *   "/"     <= 120 KB gzip
 *   "/i/*"  <= 150 KB gzip
 *
 * Next 16 + Turbopack tidak menghasilkan `.next/app-build-manifest.json`, jadi
 * angka diambil dari sumber sebenarnya: server produksi dijalankan sementara,
 * HTML rute diambil, lalu setiap <script> muatan awal dijumlahkan setelah gzip.
 *
 * Dua koreksi pengukuran yang penting:
 *  1. Script `noModule` adalah polyfill core-js untuk browser lama. Browser
 *     modern tidak pernah mengunduhnya, jadi tidak dihitung.
 *  2. Chunk framework (react, react-dom, runtime Next) dipisahkan dari chunk
 *     milik aplikasi. Batas PRD diterapkan pada total, tetapi laporan
 *     menampilkan keduanya supaya regresi kode aplikasi terlihat jelas.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const PORT = Number(process.env.SIZE_PORT ?? 4311);
const BASE = `http://127.0.0.1:${PORT}`;
const BUDGETS = [
  { route: "/", limitKb: 120, path: "/" },
  { route: "/i/[kode]", limitKb: 150, path: null },
];

if (!existsSync(".next/BUILD_ID")) {
  console.error("\n  BUNDLE SIZE GAGAL: jalankan `pnpm build` dulu (.next/BUILD_ID tidak ada).\n");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`\n  BUNDLE SIZE GAGAL: ${message}\n`);
  process.exit(1);
}

async function waitForServer(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      /* server belum siap */
    }
    await sleep(500);
  }
  throw new Error("server produksi tidak siap dalam 90 detik");
}

async function login() {
  const response = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code: "ADM01", pin: "2468" }),
  });
  if (!response.ok) throw new Error(`login gagal: ${response.status}`);
  const cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("cookie sesi tidak diterima");
  return cookie;
}

async function firstItemCode(cookie) {
  const response = await fetch(`${BASE}/api/v1/items/search?q=a&limit=1`, { headers: { cookie } });
  if (!response.ok) throw new Error(`pencarian item gagal: ${response.status}`);
  const payload = await response.json();
  const code = payload?.data?.[0]?.item?.code;
  if (!code) throw new Error("tidak ada item di fixture");
  return code;
}

/** Hanya script yang dieksekusi browser modern (noModule = legacy polyfill). */
function modernScripts(html) {
  const out = new Set();
  const pattern = /<script\b([^>]*)>/g;
  let match = pattern.exec(html);
  while (match) {
    const attrs = match[1] ?? "";
    const src = /src="([^"]*\/_next\/static\/chunks\/[^"]+)"/.exec(attrs)?.[1];
    const legacy = /\bnoModule\b/i.test(attrs);
    if (src && !legacy) out.add(src);
    match = pattern.exec(html);
  }
  return [...out];
}

/**
 * Framework = chunk runtime Next/React yang dikirim ke semua rute
 * (`rootMainFiles` di build-manifest) + polyfill. Sisanya milik aplikasi.
 */
function frameworkSet() {
  const manifestPath = ".next/build-manifest.json";
  if (!existsSync(manifestPath)) throw new Error("build-manifest.json tidak ditemukan");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const names = new Set();
  for (const file of manifest.rootMainFiles ?? []) names.add(`/_next/${file}`);
  for (const file of manifest.polyfillFiles ?? []) names.add(`/_next/${file}`);
  return names;
}

async function measure(path, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : undefined,
    redirect: "manual",
  });
  if (response.status !== 200) throw new Error(`${path} mengembalikan ${response.status} (butuh 200)`);
  const html = await response.text();
  const sources = modernScripts(html);
  if (sources.length === 0) throw new Error(`${path} tidak memuat chunk JS`);

  const frameworkNames = frameworkSet();
  let framework = 0;
  let app = 0;
  for (const src of sources) {
    const asset = await fetch(`${BASE}${src}`);
    if (!asset.ok) throw new Error(`aset ${src} mengembalikan ${asset.status}`);
    const buffer = Buffer.from(await asset.arrayBuffer());
    const kb = gzipSync(buffer).length / 1024;
    if (frameworkNames.has(src)) framework += kb;
    else app += kb;
  }
  return { total: framework + app, framework, app, chunks: sources.length };
}

const server = spawn(
  process.platform === "win32" ? "node.exe" : "node",
  ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
  { stdio: "ignore", env: { ...process.env, NODE_ENV: "production" } },
);

let exitCode = 0;
try {
  await waitForServer();
  const cookie = await login();
  BUDGETS[1].path = `/i/${await firstItemCode(cookie)}`;

  console.log("\n  Anggaran JS awal (gzip, muatan awal yang benar-benar dieksekusi)");
  console.log("  " + "-".repeat(72));
  console.log(`  ${"rute".padEnd(14)}${"total".padStart(11)}${"batas".padStart(10)}${"framework".padStart(12)}${"aplikasi".padStart(11)}  status`);

  for (const budget of BUDGETS) {
    const result = await measure(budget.path, cookie);
    const ok = result.total <= budget.limitKb;
    if (!ok) exitCode = 1;
    console.log(
      `  ${budget.route.padEnd(14)}${`${result.total.toFixed(1)} KB`.padStart(11)}${`${budget.limitKb} KB`.padStart(10)}${`${result.framework.toFixed(1)} KB`.padStart(12)}${`${result.app.toFixed(1)} KB`.padStart(11)}  ${ok ? "OK" : "LEWAT"}`,
    );
  }
  console.log("  " + "-".repeat(72));
  console.log(exitCode === 0 ? "  Semua rute dalam anggaran.\n" : "  Ada rute yang melewati anggaran PRD bagian 4.\n");
} catch (error) {
  console.error(`\n  BUNDLE SIZE GAGAL: ${error instanceof Error ? error.message : String(error)}\n`);
  exitCode = 1;
} finally {
  server.kill("SIGTERM");
  await sleep(400);
  if (!server.killed) server.kill("SIGKILL");
}

process.exit(exitCode);
