#!/usr/bin/env node

import { createServer } from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import askGlobeHandler from '../../api/ask-globe.js';
import feedbackHandler from '../../api/feedback.js';
import provenanceHandler from '../../api/provenance/[provenance_id].js';
import diligencePacketHandler from '../../api/exports/diligence-packet.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const distDir = path.resolve(root, process.env.NEXUSWATCH_DIST_DIR || 'dist');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);

const ROUTES = [
  { method: 'POST', matcher: /^\/api\/ask-globe$/, handler: askGlobeHandler },
  { method: 'POST', matcher: /^\/api\/feedback$/, handler: feedbackHandler },
  { method: 'GET', matcher: /^\/api\/provenance\/[0-9a-fA-F-]+$/, handler: provenanceHandler },
  { method: 'POST', matcher: /^\/api\/exports\/diligence-packet$/, handler: diligencePacketHandler },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function hasRequestBody(method) {
  return !['GET', 'HEAD'].includes(method.toUpperCase());
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createRequestHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
      continue;
    }
    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  return headers;
}

async function invokeApiHandler(nodeReq) {
  const pathname = new URL(nodeReq.url || '/', `http://${nodeReq.headers.host || 'localhost'}`).pathname;
  const route = ROUTES.find((candidate) => candidate.matcher.test(pathname) && candidate.method === nodeReq.method?.toUpperCase());

  // Permit OPTIONS for all registered routes.
  const optionsRoute = nodeReq.method?.toUpperCase() === 'OPTIONS'
    ? ROUTES.find((candidate) => candidate.matcher.test(pathname))
    : null;

  const selected = route || optionsRoute;
  if (!selected) return null;

  const bodyBuffer = hasRequestBody(nodeReq.method || 'GET') ? await readBody(nodeReq) : null;
  const headers = createRequestHeaders(nodeReq.headers);
  const requestUrl = `http://${nodeReq.headers.host || `localhost:${port}`}${nodeReq.url || '/'}`;

  const requestInit = {
    method: nodeReq.method,
    headers,
  };

  if (bodyBuffer && bodyBuffer.length > 0) {
    requestInit.body = bodyBuffer;
  }

  const request = new Request(requestUrl, requestInit);
  const response = await selected.handler(request);
  return response;
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function serveStatic(nodeReq, nodeRes) {
  const reqUrl = new URL(nodeReq.url || '/', `http://${nodeReq.headers.host || `localhost:${port}`}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  if (pathname.startsWith('/api/')) {
    nodeRes.writeHead(404, { 'Content-Type': 'application/json' });
    nodeRes.end(JSON.stringify({ error: 'Route not found' }));
    return;
  }

  const requestedPath = pathname === '/'
    ? path.join(distDir, 'index.html')
    : path.join(distDir, pathname.replace(/^\/+/, ''));

  const candidate = path.resolve(requestedPath);
  let filePath = candidate;

  if (!isPathInside(distDir, candidate)) {
    nodeRes.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    nodeRes.end('Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    filePath = path.join(distDir, 'index.html');
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const data = await fsp.readFile(filePath);
    nodeRes.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    });
    nodeRes.end(data);
  } catch {
    nodeRes.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    nodeRes.end('Not Found');
  }
}

async function sendFetchResponse(nodeRes, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = Buffer.from(await response.arrayBuffer());
  nodeRes.writeHead(response.status, headers);
  nodeRes.end(body);
}

if (!fs.existsSync(distDir)) {
  console.error(`[nexuswatch] dist directory not found: ${distDir}`);
  console.error('[nexuswatch] run `npm run build:nexus` before starting private-cloud-server.');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const apiResponse = await invokeApiHandler(req);
    if (apiResponse) {
      await sendFetchResponse(res, apiResponse);
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    console.error('[nexuswatch] request failure', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(port, host, () => {
  console.log(`[nexuswatch] private cloud server listening on http://${host}:${port}`);
});
