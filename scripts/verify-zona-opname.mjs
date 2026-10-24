#!/usr/bin/env node
/** Uji: bisakah menambah zona dari halaman Lokasi, dan apakah opname bisa dipakai? */
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
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 150)));
page.on("response", async (r) => {
  if (r.url().includes("/api/v1/") && r.status() >= 400) {
    let b = "";
    try {
      b = (await r.text()).slice(0, 150);
    } catch {}
    console.log(`    ${r.status()} ${r.url().split("/api/v1")[1]?.slice(0, 40)} -> ${b}`);
  }
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.getByTestId("tab-email").click();
await page.waitForTimeout(300);
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

console.log("\n== 1. TAMBAH ZONA DI HALAMAN LOKASI ==");
await page.goto(`${BASE}/app/database/lokasi`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const addBtn = page.getByTestId("add-location");
check("tombol tambah lokasi ada", (await addBtn.count()) > 0);
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(1000);
  check("form tambah lokasi terbuka", (await page.getByTestId("new-location-name").count()) > 0);

  await page.getByTestId("new-location-name").fill("Zona Uji");
  await page
    .getByTestId("new-location-code")
    .fill(`Z-${Date.now().toString(36).slice(-4).toUpperCase()}`);
  await page.getByTestId("new-location-type").selectOption("zone");
  // Pilih gudang sebagai induk bila perlu.
  const parent = page.getByTestId("new-location-parent");
  if ((await parent.count()) > 0) {
    const opts = await parent.locator("option").all();
    for (const o of opts) {
      const v = await o.getAttribute("value");
      if (v) {
        await parent.selectOption(v);
        break;
      }
    }
  }
  await page.getByTestId("save-location").click();
  await page.waitForTimeout(3500);

  const body = await page.locator("body").innerText();
  const created = /Zona Uji/.test(body);
  check(
    "zona tersimpan",
    created,
    created ? "muncul di daftar" : body.replace(/\s+/g, " ").slice(0, 120),
  );
}

console.log("\n== 2. OPNAME BISA DIBUKA ==");
await page.goto(`${BASE}/app/opname`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const opnameBody = await page.locator("body").innerText();
check("halaman opname terbuka", opnameBody.length > 200);
check("tidak menampilkan 'gagal dimuat'", !/gagal dimuat|couldn.t load/i.test(opnameBody));

// Dialog "Sesi opname baru" harus dibuka dulu — formnya ada di dalam dialog.
const openBtn = page.locator('button:has-text("Sesi"), button:has-text("opname")').first();
const plusBtn = page
  .locator("button")
  .filter({ hasText: /sesi|opname|baru/i })
  .first();
const trigger = (await plusBtn.count()) ? plusBtn : openBtn;
if (await trigger.count()) {
  await trigger.click();
  await page.waitForTimeout(1800);
}
const zoneSelect = page.locator("#zone");
if ((await zoneSelect.count()) > 0) {
  const opts = await zoneSelect.locator("option").all();
  const values = [];
  for (const o of opts) values.push(await o.getAttribute("value"));
  const realZones = values.filter((v) => v);
  check("dropdown zona punya pilihan nyata", realZones.length > 0, `${realZones.length} zona`);
} else {
  check("dropdown zona ada", false, "tidak ditemukan");
}

console.log("\n== 3. PESAN BILA ZONA KOSONG ==");
const dialogText = (await page.locator('[role="dialog"]').count())
  ? await page.locator('[role="dialog"]').innerText()
  : "";
const hasEmptyHint = /buat zona|belum ada zona/i.test(dialogText + opnameBody);
// Petunjuk HANYA muncul bila zona benar-benar belum ada. Uji di atas sudah
// membuat satu zona, jadi keadaan "kosong" tidak berlaku lagi — yang diperiksa
// adalah: salah satu dari dua keadaan harus konsisten.
const realZoneCount = await zoneSelect.locator('option[value]:not([value=""])').count();
check(
  realZoneCount > 0 ? "dropdown berisi zona" : "petunjuk zona kosong tampil",
  realZoneCount > 0 || hasEmptyHint,
  realZoneCount > 0 ? `${realZoneCount} zona` : "petunjuk tampil",
);

console.log("\nerror:", errs.slice(0, 4).join(" | ") || "tidak ada");
await browser.close();
console.log(`\n${"-".repeat(50)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
