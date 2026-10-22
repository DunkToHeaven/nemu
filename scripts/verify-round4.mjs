#!/usr/bin/env node
/**
 * Uji empat perbaikan terbaru:
 *  1. Badge status tidak boleh berputar "Menyambung" selamanya
 *  2. Tombol tambah di kategori/alasan/mesin/pengguna bisa DIKLIK
 *  3. Halaman impor tidak lagi punya pemilih entitas
 *  4. Ada menu ekspor master data yang menghasilkan .xlsx
 */
import { chromium } from "@playwright/test";
import { statSync } from "node:fs";

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

const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByTestId("input-code").fill("ADM01");
await page.getByTestId("input-pin").fill("2468");
await page.getByTestId("submit-login").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

console.log(`\n== 1. BADGE STATUS (${BASE}) ==`);
// Beri waktu melewati batas handshake 6 detik.
await page.waitForTimeout(9000);
const badge = page.getByTestId("connection-status").first();
const state = await badge.getAttribute("data-state").catch(() => null);
const label = (await badge.innerText().catch(() => "")).trim();
check("tidak berputar di 'Menyambung' selamanya", state !== "connecting", `state=${state}, label="${label}"`);
check("menampilkan status akhir yang jelas", ["live", "polling"].includes(state ?? ""), state ?? "-");

console.log("\n== 2. TOMBOL TAMBAH BISA DIKLIK ==");
const TABS = [
  ["kategori", "/app/database/kategori", "add-category", "add-category"],
  ["alasan", "/app/database/alasan", "add-reason", null],
  ["mesin", "/app/database/mesin", "add-equipment", null],
  ["pengguna", "/app/database/pengguna", "add-user", null],
];
for (const [name, path, testId, extra] of TABS) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const btn = page.getByTestId(testId).first();
  const disabled = await btn.isDisabled().catch(() => null);
  check(`${name}: tombol ada dan TIDAK disabled`, disabled === false, `disabled=${disabled}`);

  // Klik tanpa mengisi apa pun: harus muncul pesan, bukan diam.
  await btn.click({ timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(1200);
  const body = await page.locator("body").innerText();
  check(`${name}: klik memberi umpan balik`, /wajib|required|isi/i.test(body), "");
}

console.log("\n== 3. IMPOR TANPA PEMILIH ENTITAS ==");
await page.goto(`${BASE}/app/database/impor`, { waitUntil: "load" });
await page.waitForTimeout(1500);
const pills = (await page.locator("button").allInnerTexts()).map((t) => t.trim());
check("tidak ada tombol pilihan 'Item'", !pills.some((p) => /^Item$/i.test(p)));
check("tidak ada tombol pilihan 'Kategori'", !pills.some((p) => /^Kategori$/i.test(p)));

console.log("\n== 4. EKSPOR MASTER DATA ==");
const dl = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
await page.getByTestId("export-master").first().click();
const download = await dl;
if (download) {
  const name = download.suggestedFilename();
  const path = await download.path();
  const size = path ? statSync(path).size : 0;
  check("berkas ekspor terunduh", name.endsWith(".xlsx"), name);
  check("berkas ekspor tidak kosong", size > 3000, `${size} byte`);
} else {
  check("berkas ekspor terunduh", false, "tidak ada event download");
}

await browser.close();
console.log(`\n${"-".repeat(50)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
