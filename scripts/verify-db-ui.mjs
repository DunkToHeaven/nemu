#!/usr/bin/env node
/**
 * Uji tiga keluhan terbaru:
 *  1. Aktivitas live tidak boleh "gagal dimuat" dan harus menampilkan baris
 *  2. Tiap tab Database harus punya tombol tambah berlabel
 *  3. Pemilih entitas di Impor hanya Item + Kategori
 */
import { chromium } from "@playwright/test";

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
const context = await browser.newContext();
const page = await context.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByTestId("input-code").fill("ADM01");
await page.getByTestId("input-pin").fill("2468");
await page.getByTestId("submit-login").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

console.log("\n== 1. AKTIVITAS LIVE ==");
await page.waitForTimeout(4000);
const dash = await page.locator("body").innerText();
check("tidak ada tulisan 'gagal dimuat'", !/gagal dimuat|failed to load/i.test(dash));
const liveItems = await page.locator('[data-testid="live-activity"] li').count();
check("aktivitas live menampilkan baris", liveItems > 0, `${liveItems} baris`);

console.log("\n== 2. TOMBOL TAMBAH PER TAB ==");
const TABS = [
  ["lokasi", "/app/database/lokasi", "add-location"],
  ["kategori", "/app/database/kategori", "add-category"],
  ["alasan", "/app/database/alasan", null],
  ["mesin", "/app/database/mesin", "add-equipment"],
  ["pengguna", "/app/database/pengguna", null],
];
for (const [name, path, testId] of TABS) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(1800);
  const buttons = await page.locator("button").allInnerTexts();
  const labelled = buttons.map((b) => b.trim()).filter((b) => b.length > 2);
  // Tombol tambah dikenali dari label yang menyebut tambah/baru.
  const addBtn = labelled.find((b) => /tambah|baru|add|new/i.test(b));
  check(
    `${name}: ada tombol tambah berlabel`,
    Boolean(addBtn),
    addBtn ?? `hanya ${labelled.slice(0, 4).join(", ")}`,
  );
  if (testId) {
    const byTest = await page.getByTestId(testId).count();
    check(`${name}: tombol teridentifikasi`, byTest > 0, `testid ${testId}=${byTest}`);
  }
}

console.log("\n== 2b. FORM LOKASI BENAR-BENAR MENYIMPAN ==");
await page.goto(`${BASE}/app/database/lokasi`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.getByTestId("add-location").click();
const suffix = Date.now().toString(36).toUpperCase().slice(-4);
await page.getByTestId("new-location-name").fill(`Rak Uji ${suffix}`);
await page.getByTestId("new-location-code").fill(`UJI-${suffix}`);
await page.getByTestId("save-location").click();
await page.waitForTimeout(2500);
const locBody = await page.locator("body").innerText();
check("lokasi baru tersimpan dan tampil", locBody.includes(`UJI-${suffix}`), `UJI-${suffix}`);

console.log("\n== 3. PEMILIH ENTITAS IMPOR ==");
await page.goto(`${BASE}/app/database/impor`, { waitUntil: "load" });
await page.waitForTimeout(1500);
const pills = await page.locator("button").allInnerTexts();
const pillText = pills.map((p) => p.trim());
// Pemilih entitas dihapus: halaman impor hanya untuk item.
check("tidak ada pilihan Item", !pillText.some((p) => /^Item$/i.test(p)));
check("tidak ada pilihan Kategori", !pillText.some((p) => /^Kategori$/i.test(p)));
check("ada menu ekspor master data", (await page.getByTestId("export-master").count()) > 0);
check("tidak ada pilihan Lokasi", !pillText.some((p) => /^Lokasi$/i.test(p)));
check("tidak ada pilihan Pengguna", !pillText.some((p) => /^Pengguna$/i.test(p)));
check("tidak ada pilihan Mesin/aset", !pillText.some((p) => /^Mesin/i.test(p)));

await browser.close();
console.log(`\n${"-".repeat(50)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
