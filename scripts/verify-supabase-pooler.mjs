/**
 * Uji apakah isolasi schema-per-tenant BERTAHAN di Supavisor transaction pooler.
 *
 * Ini pertanyaan penentu. Transaction pooler memakai ulang koneksi antar
 * transaksi, sehingga `search_path` yang di-set per koneksi bisa bocor ke
 * request lain — dan itu berarti satu tenant bisa membaca tabel tenant lain.
 *
 * Uji ini membuktikan dengan dua koneksi terpisah yang dibuat bergantian:
 *   A. set search_path tenant_1, query tabel
 *   B. tanpa set search_path, query tabel yang sama
 * Bila B melihat tabel tenant_1, isolasi TIDAK aman di mode ini.
 */
import postgres from "postgres";

const REF = process.env.SUPABASE_REF ?? "sitbuxaffphzwbwdeuml";
const PASSWORD = process.env.SUPABASE_PASSWORD;
const HOST = process.env.SUPABASE_HOST ?? "aws-0-ap-northeast-2.pooler.supabase.com";
const PORT = Number(process.env.SUPABASE_PORT ?? 6543);
const PW = encodeURIComponent(PASSWORD);

function make(searchPath) {
  return postgres(`postgresql://postgres.${REF}:${PW}@${HOST}:${PORT}/postgres`, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 2,
    onnotice: () => {},
    prepare: false,
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
  console.log(`\n== POOLER ${HOST}:${PORT} ==`);

  // Bersihkan sisa uji sebelumnya.
  const admin = make();
  await admin.unsafe(`DROP SCHEMA IF EXISTS probe_a CASCADE`);
  await admin.unsafe(`DROP SCHEMA IF EXISTS probe_b CASCADE`);
  await admin.unsafe(`CREATE SCHEMA probe_a`);
  await admin.unsafe(`CREATE TABLE probe_a.rahasia (id int)`);
  await admin.unsafe(`INSERT INTO probe_a.rahasia VALUES (1)`);

  // A: dengan search_path ke probe_a.
  const a = make("probe_a,public");
  const ra = await a`SELECT count(*)::int AS n FROM rahasia`;
  check("koneksi A (search_path=probe_a) melihat tabelnya", ra[0]?.n === 1, `${ra[0]?.n} baris`);
  await a.end({ timeout: 3 }).catch(() => {});

  // B: koneksi BARU tanpa search_path. Kalau pooler membocorkan state,
  //    koneksi ini akan "mewarisi" search_path dari A.
  const b = make();
  let leaked = false;
  let detail = "";
  try {
    const rb = await b`SELECT count(*)::int AS n FROM rahasia`;
    leaked = true;
    detail = `melihat ${rb[0]?.n} baris tanpa search_path`;
  } catch (error) {
    detail = String(error?.message ?? error).slice(0, 60);
  }
  check("koneksi B TIDAK mewarisi search_path dari A", !leaked, detail);

  // C: pastikan schema juga tidak terlihat lewat pencarian tak berkualifikasi
  //    setelah beberapa query lain di koneksi yang sama (pemakaian ulang).
  const c = make();
  await c`SELECT 1`;
  await c`SELECT 2`;
  let leaked2 = false;
  try {
    await c`SELECT * FROM rahasia LIMIT 1`;
    leaked2 = true;
  } catch {
    /* diharapkan gagal */
  }
  check("pemakaian ulang koneksi tidak membocorkan schema", !leaked2);

  // Bereskan.
  await c.end({ timeout: 3 }).catch(() => {});
  await admin.unsafe(`DROP SCHEMA IF EXISTS probe_a CASCADE`);
  await admin.end({ timeout: 3 }).catch(() => {});

  console.log(`\n  lulus ${pass} · gagal ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
