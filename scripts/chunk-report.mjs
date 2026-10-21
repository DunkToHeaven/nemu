
import { gzipSync } from "node:zlib";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code: "ADM01", pin: "2468" }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

const FRAMEWORK = [/core-js|corejs/, /react-dom/, /react\.development|react\.production/, /next\/dist/, /appBootstrap/, /turbopack/];

function classify(name, text) {
  if (FRAMEWORK.some((re) => re.test(name))) return "framework";
  const head = text.slice(0, 2000);
  if (/core-js|polyfill/i.test(head)) return "framework";
  if (/react-dom|appBootstrap|addBasePath|next\/dist\/client/i.test(head)) return "framework";
  return "app";
}

const cookie = await login();
for (const path of ["/", "/i/BEA-0001"]) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const html = await res.text();
  const sources = [...new Set([...html.matchAll(/<script[^>]+src="([^"]*\/_next\/static\/chunks\/[^"]+)"/g)].map((m) => m[1]))];
  let fw = 0;
  let app = 0;
  const rows = [];
  for (const src of sources) {
    const asset = await fetch(`${BASE}${src}`);
    const buf = Buffer.from(await asset.arrayBuffer());
    const gz = gzipSync(buf).length / 1024;
    const kind = classify(src, buf.toString("utf8", 0, 4000));
    if (kind === "framework") fw += gz; else app += gz;
    rows.push({ kind, gz, src: src.split("/").pop() });
  }
  rows.sort((a, b) => b.gz - a.gz);
  console.log(`\n=== ${path} — ${sources.length} chunks ===`);
  for (const r of rows.slice(0, 10)) console.log(`${r.gz.toFixed(1).padStart(7)} KB  ${r.kind.padEnd(9)} ${r.src}`);
  console.log(`framework: ${fw.toFixed(1)} KB | app: ${app.toFixed(1)} KB | total: ${(fw + app).toFixed(1)} KB`);
}
