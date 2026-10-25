#!/usr/bin/env node
/** Cek dashboard: widget needs-count tanpa key duplikat / teks undefined. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";
const browser = await chromium.launch({ channel: "chromium" });
const page = await (await browser.newContext({ locale: "id" })).newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR ${e.message.slice(0, 160)}`));

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
console.log("ada kata 'undefined':", /undefined/i.test(body));
const dupKey = consoleErrors.filter((e) => /same key/i.test(e));
console.log("error key duplikat:", dupKey.length ? dupKey.join(" | ") : "TIDAK ADA");
const other = consoleErrors.filter((e) => !/same key/i.test(e));
console.log("error konsol lain:", other.length ? other.slice(0, 3).join(" | ") : "tidak ada");

// Widget perlu dihitung — tampilkan isinya.
const m = body.match(/Target opname[\s\S]{0,200}/i);
console.log("widget needsCount:", m ? m[0].replace(/\s+/g, " ").slice(0, 160) : "(tidak ketemu)");
await page.screenshot({ path: "dashboard-check.png", fullPage: true });
await browser.close();
