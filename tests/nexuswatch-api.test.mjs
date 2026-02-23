import { strict as assert } from 'node:assert';
import test from 'node:test';

import askGlobeHandler from '../api/ask-globe.js';
import feedbackHandler from '../api/feedback.js';
import provenanceHandler from '../api/provenance/[provenance_id].js';
import exportPacketHandler from '../api/exports/diligence-packet.js';

const ORIGINAL_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXUSWATCH_INTERNAL_API_KEY: process.env.NEXUSWATCH_INTERNAL_API_KEY,
};

test.after(() => {
  process.env.SUPABASE_URL = ORIGINAL_ENV.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXUSWATCH_INTERNAL_API_KEY = ORIGINAL_ENV.NEXUSWATCH_INTERNAL_API_KEY;
});

function clearSupabaseEnv() {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function makeJsonRequest(url, body, method = 'POST') {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:5173',
    },
    body: JSON.stringify(body),
  });
}

test('ask-globe rejects missing question', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await askGlobeHandler(makeJsonRequest('https://worldmonitor.app/api/ask-globe', {
    question: '',
    active_layers: ['nuclear'],
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'question is required');
});

test('ask-globe refuses when no active layers are enabled', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await askGlobeHandler(makeJsonRequest('https://worldmonitor.app/api/ask-globe', {
    question: 'Which areas changed this week?',
    active_layers: [],
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(typeof payload.refusal_reason, 'string');
  assert.equal(payload.refusal_reason.includes('No active layers selected'), true);
});

test('ask-globe returns grounded refusal when Supabase is not configured', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await askGlobeHandler(makeJsonRequest('https://worldmonitor.app/api/ask-globe', {
    question: 'What are top coal-to-nuclear opportunities?',
    active_layers: ['coalToNuclear'],
    top_k: 6,
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.answer, '');
  assert.equal(payload.refusal_reason.includes('Supabase RAG backend unavailable'), true);
});

test('feedback enforces UUID answer_id format', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await feedbackHandler(makeJsonRequest('https://worldmonitor.app/api/feedback', {
    answer_id: 'bad-id',
    rating: 'up',
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'answer_id must be a UUID');
});

test('feedback remains queued when Supabase is not configured', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await feedbackHandler(makeJsonRequest('https://worldmonitor.app/api/feedback', {
    answer_id: '11111111-1111-4111-8111-111111111111',
    rating: 'down',
    comment: 'Needs better source recency',
    correction_tags: ['freshness'],
  }));

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'queued');
  assert.equal(typeof payload.warning, 'string');
});

test('provenance endpoint rejects invalid provenance id', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await provenanceHandler(new Request('https://worldmonitor.app/api/provenance/not-a-uuid', {
    method: 'GET',
    headers: {
      origin: 'http://localhost:5173',
    },
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'Missing provenance_id');
});

test('diligence-packet endpoint validates answer_id format', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await exportPacketHandler(makeJsonRequest('https://worldmonitor.app/api/exports/diligence-packet', {
    answer_id: 'not-a-uuid',
    title: 'Packet',
  }));

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'answer_id must be a UUID');
});

test('diligence-packet endpoint supports inline payload export', async () => {
  clearSupabaseEnv();
  delete process.env.NEXUSWATCH_INTERNAL_API_KEY;

  const response = await exportPacketHandler(makeJsonRequest('https://worldmonitor.app/api/exports/diligence-packet', {
    title: 'Inline Packet',
    question: 'What changed near the target site?',
    answer: 'Grounded evidence indicates no status transition this week.',
    confidence: 0.66,
    provenance_id: '11111111-1111-4111-8111-111111111111',
    citations: [
      {
        citation_id: 'inline-1',
        source_id: 'iaea-pris',
        title: 'IAEA PRIS Snapshot',
        url: 'https://pris.iaea.org',
        snippet: 'Status unchanged in latest reporting period.',
      },
    ],
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.markdown, 'string');
  assert.equal(typeof payload.shortlist_csv, 'string');
});
