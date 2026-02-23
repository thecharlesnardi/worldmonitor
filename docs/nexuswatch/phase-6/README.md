# Phase 6 - Analyst Workflow and Consulting Deliverables

## Implemented Artifacts
- `api/exports/diligence-packet.js`
  - Builds citation-backed diligence output from `answer_id` or inline response payload.
  - Returns markdown and CSV outputs for analyst review workflows.
- `scripts/nexuswatch/export-diligence-packet.mjs`
  - Creates local analyst packet artifacts:
    - `diligence-packet.md`
    - `diligence-shortlist.csv`
    - `diligence-raw.json`
- `data/nexuswatch/alerts/headless-templates.json`
  - Starter templates for high-priority signal alerts.
- `api/feedback.js`
  - Persists thumbs up/down and correction tags to `nexus.feedback`.

## Exact Next Actions
1. Add PDF generation pass for packet markdown and include citation footnotes.
2. Add native `.xlsx` exporter with confidence/citation columns preserved.
3. Connect alert templates to Slack/Teams/email dispatch workers.
4. Add analyst triage UI for `feedback` and low-confidence answer review.
5. Define recurring QA runbook for refresh + false-positive tracking.
