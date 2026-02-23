#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

const inputPath = path.resolve(root, argValue('--input', 'data/nexuswatch/processed/last_ask_globe_response.json'));
const outputDir = path.resolve(root, argValue('--out-dir', 'data/nexuswatch/exports'));
const packetTitle = argValue('--title', 'NexusWatch Diligence Packet');

if (!fs.existsSync(inputPath)) {
  console.error(`[nexuswatch] input JSON not found: ${inputPath}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const citations = Array.isArray(payload.citations) ? payload.citations : [];

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const csvRows = [
  'rank,source_id,citation_title,url,chunk_id,confidence,snippet',
  ...citations.map((citation, index) => [
    index + 1,
    escapeCsv(citation.source_id || 'unknown'),
    escapeCsv(citation.title || 'Citation'),
    escapeCsv(citation.url || ''),
    escapeCsv(citation.chunk_id || ''),
    escapeCsv(payload.confidence ?? ''),
    escapeCsv(citation.snippet || ''),
  ].join(',')),
].join('\n');

const md = [
  `# ${packetTitle}`,
  '',
  `- Generated at: ${new Date().toISOString()}`,
  `- Provenance ID: ${payload.provenance_id || 'n/a'}`,
  `- Confidence: ${typeof payload.confidence === 'number' ? payload.confidence.toFixed(3) : '0.000'}`,
  '',
  '## Question',
  '',
  payload.question || 'n/a',
  '',
  '## Answer',
  '',
  payload.answer || payload.refusal_reason || 'No grounded answer returned.',
  '',
  '## Citations',
  '',
  ...(citations.length > 0
    ? citations.map((citation, index) => (`- [${index + 1}] ${citation.title || 'Citation'} (${citation.source_id || 'unknown'})${citation.url ? ` - ${citation.url}` : ''}`))
    : ['- No citations available.']),
].join('\n');

fs.mkdirSync(outputDir, { recursive: true });
const mdPath = path.join(outputDir, 'diligence-packet.md');
const csvPath = path.join(outputDir, 'diligence-shortlist.csv');
const jsonPath = path.join(outputDir, 'diligence-raw.json');

fs.writeFileSync(mdPath, `${md}\n`, 'utf8');
fs.writeFileSync(csvPath, `${csvRows}\n`, 'utf8');
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log('[nexuswatch] diligence packet export complete');
console.log(JSON.stringify({
  input: inputPath,
  markdown: mdPath,
  csv: csvPath,
  raw_json: jsonPath,
}, null, 2));
