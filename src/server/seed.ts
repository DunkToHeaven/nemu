/**
 * Seed database.
 *
 * Volume sesuai PRD: 3 gudang, hierarki lokasi, 15 pekerja, 3 role,
 * ±300 item, 5.000 transaksi. Idempoten: dijalankan ulang akan mengosongkan
 * tabel dulu, jadi aman untuk dev.
 *
 * PIN/password seed hanya untuk pengembangan. Di produksi admin pertama dibuat
 * lewat wizard setup dengan PIN yang diketik sendiri.
 */

import { hashSecret } from "@/server/crypto";
import { sql } from "@/server/db";

const DAY = 86_400_000;

const WORKER_NAMES = [
  "Budi Santoso",
  "Sari Wulandari",
  "Agus Prasetyo",
  "Dewi Lestari",
  "Rudi Hartono",
  "Nur Aini",
  "Joko Susilo",
  "Rina Marlina",
  "Hendra Gunawan",
  "Siti Nurhaliza",
  "Bambang Wijaya",
  "Fitri Handayani",
];
const SUPERVISOR_NAMES = ["Andi Kurniawan", "Maya Sari", "Doni Firmansyah"];

const WAREHOUSES = [
  { id: "wh_1", code: "GD1", name: "Gudang 1", city: "Cikarang" },
  { id: "wh_2", code: "GD2", name: "Gudang 2", city: "Surabaya" },
  { id: "wh_3", code: "GD3", name: "Gudang 3", city: "Medan" },
];

const CATEGORIES = [
  "Bearing",
  "Fastener",
  "Seal",
  "Electrical",
  "Hydraulic",
  "Pneumatic",
  "Tooling",
  "Safety",
  "Consumable",
];

const UNITS = [
  { id: "un_pcs", name: "Piece", symbol: "pcs", decimals: 0 },
  { id: "un_box", name: "Box", symbol: "box", decimals: 0 },
  { id: "un_set", name: "Set", symbol: "set", decimals: 0 },
  { id: "un_kg", name: "Kilogram", symbol: "kg", decimals: 2 },
  { id: "un_l", name: "Liter", symbol: "L", decimals: 2 },
  { id: "un_m", name: "Meter", symbol: "m", decimals: 2 },
];

const REASONS = [
  { id: "rs_prod", name: "Produksi", requiresWo: false, requiresNote: false },
  { id: "rs_maint", name: "Perawatan", requiresWo: true, requiresNote: false },
  { id: "rs_repair", name: "Perbaikan", requiresWo: true, requiresNote: true },
  { id: "rs_sample", name: "Sampel", requiresWo: false, requiresNote: true },
  { id: "rs_damage", name: "Rusak", requiresWo: false, requiresNote: true },
];

const ITEM_BASE = [
  "Adaptor Pipa",
  "Bearing",
  "Baut Hex",
  "Selang Hidrolik",
  "Kabel NYM",
  "Kontaktor",
  "Filter Oli",
  "Gasket",
  "V-Belt",
  "Mur Segi Enam",
  "Ring Plat",
  "Seal Oli",
  "Solenoid Valve",
  "Pressure Gauge",
  "Sarung Tangan",
];

/** Crockford base32, 9 karakter, tanpa huruf ambigu (I, L, O, U). */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function makeCode(rng: () => number): string {
  let out = "";
  for (let i = 0; i < 9; i += 1) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return out;
}

