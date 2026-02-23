#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

const inputDir = path.resolve(root, argValue('--input-dir', 'data/nexuswatch/internal-intake'));
const filesDir = path.resolve(root, argValue('--files-dir', 'data/nexuswatch/internal-intake/files'));
const outputPath = path.resolve(root, argValue('--output', 'data/nexuswatch/processed/chunks.jsonl'));
const maxChars = Number(argValue('--max-chars', '1600'));
const overlapChars = Number(argValue('--overlap', '220'));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function listManifestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(dir, file));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextAsset(manifest) {
  const explicitPath = typeof manifest.local_path === 'string' ? manifest.local_path : null;
  const sourceCandidates = [
    explicitPath,
    path.join(filesDir, `${manifest.document_id}.txt`),
    path.join(filesDir, `${manifest.document_id}.md`),
    path.join(filesDir, `${manifest.document_id}.json`),
    path.join(filesDir, `${manifest.document_id}.csv`),
  ].filter(Boolean);

  for (const candidate of sourceCandidates) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
    if (!fs.existsSync(absolute)) continue;

    const ext = path.extname(absolute).toLowerCase();
    if (['.txt', '.md', '.csv'].includes(ext)) {
      return {
        content: fs.readFileSync(absolute, 'utf8'),
        filePath: absolute,
      };
    }

    if (ext === '.json') {
      const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
      return {
        content: JSON.stringify(parsed, null, 2),
        filePath: absolute,
      };
    }
  }

  return null;
}

function chunkText(content, chunkSize, overlapSize) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    // Prefer chunk boundaries at line breaks for audit readability.
    if (end < normalized.length) {
      const breakpoint = normalized.lastIndexOf('\n', end);
      if (breakpoint > start + Math.floor(chunkSize * 0.55)) {
        end = breakpoint;
      }
    }

    const piece = normalized.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= normalized.length) break;

    start = Math.max(0, end - overlapSize);
  }

  return chunks;
}

function inferConfidence(manifest, chunkCount) {
  const classification = String(manifest.classification || '').toLowerCase();
  const base = classification === 'restricted'
    ? 0.95
    : classification === 'confidential'
      ? 0.9
      : classification === 'internal'
        ? 0.85
        : 0.75;

  const chunkAdjustment = chunkCount > 60 ? -0.06 : chunkCount > 30 ? -0.03 : 0;
  return Math.max(0, Math.min(1, Number((base + chunkAdjustment).toFixed(4))));
}

function ensureOutputDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

const manifestFiles = listManifestFiles(inputDir);
if (manifestFiles.length === 0) {
  console.error(`[nexuswatch] no manifests found in ${inputDir}`);
  process.exit(1);
}

const lines = [];
const report = {
  manifests: manifestFiles.length,
  chunk_records: 0,
  skipped_manifests: [],
};

for (const manifestPath of manifestFiles) {
  let manifest;
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    report.skipped_manifests.push({
      manifest: path.basename(manifestPath),
      reason: `json_parse_error: ${String(error)}`,
    });
    continue;
  }

  if (!manifest.document_id || !manifest.source_id || !manifest.title || !manifest.sha256) {
    report.skipped_manifests.push({
      manifest: path.basename(manifestPath),
      reason: 'missing_required_fields(document_id,source_id,title,sha256)',
    });
    continue;
  }

  const textAsset = readTextAsset(manifest);
  if (!textAsset) {
    report.skipped_manifests.push({
      manifest: path.basename(manifestPath),
      reason: 'no_text_asset_found',
    });
    continue;
  }

  const chunks = chunkText(textAsset.content, maxChars, overlapChars);
  if (chunks.length === 0) {
    report.skipped_manifests.push({
      manifest: path.basename(manifestPath),
      reason: 'empty_text_after_normalization',
    });
    continue;
  }

  const confidence = inferConfidence(manifest, chunks.length);
  const transformVersion = manifest.lineage?.transform_version || 'nexuswatch:chunk-intake-docs:v1';
  const rawArtifactHash = manifest.lineage?.raw_artifact_hash || manifest.sha256;
  const tags = Array.isArray(manifest.tags)
    ? manifest.tags.filter((tag) => typeof tag === 'string').slice(0, 24)
    : [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const textContent = chunks[chunkIndex];
    const recordHash = sha256(`${manifest.document_id}:${chunkIndex}:${textContent}`);
    const line = {
      source_id: manifest.source_id,
      document_id: manifest.document_id,
      title: manifest.title,
      sensitivity: manifest.classification || 'internal',
      mime_type: manifest.mime_type || 'text/plain',
      owner: manifest.owner || null,
      origin_path: manifest.origin_path || textAsset.filePath,
      checksum_sha256: manifest.sha256,
      raw_artifact_hash: rawArtifactHash,
      external_document_id: manifest.external_document_id || null,
      chunk_index: chunkIndex,
      text_content: textContent,
      token_count: Math.max(1, Math.ceil(textContent.length / 4)),
      confidence,
      transform_version: transformVersion,
      record_hash: recordHash,
      metadata: {
        document_manifest: path.basename(manifestPath),
        source_file_path: textAsset.filePath,
        classification: manifest.classification || 'internal',
        feature_id: typeof manifest.feature_id === 'string' ? manifest.feature_id : null,
        layer_id: typeof manifest.layer_id === 'string' ? manifest.layer_id : null,
        lat: Number.isFinite(Number(manifest.lat)) ? Number(manifest.lat) : null,
        lon: Number.isFinite(Number(manifest.lon)) ? Number(manifest.lon) : null,
        tags,
        citability: manifest.citability || {},
      },
    };

    lines.push(JSON.stringify(line));
    report.chunk_records += 1;
  }
}

ensureOutputDir(outputPath);
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

console.log('[nexuswatch] chunk intake completed');
console.log(JSON.stringify({
  input_dir: inputDir,
  files_dir: filesDir,
  output: outputPath,
  ...report,
}, null, 2));
