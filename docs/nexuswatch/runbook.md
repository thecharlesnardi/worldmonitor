# NexusWatch Execution Runbook

## Phase 1 - Source Catalog
```bash
npm run nexus:validate-sources
npm run nexus:chunk-intake
```

## Phase 2 - Globe Runtime
```bash
npm run dev:nexus
npm run build:nexus
```

## Phase 3 - Supabase RAG
```bash
npm run nexus:sync-sources
npm run nexus:sync-chunks -- --write-citations
# optional embeddings
npm run nexus:sync-chunks -- --with-embeddings --write-citations
# strict mode (fails if embeddings cannot be generated)
npm run nexus:sync-chunks -- --with-embeddings --require-embeddings --write-citations
```

## Phase 4/5 - Ask + Security
- Apply migrations in order:
  - `supabase/migrations/202602230001_nexuswatch_rag.sql`
  - `supabase/migrations/202602230002_nexuswatch_hardening.sql`
- Set environment:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXUSWATCH_INTERNAL_API_KEY`
  - `NEXUSWATCH_ALLOWED_ORIGINS`

## Phase 6 - Analyst Outputs
```bash
npm run nexus:export-packet -- --input data/nexuswatch/processed/last_ask_globe_response.json
```

## Phase 7 - Private Cloud / Air-Gap
```bash
docker compose -f deploy/nexuswatch/docker-compose.private-cloud.yml build
docker compose -f deploy/nexuswatch/docker-compose.private-cloud.yml up -d
npm run nexus:offline-bundle
```

## Phase 8 - Pilot + Governance
- Use `docs/nexuswatch/phase-8/README.md` checklist for pilot gate reviews.
