import { readFileSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/nemu", {
  max: 1,
});
await sql`CREATE TABLE IF NOT EXISTS migration_sources (
  name text PRIMARY KEY,
  body text NOT NULL
)`;
const files = [
  "001_init.sql",
  "002_stock.sql",
  "003_oversell_guard.sql",
  "004_count_line_note.sql",
];
for (const name of files) {
  const body = readFileSync(`db/migrations/${name}`, "utf8");
  await sql`INSERT INTO migration_sources (name, body) VALUES (${name}, ${body})
            ON CONFLICT (name) DO UPDATE SET body = EXCLUDED.body`;
  console.log(`  ${name}: ${body.length} chars`);
}
await sql.end();
