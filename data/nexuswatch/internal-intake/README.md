# NexusWatch Internal Intake

Place internal source documents in typed subfolders:
- `reactor-specs/`
- `safety-analyses/`
- `regulatory-strategy/`
- `site-feasibility/`
- `cad-manifests/`
- `test-notes/`
- `meeting-notes/`
- `msds/`
- `files/` (plain-text extraction files used by `nexus:chunk-intake`)

Each uploaded file requires a manifest (`*.json`) following:
- `docs/nexuswatch/phase-1/internal_manifest.template.json`

Recommended local-first flow:
1. Drop extracted `.txt` / `.md` files in `data/nexuswatch/internal-intake/files/`.
2. Create one manifest per document with `local_path`, `layer_id`, `feature_id`, and `tags`.
3. Run `npm run nexus:chunk-intake` to generate `data/nexuswatch/processed/chunks.jsonl`.

Do not commit sensitive client documents to git. Keep only synthetic fixtures in this repository.
