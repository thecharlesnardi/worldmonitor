# NexusWatch Private-Cloud Deployment

## Build
```bash
docker compose -f deploy/nexuswatch/docker-compose.private-cloud.yml build
```

## Run
```bash
docker compose -f deploy/nexuswatch/docker-compose.private-cloud.yml up -d
```

## Air-Gapped Profile
```bash
docker compose -f deploy/nexuswatch/docker-compose.airgap.yml up -d
```

## Notes
- Private runtime serves:
  - `GET /` static NexusWatch app
  - `POST /api/ask-globe`
  - `GET /api/provenance/:provenance_id`
  - `POST /api/feedback`
  - `POST /api/exports/diligence-packet`
- Set `SUPABASE_SERVICE_ROLE_KEY` only in server-side environment.
- Use `NEXUSWATCH_INTERNAL_API_KEY` for internal endpoint enforcement.
