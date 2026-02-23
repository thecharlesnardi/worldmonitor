# Phase 5 - Threat Model (Initial)

## Assets
- Internal source documents and extracted chunks
- Embeddings and retrieval metadata
- Analyst prompts, answers, and citations
- API keys and service-role credentials

## Trust Boundaries
- Browser client <-> API edge handlers
- API edge handlers <-> Supabase
- Internal document intake path <-> ingestion workers

## High-Risk Abuse Paths
1. Prompt injection via malicious document content.
2. Unauthorized retrieval of restricted chunks.
3. Client-side secret leakage.
4. Citation spoofing (answer cites incorrect source).
5. API abuse for data exfiltration.

## Mitigations
- Grounding-first refusal policy with lexical retrieval fallback and confidence threshold.
- RLS with authenticated-only policies in `nexus` schema.
- Mandatory provenance IDs and citation rows per answer.
- Strict source catalog governance with legal + security review.
- Input validation and CORS restrictions on all new API handlers.
- Optional internal API key enforcement for private deployment.
- Hash-chained immutable audit events (`nexus.audit_events`).

## Remaining Gaps
- Tenant/organization isolation policy still needs explicit field-level partitioning.
- Embedding pipeline in air-gapped mode requires local model adapter selection.
- Automated abuse-rate limiting layer is not yet implemented at gateway level.
