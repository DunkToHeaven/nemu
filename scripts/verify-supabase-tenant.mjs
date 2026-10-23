/**
 * Uji provisioning tenant di Supabase — bagian yang belum pernah diverifikasi.
 *
 * Yang dibuktikan:
 *   1. create_tenant_schema() membuat schema lengkap (tabel, view, matview, trigger)
 *   2. FK user_id menunjuk public.users (bukan tabel tenant)
 *   3. integritas stok bekerja: saldo 10 -> 7, UPDATE transaksi ditolak
 *   4. isolasi: tenant kedua tidak melihat data tenant pertama
 */
import postgres from "postgres";

const REF = "sitbuxaffphzwbwdeuml";
const PW = encodeURIComponent(process.env.SUPABASE_PASSWORD);
const HOST = "aws-0-ap-northeast-2.pooler.supabase.com";

function make(searchPath) {
  return postgres(`postgresql://postgres.${REF}:${PW}@${HOST}:6543/postgres`, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    connect_timeout: 20,
    ...(searchPath ? { connection: { search_path: searchPath } } : {}),
  });
}

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

async function main() {
  const root = make();

  // Bersihkan sisa uji.
  for (const s of ["tenant_sbtest1", "tenant_sbtest2"]) {
    await root.unsafe(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
  }
  await root`DELETE FROM users WHERE id LIKE 'usr_sbtest%'`;

  console.log("\n== 1. PROVISIONING ==");
  await root`SELECT create_tenant_schema('tenant_sbtest1')`;

  const counts = await root`
    SELECT (SELECT count(*)::int FROM pg_tables WHERE schemaname='tenant_sbtest1') AS tables,
           (SELECT count(*)::int FROM pg_views WHERE schemaname='tenant_sbtest1') AS views,
           (SELECT count(*)::int FROM pg_matviews WHERE schemaname='tenant_sbtest1') AS matviews,
           (SELECT count(*)::int FROM pg_trigger t
              JOIN pg_class c ON c.oid=t.tgrelid
              JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='tenant_sbtest1' AND NOT t.tgisinternal) AS triggers
  `;
  const c = counts[0];
  check("tabel dibuat", c.tables >= 18, `${c.tables} tabel`);
  check("view dibuat (stock_levels)", c.views >= 2, `${c.views} view`);
  check("materialized view dibuat", c.matviews >= 1, `${c.matviews} matview`);
  check("trigger integritas dibuat", c.triggers >= 2, `${c.triggers} trigger`);

  const fk = await root`
    SELECT confrelid::regclass::text AS ref FROM pg_constraint
    WHERE conrelid='tenant_sbtest1.transactions'::regclass
      AND conname LIKE '%user%' AND contype='f'
  `;
  check("FK user_id menunjuk public.users", fk[0]?.ref === "users", fk[0]?.ref ?? "tidak ada");

  console.log("\n== 2. INTEGRITAS STOK ==");
  await root`INSERT INTO users (id, code, name, role, pin_hash, tenant_slug)
             VALUES ('usr_sbtest1','SBT01','Uji Supabase','worker','x','sbtest1')
             ON CONFLICT (id) DO NOTHING`;

  const t = make("tenant_sbtest1,public");
  await t`INSERT INTO units (id,name,symbol,decimals) VALUES ('u1','Pcs','pcs',0) ON CONFLICT DO NOTHING`;
  await t`INSERT INTO categories (id,name) VALUES ('c1','Umum') ON CONFLICT DO NOTHING`;
  await t`INSERT INTO warehouses (id,code,name) VALUES ('w1','GD1','Gudang') ON CONFLICT DO NOTHING`;
  await t`INSERT INTO locations (id,warehouse_id,code,name,type,path)
          VALUES ('l1','w1','A-01','Rak A1','rack','Gudang/Rak A1') ON CONFLICT DO NOTHING`;
  await t`INSERT INTO items (id,sku,code,name,category_id,unit_id)
          VALUES ('i1','SKU-1','4A9D4S90G','Bearing','c1','u1') ON CONFLICT DO NOTHING`;

  await t`INSERT INTO transactions (id,type,item_id,to_location_id,qty,user_id,idempotency_key)
          VALUES ('t1','receive','i1','l1',10,'usr_sbtest1','k1')`;
  const s1 = await t`SELECT stock_at('i1','l1') AS qty`;
  check("terima 10 -> saldo 10", Number(s1[0].qty) === 10, String(s1[0].qty));

  await t`INSERT INTO transactions (id,type,item_id,from_location_id,qty,user_id,idempotency_key)
          VALUES ('t2','issue','i1','l1',3,'usr_sbtest1','k2')`;
  const s2 = await t`SELECT stock_at('i1','l1') AS qty`;
  check("ambil 3 -> saldo 7", Number(s2[0].qty) === 7, String(s2[0].qty));

  let blocked = false;
  try {
    await t`UPDATE transactions SET qty=99 WHERE id='t1'`;
  } catch {
    blocked = true;
  }
  check("UPDATE transaksi ditolak (append-only)", blocked);

  console.log("\n== 3. ISOLASI ==");
  await root`SELECT create_tenant_schema('tenant_sbtest2')`;
  const t2 = make("tenant_sbtest2,public");
  const items2 = await t2`SELECT count(*)::int AS n FROM items`;
  check("tenant kedua kosong", items2[0].n === 0, `${items2[0].n} item`);

  // Uji kebocoran yang BENAR: tabel `items` ada di setiap tenant (kosong), jadi
  // query-nya selalu sah. Yang harus dibuktikan adalah tenant kedua tidak
  // melihat BARIS milik tenant pertama.
  const rows2 = await t2`SELECT sku FROM items WHERE sku = 'SKU-1'`;
  check(
    "tenant kedua tidak melihat baris tenant pertama",
    rows2.length === 0,
    `${rows2.length} baris SKU-1 terlihat`,
  );

  // Dan sebaliknya: tenant pertama tetap melihat datanya sendiri.
  const rows1 = await t`SELECT sku FROM items WHERE sku = 'SKU-1'`;
  check("tenant pertama tetap melihat datanya", rows1.length === 1, `${rows1.length} baris`);

  // Bersihkan.
  await t.end({ timeout: 5 }).catch(() => {});
  await t2.end({ timeout: 5 }).catch(() => {});
  for (const s of ["tenant_sbtest1", "tenant_sbtest2"]) {
    await root.unsafe(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
  }
  await root`DELETE FROM users WHERE id LIKE 'usr_sbtest%'`;
  await root.end({ timeout: 5 }).catch(() => {});

  console.log(`\n${"-".repeat(48)}`);
  console.log(`  lulus ${pass} · gagal ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
