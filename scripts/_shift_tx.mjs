import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { max: 1, prepare: false });
const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;
await sql.unsafe(
  `UPDATE ${s}.transactions SET created_at = created_at - interval '20 days' WHERE id='tx_07aa9d1e-90d7-4f34-929a-d3ac085fe5ab'`,
);
console.log("receive pertama digeser 20 hari ke belakang");
await sql.end();
