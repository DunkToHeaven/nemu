#!/usr/bin/env node
/**
 * Uji keempat keluhan pengguna pada server sungguhan:
 *  1. badge status tidak boleh "Offline" padahal jaringan normal
 *  2. tombol "+ Item baru" harus membuka form dan benar-benar membuat item
 *  3. tombol "Unduh template" harus menghasilkan berkas .xlsx
 *  4. halaman /scan harus menjelaskan kamera butuh HTTPS (bukan "tidak didukung")
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://192.168.100.106:3100";
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

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

// login admin (butuh akses Database)
await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByTestId("input-code").fill("ADM01");
await page.getByTestId("input-pin").fill("2468");
await page.getByTestId("submit-login").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

console.log("\n== 1. BADGE STATUS ==");
await page.waitForTimeout(4000);
const status = page.getByTestId("connection-status").first();
await status.waitFor({ state: "attached", timeout: 15_000 }).catch(() => null);
const state = await status.getAttribute("data-state").catch(() => null);
check("badge status tidak Offline", state === "live" || state === "connecting", `state=${state}`);

console.log("\n== 2. TOMBOL + ITEM BARU ==");
await page.goto(`${BASE}/app/database/items?new=1`, { waitUntil: "load" });
await page.waitForTimeout(1500);
const skuField = page.getByTestId("new-item-sku");
const sheetVisible = await skuField.isVisible().catch(() => false);
check("form buat item terbuka dari ?new=1", sheetVisible);

if (sheetVisible) {
  const sku = `UJI-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await skuField.fill(sku);
  await page.getByTestId("new-item-name").fill("Item Uji Otomatis");
  await page.getByTestId("new-item-min").fill("5");
  await page.getByTestId("new-item-save").click();
  await page.waitForTimeout(2500);

  // Cari item yang baru dibuat — bukti item benar-benar tersimpan.
  await page.goto(`${BASE}/app/database/items?q=${sku}`, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const body = await page.locator("body").innerText();
  check("item baru tersimpan dan muncul di daftar", body.includes(sku), sku);
}

console.log("\n== 3. UNDUH TEMPLATE EXCEL ==");
await page.goto(`${BASE}/app/database/impor`, { waitUntil: "load" });
await page.waitForTimeout(1500);
const downloadPromise = page.waitForEvent("download", { timeout: 25_000 }).catch(() => null);
await page.locator('a[href*="imports/template"]').first().click();
const download = await downloadPromise;
if (download) {
  const name = download.suggestedFilename();
  const path = await download.path();
  const { statSync } = await import("node:fs");
  const size = path ? statSync(path).size : 0;
  check("berkas terunduh", name.endsWith(".xlsx"), name);
  check("berkas tidak kosong", size > 2000, `${size} byte`);
} else {
  check("berkas terunduh", false, "tidak ada event download");
}

console.log("\n== 4. HALAMAN SCAN ==");
await page.goto(`${BASE}/scan`, { waitUntil: "load" });
await page.waitForTimeout(2000);
const scanBody = await page.locator("body").innerText();
const hasInsecure = /HTTPS/i.test(scanBody);
const hasUnsupported = /tidak didukung|not supported/i.test(scanBody);
check("menjelaskan kamera butuh HTTPS", hasInsecure);
check("tidak lagi bilang 'tidak didukung'", !hasUnsupported);
const photo = await page.getByTestId("scan-photo").count();
check("ada jalan alternatif unggah foto", photo > 0);

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await browser.close();
console.log(`\n${"-".repeat(50)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
