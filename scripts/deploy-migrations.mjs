#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'fibpamjksquymscdlfal';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const MIGRATIONS_DIR = 'supabase/migrations';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN missing');
  process.exit(1);
}

async function runSql(query) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function ensureMigrationsTable() {
  await runSql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      statements text[],
      created_at timestamptz default now()
    );
  `);
}

async function getApplied() {
  const rows = await runSql(`select version from supabase_migrations.schema_migrations`);
  return new Set((rows || []).map(r => r.version));
}

function listLocal() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => {
      const m = f.match(/^(\d{14})_(.+)\.sql$/);
      if (!m) throw new Error(`Bad migration filename: ${f}`);
      return { file: f, version: m[1], name: m[2] };
    });
}

async function apply(m) {
  const body = fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8');
  await runSql(body);
  const safeName = m.name.replace(/'/g, "''");
  await runSql(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ('${m.version}', '${safeName}', '{}'::text[])`
  );
}

await ensureMigrationsTable();
const applied = await getApplied();
const local = listLocal();
const pending = local.filter(m => !applied.has(m.version));
console.log(`local=${local.length} applied=${applied.size} pending=${pending.length}`);
for (const m of pending) {
  console.log(`-> ${m.file}`);
  await apply(m);
}
console.log('Migrations done.');
