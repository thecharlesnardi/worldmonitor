#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');

const catalogPath = path.join(root, 'data/nexuswatch/source_catalog.json');
const layerConfigPath = path.join(root, 'src/config/nexus-geo.ts');
const intakeDir = path.join(root, 'data/nexuswatch/internal-intake');

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateCatalog() {
  if (!fs.existsSync(catalogPath)) {
    fail(`Missing source catalog: ${catalogPath}`);
    return;
  }

  let catalog;
  try {
    catalog = readJson(catalogPath);
  } catch (error) {
    fail(`source_catalog.json parse failure: ${String(error)}`);
    return;
  }

  if (!Array.isArray(catalog)) {
    fail('source_catalog.json must be a JSON array');
    return;
  }

  const requiredFields = [
    'source_id',
    'name',
    'category',
    'canonical_url',
    'license',
    'cadence',
    'owner',
    'sensitivity',
    'parser',
    'freshness_sla',
    'validation_rules',
    'confidence_model',
    'priority_tier',
    'legal_notes',
  ];

  const seenSourceIds = new Set();
  let p0Count = 0;

  catalog.forEach((row, index) => {
    const label = `source_catalog[${index}]`;

    if (!row || typeof row !== 'object') {
      fail(`${label} must be an object`);
      return;
    }

    for (const key of requiredFields) {
      if (!(key in row)) fail(`${label} missing required field: ${key}`);
    }

    if (typeof row.source_id !== 'string' || !/^[a-z0-9-]+$/.test(row.source_id)) {
      fail(`${label}.source_id must match ^[a-z0-9-]+$`);
    }

    if (seenSourceIds.has(row.source_id)) {
      fail(`${label}.source_id duplicated: ${row.source_id}`);
    }
    seenSourceIds.add(row.source_id);

    if (typeof row.canonical_url !== 'string' || !/^(https?:\/\/|file:\/\/)/.test(row.canonical_url)) {
      fail(`${label}.canonical_url must start with http(s):// or file://`);
    }

    if (!Array.isArray(row.validation_rules) || row.validation_rules.length === 0) {
      fail(`${label}.validation_rules must be a non-empty array`);
    }

    if (!['P0', 'P1', 'P2'].includes(row.priority_tier)) {
      fail(`${label}.priority_tier must be one of P0/P1/P2`);
    }

    if (row.priority_tier === 'P0') p0Count += 1;

    if (strict && row.sensitivity !== 'public' && !String(row.canonical_url).startsWith('file://')) {
      warn(`${label} is non-public but canonical_url is not a file:// path`);
    }
  });

  if (strict && p0Count < 13) {
    fail(`Expected at least 13 P0 sources, found ${p0Count}`);
  }
}

function validateLayerCoordinates() {
  if (!fs.existsSync(layerConfigPath)) {
    warn(`Missing layer config for coordinate checks: ${layerConfigPath}`);
    return;
  }

  const content = fs.readFileSync(layerConfigPath, 'utf8');
  const pattern = /feature_id:\s*'([^']+)'[\s\S]*?lat:\s*(-?\d+(?:\.\d+)?)[\s\S]*?lon:\s*(-?\d+(?:\.\d+)?)/g;
  const seenFeatureIds = new Set();
  let matchCount = 0;

  for (const match of content.matchAll(pattern)) {
    matchCount += 1;
    const featureId = match[1];
    const lat = Number(match[2]);
    const lon = Number(match[3]);

    if (seenFeatureIds.has(featureId)) {
      fail(`Duplicate feature_id detected in nexus-geo.ts: ${featureId}`);
    }
    seenFeatureIds.add(featureId);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      fail(`Invalid latitude for feature ${featureId}: ${match[2]}`);
    }
    if (Number.isNaN(lon) || lon < -180 || lon > 180) {
      fail(`Invalid longitude for feature ${featureId}: ${match[3]}`);
    }
  }

  if (matchCount === 0) {
    warn('No layer features found in nexus-geo.ts during coordinate validation');
  }
}

function validateIntakeManifests() {
  if (!fs.existsSync(intakeDir)) return;

  const manifestFiles = fs.readdirSync(intakeDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(intakeDir, file));

  const required = [
    'document_id',
    'source_id',
    'classification',
    'owner',
    'created_at',
    'uploaded_at',
    'sha256',
    'mime_type',
    'origin_system',
    'permitted_use',
    'redaction_status',
  ];

  for (const manifestPath of manifestFiles) {
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch (error) {
      fail(`Manifest parse failure (${manifestPath}): ${String(error)}`);
      continue;
    }

    for (const key of required) {
      if (!(key in manifest)) {
        fail(`Manifest ${path.basename(manifestPath)} missing field: ${key}`);
      }
    }

    if (typeof manifest.sha256 !== 'string' || manifest.sha256.length < 32) {
      fail(`Manifest ${path.basename(manifestPath)} has invalid sha256`);
    }
  }
}

validateCatalog();
validateLayerCoordinates();
validateIntakeManifests();

if (warnings.length > 0) {
  console.log('[nexuswatch] warnings');
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length > 0) {
  console.error('[nexuswatch] validation failed');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('[nexuswatch] source catalog validation passed');
