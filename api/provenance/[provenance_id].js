export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import {
  hasNexusSupabaseConfig,
  isUuid,
  NexusSupabaseError,
  requireNexusApiKey,
  rpcNexus,
} from '../_nexus-supabase.js';

function extractProvenanceId(url) {
  const pathname = new URL(url).pathname;
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export default async function handler(req) {
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cors = getCorsHeaders(req, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'GET') {
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

  const provenanceId = extractProvenanceId(req.url);
  if (!provenanceId || !isUuid(provenanceId)) {
    return new Response(JSON.stringify({ error: 'Missing provenance_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (!hasNexusSupabaseConfig()) {
    const payload = {
      provenance_id: provenanceId,
      status: 'unresolved',
      message: 'Supabase provenance resolver not configured.',
      lineage: {
        source: null,
        transform: null,
        chunk: null,
        retrieval: null,
        answer: null,
      },
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  }

  try {
    const lineage = await rpcNexus('get_provenance', { p_provenance_id: provenanceId });
    if (!lineage || (typeof lineage === 'object' && Object.keys(lineage).length === 0)) {
      return new Response(JSON.stringify({
        provenance_id: provenanceId,
        status: 'not_found',
        message: 'No provenance record found for this ID.',
        generated_at: new Date().toISOString(),
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...cors,
        },
      });
    }

    const payload = {
      status: 'resolved',
      generated_at: new Date().toISOString(),
      ...lineage,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  } catch (error) {
    const payload = {
      provenance_id: provenanceId,
      status: 'error',
      message: error instanceof NexusSupabaseError ? error.message : 'Failed to resolve provenance.',
      details: error instanceof NexusSupabaseError ? error.details : null,
      generated_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  }

}
