# Prompt Log — My Events + Attendance Status

- Issue: https://github.com/gloriazhangcx-hub/openwindow/issues/13
- Branch: `feature/13-my-events-attendance`
- Base: GitHub `main` at `b0c82e15df8ac69db37f9807e84e686bf33522a4`
- Status: implementation and local verification complete; PR #14 is open for review.
- Pull request: https://github.com/gloriazhangcx-hub/openwindow/pull/14

## Approved user request

> Reuse the current saved-events experience: evolve the heart/Saved filter into a clearly labeled My Events view without creating a separate page or duplicating event cards. Keep bookmark/save behavior unchanged. Show saved events with Interested (default), Planning to Attend, and Registered statuses. Require sign-in to edit a status while preserving signed-out local saving. Store status on the saved-event relationship using an additive migration, keep Stars separate, and update only outdated implementation-status sections of PLAN.md. Keep Luma, Apple Calendar, conflict detection, and ICS behavior unchanged; status changes must have no external side effects. Make My Events easy to find and make returning to full Discover clear. Create an Issue, branch from latest GitHub main, implement and test, then open a PR with a closing reference. Do not merge, deploy, modify draft PR #8, or alter the local prototype worktree.

## Implementation decisions

- Issue #13; branch from verified GitHub `main` (`b0c82e1`) in a separate worktree.
- Reuse the existing saved-only view and event cards; the bookmark continues to save/unsave.
- Keep the `saved_events` junction distinct from `stars`; attendance status belongs to `saved_events`.
- Add the status as a constrained, non-null `saved_events` field defaulting to `interested`. The existing schema-first migration path is Drizzle `db:push`; existing save rows therefore receive the default without being deleted or recreated.
- Keep signed-out local saves. Status changes require a verified Clerk session; migrated existing saves default to Interested.
- Keep attendance status out of localStorage and use the existing per-account write queue for signed-in changes.
- Do not call Luma or change source-event records, Apple Calendar, busy intervals, conflict detection, or ICS export when a status changes.
- Preserve the product stories and course requirements in `PLAN.md`; update only implementation status that became stale after PR #12 and the current feature.

## Validation

- `npm test` — 32 passed, 1 PostgreSQL integration test skipped because the test process was deliberately run without database connection variables to avoid any production database access.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- Captured desktop and mobile screenshots from an isolated demo-mode server on port 5090; the existing Preview workflow and prototype worktree were not changed.
- The additive schema migration and PostgreSQL-backed persistence test still need development-database verification after review. No database migration was run against production, and the app was not published.
