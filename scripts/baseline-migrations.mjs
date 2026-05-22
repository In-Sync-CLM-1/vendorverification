#!/usr/bin/env node
// One-shot: record all local migrations EXCEPT the newest one as already-applied
// in supabase_migrations.schema_migrations. Use when the DB schema already
// matches the local migration history but the tracking table is empty (e.g.,
// after a cross-region project clone).
import fs from 'node:fs';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'fibpamjksquymscdlfal';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const SKIP_VERSION = process.argv[2]; // optional: version to NOT baseline (will be applied normally)

async function runSql(query) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${text}`);
  return text;
}

await runSql(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    name text,
    statements text[],
    created_at timestamptz default now()
  );
`);

const files = fs.readdirSync('supabase/migrations')
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => {
    const m = f.match(/^(\d{14})_(.+)\.sql$/);
    return { version: m[1], name: m[2].replace(/'/g, "''") };
  })
  .filter(m => m.version !== SKIP_VERSION);

const values = files.map(m => `('${m.version}', '${m.name}', '{}'::text[])`).join(',\n  ');
await runSql(`
  insert into supabase_migrations.schema_migrations (version, name, statements)
  values
  ${values}
  on conflict (version) do nothing;
`);
console.log(`Baselined ${files.length} migrations${SKIP_VERSION ? `, skipping ${SKIP_VERSION}` : ''}.`);
