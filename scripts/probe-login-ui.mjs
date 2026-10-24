#!/usr/bin/env node
/** Diagnosis login UI lewat tunnel: kenapa "selalu salah pw". */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "https://operated-harmony-retrieved-worship.trycloudflare.com";
const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errs = [];
page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 160)}`));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`);
});
page.on("response", (r) => {
  if (r.url().includes("/api/v1/auth")) {
    console.log(`  RESP ${r.status()} ${r.url().replace(BASE, "")}`);
  }
});

// Persis URL yang dilaporkan pengguna.
await page.goto(`${BASE}/login?next=%2Flogin`, { waitUntil: "load" });
await page.waitForTimeout(2500);

console.log("url:", page.url());
console.log("judul:", await page.title());

// Isi form login email+sandi.
const hasEmailTab = await page.getByTestId("tab-email").count();
console.log("tab email ada:", hasEmailTab);

if (hasEmailTab) {
  await page.getByTestId("tab-email").click();
  await page.waitForTimeout(400);
}
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.waitForTimeout(300);
await page.getByTestId("submit-login-email").click();
await page.waitForTimeout(6000);

console.log("url setelah login:", page.url());
const body = await page.locator("body").innerText();
const alert = await page.locator('[role="alert"]').allInnerTexts();
console.log("alert:", JSON.stringify(alert.slice(0, 3)));
console.log("ada teks 'salah':", /salah|invalid|gagal/i.test(body));
console.log("cuplikan:", body.replace(/\s+/g, " ").slice(0, 200));

// Apakah cookie sesi terpasang?
const cookies = await ctx.cookies();
console.log(
  "cookie:",
  cookies.map((c) => `${c.name}=${c.value.slice(0, 8)}… domain=${c.domain}`).join(", ") ||
    "(tidak ada)",
);
console.log("error:", errs.slice(0, 4).join(" | ") || "tidak ada");

await browser.close();