/** PRNG deterministik supaya seed bisa direproduksi. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export async function seed(): Promise<{ items: number; transactions: number; users: number }> {
  const rng = mulberry32(20261021);

  // ---- bersihkan (urutan penting karena FK) ----
  await sql`TRUNCATE transactions, verifications, custody, stock_count_lines,
    stock_counts, import_jobs, audit_log, outbox, sync_runs, rate_limits,
    sessions, items, locations, warehouses, categories, units, reasons,
    equipment, users CASCADE`;

  // ---- settings ----
  await sql`INSERT INTO settings (id, org_name) VALUES (true, 'Nemu')
    ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO google_integration (id) VALUES (true) ON CONFLICT (id) DO NOTHING`;

  // ---- master ----
  for (const w of WAREHOUSES) {
    await sql`INSERT INTO warehouses (id, code, name, city)
      VALUES (${w.id}, ${w.code}, ${w.name}, ${w.city})`;
  }
  for (const c of CATEGORIES) {
    await sql`INSERT INTO categories (id, name) VALUES (${`cat_${c.toLowerCase()}`}, ${c})`;
  }
  for (const u of UNITS) {
    await sql`INSERT INTO units (id, name, symbol, decimals)
      VALUES (${u.id}, ${u.name}, ${u.symbol}, ${u.decimals})`;
  }
  for (const r of REASONS) {
    await sql`INSERT INTO reasons (id, name, requires_wo, requires_note)
      VALUES (${r.id}, ${r.name}, ${r.requiresWo}, ${r.requiresNote})`;
  }

  // ---- lokasi: gudang → zona → rak → bin ----
  const locations: { id: string; warehouseId: string; path: string; type: string }[] = [];
  let locSeq = 0;
  for (const w of WAREHOUSES) {
    const whLoc = `loc_wh_${w.id}`;
    await sql`INSERT INTO locations (id, warehouse_id, code, name, type, path)
      VALUES (${whLoc}, ${w.id}, ${w.code}, ${w.name}, 'warehouse', ${w.name})`;
    locations.push({ id: whLoc, warehouseId: w.id, path: w.name, type: "warehouse" });

    for (const zone of ["Zona A", "Zona B", "Zona C"]) {
      locSeq += 1;
      const zoneId = `loc_z${locSeq}`;
      const zonePath = `${w.name} › ${zone}`;
      await sql`INSERT INTO locations (id, warehouse_id, parent_id, code, name, type, path)
        VALUES (${zoneId}, ${w.id}, ${whLoc}, ${`Z${locSeq}`}, ${zone}, 'zone', ${zonePath})`;
      locations.push({ id: zoneId, warehouseId: w.id, path: zonePath, type: "zone" });

      for (let r = 1; r <= 4; r += 1) {
        locSeq += 1;
        const rackId = `loc_r${locSeq}`;
        const rackCode = `${zone.slice(-1)}-${String(r).padStart(2, "0")}`;
        const rackPath = `${zonePath} › Rak ${rackCode}`;
        await sql`INSERT INTO locations (id, warehouse_id, parent_id, code, name, type, path)
          VALUES (${rackId}, ${w.id}, ${zoneId}, ${`R${locSeq}`}, ${`Rak ${rackCode}`}, 'rack', ${rackPath})`;
        locations.push({ id: rackId, warehouseId: w.id, path: rackPath, type: "rack" });
      }
    }
  }

  // ---- pengguna ----
  const users: { id: string; role: string; code: string }[] = [];
  const workerPin = await hashSecret("1122");
  const supervisorPin = await hashSecret("1357");
  const adminPin = await hashSecret("2468");
  const supervisorPw = await hashSecret("nemusup123");
  const adminPw = await hashSecret("nemuadmin123");

  for (let i = 0; i < WORKER_NAMES.length; i += 1) {
    const id = `usr_w${i + 1}`;
    const code = `WRK${String(i + 1).padStart(2, "0")}`;
    await sql`INSERT INTO users (id, code, name, role, pin_hash, shift_ends_at, last_login_at)
      VALUES (${id}, ${code}, ${WORKER_NAMES[i] ?? `Pekerja ${i + 1}`}, 'worker', ${workerPin}, '16:00',
              ${new Date(Date.now() - Math.floor(rng() * 40) * 3_600_000)})`;
    users.push({ id, role: "worker", code });
  }

  for (let i = 0; i < SUPERVISOR_NAMES.length; i += 1) {
    const id = `usr_s${i + 1}`;
    const code = `SPV${String(i + 1).padStart(2, "0")}`;
    // Hanya SPV01 aktif — menguji penolakan akun nonaktif.
    await sql`INSERT INTO users (id, code, name, role, email, pin_hash, password_hash, active, last_login_at)
      VALUES (${id}, ${code}, ${SUPERVISOR_NAMES[i] ?? `Supervisor ${i + 1}`}, 'supervisor',
              ${`spv${i + 1}@nemu.local`}, ${supervisorPin}, ${supervisorPw}, ${i === 0},
              ${new Date(Date.now() - Math.floor(rng() * 12) * 3_600_000)})`;
    users.push({ id, role: "supervisor", code });
  }

  await sql`INSERT INTO users (id, code, name, role, email, pin_hash, password_hash, last_login_at)
    VALUES ('usr_admin', 'ADM01', 'Andi Pratama', 'admin', 'andi@nemu.local',
            ${adminPin}, ${adminPw}, ${new Date(Date.now() - 2 * 3_600_000)})`;
  users.push({ id: "usr_admin", role: "admin", code: "ADM01" });

  // ---- item (±300) ----
  const itemIds: string[] = [];
  const ITEM_COUNT = 300;
  for (let i = 0; i < ITEM_COUNT; i += 1) {
    const id = `itm_${String(i + 1).padStart(4, "0")}`;
    const base = ITEM_BASE[i % ITEM_BASE.length] ?? "Item";
    const size = `${Math.floor(rng() * 90) + 10}`;
    const categoryId = `cat_${(CATEGORIES[i % CATEGORIES.length] ?? "Consumable").toLowerCase()}`;
    const unitId = UNITS[i % UNITS.length]?.id ?? "un_pcs";
    const primary = locations[Math.floor(rng() * locations.length)] ?? locations[0];
    if (!primary) throw new Error("seed: tidak ada lokasi");
    // Sebagian kecil item nonaktif untuk menguji penyaringan.
    const active = i % 37 !== 0;

    await sql`INSERT INTO items (id, sku, code, name, category_id, unit_id, min_stock,
        unit_value, is_bulk, primary_location_id, active, created_at)
      VALUES (${id}, ${`SKU-${String(i + 1).padStart(4, "0")}`}, ${makeCode(rng)},
              ${`${base} ${size}`}, ${categoryId}, ${unitId},
              ${Math.floor(rng() * 20)}, ${(rng() * 500000).toFixed(2)},
              ${rng() < 0.15}, ${primary.id}, ${active},
              ${new Date(Date.now() - Math.floor(rng() * 400) * DAY)})`;
    itemIds.push(id);
  }

  // ---- transaksi (5.000) ----
  // Saldo dibangun dari penerimaan dulu, lalu pengambilan, supaya tidak negatif.
  const rackLocations = locations.filter((l) => l.type === "rack");
  if (rackLocations.length === 0) throw new Error("seed: tidak ada lokasi rak");
  if (itemIds.length === 0) throw new Error("seed: tidak ada item");
  if (users.length === 0) throw new Error("seed: tidak ada pengguna");

  const txRows: {
    id: string;
    type: string;
    itemId: string;
    from: string | null;
    to: string | null;
    qty: number;
    userId: string;
    createdAt: Date;
    key: string;
  }[] = [];

  const stockMap = new Map<string, number>();
  const key = (item: string, loc: string) => `${item}|${loc}`;

  /** Ambil elemen acak; array sudah dijamin tidak kosong di atas. */
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)] as T;

  // 1.000 penerimaan awal — qty besar supaya pengambilan berikutnya cukup.
  for (let i = 0; i < 1000; i += 1) {
    const itemId = pick(itemIds);
    const loc = pick(rackLocations);
    const qty = Math.floor(rng() * 40) + 60;
    const user = pick(users);
    txRows.push({
      id: `tx_s${i}`,
      type: "receive",
      itemId,
      from: null,
      to: loc.id,
      qty,
      userId: user.id,
      createdAt: new Date(Date.now() - Math.floor(rng() * 300) * DAY),
      key: `seed-rcv-${i}`,
    });
    stockMap.set(key(itemId, loc.id), (stockMap.get(key(itemId, loc.id)) ?? 0) + qty);
  }

  // 3.800 pengambilan — hanya kalau saldo cukup.
  let issued = 0;
  let attempt = 0;
  while (issued < 3800 && attempt < 200_000) {
    attempt += 1;
    const itemId = pick(itemIds);
    const loc = pick(rackLocations);
    const available = stockMap.get(key(itemId, loc.id)) ?? 0;
    if (available <= 1) continue;

    const qty = Math.floor(rng() * Math.min(5, available - 1)) + 1;
    if (qty < 1 || qty >= available) continue;

    const user = pick(users);
    txRows.push({
      id: `tx_s${1000 + issued}`,
      type: "issue",
      itemId,
      from: loc.id,
      to: null,
      qty,
      userId: user.id,
      createdAt: new Date(Date.now() - Math.floor(rng() * 200) * DAY),
      key: `seed-iss-${issued}`,
    });
    stockMap.set(key(itemId, loc.id), available - qty);
    issued += 1;
  }

  // 200 pengembalian
  for (let i = 0; i < 200; i += 1) {
    const itemId = pick(itemIds);
    const loc = pick(rackLocations);
    const qty = Math.floor(rng() * 3) + 1;
    const user = pick(users);
    txRows.push({
      id: `tx_s${5000 + i}`,
      type: "return",
      itemId,
      from: null,
      to: loc.id,
      qty,
      userId: user.id,
      createdAt: new Date(Date.now() - Math.floor(rng() * 60) * DAY),
      key: `seed-ret-${i}`,
    });
  }

  // Insert berkelompok; trigger tetap memeriksa tiap baris.
  for (const row of txRows) {
    try {
      await sql`INSERT INTO transactions (
          id, type, item_id, from_location_id, to_location_id, qty, user_id,
          idempotency_key, created_at
        ) VALUES (${row.id}, ${row.type}, ${row.itemId}, ${row.from}, ${row.to},
                  ${row.qty}, ${row.userId}, ${row.key}, ${row.createdAt})
        ON CONFLICT DO NOTHING`;
    } catch {
      // Seed tidak boleh gagal total karena satu baris bertabrakan aturan;
      // baris yang ditolak memang berarti datanya tidak valid.
    }
  }

  await sql`REFRESH MATERIALIZED VIEW stock_balances`;

  const counts = await sql<{ items: number; tx: number; users: number }[]>`
    SELECT (SELECT count(*)::int FROM items)        AS items,
           (SELECT count(*)::int FROM transactions) AS tx,
           (SELECT count(*)::int FROM users)        AS users
  `;
  const itemCount = counts[0]?.items ?? 0;
  const txCount = counts[0]?.tx ?? 0;
  const userCount = counts[0]?.users ?? 0;

  return { items: itemCount, transactions: txCount, users: userCount };
}

export const SEED_CREDENTIALS = {
  worker: { code: "WRK01", pin: "1122" },
  supervisor: { code: "SPV01", pin: "1357", email: "spv1@nemu.local", password: "nemusup123" },
  admin: { code: "ADM01", pin: "2468", email: "andi@nemu.local", password: "nemuadmin123" },
} as const;
