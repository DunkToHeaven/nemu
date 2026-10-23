/** Isi database Supabase saat ini — sebelum migrasi apa pun. */
import postgres from "postgres";

const REF = "sitbuxaffphzwbwdeuml";
const PW = encodeURIComponent(process.env.SUPABASE_PASSWORD);
const sql = postgres(
  `postgresql://postgres.${REF}:${PW}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`,
  { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 },
);

const schemas = await sql`
  SELECT nspname FROM pg_namespace
  WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema'
  ORDER BY nspname
`;
console.log("schema:", schemas.map((r) => r.nspname).join(", "));

const tables = await sql`
  SELECT schemaname, tablename FROM pg_tables
  WHERE schemaname = 'public' ORDER BY tablename
`;
console.log(`tabel public: ${tables.length}`);
if (tables.length) console.log(" ", tables.map((t) => t.tablename).join(", "));

const ext = await sql`SELECT extname FROM pg_extension ORDER BY extname`;
console.log("ekstensi:", ext.map((e) => e.extname).join(", "));

const ver = await sql`SELECT current_setting('server_version') AS v`;
console.log("versi:", ver[0].v);

await sql.end();
