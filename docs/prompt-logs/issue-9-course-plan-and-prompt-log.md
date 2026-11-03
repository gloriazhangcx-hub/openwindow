# Prompt Log — Course PLAN.md

- Issue: https://github.com/gloriazhangcx-hub/openwindow/issues/9
- Branch: docs/9-course-plan-and-prompt-log
- Status: documentation-only PR; awaiting user review; not merged.

## User request

> Continue with the existing OpenWindow project and preserve all working prototype features. Safely reconcile the local Git checkout without force-pushing, resetting, or overwriting work. Review the uploaded PLAN.md against the codebase and make only necessary corrections for existing CSS, the calendar component, the multi-topic event model, and current Luma status. Keep the Product Plan DOCX and README unchanged. Create an Issue, feature branch, prompt log, and PR into main; do not merge. Do not modify the existing UI or continue Luma integration.

## Review findings and decisions

- Reuse the existing React/TypeScript app and CSS; no Tailwind migration.
- Reuse the existing custom Day/Week/Month calendar; no calendar-library replacement.
- The current event model has arrays for topics and formats, so the draft schema now represents both with junction tables.
- Luma OAuth and `search_events` tool discovery were confirmed, but actual event results and response mapping remain unverified end to end. Luma sessions reset on a server restart. Luma and Apple Calendar automation remain optional for the course MVP.
- Preserve the plan's post-prototype timing statement and the Plan vs. Reality table for completion after implementation.
- Do not change application code/UI, `README.md`, or the original Product Plan DOCX.

## Validation

- Existing audit baseline: `npm test` — 36 passing; `npx tsc --noEmit` — passed.
- This change is documentation-only. The PR should contain only root `PLAN.md` and this prompt log.

## Input note

The uploaded draft is the source for root `PLAN.md`; it was not rewritten from scratch.