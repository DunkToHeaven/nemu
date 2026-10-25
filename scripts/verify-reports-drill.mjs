#!/usr/bin/env node
/** Drill-down laporan: klik card -> sheet berisi item/transaksi yang bersangkutan. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "OK   " : "GAGAL"} ${n}${d ? `  (${d})` : ""}`); };

const browser = await chromium.launch({ channel: "chromium" });
const page = await (await browser.newContext({ locale: "id" })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
page.on("console", (m) => m.type() === "error" && errs.push("CONSOLE " + m.text().slice(0, 140)));

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("tab-email").waitFor({ state: "visible", timeout: 60_000 });
for (let i = 0; i < 6; i++) {
  await page.getByTestId("tab-email").click();
  await page.waitForTimeout(1000);
  if ((await page.getByTestId("input-email").count()) > 0) break;
}
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

console.log("\n== HALAMAN LAPORAN ==");
await page.goto(`${BASE}/app/laporan`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="drill-card-belowMin"]', { timeout: 60_000 });
check("halaman terbuka", (await page.locator('[data-testid="drill-card-belowMin"]').count()) > 0);

console.log("\n== KLIK KARTU BAWAH MINIMUM ==");
await page.getByTestId("drill-card-belowMin").click();
await page.waitForTimeout(4000);
let sheet = page.locator('[data-testid="drill-items"]');
check("sheet item muncul", (await sheet.count()) > 0);
let rows = await sheet.locator("li").count();
check("daftar item terisi", rows > 0, `${rows} item`);
const firstItem = await sheet.locator("li").first().innerText();
console.log(`   isi: ${firstItem.replace(/\s+/g, " ").slice(0, 90)}`);
// Baris harus menautkan ke halaman item.
const href = await sheet.locator("a").first().getAttribute("href");
check("baris menaut ke halaman item", Boolean(href?.startsWith("/app/item/")), href ?? "");
await page.keyboard.press("Escape");
await page.waitForTimeout(800);

console.log("\n== KLIK KARTO BELUM PERNAH DIHITUNG ==");
await page.getByTestId("drill-card-neverCounted").click();
await page.waitForTimeout(4000);
check("sheet muncul lagi", (await page.locator('[data-testid="drill-items"]').count()) > 0);
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

console.log("\n== KLIK BARIS PERINGKAT (KARYAWAN) ==");
const userRow = page.locator('[data-testid^="drill-row-byUser-"]').first();
check("baris peringkat karyawan bisa diklik", (await userRow.count()) > 0);
if (await userRow.count()) {
  await userRow.click();
  await page.waitForTimeout(4000);
  const txList = page.locator('[data-testid="drill-tx"]');
  check("sheet transaksi muncul", (await txList.count()) > 0);
  if (await txList.count()) {
    const n = await txList.locator("li").count();
    check("transaksi terisi", n > 0, `${n} transaksi`);
    console.log(`   isi: ${(await txList.locator("li").first().innerText()).replace(/\s+/g, " ").slice(0, 90)}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}

console.log("\n== KLIK BUCKET KEYAKINAN ==");
const conf = page.locator('[data-testid="drill-confidence-never"]').first();
if (await conf.count()) {
  await conf.click();
  await page.waitForTimeout(4000);
  const items = page.locator('[data-testid="drill-items"]');
  check("bucket keyakinan membuka daftar item", (await items.count()) > 0);
  await page.keyboard.press("Escape");
}

console.log("\n== BARIS PERLU DIHITUNG & STOK MATI ==");
await page.waitForTimeout(500);
const needs = page.locator('[data-testid^="drill-needs-"]').first();
if (await needs.count()) {
  check("perlu dihitung -> link item", (await needs.getAttribute("href"))?.startsWith("/app/item/"));
} else {
  console.log("   (tidak ada baris perlu dihitung — kosong)");
}

console.log("\nerror:", errs.slice(0, 4).join(" | ") || "tidak ada");
await page.screenshot({ path: "reports-drill.png" });
await browser.close();
console.log(`\n${"-".repeat(46)}\n  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
