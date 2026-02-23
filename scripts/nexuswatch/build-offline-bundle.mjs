#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const outputDir = path.resolve(root, process.argv[2] || 'data/nexuswatch/offline-bundle');

const includePaths = [
  'data/nexuswatch/source_catalog.json',
  'data/nexuswatch/processed/chunks.jsonl',
  'data/nexuswatch/alerts/headless-templates.json',
  'src/config/nexus-geo.ts',
  'docs/nexuswatch',
  'supabase/migrations',
];

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function copyRecursive(source, destination, registry) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(destination, entry), registry);
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  registry.push({
    path: destination,
    bytes: stat.size,
    sha256: sha256File(source),
  });
}

const copiedFiles = [];
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const relativePath of includePaths) {
  const source = path.resolve(root, relativePath);
  if (!fs.existsSync(source)) {
    console.warn(`[nexuswatch] skip missing path: ${relativePath}`);
    continue;
  }

  const destination = path.join(outputDir, relativePath);
  copyRecursive(source, destination, copiedFiles);
}

const manifest = {
  bundle_name: 'nexuswatch-offline-bundle',
  created_at: new Date().toISOString(),
  source_root: root,
  file_count: copiedFiles.length,
  files: copiedFiles.map((file) => ({
    path: path.relative(outputDir, file.path),
    bytes: file.bytes,
    sha256: file.sha256,
  })),
};

const manifestPath = path.join(outputDir, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outputDir, '.gitkeep'), '', 'utf8');

console.log('[nexuswatch] offline bundle created');
console.log(JSON.stringify({
  output_dir: outputDir,
  manifest: manifestPath,
  file_count: manifest.file_count,
}, null, 2));
