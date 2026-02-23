# Phase 5 - Security Baseline

## Data Classification
- `public`: open datasets and public reports.
- `internal`: internal operational docs with no client confidentiality constraints.
- `confidential`: client-related and commercially sensitive content.
- `restricted`: safety analyses, reactor specifications, regulated material.

## Required Controls
- Supabase RLS enabled on all Nexus schema tables.
- Service-role keys allowed only in backend runtime.
- Client bundles must not expose service role secrets.
- Immutable audit chain (`audit_events.event_hash` with previous hash linking).
- Answer logging (`query_logs`, `answer_logs`, `answer_citations`) with refusal paths.
- Provenance IDs required for every non-empty answer.
- Optional internal API key enforcement (`NEXUSWATCH_INTERNAL_API_KEY`).

## Logging and Audit
- Record `prompt_hash`, `model_id`, `retrieved_chunk_ids`, `matched_feature_ids`.
- Log refusals explicitly with `refusal_reason`.
- Keep all logs in UTC timestamps.
- Persist feedback records linked to `answer_id`.
- Emit audit events through `nexus.log_audit_event(...)` when available.

## Pre-Rollout Security Checklist
1. Apply both migrations (`202602230001`, `202602230002`) and verify policies in Supabase.
2. Set `NEXUSWATCH_INTERNAL_API_KEY` and `NEXUSWATCH_ALLOWED_ORIGINS` in private environments.
3. Run endpoint tests for unauthorized access (`/api/ask-globe`, `/api/provenance/*`, `/api/feedback`, `/api/exports/diligence-packet`).
4. Confirm server logs redact document excerpts above policy limits.
5. Validate backup/restore path for `nexus.*` tables including `audit_events`.
