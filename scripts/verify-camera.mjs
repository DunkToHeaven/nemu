#!/usr/bin/env node
/**
 * Uji kamera di halaman /scan dengan kamera PALSU (fake device).
 *
 * Dua skenario yang harus dibedakan:
 *  - HTTPS / localhost  -> kamera HARUS benar-benar terbuka (state=running)
 *  - http://<ip-lan>    -> browser memblokir; halaman harus menjelaskan
 *                          bahwa butuh HTTPS, bukan "tidak didukung"
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "https://control-lunch-stevens-matthew.trycloudflare.com";
const secure = BASE.startsWith("https://") || BASE.includes("localhost") || BASE.includes("127.0.0.1");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  OK    ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  GAGAL ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const browser = await chromium.launch({
  channel: "chromium",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({ permissions: ["camera"] });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByTestId("input-code").fill("WRK01");
await page.getByTestId("input-pin").fill("1122");
await page.getByTestId("submit-login").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

await page.goto(`${BASE}/scan`, { waitUntil: "load" });
await page.waitForTimeout(4000);

const video = page.locator("video");
const srcOk = await video.evaluate((el) => {
  const stream = el.srcObject;
  if (!stream) return false;
  const tracks = stream.getVideoTracks();
  return tracks.length > 0 && tracks[0].readyState === "live";
}).catch(() => false);

const body = await page.locator("body").innerText();
const saysHttps = /HTTPS/i.test(body);
const saysUnsupported = /tidak didukung|not supported/i.test(body);

console.log(`\n== KAMERA di ${BASE} ==`);
if (secure) {
  check("kamera benar-benar terbuka (stream live)", srcOk);
  check("tidak menampilkan pesan butuh HTTPS", !saysHttps);
  check("tidak menampilkan 'tidak didukung'", !saysUnsupported);
} else {
  check("menjelaskan butuh HTTPS", saysHttps);
  check("tidak menampilkan 'tidak didukung'", !saysUnsupported);
}

await browser.close();
console.log("\n" + "-".repeat(48));
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
