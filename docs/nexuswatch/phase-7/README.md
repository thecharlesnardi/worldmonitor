# Phase 7 - Private Cloud Deployment with Air-Gap Parity

## Implemented Artifacts
- `server/nexuswatch/private-cloud-server.mjs`
  - Runs NexusWatch static UI + core API handlers without Vercel runtime dependency.
- `deploy/nexuswatch/Dockerfile`
  - Multi-stage build producing runnable private-cloud image.
- `deploy/nexuswatch/docker-compose.private-cloud.yml`
  - Standard private-cloud container deployment profile.
- `deploy/nexuswatch/docker-compose.airgap.yml`
  - Disconnected profile with local data mounts.
- `scripts/nexuswatch/build-offline-bundle.mjs`
  - Produces deterministic offline bundle with checksums and manifest.

## Run Commands
- Build private cloud image:
  - `docker compose -f deploy/nexuswatch/docker-compose.private-cloud.yml build`
- Run private cloud profile:
  - `docker compose -f deploy/nexuswatch/docker-compose.private-cloud.yml up -d`
- Run air-gap profile:
  - `docker compose -f deploy/nexuswatch/docker-compose.airgap.yml up -d`
- Build offline bundle:
  - `npm run nexus:offline-bundle`

## Exact Next Actions
1. Add signed bundle verification workflow for offline imports.
2. Run disconnected functional tests for ask/provenance/feedback/export endpoints.
3. Add key-rotation procedure with dual-key overlap window.
4. Add backup/restore automation for `nexus.*` and run restore drills.
5. Add rate limiting/WAF profile for private edge ingress.
