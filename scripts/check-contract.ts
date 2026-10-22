/**
 * Uji parse respons API terhadap skema klien — persis seperti yang dilakukan
 * `src/lib/api/client.ts`. Ini menangkap ketidakcocokan kontrak lebih cepat
 * daripada menebak dari pesan "Gagal memuat item" di UI.
 */
import { itemDetailSchema, searchResponseSchema } from "@/lib/api/schemas";

const BASE = "http://127.0.0.1:3100";

async function main() {
  const login = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code: "WRK01", pin: "1122" }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const search = await fetch(`${BASE}/api/v1/items/search?q=bearing&limit=3`, {
    headers: { cookie },
  });
  const searchJson = await search.json();
  const s = searchResponseSchema.safeParse(searchJson);
  console.log("search parse:", s.success ? "OK" : "GAGAL");
  if (!s.success) console.log(JSON.stringify(s.error.issues.slice(0, 4), null, 1));

  const code = searchJson?.data?.[0]?.item?.code;
  const detail = await fetch(`${BASE}/api/v1/items/by-code/${code}`, { headers: { cookie } });
  const detailJson = await detail.json();
  const d = itemDetailSchema.safeParse(detailJson);
  console.log("detail parse:", d.success ? "OK" : "GAGAL");
  if (!d.success) console.log(JSON.stringify(d.error.issues.slice(0, 6), null, 1));
}

main();
