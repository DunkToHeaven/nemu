/**
 * Temukan region pooler Supabase untuk project ini, memakai kredensial asli.
 *
 * Kenapa perlu: free plan tidak punya IPv4 untuk `db.<ref>.supabase.co`, dan
 * jaringan ini tidak punya rute IPv6. Pooler Supavisor punya IPv4, tetapi
 * host-nya bergantung region: `aws-0-<region>.pooler.supabase.com`.
 *
 * Password dibaca dari env (SUPABASE_PASSWORD), tidak ditanam di file.
 */
import postgres from "postgres";

const REF = process.env.SUPABASE_REF ?? "sitbuxaffphzwbwdeuml";
const PASSWORD = process.env.SUPABASE_PASSWORD;
if (!PASSWORD) {
  console.error("SUPABASE_PASSWORD belum diset.");
  process.exit(1);
}

const REGIONS = [
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-south-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "ca-central-1",
  "sa-east-1",
];

// Percent-encode: password berisi "@" yang akan merusak URL bila dibiarkan.
const PW = encodeURIComponent(PASSWORD);

async function tryHost(host, port) {
  const url = `postgresql://postgres.${REF}:${PW}@${host}:${port}/postgres`;
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 8,
    idle_timeout: 1,
    onnotice: () => {},
    prepare: false,
  });
  try {
    const rows = await sql`SELECT current_database() AS db, version() AS v`;
    const v = String(rows[0]?.v ?? "");
    const ver = v.match(/PostgreSQL (\d+\.\d+)/)?.[1] ?? "?";
    return { ok: true, db: rows[0]?.db, ver };
  } catch (error) {
    return { ok: false, message: String(error?.message ?? error).slice(0, 90) };
  } finally {
    await sql.end({ timeout: 3 }).catch(() => {});
  }
}

const targets = [];
for (const prefix of ["aws-0", "aws-1"]) {
  for (const region of REGIONS) {
    targets.push({ host: `${prefix}-${region}.pooler.supabase.com`, port: 6543 });
  }
}

console.log(`\n  menguji ${targets.length} host pooler (paralel)\n`);

const results = await Promise.all(
  targets.map(async (t) => ({ ...t, result: await tryHost(t.host, t.port) })),
);

const hits = results.filter((r) => r.result.ok);
for (const hit of hits) {
  console.log(`  COCOK   ${hit.host}:${hit.port}  (PostgreSQL ${hit.result.ver})`);
}

if (hits.length === 0) {
  const sample = results
    .filter((r) => !r.result.message?.includes("not found"))
    .slice(0, 4)
    .map((r) => `${r.host} -> ${r.result.message}`);
  console.log("  tidak ada yang cocok");
  for (const line of sample) console.log(`    ${line}`);
} else {
  console.log(`\n  DATABASE_URL=postgresql://postgres.${REF}:***@${hits[0].host}:6543/postgres\n`);
}
