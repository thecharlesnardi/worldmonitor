export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import {
  hasNexusSupabaseConfig,
  isUuid,
  requireNexusApiKey,
  rpcNexus,
  selectNexus,
} from '../_nexus-supabase.js';

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'rank,source_id,citation_title,url,snippet\n';
  }

  const header = 'rank,source_id,citation_title,url,snippet';
  const lines = rows.map((row, index) => [
    index + 1,
    escapeCsv(row.source_id),
    escapeCsv(row.title),
    escapeCsv(row.url || ''),
    escapeCsv(row.snippet || ''),
  ].join(','));

  return [header, ...lines].join('\n');
}

function buildMarkdown({ title, question, answer, confidence, citations, provenanceId }) {
  const citationLines = citations.length === 0
    ? ['- No citations available.']
    : citations.map((citation, index) => (
      `- [${index + 1}] ${citation.title} (${citation.source_id})${citation.url ? ` - ${citation.url}` : ''}`
    ));

  return [
    `# ${title}`,
    '',
    `- Generated at: ${new Date().toISOString()}`,
    `- Provenance ID: ${provenanceId || 'n/a'}`,
    `- Confidence: ${Number.isFinite(confidence) ? confidence.toFixed(3) : '0.000'}`,
    '',
    '## Question',
    '',
    question || 'n/a',
    '',
    '## Grounded Answer',
    '',
    answer || 'No grounded answer available.',
    '',
    '## Citations',
    '',
    ...citationLines,
    '',
    '## Export Notes',
    '',
    '- This packet is generated for internal analyst workflows.',
    '- Always review provenance before external distribution.',
  ].join('\n');
}

export default async function handler(req) {
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cors = getCorsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const keyValidation = requireNexusApiKey(req);
  if (!keyValidation.ok) {
    return new Response(JSON.stringify({ error: keyValidation.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const packetTitle = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim()
    : 'NexusWatch Diligence Packet';

  let question = typeof body.question === 'string' ? body.question.trim() : '';
  let answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  let confidence = Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : 0;
  let citations = Array.isArray(body.citations) ? body.citations : [];
  let provenanceId = typeof body.provenance_id === 'string' ? body.provenance_id : null;

  const answerId = typeof body.answer_id === 'string' ? body.answer_id.trim() : '';
  if (answerId) {
    if (!isUuid(answerId)) {
      return new Response(JSON.stringify({ error: 'answer_id must be a UUID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    if (!hasNexusSupabaseConfig()) {
      return new Response(JSON.stringify({ error: 'Supabase is required when answer_id is provided.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const rows = await selectNexus('answer_logs', {
      select: 'id,query_id,answer_text,confidence,provenance_id',
      filters: { id: `eq.${answerId}` },
      limit: 1,
    });

    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'answer_id not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const row = rows[0];
    answer = row.answer_text || answer;
    confidence = Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : confidence;
    provenanceId = row.provenance_id || provenanceId;

    const queryRows = await selectNexus('query_logs', {
      select: 'question',
      filters: { id: `eq.${row.query_id}` },
      limit: 1,
    });
    if (queryRows.length > 0 && queryRows[0].question) {
      question = queryRows[0].question;
    }

    if (provenanceId && isUuid(provenanceId)) {
      const provenance = await rpcNexus('get_provenance', { p_provenance_id: provenanceId });
      citations = Array.isArray(provenance?.citations)
        ? provenance.citations.map((citation) => ({
          citation_id: citation.id,
          source_id: citation.source_id || 'unknown',
          title: citation.citation_label || 'Citation',
          url: citation.citation_url || '',
          snippet: citation.snippet || '',
        }))
        : citations;
    }
  }

  const normalizedCitations = citations.map((citation, index) => ({
    citation_id: typeof citation.citation_id === 'string' ? citation.citation_id : `inline-${index + 1}`,
    source_id: typeof citation.source_id === 'string' ? citation.source_id : 'unknown',
    title: typeof citation.title === 'string' ? citation.title : 'Citation',
    url: typeof citation.url === 'string' ? citation.url : '',
    snippet: typeof citation.snippet === 'string' ? citation.snippet : '',
  }));

  const markdown = buildMarkdown({
    title: packetTitle,
    question,
    answer,
    confidence,
    citations: normalizedCitations,
    provenanceId,
  });

  const shortlistCsv = toCsv(normalizedCitations);

  return new Response(JSON.stringify({
    ok: true,
    title: packetTitle,
    question,
    confidence,
    provenance_id: provenanceId,
    markdown,
    shortlist_csv: shortlistCsv,
    citations: normalizedCitations,
    generated_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...cors,
    },
  });
}
