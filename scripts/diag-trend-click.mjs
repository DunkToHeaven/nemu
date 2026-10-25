#!/usr/bin/env node
/** Diagnosa: kotak hitam sekeliling card tren saat diklik — cari activeElement + style outline. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3100";
const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ locale: "id" });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 6; i++) {
  await page.getByTestId("tab-email").click();
  await page.waitForTimeout(900);
  if ((await page.getByTestId("input-email").count()) > 0) break;
}
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

for (const [label, path] of [
  ["dashboard", "/app"],
  ["laporan", "/app/laporan"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("trend-chart").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const card = page.locator("section", { hasText: /tren/i }).first();
  if ((await card.count()) === 0) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
    console.log(`${label}: card tren TIDAK DITEMUKAN. body:`, body.split("\n").slice(0, 12).join(" | "));
    continue;
  }
  // Klik di TENGAH grafik (daerah plot), bukan sudut card.
  const chart = page.getByTestId("trend-chart");
  await chart.click({ position: { x: 300, y: 90 } });
  await page.waitForTimeout(400);
  const focusables = await page.evaluate(() => {
    const sec = [...document.querySelectorAll("section")].find((x) => /tren/i.test(x.getAttribute("aria-label") ?? ""));
    if (!sec) return [];
    return [...sec.querySelectorAll("[tabindex]")]
      .map((el) => `${el.tagName}.${(el.getAttribute("class") ?? "").slice(0, 40)} tabindex=${el.getAttribute("tabindex")}`)
      .slice(0, 8);
  });
  console.log(`${label}: elemen difokuskan-dalam-card =`, JSON.stringify(focusables));
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "body" };
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      cls: (el.getAttribute("class") ?? "").slice(0, 120),
      tabindex: el.getAttribute("tabindex"),
      outline: cs.outline,
      boxShadow: cs.boxShadow.slice(0, 120),
      parent: el.parentElement?.tagName ?? null,
      parentCls: (el.parentElement?.getAttribute("class") ?? "").slice(0, 120),
    };
  });
  console.log(`${label}:`, JSON.stringify(info, null, 1));
  await page.screenshot({ path: `trend-click-${label}.png` });
}
await browser.close();
