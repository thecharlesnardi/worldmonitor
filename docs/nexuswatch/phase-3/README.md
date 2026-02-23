# Phase 3 - Supabase pgvector RAG Backbone

## Migration
- SQL migration: `supabase/migrations/202602230001_nexuswatch_rag.sql`
- SQL hardening migration: `supabase/migrations/202602230002_nexuswatch_hardening.sql`
- Required Supabase extensions: `vector`, `pgcrypto`

## Created Objects
- Schema: `nexus`
- Tables:
  - `nexus.sources`
  - `nexus.documents`
  - `nexus.chunks`
  - `nexus.embeddings`
  - `nexus.citations`
  - `nexus.query_logs`
  - `nexus.answer_logs`
  - `nexus.answer_citations`
  - `nexus.feedback`
  - `nexus.audit_events`
- Functions:
  - `nexus.match_chunks(query_embedding, match_count, min_similarity, source_filter, sensitivity_filter)`
  - `nexus.match_chunks_lexical(query_text, match_count, source_filter, sensitivity_filter, min_rank)`
  - `nexus.get_provenance(provenance_id)`
  - `nexus.log_audit_event(event_type, entity_id, actor_id, payload)`

## Ingestion Tooling
- `npm run nexus:chunk-intake`
  - Chunks local intake text assets to JSONL with lineage metadata.
- `npm run nexus:sync-sources`
  - Upserts `data/nexuswatch/source_catalog.json` into `nexus.sources`.
- `npm run nexus:sync-chunks -- --write-citations`
  - Upserts documents/chunks and optional citation rows.
- `npm run nexus:sync-chunks -- --with-embeddings --write-citations`
  - Attempts pgvector embeddings.
  - If `OPENAI_API_KEY` is missing, ingestion continues without embeddings by default.
  - Add `--require-embeddings` to fail-fast when embedding generation is mandatory.

## API Wiring Completed
- `/api/ask-globe` now:
  - Writes `query_logs` and `answer_logs`.
  - Retrieves grounded rows through `nexus.match_chunks_lexical`.
  - Returns refusal when evidence is missing or confidence is below threshold.
- `/api/provenance/:provenance_id` now resolves through `nexus.get_provenance`.
- `/api/feedback` now persists to `nexus.feedback` (or returns queued when backend is unavailable).

## Security Baseline
- RLS enabled for all `nexus.*` tables.
- Least-privilege policy split for select/insert on mutable log tables.
- Service-role key remains backend-only.
