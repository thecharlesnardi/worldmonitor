export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import {
  clampNumber,
  getClientUserId,
  hasNexusSupabaseConfig,
  insertNexusRow,
  insertNexusRows,
  NexusSupabaseError,
  requireNexusApiKey,
  rpcNexus,
  sha256Hex,
} from './_nexus-supabase.js';

const SUPPORTED_LAYERS = new Set([
  'nuclear',
  'datacenters',
  'coalToNuclear',
  'industrialHeat',
  'advancedReactors',
]);

function sanitizeLayers(activeLayers) {
  if (!Array.isArray(activeLayers)) return [];
  return activeLayers
    .filter((layer) => typeof layer === 'string')
    .map((layer) => layer.trim())
    .filter((layer) => layer && SUPPORTED_LAYERS.has(layer))
    .slice(0, 24);
}

function sanitizeBbox(mapBBox) {
  if (!Array.isArray(mapBBox) || mapBBox.length !== 4) return null;
  const west = Number(mapBBox[0]);
  const south = Number(mapBBox[1]);
  const east = Number(mapBBox[2]);
  const north = Number(mapBBox[3]);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (south < -90 || south > 90 || north < -90 || north > 90) return null;
  if (west < -180 || west > 180 || east < -180 || east > 180) return null;
  return [west, south, east, north];
}

function pointWithinBbox(lat, lon, bbox) {
  if (!bbox) return true;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;

  const [west, south, east, north] = bbox;
  if (lat < south || lat > north) return false;

  if (west <= east) {
    return lon >= west && lon <= east;
  }

  // Dateline crossing bbox
  return lon >= west || lon <= east;
}

function sanitizeFilters(filters) {
  if (!filters || typeof filters !== 'object') {
    return {
      sourceIds: null,
      sensitivity: null,
      minRank: 0.03,
      tags: null,
    };
  }

  const objectFilters = filters;
  const sourceIds = Array.isArray(objectFilters.source_ids)
    ? objectFilters.source_ids.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 100)
    : null;

  const allowedSensitivity = new Set(['public', 'internal', 'confidential', 'restricted']);
  const sensitivity = Array.isArray(objectFilters.sensitivity)
    ? objectFilters.sensitivity
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => allowedSensitivity.has(value))
      .slice(0, 4)
    : null;

  const tags = Array.isArray(objectFilters.tags)
    ? objectFilters.tags.filter((value) => typeof value === 'string').map((value) => value.trim().toLowerCase()).filter(Boolean).slice(0, 12)
    : null;

  return {
    sourceIds: sourceIds && sourceIds.length > 0 ? sourceIds : null,
    sensitivity: sensitivity && sensitivity.length > 0 ? sensitivity : null,
    minRank: clampNumber(objectFilters.min_rank, 0, 1, 0.03),
    tags: tags && tags.length > 0 ? tags : null,
  };
}

