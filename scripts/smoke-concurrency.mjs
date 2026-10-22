#!/usr/bin/env node
/**
 * Uji konkurensi lewat HTTP: 20 pengambilan bersamaan pada stok yang hanya
 * cukup untuk sebagian.
 *
 * Yang dibuktikan: jumlah yang berhasil tidak pernah melebihi stok, dan saldo
 * akhir tidak pernah negatif. Inilah uji yang paling penting untuk WMS —
 * oversell berarti stok fisik dan sistem berbeda.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const QTY_EACH = 2;

async function login(code, pin) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code, pin }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return cookie;
}

async function main() {
  const cookie = await login("WRK01", "1122");

  // Cari item dengan saldo yang cukup untuk sebagian saja dari total permintaan.
  const search = await fetch(`${BASE}/api/v1/items/search?q=&limit=50`, {
    headers: { cookie },
  });
  const body = await search.json();

  const needed = CONCURRENCY * QTY_EACH;
  const target = body.data?.find((row) => {
    const level = row.stock?.[0];
    return level && level.qty > 0 && level.qty < needed;
  });

  if (!target) {
    console.log("  lewati: tidak ada item dengan saldo parsial untuk diuji");
    process.exit(0);
  }

  const itemId = target.item.id;
  const locationId = target.stock[0].locationId;
  const before = target.stock[0].qty;
  const maxSuccess = Math.floor(before / QTY_EACH);

  console.log(
    `\n  item=${target.item.code} saldo_awal=${before} permintaan=${CONCURRENCY}x${QTY_EACH}`,
  );
  console.log(`  maksimum yang boleh berhasil = ${maxSuccess}\n`);

  const stamp = Date.now();
  const attempts = Array.from({ length: CONCURRENCY }, (_, i) =>
    fetch(`${BASE}/api/v1/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        type: "issue",
        itemId,
        locationId,
        qty: QTY_EACH,
        idempotencyKey: `conc-${stamp}-${i}`,
        scanMethod: "manual_code",
      }),
    }).then(async (res) => ({ status: res.status, body: await res.json() })),
  );

  const results = await Promise.all(attempts);
  const ok = results.filter((r) => r.status === 201).length;
  const conflict = results.filter((r) => r.status === 409).length;
  const other = results.length - ok - conflict;

  const after = await fetch(`${BASE}/api/v1/items/by-code/${target.item.code}`, {
    headers: { cookie },
  });
  const afterBody = await after.json();
  const finalQty = afterBody.stock?.find((s) => s.locationId === locationId)?.qty ?? 0;

  console.log(`  berhasil=${ok}  ditolak(409)=${conflict}  lain=${other}`);
  console.log(`  saldo_akhir=${finalQty}`);

  let failures = 0;
  if (ok > maxSuccess) {
    failures += 1;
    console.log(`  GAGAL oversell: ${ok} berhasil, seharusnya maksimum ${maxSuccess}`);
  } else {
    console.log("  OK    tidak ada oversell");
  }

  if (finalQty < 0) {
    failures += 1;
    console.log(`  GAGAL saldo negatif: ${finalQty}`);
  } else {
    console.log("  OK    saldo tidak negatif");
  }

  const expected = before - ok * QTY_EACH;
  if (finalQty !== expected) {
    failures += 1;
    console.log(`  GAGAL saldo tidak konsisten: ${finalQty} != ${expected}`);
  } else {
    console.log("  OK    saldo konsisten dengan jumlah keberhasilan");
  }

  console.log(failures === 0 ? "\n  UJI KONKURENSI LULUS\n" : `\n  ${failures} UJI GAGAL\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("uji gagal:", error);
  process.exit(1);
});
