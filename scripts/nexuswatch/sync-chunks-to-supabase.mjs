#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);

function argValue(flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

function findInputPath() {
  for (const arg of args) {
    if (arg.startsWith('--')) continue;
    return arg;
  }
  return 'data/nexuswatch/processed/chunks.jsonl';
}

const inputPath = path.resolve(root, findInputPath());
const withEmbeddings = args.includes('--with-embeddings');
const writeCitations = args.includes('--write-citations');
const requireEmbeddings = args.includes('--require-embeddings');
const maxRows = Number(argValue('--max-rows', 'Infinity'));
const embeddingProvider = (argValue('--embedding-provider', 'openai') || 'openai').toLowerCase();

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const openAiApiKey = (process.env.OPENAI_API_KEY || '').trim();
const embeddingModel = process.env.NEXUSWATCH_EMBEDDING_MODEL || 'text-embedding-3-small';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[nexuswatch] missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`[nexuswatch] chunks file not found: ${inputPath}`);
  process.exit(1);
}

if (withEmbeddings && embeddingProvider !== 'openai') {
  console.error(`[nexuswatch] unsupported embedding provider: ${embeddingProvider} (supported: openai)`);
  process.exit(1);
}

const embeddingsEnabled = withEmbeddings && Boolean(openAiApiKey) && embeddingProvider === 'openai';
const embeddingsSkipReason = withEmbeddings && !embeddingsEnabled
  ? 'OPENAI_API_KEY missing or provider unavailable'
  : null;

if (withEmbeddings && !embeddingsEnabled && requireEmbeddings) {
  console.error('[nexuswatch] embeddings were explicitly required but OPENAI_API_KEY is missing.');
  process.exit(1);
}

if (withEmbeddings && !embeddingsEnabled && !requireEmbeddings) {
  console.warn('[nexuswatch] --with-embeddings requested, but OPENAI_API_KEY is missing. Continuing without embeddings.');
  console.warn('[nexuswatch] use --require-embeddings to fail fast when embeddings cannot be generated.');
}

async function request(pathname, { method = 'GET', body, query, prefer = 'return=representation' } = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${pathname}`);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      [method === 'GET' ? 'Accept-Profile' : 'Content-Profile']: 'nexus',
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase ${method} ${pathname} failed (${response.status}): ${text}`);
  }

  if (!text) return null;
  return JSON.parse(text);
}

async function embed(text) {
  if (!embeddingsEnabled) return null;

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: embeddingModel, input: text }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`embedding request failed: ${JSON.stringify(payload)}`);
  }

  return payload?.data?.[0]?.embedding;
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const chunkRows = readJsonl(inputPath).slice(0, Number.isFinite(maxRows) ? maxRows : undefined);
if (chunkRows.length === 0) {
  console.error('[nexuswatch] no chunk rows available');
  process.exit(1);
}

const sourceRows = await request('sources', {
  method: 'GET',
  query: { select: 'id,source_id' },
  prefer: '',
});

const sourceMap = new Map(sourceRows.map((row) => [row.source_id, row.id]));

let insertedDocuments = 0;
let insertedChunks = 0;
let insertedEmbeddings = 0;
let insertedCitations = 0;
let skipped = 0;

for (const row of chunkRows) {
  const sourceUuid = sourceMap.get(row.source_id);
  if (!sourceUuid) {
    skipped += 1;
    console.warn(`[nexuswatch] skipping chunk for unknown source_id: ${row.source_id}`);
    continue;
  }

  const documentPayload = {
    source_id: sourceUuid,
    external_document_id: row.external_document_id,
    title: row.title,
    mime_type: row.mime_type || 'text/plain',
    sensitivity: row.sensitivity || 'internal',
    owner: row.owner || null,
    origin_path: row.origin_path || null,
    raw_artifact_hash: row.raw_artifact_hash,
    checksum_sha256: row.checksum_sha256,
    metadata: row.metadata || {},
  };

  const documentRows = await request('documents', {
    method: 'POST',
    body: [documentPayload],
    query: { on_conflict: 'source_id,checksum_sha256' },
    prefer: 'resolution=merge-duplicates,return=representation',
  });

  const document = Array.isArray(documentRows) ? documentRows[0] : null;
  if (!document?.id) {
    skipped += 1;
    console.warn(`[nexuswatch] skipping chunk (document upsert failed): ${row.document_id}`);
    continue;
  }

  insertedDocuments += 1;

  const chunkPayload = {
    document_id: document.id,
    chunk_index: row.chunk_index,
    text_content: row.text_content,
    token_count: row.token_count,
    section_path: row.section_path || null,
    page_number: row.page_number || null,
    confidence: row.confidence,
    transform_version: row.transform_version,
    record_hash: row.record_hash,
    metadata: row.metadata || {},
  };

  const chunkRowsResult = await request('chunks', {
    method: 'POST',
    body: [chunkPayload],
    query: { on_conflict: 'document_id,chunk_index' },
    prefer: 'resolution=merge-duplicates,return=representation',
  });

  const chunk = Array.isArray(chunkRowsResult) ? chunkRowsResult[0] : null;
  if (!chunk?.id) {
    skipped += 1;
    console.warn(`[nexuswatch] skipping chunk (chunk upsert failed): ${row.document_id}:${row.chunk_index}`);
    continue;
  }

  insertedChunks += 1;

  if (writeCitations) {
    await request('citations', {
      method: 'POST',
      body: [{
        source_id: sourceUuid,
        document_id: document.id,
        chunk_id: chunk.id,
        citation_label: `${row.title} (chunk ${row.chunk_index})`,
        citation_url: row.metadata?.citation_url || null,
        snippet: String(row.text_content || '').slice(0, 900),
      }],
      prefer: 'return=representation',
    });
    insertedCitations += 1;
  }

  if (embeddingsEnabled) {
    const vector = await embed(row.text_content);
    if (Array.isArray(vector) && vector.length > 0) {
      await request('embeddings', {
        method: 'POST',
        body: [{
          chunk_id: chunk.id,
          embedding: vector,
          embedding_model: embeddingModel,
          embedding_version: 'nexuswatch-v1',
        }],
        query: { on_conflict: 'chunk_id' },
        prefer: 'resolution=merge-duplicates,return=representation',
      });
      insertedEmbeddings += 1;
    }
  }
}

console.log('[nexuswatch] chunk sync complete');
console.log(JSON.stringify({
  input_path: inputPath,
  total_rows: chunkRows.length,
  inserted_documents: insertedDocuments,
  inserted_chunks: insertedChunks,
  inserted_citations: insertedCitations,
  inserted_embeddings: insertedEmbeddings,
  skipped,
  embeddings_requested: withEmbeddings,
  embeddings_enabled: embeddingsEnabled,
  embeddings_skipped_reason: embeddingsSkipReason,
  embedding_provider: embeddingProvider,
  embedding_model: embeddingsEnabled ? embeddingModel : null,
  with_embeddings: withEmbeddings,
  write_citations: writeCitations,
}, null, 2));
