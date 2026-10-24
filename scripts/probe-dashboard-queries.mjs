/** Time setiap query dashboard satu per satu. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 2, prepare: false, connect_timeout: 15, onnotice: () => {} });
const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;
const uid = (await sql`SELECT id FROM users LIMIT 1`)[0].id;

const run = async (label, q) => {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      sql.unsafe(q),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 10s")), 10_000)),
    ]);
    console.log(
      `  ${label.padEnd(16)} ${String(Date.now() - t0).padStart(6)}ms  ${r.length} baris`,
    );
  } catch (e) {
    console.log(
      `  ${label.padEnd(16)} ${String(Date.now() - t0).padStart(6)}ms  ${e.message.slice(0, 45)}`,
    );
  }
};

console.log(`schema ${s}, user ${uid}\n`);

await run(
  "totals",
  `
  SELECT
    (SELECT count(*)::int FROM "${s}".items WHERE active) AS total_items,
    (SELECT COALESCE(SUM(qty), 0)::int FROM "${s}".stock_levels) AS total_qty,
    (SELECT count(*)::int FROM "${s}".items i
       WHERE i.active AND i.min_stock > 0
         AND COALESCE((SELECT SUM(qty) FROM "${s}".stock_levels WHERE item_id = i.id), 0) < i.min_stock) AS below_min,
    (SELECT count(*)::int FROM "${s}".transactions WHERE created_at >= date_trunc('day', now())) AS tx_today,
    (SELECT count(*)::int FROM "${s}".transactions WHERE review_status = 'needs_review') AS needs_review,
    (SELECT count(*)::int FROM "${s}".stock_counts WHERE status <> 'approved') AS open_counts,
    (SELECT COALESCE(ROUND(100.0 * count(*) FILTER (WHERE v.cnt > 0) / NULLIF(count(*), 0)), 0)::int
       FROM "${s}".items i
       LEFT JOIN LATERAL (
         SELECT count(*) AS cnt FROM "${s}".verifications
         WHERE item_id = i.id AND status IN ('recorded','approved')
           AND answered_at > now() - interval '30 days'
       ) v ON true
       WHERE i.active) AS high_pct,
    (SELECT count(*)::int FROM "${s}".custody WHERE status = 'open' AND created_at < now() - interval '24 hours') AS overdue,
    (SELECT COALESCE(SUM(qty - qty_settled), 0)::int FROM "${s}".custody WHERE status = 'open' AND user_id = '${uid}') AS my_custody,
    (SELECT count(*)::int FROM "${s}".transactions WHERE user_id = '${uid}' AND created_at > now() - interval '7 days') AS my_tx_7d,
    (SELECT count(*)::int FROM "${s}".verifications WHERE status = 'pending' AND user_id = '${uid}') AS my_queue
`,
);

await run(
  "recent",
  `
  SELECT t.id, t.type::text AS type, t.item_id, i.name AS item_name, t.qty, t.created_at, t.user_id, u.name AS user_name
  FROM "${s}".transactions t
  JOIN "${s}".items i ON i.id = t.item_id
  JOIN public.users u ON u.id = t.user_id
  ORDER BY t.created_at DESC LIMIT 10
`,
);

await run(
  "lowStock",
  `
  SELECT i.id AS item_id, i.name, COALESCE(s.qty,0)::int AS qty, i.min_stock
  FROM "${s}".items i
  JOIN "${s}".units u ON u.id = i.unit_id
  LEFT JOIN LATERAL (SELECT COALESCE(SUM(qty),0) AS qty FROM "${s}".stock_levels WHERE item_id = i.id) s ON true
  LEFT JOIN LATERAL (SELECT max(answered_at) AS lv FROM "${s}".verifications WHERE item_id = i.id) v ON true
  WHERE i.active AND i.min_stock > 0 AND COALESCE(s.qty,0) < i.min_stock
  LIMIT 6
`,
);

await run(
  "lastTaken",
  `
  SELECT DISTINCT ON (t.item_id) t.item_id, t.qty, t.created_at
  FROM "${s}".transactions t
  JOIN "${s}".items i ON i.id = t.item_id
  JOIN "${s}".units u ON u.id = i.unit_id
  WHERE t.type = 'issue'
  ORDER BY t.item_id, t.created_at DESC LIMIT 5
`,
);

await run(
  "usage",
  `
  SELECT to_char(d.day,'YYYY-MM-DD') AS date, COALESCE(SUM(t.qty),0)::int AS qty, count(t.id)::int AS tx
  FROM generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') AS d(day)
  LEFT JOIN "${s}".transactions t ON date_trunc('day', t.created_at) = d.day AND t.type = 'issue'
  GROUP BY d.day ORDER BY d.day
`,
);

await run(
  "topItems",
  `
  SELECT i.id, i.name, SUM(t.qty)::int AS qty FROM "${s}".transactions t
  JOIN "${s}".items i ON i.id = t.item_id
  WHERE t.type = 'issue' AND t.created_at > now() - interval '30 days'
  GROUP BY i.id, i.name ORDER BY qty DESC LIMIT 5
`,
);

await run(
  "needsCount",
  `
  SELECT i.id AS item_id, COALESCE(s.qty,0)::int AS qty
  FROM "${s}".items i
  LEFT JOIN "${s}".units u ON u.id = i.unit_id
  LEFT JOIN LATERAL (SELECT SUM(qty) AS qty FROM "${s}".stock_levels WHERE item_id = i.id) s ON true
  WHERE i.active AND NOT EXISTS (
    SELECT 1 FROM "${s}".verifications v WHERE v.item_id = i.id AND v.answered_at > now() - interval '90 days')
  ORDER BY COALESCE(s.qty,0) DESC LIMIT 5
`,
);

await run(
  "activeUsers",
  `SELECT count(DISTINCT user_id)::int AS c FROM public.sessions WHERE expires_at > now()`,
);
await run("teamCustody", `SELECT count(*)::int AS c FROM "${s}".custody WHERE status = 'open'`);
await run(
  "custodyRows",
  `
  SELECT c.id, c.item_id, i.name, (c.qty - c.qty_settled)::int AS qty
  FROM "${s}".custody c JOIN "${s}".items i ON i.id = c.item_id
  WHERE c.status='open' AND c.user_id='${uid}' ORDER BY c.created_at DESC LIMIT 5
`,
);

await sql.end();
