# NexusWatch Build Plan (Chronological)

## Phase 1 - Source Catalog and Truth Layer
- Status: Implemented (initial catalog + governance + validation)
- Deliverables implemented:
  - `data/nexuswatch/source_catalog.json`
  - `docs/nexuswatch/phase-1/source_catalog.schema.json`
  - `docs/nexuswatch/phase-1/internal_manifest.template.json`
  - `docs/nexuswatch/phase-1/README.md`
  - `scripts/nexuswatch/validate-source-catalog.mjs`

## Phase 2 - WorldMonitor Fork, Rebrand, and Live Globe Foundation
- Status: Implemented (local fork baseline)
- Deliverables implemented:
  - Local fork under `nexuswatch/`
  - New `nexus` variant wiring
  - Rebrand touches (`NEXUSWATCH` logo/title, package name)
  - Hero rotating globe retained in deck.gl/maplibre mode
  - First Nexus layer set wired:
    - Existing nuclear facilities
    - Existing datacenters
    - Coal-to-nuclear feasibility
    - Industrial heat opportunities
    - Advanced reactor pipeline
  - `Ask the Globe` UI shell in map overlay
  - AGPL notice doc: `docs/nexuswatch/phase-2/AGPL-NOTICE.md`

## Phase 3 - Supabase pgvector RAG Backbone
- Status: Implemented (schema + ingestion scripts + retrieval functions)
- Deliverables implemented:
  - Migration file: `supabase/migrations/202602230001_nexuswatch_rag.sql`
  - Tables: sources/documents/chunks/embeddings/citations/query_logs/answer_logs (+ relation tables)
  - Retrieval + provenance SQL functions
  - RLS baseline and authenticated policies
  - Phase notes: `docs/nexuswatch/phase-3/README.md`

## Phase 4 - Ask the Globe Intelligence Integration
- Status: Implemented (grounded retrieval + refusal thresholds + logs)
- Deliverables implemented:
  - `api/ask-globe.js`
  - `api/provenance/[provenance_id].js`
  - `api/feedback.js`
  - `api/exports/diligence-packet.js`
  - `api/_nexus-supabase.js`

## Phase 5 - Security, Provenance, Auditability
- Status: Implemented (baseline)
- Deliverables implemented:
  - Internal API key option (`NEXUSWATCH_INTERNAL_API_KEY`)
  - Audit-chain schema and function (`nexus.audit_events`, `nexus.log_audit_event`)
  - RLS policy hardening in `202602230002_nexuswatch_hardening.sql`
  - Provenance resolution via `nexus.get_provenance`

## Phase 6 - Analyst Workflow and Deliverables
- Status: Implemented (baseline)
- Deliverables implemented:
  - `api/exports/diligence-packet.js`
  - `scripts/nexuswatch/export-diligence-packet.mjs`
  - `data/nexuswatch/alerts/headless-templates.json`

## Phase 7 - Private Cloud + Air-Gap Parity
- Status: Implemented (baseline)
- Deliverables implemented:
  - `server/nexuswatch/private-cloud-server.mjs`
  - `deploy/nexuswatch/Dockerfile`
  - `deploy/nexuswatch/docker-compose.private-cloud.yml`
  - `deploy/nexuswatch/docker-compose.airgap.yml`
  - `scripts/nexuswatch/build-offline-bundle.mjs`

## Phase 8 - Internal Rollout and Governance
- Status: Planned with rollout docs
- Deliverables implemented:
  - `docs/nexuswatch/phase-8/README.md`
