# Phase 4 - Ask the Globe Intelligence Integration

## Implemented
- `api/ask-globe.js`
  - Geospatial + metadata filter intake
  - Grounded lexical retrieval orchestration (`nexus.match_chunks_lexical`)
  - Refusal threshold enforcement
  - Query/answer log writes
- `api/provenance/[provenance_id].js`
  - Provenance resolution via `nexus.get_provenance`
- `api/feedback.js`
  - Feedback persistence with correction tags

## Runtime Contract
- Refuses unsupported answers by default.
- Returns citations and provenance IDs for any grounded response.
- Returns `answer_id` for downstream feedback and export APIs.

## Exact Next Actions
1. Add semantic retrieval blend (`match_chunks` + embedding query) for improved recall.
2. Add model-grounded synthesis stage with strict citation pinning.
3. Add map feature highlight wiring for `matched_features` in frontend panel.
4. Add endpoint-level rate limiting and abuse controls.
5. Add regression QA suite for confidence/refusal calibration.
