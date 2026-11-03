# Prompt Log — Course PLAN.md

- Issue: https://github.com/gloriazhangcx-hub/openwindow/issues/9
- Branch: docs/9-course-plan-and-prompt-log
- Status: documentation-only PR; open for user review; not merged.

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
- Documentation-only; the revised PR should contain only root `PLAN.md` and `prompts/course-plan.md`.

## Input note

The user supplied a newer revised Markdown plan; that version is now the primary source, with only necessary corrections to keep it aligned with the codebase.

## PR record

- PR: https://github.com/gloriazhangcx-hub/openwindow/pull/10 (open for user review; not merged).
- Branch base: canonical GitHub `main` at the start of this issue.
- Reconciliation: fetched all GitHub refs under a separate remote; local and GitHub histories have no common ancestor, so no existing branch was merged or rewritten.


## Revised source and scope update

> Use the newer revised version as the primary source for root `PLAN.md` in existing PR #10. Preserve the verified React/TypeScript/CSS stack, Day/Week/Month calendar, multi-topic and multi-format model, and accurate Luma status. Move this prompt log to `prompts/course-plan.md`, clarify proposed database and authentication technologies, do not create a new Issue or PR, and leave PR #10 unmerged for review.

- Replaced the earlier uploaded PLAN draft with `OpenWindow_PLAN_revised`; preserved the revised document's pitch, stories, schema, tests, design, risks, and Plan vs. Reality table.
- Retained the verified custom calendar and existing plain-CSS frontend without proposing a UI rewrite.
- Clarified the model using junction tables for multiple topics and formats per event.
- Retained the status that OAuth/tool discovery work exists, but authenticated real Luma `tools/call` event retrieval is not confirmed; mock data must remain clearly labeled.
- Proposed Replit PostgreSQL via `DATABASE_URL` and Node `pg`, plus Replit-managed Clerk. These are future implementation choices, not installed app features. The repository has no SQL driver or application login; Clerk status is not configured. `SESSION_SECRET` is used only for Luma OAuth session cookies.
- Moved this log from `docs/prompt-logs/issue-9-course-plan-and-prompt-log.md` to `prompts/course-plan.md`. No new Issue or PR was created.
- `README.md`, the original Product Plan DOCX, and application code remain unchanged.

## Revision verification

- No application tests were rerun because this update changes documentation only; the previously audited baseline remains 36 passing tests and a passing TypeScript check.
