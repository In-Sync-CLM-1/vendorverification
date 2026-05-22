#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'fibpamjksquymscdlfal';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const FUNCTIONS_DIR = 'supabase/functions';
const CONFIG_PATH = 'supabase/config.toml';

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN missing');
  process.exit(1);
}

function parseVerifyJwt() {
  const opted = new Set();
  if (!fs.existsSync(CONFIG_PATH)) return opted;
  const lines = fs.readFileSync(CONFIG_PATH, 'utf8').split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const header = line.match(/^\[functions\.([^\]]+)\]/);
    if (header) { current = header[1]; continue; }
    if (current && /^\s*verify_jwt\s*=\s*false/.test(line)) {
      opted.add(current);
      current = null;
    }
  }
  return opted;
}

const verifyJwtFalse = parseVerifyJwt();

async function deployOne(slug) {
  const indexPath = path.join(FUNCTIONS_DIR, slug, 'index.ts');
  if (!fs.existsSync(indexPath)) {
    console.log(`skip ${slug} (no index.ts)`);
    return;
  }
  const verifyJwt = !verifyJwtFalse.has(slug);

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: slug,
    verify_jwt: verifyJwt,
    entrypoint_path: 'index.ts',
  })], { type: 'application/json' }));
  form.append('file', new Blob([fs.readFileSync(indexPath)], { type: 'application/typescript' }), 'index.ts');

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(slug)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`deploy ${slug} ${r.status}: ${text}`);
  console.log(`ok  ${slug} (verify_jwt=${verifyJwt})`);
}

const slugs = fs.readdirSync(FUNCTIONS_DIR)
  .filter(name => {
    const p = path.join(FUNCTIONS_DIR, name);
    return fs.statSync(p).isDirectory() && !name.startsWith('_');
  })
  .sort();

console.log(`Deploying ${slugs.length} function(s)`);
for (const slug of slugs) {
  await deployOne(slug);
}
console.log('Functions done.');
