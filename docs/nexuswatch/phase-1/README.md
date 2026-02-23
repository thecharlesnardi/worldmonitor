# Phase 1 - Source Catalog and Truth Layer

## Scope
This phase establishes the canonical source registry, confidence policy, lineage requirements, and internal intake protocol for NexusWatch.

## Canonical Registry
- Registry file: `data/nexuswatch/source_catalog.json`
- Validation script: `scripts/nexuswatch/validate-source-catalog.mjs`
- Internal intake root: `data/nexuswatch/internal-intake/`
- Intake chunking script: `scripts/nexuswatch/chunk-intake-docs.mjs`

## Source Approval Workflow
1. `Draft`: Data engineer adds source candidate row to `source_catalog.json` with parser + legal notes.
2. `Legal Review`: Compliance confirms license terms, redistribution constraints, and citation obligations.
3. `Security Review`: AppSec assigns sensitivity class and confirms handling controls.
4. `Ops Review`: Data owner confirms cadence, freshness SLA, and incident contact.
5. `Approved`: Source can be ingested into production pipelines.
6. `Suspended`: Source can be temporarily disabled for quality/legal/security risk.

## Required Lineage Contract
Every ingested record must preserve this lineage chain:
- `source_id`
- `acquired_at_utc`
- `raw_artifact_hash` (sha256)
- `transform_version` (git sha or migration id)
- `record_hash` (sha256)
- `chunk_id` (for RAG)
- `embedding_version`
- `retrieval_trace_id`
- `answer_id` (if referenced in generated output)

## Confidence Policy
NexusWatch confidence score is normalized to `[0.0, 1.0]` and must be attached to each surfaced claim.

Formula baseline (per source row):
- `confidence = base_source_score*0.40 + recency_score*0.25 + schema_validity*0.20 + cross_source_agreement*0.15`

Rules:
- Any claim without citation lineage is forced to `confidence = 0` and is not answerable.
- Confidence > 0.85 requires at least one independent corroborating source.
- If data is stale beyond SLA, confidence is capped at 0.55.
- For internal restricted docs, confidence is capped at 0.70 unless a second internal source corroborates.

## Internal Intake Manifest
Use `docs/nexuswatch/phase-1/internal_manifest.template.json` for every uploaded internal file.

Required fields:
- `document_id`
- `source_id`
- `title`
- `classification`
- `owner`
- `created_at`
- `uploaded_at`
- `sha256`
- `mime_type`
- `origin_system`
- `permitted_use`
- `redaction_status`

Recommended enrichment fields:
- `local_path` (local-first intake file path)
- `layer_id` / `feature_id` (map linkage)
- `lat` / `lon` (optional geospatial context)
- `tags[]`

## Data Quality Checks (P0)
- Schema validation for every catalog row and every intake manifest.
- Coordinate sanity check: latitude `[-90, 90]`, longitude `[-180, 180]`.
- Duplicate detection: reject records with same `(source_id, primary_id, updated_at)` hash.
- Freshness monitor: alert when `freshness_sla` is breached.
- Legal gate: source rows without `license` or `legal_notes` cannot move to `Approved`.

## Execution Commands
```bash
node scripts/nexuswatch/validate-source-catalog.mjs
```

```bash
node scripts/nexuswatch/validate-source-catalog.mjs --strict
```

```bash
npm run nexus:chunk-intake
```
