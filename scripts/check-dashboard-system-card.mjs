#!/usr/bin/env node
/** Dashboard: card Status sistem hilang, tidak ada error konsol baru. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";
const browser = await chromium.launch({ channel: "chromium" });
const page = await (await browser.newContext({ locale: "id" })).newPage();
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
page.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message.slice(0, 160)}`));

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

await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
const body = await page.evaluate(() => document.body.innerText);
const has = (re) => re.test(body);
console.log("ada 'Status sistem':", has(/status sistem/i));
console.log("ada 'Sinkron Sheets':", has(/sheets/i));
console.log("ada 'Daftar periksa setup':", has(/daftar periksa/i));
console.log("widget lain masih ada:", has(/perlu dihitung/i), "|", has(/stok menipis|menipis/i));
console.log(
  "error konsol:",
  errs.filter((e) => !/401|404/.test(e)).join(" | ") || "bersih",
);
await page.screenshot({ path: "dashboard-no-system.png", fullPage: true });
await browser.close();
