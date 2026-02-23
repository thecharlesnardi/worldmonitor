const NEXUS_SCHEMA = 'nexus';

export class NexusSupabaseError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'NexusSupabaseError';
    this.status = status;
    this.details = details;
  }
}

function env(name) {
  return (process.env[name] || '').trim();
}

function normalizeSupabaseUrl(value) {
  return value.replace(/\/+$/, '');
}

export function getNexusSupabaseConfig() {
  const url = normalizeSupabaseUrl(env('SUPABASE_URL') || env('VITE_SUPABASE_URL'));
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export function hasNexusSupabaseConfig() {
  return Boolean(getNexusSupabaseConfig());
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function requireNexusApiKey(req) {
  const requiredKey = env('NEXUSWATCH_INTERNAL_API_KEY');
  if (!requiredKey) {
    return { ok: true, required: false };
  }

  const provided = (req.headers.get('x-nexuswatch-key') || req.headers.get('x-worldmonitor-key') || '').trim();
  if (!provided) {
    return { ok: false, required: true, error: 'API key required for NexusWatch internal endpoints.' };
  }

  if (!constantTimeEqual(provided, requiredKey)) {
    return { ok: false, required: true, error: 'Invalid NexusWatch API key.' };
  }

  return { ok: true, required: true };
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createSupabaseHeaders(serviceRoleKey, { profile = NEXUS_SCHEMA, method = 'GET', prefer = '' } = {}) {
  const isRead = method === 'GET' || method === 'HEAD';
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    [isRead ? 'Accept-Profile' : 'Content-Profile']: profile,
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function appendQuery(url, query) {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
}

export async function nexusRest(path, {
  method = 'GET',
  body,
  query,
  profile = NEXUS_SCHEMA,
  prefer = '',
  timeoutMs = 18_000,
} = {}) {
  const config = getNexusSupabaseConfig();
  if (!config) {
    throw new NexusSupabaseError('Supabase configuration missing (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).', 503);
  }

  const url = new URL(`${config.url}/rest/v1/${path}`);
  appendQuery(url, query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('nexus_supabase_timeout'), timeoutMs);

  let response;
  let text = '';
  try {
    response = await fetch(url, {
      method,
      headers: createSupabaseHeaders(config.serviceRoleKey, { profile, method, prefer }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    text = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new NexusSupabaseError(`Supabase request failed: ${message}`, 502);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const details = parseJsonSafe(text) || text;
    const message = `Supabase request failed with status ${response.status}`;
    throw new NexusSupabaseError(message, response.status, details);
  }

  if (!text) return null;
  const json = parseJsonSafe(text);
  return json === null ? text : json;
}

export async function rpcNexus(functionName, args = {}, { timeoutMs } = {}) {
  return nexusRest(`rpc/${functionName}`, {
    method: 'POST',
    body: args,
    prefer: 'return=representation',
    timeoutMs,
  });
}

export async function insertNexusRow(table, row, { timeoutMs } = {}) {
  const result = await nexusRest(table, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
    timeoutMs,
  });

  if (Array.isArray(result)) return result[0] || null;
  return result;
}

export async function insertNexusRows(table, rows, { timeoutMs } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const result = await nexusRest(table, {
    method: 'POST',
    body: rows,
    prefer: 'return=representation',
    timeoutMs,
  });
  return Array.isArray(result) ? result : [];
}

export async function upsertNexusRows(table, rows, { onConflict, ignoreDuplicates = false, timeoutMs } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const preferParts = ['resolution=merge-duplicates', 'return=representation'];
  if (ignoreDuplicates) preferParts.push('missing=default');

  const result = await nexusRest(table, {
    method: 'POST',
    body: rows,
    prefer: preferParts.join(','),
    query: onConflict ? { on_conflict: onConflict } : undefined,
    timeoutMs,
  });

  return Array.isArray(result) ? result : [];
}

export async function selectNexus(table, {
  select = '*',
  filters,
  order,
  limit,
  timeoutMs,
} = {}) {
  const query = { select };

  if (order) {
    query.order = order;
  }

  if (Number.isFinite(limit)) {
    query.limit = Number(limit);
  }

  if (filters && typeof filters === 'object') {
    for (const [field, value] of Object.entries(filters)) {
      if (typeof value !== 'string') continue;
      query[field] = value;
    }
  }

  const result = await nexusRest(table, {
    method: 'GET',
    query,
    timeoutMs,
  });

  return Array.isArray(result) ? result : [];
}

function decodeBase64Url(value) {
  if (!value) return '';
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');

  if (typeof atob === 'function') {
    return atob(normalized);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'base64').toString('utf8');
  }

  return '';
}

export function getClientUserId(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const payloadText = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadText);
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
