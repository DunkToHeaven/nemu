/**
 * Verifikasi alur "sesi habis" pada server berjalan (default :3100).
 *
 * Memotret langsung skenario bug user:
 *  1. login → cookie sesi sah, /app terbuka (200);
 *  2. sesi DICABUT di DB (cookie basi) → /app dan /app/item/… harus
 *     dialihkan ke BERANDA "/" tanpa `next` (bukan /login?next=… yang
 *     memicu loop sesi habis);
 *  3. tamu murni tanpa cookie → tetap wajar ke /login?next=…;
 *  4. logout endpoint membersihkan cookie.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const base = process.env.CHECK_BASE ?? "http://localhost:3100";

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
  ok ? pass++ : fail++;
};

async function get(path, cookie) {
  const r = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: r.status, location: r.headers.get("location") ?? "" };
}

// 1. login lewat API (email) — ambil cookie mentah dari Set-Cookie.
const loginRes = await fetch(`${base}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
if (loginRes.status !== 200) {
  console.log("login gagal:", loginRes.status, (await loginRes.text()).slice(0, 200));
}
const setCookie = loginRes.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";")[0] ?? "";
check("login API mengembalikan cookie nemu_session", cookie.startsWith("nemu_session="), cookie.slice(0, 30));

const sessionId = cookie.replace("nemu_session=", "");
const okPage = await get("/app", cookie);
check("sesi sah: /app tidak dialihkan", okPage.status === 200, `status ${okPage.status}`);

// 2. cabut sesi di DB → cookie jadi basi persis seperti "sesi habis".
await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}`;
const stale = await get("/app", cookie);
check(
  "sesi basi: /app → beranda TANPA next",
  stale.location === "/",
  `status ${stale.status} location=${stale.location || "(none)"}`,
);

const itemPath = "/app/item/itm_4031a5e7";
const staleItem = await get(itemPath, cookie);
check(
  "sesi basi: /app/item/… → beranda TANPA next (repro URL user)",
  staleItem.location === "/",
  `status ${staleItem.status} location=${staleItem.location || "(none)"}`,
);

// 3. tamu murni (tanpa cookie) → /login?next=… tetap OK.
const guest = await get("/app/opname", null);
check(
  "tulen tanpa cookie: → /login dengan next (perilaku lama dipertahankan)",
  guest.location.includes("/login") && guest.location.includes("next="),
  `status ${guest.status} location=${guest.location}`,
);

// 4. logout membersihkan cookie.
const outRes = await fetch(`${base}/api/v1/auth/logout`, {
  method: "POST",
  headers: { cookie },
});
const outSet = outRes.headers.get("set-cookie") ?? "";
check("logout menyetel cookie kosong", /nemu_session=;/.test(outSet), outSet.slice(0, 40));

await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
await sql.end();

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
