#!/usr/bin/env node
/**
 * Uji login lewat browser SUNGGUHAN di IP LAN.
 *
 * Ini penting: bug cookie `Secure` hanya muncul saat diakses lewat
 * http://<ip-lan>:3100, bukan lewat localhost. Uji API saja tidak menangkapnya
 * karena curl tetap menerima cookie yang browser tolak.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://192.168.100.106:3100";
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

const ACCOUNTS = [
  ["WRK01", "1122", "/app"],
  ["SPV01", "1357", "/app"],
  ["ADM01", "2468", "/app"],
];

const browser = await chromium.launch({ channel: "chromium" });

console.log(`\n== LOGIN LEWAT BROWSER di ${BASE} ==`);
for (const [code, pin, expected] of ACCOUNTS) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.getByTestId("input-code").fill(code);
  await page.getByTestId("input-pin").fill(pin);
  await page.getByTestId("submit-login").click();

  let landed = false;
  try {
    await page.waitForURL(new RegExp(`${expected}(/|$|\\?)`), { timeout: 25_000 });
    landed = true;
  } catch {
    landed = false;
  }

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "nemu_session");
  check(
    `${code} masuk ke ${expected}`,
    landed,
    landed ? `url ${new URL(page.url()).pathname}` : `tertahan di ${new URL(page.url()).pathname}`,
  );
  check(`${code} cookie sesi tersimpan`, Boolean(session), session ? "ada" : "TIDAK ADA");

  // Muat ulang: bila cookie tidak tersimpan, ini akan memantul ke /login.
  if (landed) {
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1200);
    const stillIn = new URL(page.url()).pathname.startsWith("/app");
    check(`${code} tetap masuk setelah reload`, stillIn, new URL(page.url()).pathname);
    check(`${code} tanpa error runtime`, errors.length === 0, errors[0] ?? "");
  }

  await context.close();
}

console.log("\n== LOGIN SALAH DITOLAK ==");
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.getByTestId("input-code").fill("WRK01");
  await page.getByTestId("input-pin").fill("9999");
  await page.getByTestId("submit-login").click();
  await page.waitForTimeout(2500);
  const stayed = new URL(page.url()).pathname.includes("/login");
  const cookies = await context.cookies();
  check("PIN salah tidak masuk", stayed, new URL(page.url()).pathname);
  check("PIN salah tidak membuat sesi", !cookies.some((c) => c.name === "nemu_session"));
  await context.close();
}

await browser.close();
console.log(`\n${"-".repeat(48)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
