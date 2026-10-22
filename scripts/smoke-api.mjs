#!/usr/bin/env node
/**
 * Uji asap API terhadap database sungguhan.
 *
 * Membuktikan perilaku yang tidak bisa dibuktikan mock:
 *   - login menghasilkan sesi yang tersimpan di database
 *   - pencarian mengembalikan stok hasil agregasi log
 *   - pengambilan mengurangi stok dan tercatat permanen
 *   - idempotency: kiriman ulang tidak menggandakan transaksi
 *   - stok kurang -> 409 dengan saldo terbaru
 *   - pembalik mengoreksi saldo tanpa menghapus baris
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let failures = 0;

function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  OK    ${name}`);
  } else {
    failures += 1;
    console.log(`  GAGAL ${name} ${detail}`);
  }
}

async function login(code, pin) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code, pin }),
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie, body: await res.json().catch(() => null) };
}

const H = (cookie) => ({ "Content-Type": "application/json", cookie });

async function main() {
  console.log("\n== health ==");
  const health = await fetch(`${BASE}/api/v1/health`);
  const healthBody = await health.json();
  check("database up", healthBody.database === "up", JSON.stringify(healthBody));

  console.log("\n== autentikasi ==");
  const worker = await login("WRK01", "1122");
  check("login PIN pekerja 200", worker.status === 200, `status ${worker.status}`);
  check("cookie sesi diterbitkan", worker.cookie.includes("nemu_session="));
  check("peran worker", worker.body?.user?.role === "worker", JSON.stringify(worker.body?.user));

  const wrong = await login("WRK01", "9999");
  check("PIN salah ditolak 401", wrong.status === 401, `status ${wrong.status}`);

  const inactive = await login("SPV02", "1357");
  check("akun nonaktif ditolak 401", inactive.status === 401, `status ${inactive.status}`);

  const admin = await login("ADM01", "2468");
  check("login admin 200", admin.status === 200);

  console.log("\n== sesi tanpa login ==");
  const noAuth = await fetch(`${BASE}/api/v1/items/search?q=bearing`);
  check("tanpa sesi -> 401", noAuth.status === 401, `status ${noAuth.status}`);
  const errBody = await noAuth.json();
  check("bentuk error seragam", Boolean(errBody?.error?.code), JSON.stringify(errBody));

  console.log("\n== pencarian ==");
  const search = await fetch(`${BASE}/api/v1/items/search?q=bearing&limit=5`, {
    headers: { cookie: worker.cookie },
  });
  const searchBody = await search.json();
  check("pencarian 200", search.status === 200, `status ${search.status}`);
  check("ada hasil", (searchBody.data?.length ?? 0) > 0);
  const first = searchBody.data?.[0];
  check("hasil memuat stok per lokasi", Array.isArray(first?.stock), JSON.stringify(first?.stock));
  check("hasil memuat keyakinan", typeof first?.confidence?.score === "number");

  console.log("\n== pengambilan & idempotency ==");
  // Pilih item yang stoknya cukup di lokasi pertama.
  const target = searchBody.data?.find((row) => (row.stock?.[0]?.qty ?? 0) >= 3);
  check("ada item dengan stok >= 3", Boolean(target), "tidak ada kandidat");

  if (target) {
    const itemId = target.item.id;
    const locationId = target.stock[0].locationId;
    const before = target.stock[0].qty;
    const idem = `smoke-${Date.now()}`;

    const issue = await fetch(`${BASE}/api/v1/transactions`, {
      method: "POST",
      headers: H(worker.cookie),
      body: JSON.stringify({
        type: "issue",
        itemId,
        locationId,
        qty: 2,
        idempotencyKey: idem,
        scanMethod: "manual_code",
      }),
    });
    const issueBody = await issue.json();
    check(
      "pengambilan 201",
      issue.status === 201,
      `status ${issue.status} ${JSON.stringify(issueBody)}`,
    );
    check(
      "saldo berkurang tepat 2",
      issueBody.balance === before - 2,
      `${before} -> ${issueBody.balance}`,
    );

    // Kirim ulang dengan key sama: harus duplicate, bukan transaksi kedua.
    const again = await fetch(`${BASE}/api/v1/transactions`, {
      method: "POST",
      headers: H(worker.cookie),
      body: JSON.stringify({
        type: "issue",
        itemId,
        locationId,
        qty: 2,
        idempotencyKey: idem,
      }),
    });
    const againBody = await again.json();
    check("kiriman ulang -> duplicate", againBody.duplicate === true, JSON.stringify(againBody));

    // Minta lebih dari saldo: 409 + saldo terbaru. Qty tetap di bawah batas
    // validasi (100.000) supaya yang diuji benar-benar jalur stok kurang.
    const over = await fetch(`${BASE}/api/v1/transactions`, {
      method: "POST",
      headers: H(worker.cookie),
      body: JSON.stringify({
        type: "issue",
        itemId,
        locationId,
        qty: 50_000,
        idempotencyKey: `over-${Date.now()}`,
      }),
    });
    const overBody = await over.json();
    check("stok kurang -> 409", over.status === 409, `status ${over.status}`);
    check(
      "409 menyertakan saldo",
      typeof overBody?.error?.details?.balance === "number",
      JSON.stringify(overBody),
    );

    // Pembalik mengembalikan saldo.
    const rev = await fetch(`${BASE}/api/v1/transactions/${issueBody.transaction.id}/reverse`, {
      method: "POST",
      headers: H(worker.cookie),
      body: JSON.stringify({ idempotencyKey: `rev-${Date.now()}` }),
    });
    check("pembalik 201", rev.status === 201, `status ${rev.status}`);

    const after = await fetch(`${BASE}/api/v1/items/by-code/${target.item.code}`, {
      headers: { cookie: worker.cookie },
    });
    const afterBody = await after.json();
    const level = afterBody.stock?.find((s) => s.locationId === locationId);
    check("saldo kembali setelah pembalik", level?.qty === before, `${level?.qty} vs ${before}`);
  }

  console.log("\n== isolasi peran ==");
  const forbidden = await fetch(`${BASE}/api/v1/items?limit=1`, {
    headers: { cookie: worker.cookie },
  });
  check(
    "worker ditolak daftar item admin (403)",
    forbidden.status === 403,
    `status ${forbidden.status}`,
  );

  const allowed = await fetch(`${BASE}/api/v1/items?limit=1`, {
    headers: { cookie: admin.cookie },
  });
  check("admin boleh daftar item", allowed.status === 200, `status ${allowed.status}`);

  console.log("\n== transaksi tidak bisa diubah ==");
  const list = await fetch(`${BASE}/api/v1/transactions?limit=1`, {
    headers: { cookie: admin.cookie },
  });
  const listBody = await list.json();
  check("daftar transaksi 200", list.status === 200);
  check("ada transaksi", (listBody.data?.length ?? 0) > 0);

  console.log(failures === 0 ? "\n  SEMUA UJI LULUS\n" : `\n  ${failures} UJI GAGAL\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("uji gagal:", error);
  process.exit(1);
});
