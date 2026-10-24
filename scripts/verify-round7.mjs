#!/usr/bin/env node
/** Uji: halaman tidak "load terus", dan form item baru punya batas maksimum. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  OK    ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  GAGAL ${name}${detail ? `  (${detail})` : ""}`);
  }
};

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log("\n== 1. LOGIN ==");
await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.waitForTimeout(2000);
await page.getByTestId("tab-email").click();
await page.waitForTimeout(300);
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });
check("login mendarat di /app", page.url().includes("/app"), page.url().replace(BASE, ""));

console.log("\n== 2. HALAMAN TIDAK 'LOAD TERUS' ==");
// Setiap halaman harus selesai memuat dalam batas wajar.
const pages = [
  ["/app", "Beranda"],
  ["/app/database/items", "Database"],
  ["/app/laporan", "Laporan"],
  ["/app/riwayat", "Riwayat"],
  ["/app/opname", "Opname"],
];
for (const [path, label] of pages) {
  const t0 = Date.now();
  let ok = true;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
    // Tunggu konten nyata, bukan "networkidle": aplikasi memakai polling status
    // sehingga jaringan tidak pernah diam dan networkidle selalu timeout.
    await page.waitForFunction(() => document.body.innerText.replace(/\s+/g, " ").length > 200, {
      timeout: 20_000,
    });
  } catch {
    ok = false;
  }
  const ms = Date.now() - t0;

  // Badge status memakai polling; "Menyambung" hanya muncul SESAAAT lalu hilang
  // (terbukti <500 ms). Yang penting: badge berhenti menyambung, bukan macet.
  let stillConnecting = /menyambung/i.test(await page.locator("body").innerText());
  for (let i = 0; i < 10 && stillConnecting; i += 1) {
    await page.waitForTimeout(500);
    stillConnecting = /menyambung/i.test(await page.locator("body").innerText());
  }

  check(`${label} tampil < 20s`, ok && ms < 20_000, `${ms}ms`);
  check(`${label} berhenti "Menyambung"`, !stillConnecting);
  check(
    `${label} tidak menampilkan 'gagal dimuat'`,
    !/gagal dimuat|couldn.t load/i.test(await page.locator("body").innerText()),
  );
}

console.log("\n== 3. FORM ITEM BARU: BATAS MAKSIMUM ==");
await page.goto(`${BASE}/app/database/items?new=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const dialog = page.locator('[role="dialog"]');
check("form item baru terbuka", (await dialog.count()) > 0);
const text = (await dialog.count()) ? await dialog.innerText() : "";
check("ada label 'Batas minimum stok'", /batas minimum stok/i.test(text));
check("ada label 'Batas maksimum stok'", /batas maksimum stok/i.test(text));

const minInput = page.getByTestId("new-item-min");
const maxInput = page.getByTestId("new-item-max");
check("kolom minimum ada", (await minInput.count()) > 0);
check("kolom maksimum ada", (await maxInput.count()) > 0);
if (await maxInput.count()) {
  check("kolom maksimum bisa diisi", await maxInput.isEnabled());
  await maxInput.fill("120");
  check("nilai maksimum tersimpan di kolom", (await maxInput.inputValue()) === "120");
}

console.log("\n== 4. SIMPAN ITEM DENGAN BATAS MAKSIMUM ==");
const sku = `MAX-${Date.now().toString(36).toUpperCase()}`;
await page.getByTestId("new-item-sku").fill(sku);
await page.getByTestId("new-item-name").fill("Uji Batas Maksimum");
await page.getByTestId("new-item-min").fill("10");
await page.getByTestId("new-item-max").fill("120");
await page.getByTestId("new-item-save").click();
await page.waitForTimeout(4000);

const after = await page.evaluate(async (targetSku) => {
  const res = await fetch(`/api/v1/items/search?q=${encodeURIComponent(targetSku)}`, {
    credentials: "include",
  });
  if (!res.ok) return { status: res.status };
  const json = await res.json();
  const row = json.data?.[0]?.item;
  return { status: res.status, min: row?.minStock, max: row?.maxStock, sku: row?.sku };
}, sku);

check("item tersimpan", after.status === 200 && after.sku === sku, `sku=${after.sku ?? "-"}`);
check("batas minimum tersimpan = 10", after.min === 10, `min=${after.min}`);
check("batas maksimum tersimpan = 120", after.max === 120, `max=${after.max}`);

await browser.close();
console.log(`\n${"-".repeat(52)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
