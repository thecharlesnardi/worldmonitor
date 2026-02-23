# NexusWatch API Contracts

## POST `/api/ask-globe`
Request body:
```json
{
  "question": "What coal sites near hyperscaler regions are likely C2N candidates?",
  "active_layers": ["coalToNuclear", "datacenters", "advancedReactors"],
  "map_bbox": [-125, 24, -66, 49],
  "filters": {
    "source_ids": ["doe-c2n", "gem-coal-tracker"],
    "sensitivity": ["public", "internal"],
    "min_rank": 0.05,
    "tags": ["grid", "interconnection"]
  },
  "top_k": 8
}
```

Response body:
```json
{
  "answer": "Grounded findings for ...",
  "answer_id": "uuid",
  "confidence": 0.71,
  "citations": [
    {
      "citation_id": "uuid-or-derived",
      "source_id": "doe-c2n",
      "title": "...",
      "url": "https://...",
      "chunk_id": "uuid",
      "snippet": "..."
    }
  ],
  "provenance_id": "uuid",
  "matched_features": ["feature-001"],
  "refusal_reason": null
}
```

## GET `/api/provenance/:provenance_id`
Response body (resolved):
```json
{
  "status": "resolved",
  "generated_at": "...",
  "provenance_id": "uuid",
  "query": { "...": "..." },
  "answer": { "...": "..." },
  "chunks": [{ "...": "..." }],
  "citations": [{ "...": "..." }],
  "audit_events": [{ "...": "..." }]
}
```

## POST `/api/feedback`
Request body:
```json
{
  "answer_id": "uuid",
  "rating": "up",
  "comment": "Useful, but please include latest outage delta.",
  "correction_tags": ["freshness", "scope"]
}
```

Response body:
```json
{
  "ok": true,
  "status": "persisted",
  "feedback": {
    "id": "uuid",
    "answer_id": "uuid",
    "rating": "up",
    "comment": "...",
    "correction_tags": ["freshness", "scope"],
    "received_at": "..."
  }
}
```

## POST `/api/exports/diligence-packet`
Request body:
```json
{
  "answer_id": "uuid",
  "title": "C2N Feasibility Diligence"
}
```

Response body:
```json
{
  "ok": true,
  "title": "...",
  "question": "...",
  "confidence": 0.72,
  "provenance_id": "uuid",
  "markdown": "# ...",
  "shortlist_csv": "rank,source_id,...",
  "citations": [{ "...": "..." }],
  "generated_at": "..."
}
```

## Security Notes
- Optional header `X-NexusWatch-Key` is enforced when `NEXUSWATCH_INTERNAL_API_KEY` is configured.
- CORS may be constrained through `NEXUSWATCH_ALLOWED_ORIGINS`.
- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed in client-side bundles.
