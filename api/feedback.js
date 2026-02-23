export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import {
  getClientUserId,
  hasNexusSupabaseConfig,
  insertNexusRow,
  isUuid,
  NexusSupabaseError,
  requireNexusApiKey,
  rpcNexus,
} from './_nexus-supabase.js';

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

  const answerId = typeof body.answer_id === 'string' ? body.answer_id.trim() : '';
  const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : '';
  const comment = typeof body.comment === 'string' ? body.comment.slice(0, 2000) : '';
  const correctionTags = Array.isArray(body.correction_tags)
    ? body.correction_tags.filter((tag) => typeof tag === 'string').slice(0, 20)
    : [];

  if (!answerId || !rating) {
    return new Response(JSON.stringify({ error: 'answer_id and rating are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (!isUuid(answerId)) {
    return new Response(JSON.stringify({ error: 'answer_id must be a UUID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (!hasNexusSupabaseConfig()) {
    return new Response(JSON.stringify({
      ok: true,
      status: 'queued',
      feedback: {
        answer_id: answerId,
        rating,
        comment,
        correction_tags: correctionTags,
        received_at: new Date().toISOString(),
      },
      warning: 'Supabase is not configured; feedback was not persisted.',
    }), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  }

  try {
    const createdBy = getClientUserId(req);
    const row = await insertNexusRow('feedback', {
      answer_id: answerId,
      rating,
      comment: comment || null,
      correction_tags: correctionTags,
      created_by: createdBy,
    });

    try {
      await rpcNexus('log_audit_event', {
        p_event_type: 'feedback.created',
        p_entity_id: row?.id || null,
        p_actor_id: createdBy || null,
        p_payload: {
          answer_id: answerId,
          rating,
          correction_tags: correctionTags,
        },
      });
    } catch {
      // Audit logging is best effort; do not fail feedback writes.
    }

    return new Response(JSON.stringify({
      ok: true,
      status: 'persisted',
      feedback: {
        id: row?.id ?? null,
        answer_id: answerId,
        rating,
        comment,
        correction_tags: correctionTags,
        received_at: row?.created_at ?? new Date().toISOString(),
      },
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  } catch (error) {
    console.error('[feedback:error]', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof NexusSupabaseError ? error.message : 'Failed to persist feedback.',
      details: error instanceof NexusSupabaseError ? error.details : null,
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...cors,
      },
    });
  }
}