function summarizeSnippet(text, maxLength = 200) {
  if (typeof text !== 'string') return '';
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function toNumber(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function matchTagFilter(metadata, tags) {
  if (!tags || tags.length === 0) return true;
  const metadataTags = Array.isArray(metadata?.tags) ? metadata.tags : [];
  if (metadataTags.length === 0) return false;
  const normalized = metadataTags.map((tag) => String(tag).trim().toLowerCase());
  return tags.some((tag) => normalized.includes(tag));
}

function computeConfidence(rows) {
  if (!rows.length) return 0;

  const avgChunkConfidence = rows.reduce((sum, row) => sum + toNumber(row.confidence, 0), 0) / rows.length;
  const avgRank = rows.reduce((sum, row) => sum + Math.min(toNumber(row.lexical_rank, 0), 1), 0) / rows.length;
  const sourceDiversity = new Set(rows.map((row) => row.source_id)).size / Math.max(1, Math.min(rows.length, 5));

  const score = (avgChunkConfidence * 0.45) + (avgRank * 0.40) + (sourceDiversity * 0.15);
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function buildGroundedAnswer(question, rows) {
  const evidence = rows.slice(0, 5).map((row, index) => (
    `${index + 1}. ${summarizeSnippet(row.text_content, 220)} (source: ${row.source_id})`
  ));

  return [
    `Grounded findings for: "${question}"`,
    '',
    ...evidence,
    '',
    'Inference policy: output is constrained to retrieved evidence only.',
  ].join('\n');
}

function sanitizeChunkRows(rows, { activeLayers, bbox, tags }) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .filter((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const layerId = typeof metadata.layer_id === 'string' ? metadata.layer_id : null;
      const lat = toNumber(metadata.lat);
      const lon = toNumber(metadata.lon);

      if (layerId && activeLayers.length > 0 && !activeLayers.includes(layerId)) return false;
      if (!matchTagFilter(metadata, tags)) return false;
      if (!pointWithinBbox(lat, lon, bbox)) return false;
      return true;
    });
}

function toCitationRows(rows) {
  return rows.map((row, index) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const citationId = typeof row.citation_id === 'string'
      ? row.citation_id
      : `derived-${row.chunk_id || index}`;

    return {
      citation_id: citationId,
      source_id: row.source_id,
      title: row.citation_label || `${row.title || 'Untitled document'} (chunk ${row.chunk_index ?? 'n/a'})`,
      url: row.citation_url || undefined,
      chunk_id: row.chunk_id || undefined,
      snippet: row.citation_snippet || summarizeSnippet(row.text_content, 200),
      feature_id: typeof metadata.feature_id === 'string' ? metadata.feature_id : null,
    };
  });
}

function createRefusalPayload(reason, provenanceId, metadata = {}) {
  return {
    answer: '',
    confidence: 0,
    citations: [],
    provenance_id: provenanceId,
    matched_features: [],
    refusal_reason: reason,
    metadata,
  };
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

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const activeLayers = sanitizeLayers(body.active_layers);
  const mapBbox = sanitizeBbox(body.map_bbox);
  const filters = sanitizeFilters(body.filters);
  const topK = clampNumber(body.top_k, 1, 20, 8);
  const refusalThreshold = clampNumber(process.env.NEXUSWATCH_REFUSAL_THRESHOLD, 0, 1, 0.4);

  if (!question || question.length > 600) {
    return new Response(JSON.stringify({ error: 'question is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const provenanceId = crypto.randomUUID();
  const userId = getClientUserId(req);

  if (activeLayers.length === 0) {
    return new Response(JSON.stringify(createRefusalPayload(
      'No active layers selected for grounded retrieval.',
      provenanceId,
      { active_layers: activeLayers },
    )), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const promptHash = await sha256Hex(question.toLowerCase());
  let queryLog = null;

  if (!hasNexusSupabaseConfig()) {
    return new Response(JSON.stringify(createRefusalPayload(
      'Supabase RAG backend unavailable. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      provenanceId,
      {
        prompt_hash: promptHash,
        model_id: 'none',
        active_layers: activeLayers,
      },
    )), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    queryLog = await insertNexusRow('query_logs', {
      user_id: userId,
      question,
      active_layers: activeLayers,
      map_bbox: mapBbox,
      filters: {
        ...body.filters,
        normalized: {
          source_ids: filters.sourceIds,
          sensitivity: filters.sensitivity,
          min_rank: filters.minRank,
          tags: filters.tags,
        },
      },
      top_k: topK,
      prompt_hash: promptHash,
      model_id: 'grounded-evidence-v1',
      metadata: {
        request_origin: req.headers.get('origin') || null,
      },
    });

    const retrieved = await rpcNexus('match_chunks_lexical', {
      query_text: question,
      match_count: topK,
      source_filter: filters.sourceIds,
      sensitivity_filter: filters.sensitivity,
      min_rank: filters.minRank,
    });

    const filteredRows = sanitizeChunkRows(retrieved, {
      activeLayers,
      bbox: mapBbox,
      tags: filters.tags,
    }).slice(0, topK);

    if (filteredRows.length === 0) {
      const refusal = createRefusalPayload(
        'No grounded evidence found for the selected layers and filters.',
        provenanceId,
        {
          prompt_hash: promptHash,
          model_id: 'grounded-evidence-v1',
        },
      );

      const answerLog = await insertNexusRow('answer_logs', {
        query_id: queryLog?.id ?? null,
        answer_text: '',
        confidence: 0,
        refusal_reason: refusal.refusal_reason,
        provenance_id: provenanceId,
        retrieved_chunk_ids: [],
        matched_feature_ids: [],
        metadata: {
          active_layers: activeLayers,
          top_k: topK,
        },
      });

      refusal.answer_id = answerLog?.id ?? null;

      return new Response(JSON.stringify(refusal), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...cors,
        },
      });
    }

    const citations = toCitationRows(filteredRows);
    const matchedFeatures = Array.from(new Set(citations.map((citation) => citation.feature_id).filter(Boolean)));
    const confidence = computeConfidence(filteredRows);
    const refusalReason = confidence < refusalThreshold
      ? `Evidence confidence ${confidence.toFixed(2)} below refusal threshold ${refusalThreshold.toFixed(2)}.`
      : undefined;

    const answerText = refusalReason
      ? ''
      : buildGroundedAnswer(question, filteredRows);

    const answerLog = await insertNexusRow('answer_logs', {
      query_id: queryLog?.id ?? null,
      answer_text: answerText,
      confidence,
      refusal_reason: refusalReason || null,
      provenance_id: provenanceId,
      retrieved_chunk_ids: filteredRows.map((row) => row.chunk_id).filter(Boolean),
      matched_feature_ids: matchedFeatures,
      metadata: {
        prompt_hash: promptHash,
        model_id: 'grounded-evidence-v1',
        retrieval: {
          source_count: new Set(filteredRows.map((row) => row.source_id)).size,
          row_count: filteredRows.length,
          min_rank: filters.minRank,
        },
      },
    });

    const citationLinks = citations
      .filter((citation) => typeof citation.citation_id === 'string' && !citation.citation_id.startsWith('derived-'))
      .map((citation) => ({ answer_id: answerLog?.id, citation_id: citation.citation_id }))
      .filter((row) => row.answer_id && row.citation_id);

    if (citationLinks.length > 0) {
      await insertNexusRows('answer_citations', citationLinks);
    }

    const response = {
      answer: answerText,
      answer_id: answerLog?.id ?? null,
      confidence,
      citations: citations.map((citation) => ({
        citation_id: citation.citation_id,
        source_id: citation.source_id,
        title: citation.title,
        url: citation.url,
        chunk_id: citation.chunk_id,
        snippet: citation.snippet,
      })),
      provenance_id: provenanceId,
      matched_features: matchedFeatures,
      refusal_reason: refusalReason,
      metadata: {
        prompt_hash: promptHash,
        model_id: 'grounded-evidence-v1',
        active_layers: activeLayers,
        logged_at: new Date().toISOString(),
      },
    };

    console.info('[ask-globe]', JSON.stringify({
      prompt_hash: promptHash,
      active_layers: activeLayers,
      top_k: topK,
      matched_features: matchedFeatures.length,
      refusal: Boolean(refusalReason),
    }));

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  } catch (error) {
    const details = error instanceof NexusSupabaseError ? error.details : null;
    const message = error instanceof Error ? error.message : String(error);

    console.error('[ask-globe:error]', JSON.stringify({
      prompt_hash: promptHash,
      message,
      details,
    }));

    const payload = createRefusalPayload(
      'Grounded retrieval failed; request has been logged for audit review.',
      provenanceId,
      {
        prompt_hash: promptHash,
        model_id: 'grounded-evidence-v1',
      },
    );

    if (queryLog?.id) {
      try {
        const answerLog = await insertNexusRow('answer_logs', {
          query_id: queryLog.id,
          answer_text: '',
          confidence: 0,
          refusal_reason: payload.refusal_reason,
          provenance_id: provenanceId,
          retrieved_chunk_ids: [],
          matched_feature_ids: [],
          metadata: {
            failure_message: message,
          },
        });
        payload.answer_id = answerLog?.id ?? null;
      } catch {
        // Ignore secondary failures while returning refusal.
      }
    }

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  }
}
