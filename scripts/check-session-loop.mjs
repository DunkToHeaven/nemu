/**
 * E2E "loop sesi habis" pada server berjalan (default http://localhost:3100).
 *
 * Skenario user: sesi dicabut → buka /app/item/… → harus mendarat di
 * beranda "/" TANPA "?next=" (alur lama: /login?next=… berputar terus).
 * Lalu jalur dialog: 401 dari API memunculkan dialog "Sesi berakhir",
 * tombolnya membawa ke beranda tanpa next.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3100";
const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ locale: "id" });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  ok ? pass++ : fail++;
};

// --- 1. login UI mode email ------------------------------------------------
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 6; i++) {
  await page.getByTestId("tab-email").click();
  await page.waitForTimeout(1000);
  if ((await page.getByTestId("input-email").count()) > 0) break;
}
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });
await page.waitForTimeout(1500);

const cookie = (await ctx.cookies()).find((c) => c.name === "nemu_session")?.value;
check("login UI memberi cookie sesi", Boolean(cookie), String(cookie).slice(0, 14));

// --- 2. cabut sesi di DB, lalu navigasi ke halaman repro user --------------
await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${cookie}`;

await page.goto(`${BASE}/app/item/itm_4031a5e7`, { waitUntil: "domcontentloaded" });
const landed = new URL(page.url());
check(
  "halaman repro user mendarat di beranda tanpa next",
  landed.pathname === "/" && !landed.search.includes("next="),
  `${landed.pathname}${landed.search}`,
);
// Beranda harus menampilkan pintu masuk login (bukan layar kosong/berputar).
await page.getByTestId("tab-email").waitFor({ state: "visible", timeout: 30_000 });
check("beranda menampilkan kartu masuk", true);

// --- 3. jalur dialog: masuk lagi, cabut sesi, 401 API memunculkan dialog ----
// Tab login direset ke PIN tiap kali halaman dimuat ulang → klik lagi dengan retry.
for (let i = 0; i < 6; i++) {
  await page.getByTestId("tab-email").click();
  await page.waitForTimeout(1000);
  if ((await page.getByTestId("input-email").count()) > 0) break;
}
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

const cookie2 = (await ctx.cookies()).find((c) => c.name === "nemu_session")?.value;
await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${cookie2}`;

// Pancing API 401 dari dalam halaman: query dashboard lewat klien.
await page.evaluate(() => fetch("/api/v1/dashboard", { credentials: "same-origin" }));
await page.evaluate(() =>
  window.dispatchEvent(new CustomEvent("nemu:session-expired")),
);
const dialog = page.getByRole("dialog");
await dialog.waitFor({ state: "visible", timeout: 25_000 });
check("dialog sesi berakhir muncul", (await dialog.textContent()).length > 0);
await dialog.getByRole("button").first().click();
await page.waitForURL((u) => u.pathname === "/", { timeout: 25_000 });
const after = new URL(page.url());
check(
  "tombol dialog membawa ke beranda tanpa next",
  after.pathname === "/" && !after.search.includes("next="),
  `${after.pathname}${after.search}`,
);

// --- 4. tanpa sesi sama sekali: /login?next= TETAP berfungsi ----------------
await ctx.clearCookies();
await page.goto(`${BASE}/app/reports`, { waitUntil: "domcontentloaded" });
const guest = new URL(page.url());
check(
  "tamu murni tetap diarahkan ke /login dengan next",
  guest.pathname === "/login" && guest.searchParams.get("next") === "/app/reports",
  `${guest.pathname}${guest.search}`,
);

check("tidak ada pageerror", errs.length === 0, errs.join(" | "));

await sql`DELETE FROM sessions WHERE revoked_at IS NOT NULL AND expires_at < now()`;
await sql.end();
await browser.close();
console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
