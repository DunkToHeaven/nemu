#!/usr/bin/env node
/** Kenapa tombol daftar tetap disabled padahal form terisi? */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chromium" });
const page = await (await browser.newContext()).newPage();

const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 200)}`);
});

await page.goto(`${BASE}/signup`, { waitUntil: "load" });
await page.waitForTimeout(1500);

// Isi satu per satu dan periksa status tombol setiap langkah.
const steps = [
  ["signup-org", "Org Cek"],
  ["signup-name", "Nama Cek"],
  ["signup-email", "cek@contoh.com"],
  ["signup-password", "rahasia12345"],
];

for (const [testId, value] of steps) {
  await page.getByTestId(testId).fill(value);
  await page.waitForTimeout(300);
  const disabled = await page.getByTestId("signup-submit").isDisabled();
  console.log(`setelah ${testId.padEnd(18)} -> disabled=${disabled}`);
}

const state = await page.evaluate(() => {
  const get = (id) => document.querySelector(`[data-testid="${id}"]`)?.value ?? null;
  return {
    org: get("signup-org"),
    name: get("signup-name"),
    email: get("signup-email"),
    pwLen: get("signup-password")?.length ?? 0,
  };
});
console.log("nilai DOM:", JSON.stringify(state));
console.log("error:", errs.slice(0, 4).join(" | ") || "tidak ada");

// Apakah tombolnya benar-benar disabled di DOM?
const attrs = await page.getByTestId("signup-submit").evaluate((el) => ({
  disabled: el.disabled,
  hasAttr: el.hasAttribute("disabled"),
  ariaDisabled: el.getAttribute("aria-disabled"),
}));
console.log("atribut tombol:", JSON.stringify(attrs));

await browser.close();
