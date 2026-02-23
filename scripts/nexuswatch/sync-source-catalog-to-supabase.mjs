#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.resolve(root, process.argv[2] || 'data/nexuswatch/source_catalog.json');

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[nexuswatch] missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!fs.existsSync(catalogPath)) {
  console.error(`[nexuswatch] source catalog not found: ${catalogPath}`);
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('[nexuswatch] source catalog is empty or invalid');
  process.exit(1);
}

const payload = rows.map((row) => ({
  source_id: row.source_id,
  name: row.name,
  category: row.category,
  canonical_url: row.canonical_url,
  license: row.license,
  cadence: row.cadence,
  owner: row.owner,
  sensitivity: row.sensitivity,
  parser: row.parser,
  freshness_sla: row.freshness_sla,
  validation_rules: row.validation_rules,
  confidence_model: row.confidence_model,
  priority_tier: row.priority_tier,
  legal_notes: row.legal_notes,
}));

const url = new URL(`${supabaseUrl}/rest/v1/sources`);
url.searchParams.set('on_conflict', 'source_id');

const response = await fetch(url, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    'Content-Profile': 'nexus',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
if (!response.ok) {
  console.error('[nexuswatch] failed syncing source catalog');
  console.error(text);
  process.exit(1);
}

const result = text ? JSON.parse(text) : [];
console.log('[nexuswatch] source catalog synced');
console.log(JSON.stringify({
  catalog_path: catalogPath,
  row_count: payload.length,
  synced_rows: Array.isArray(result) ? result.length : 0,
}, null, 2));
