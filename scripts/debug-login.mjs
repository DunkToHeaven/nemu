
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ baseURL: BASE });
const counts = new Map();
page.on("response", (r) => {
  if (r.status() >= 400) {
    const key = `${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
});
page.on("pageerror", (e) => console.log("PE:", (e.stack ?? e.message).slice(0, 800)));
await page.goto("/login", { waitUntil: "load" });
await page.waitForTimeout(4000);
console.log("FAILING REQUESTS:");
for (const [k, v] of counts) console.log("  ", v, "x", k);
const hydrated = await page.evaluate(() => Object.keys(document.body).some((k) => k.includes("react")));
console.log("hydrated:", hydrated);
await page.getByTestId("input-code").fill("WRK01");
await page.getByTestId("input-pin").fill("1122");
await page.getByTestId("submit-login").click();
await page.waitForTimeout(4000);
console.log("URL after submit:", page.url());
await browser.close();
