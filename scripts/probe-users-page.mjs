#!/usr/bin/env node
/** Apa yang sebenarnya terlihat admin baru di menu Pengguna? */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 120)}`);
});
const api = [];
page.on("response", (res) => {
  if (res.url().includes("/api/v1/")) api.push(`${res.status()} ${new URL(res.url()).pathname}`);
});

await page.goto(`${BASE}/signup`, { waitUntil: "load" });
const email = `adm-${Date.now().toString(36)}@uji.local`;
await page.getByTestId("signup-org").fill("Org Admin");
await page.getByTestId("signup-name").fill("Admin Baru");
await page.getByTestId("signup-email").fill(email);
await page.getByTestId("signup-password").fill("rahasia12345");
await page.getByTestId("signup-submit").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

await page.goto(`${BASE}/app/database/pengguna`, { waitUntil: "load" });
await page.waitForTimeout(5000);

console.log("\n== /app/database/pengguna ==");
console.log("url        :", new URL(page.url()).pathname);
console.log("testid add :", await page.getByTestId("add-user").count());
const btns = await page.locator("button").allInnerTexts();
console.log(
  "tombol     :",
  JSON.stringify(
    btns
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 10),
  ),
);
const txt = await page.locator("body").innerText();
console.log("teks awal  :", txt.slice(0, 260).replace(/\n+/g, " | "));
console.log("api        :", api.slice(-8).join(" · ") || "tidak ada");
console.log("error      :", errs.slice(0, 3).join(" | ") || "tidak ada");

// Cek peran yang dilihat klien.
const roleShown = await page.evaluate(() => {
  const el = document.querySelector("[data-role]");
  return el?.getAttribute("data-role") ?? null;
});
console.log("data-role  :", roleShown);

await browser.close();
