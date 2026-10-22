#!/usr/bin/env node
/**
 * Periksa apa yang benar-benar dilihat admin di tiap tab Database.
 *
 * Keluhan: "di lokasi, kategori, alasan, mesin, pengguna tidak ada tombol
 * tambah". Perlu dipastikan apakah tombolnya tidak dirender, atau dirender
 * tetapi tidak terlihat/berfungsi.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "https://control-lunch-stevens-matthew.trycloudflare.com";
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext();
const page = await context.newPage();

const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`);
});

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByTestId("input-code").fill("ADM01");
await page.getByTestId("input-pin").fill("2468");
await page.getByTestId("submit-login").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

const TABS = [
  ["lokasi", "/app/database/lokasi"],
  ["kategori", "/app/database/kategori"],
  ["alasan", "/app/database/alasan"],
  ["mesin", "/app/database/mesin"],
  ["pengguna", "/app/database/pengguna"],
];

for (const [name, path] of TABS) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  const buttons = await page.locator("button").allInnerTexts();
  const inputs = await page.locator("input").count();
  const h1 = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => null);
  const hasPlus = await page.locator("button:has(svg)").count();

  console.log(`\n== ${name} (${path}) ==`);
  console.log(`  h1        : ${JSON.stringify(h1)}`);
  console.log(`  input     : ${inputs}`);
  console.log(
    `  tombol    : ${JSON.stringify(
      buttons
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 8),
    )}`,
  );
  console.log(`  tombol+svg: ${hasPlus}`);
}

console.log(`\npageerror: ${errs.slice(0, 4).join(" | ") || "tidak ada"}`);
await browser.close();
