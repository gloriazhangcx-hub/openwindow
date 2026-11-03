# Prompt Log — My Events + Attendance Status

- Issue: https://github.com/gloriazhangcx-hub/openwindow/issues/13
- Branch: `feature/13-my-events-attendance`
- Base: GitHub `main` at `b0c82e15df8ac69db37f9807e84e686bf33522a4`
- Status: implementation and local verification complete; PR #14 is open for review.
- Pull request: https://github.com/gloriazhangcx-hub/openwindow/pull/14

## Approved user request

> Reuse the current saved-events experience: evolve the heart/Saved filter into a clearly labeled My Events view without creating a separate page or duplicating event cards. Keep bookmark/save behavior unchanged. Show saved events with Interested (default), Planning to Attend, and Registered statuses. Require sign-in to edit a status while preserving signed-out local saving. Store status on the saved-event relationship using an additive migration, keep Stars separate, and update only outdated implementation-status sections of PLAN.md. Keep Luma, Apple Calendar, conflict detection, and ICS behavior unchanged; status changes must have no external side effects. Make My Events easy to find and make returning to full Discover clear. Create an Issue, branch from latest GitHub main, implement and test, then open a PR with a closing reference. Do not merge, deploy, modify draft PR #8, or alter the local prototype worktree.

## Approved PR #14 UX refinement

> Preserve the existing Existing/Suggested/Conflict calendar color system. Add small, accessible heart, circle-dot, and checkmark attendance markers to saved event cards, with the full status in the label or tooltip. Add one All/Interested/Planning to Attend/Registered filter in My Events and share it across List and Calendar. Keep Full Discover filtering unchanged. Attendance filtering must not hide personal calendar commitments or affect conflict calculations. Add tests, update only PR #14, and do not merge or deploy.

## Implementation decisions

- Issue #13; branch from verified GitHub `main` (`b0c82e1`) in a separate worktree.
- Reuse the existing saved-only view and event cards; the bookmark continues to save/unsave.
- Keep the `saved_events` junction distinct from `stars`; attendance status belongs to `saved_events`.
- Add the status as a constrained, non-null `saved_events` field defaulting to `interested`. The existing schema-first migration path is Drizzle `db:push`; existing save rows therefore receive the default without being deleted or recreated.
- Keep signed-out local saves. Status changes require a verified Clerk session; migrated existing saves default to Interested.
- Keep attendance status out of localStorage and use the existing per-account write queue for signed-in changes.
- Do not call Luma or change source-event records, Apple Calendar, busy intervals, conflict detection, or ICS export when a status changes.
- Apply the attendance filter only when My Events is active; use one shared event result for List and Calendar. Calendar status markers do not add status-specific backgrounds or alter the Existing/Suggested/Conflict classes. Busy commitments remain sourced separately from the full personal-calendar interval list.
- Preserve the product stories and course requirements in `PLAN.md`; update only implementation status that became stale after PR #12 and the current feature.

## Validation

- `npm test` — 37 passed, 1 PostgreSQL integration test skipped because the test process was deliberately run without database connection variables to avoid any production database access. New tests cover all attendance filter states, Full Discover independence, calendar commitment/conflict invariants, and accessible status markers.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- During initial implementation, captured desktop and mobile screenshots from an isolated demo-mode server on port 5090; the prototype source worktree was not changed.
- Confirmed the Replit development database (heliumdb): it had two saved relationships and no attendance column before migration. Applied the schema-equivalent additive column and allowed-value check in development only; both existing rows remained and defaulted to Interested.
    - Ran a rollback-only development SQL smoke test with temporary users/events: new saves defaulted to Interested, a status update persisted in the transaction, another user's update affected zero rows, and all fixtures were rolled back.
    - The automated PostgreSQL account-store test remains skipped in the shell suite because database connection variables were deliberately unset to prevent accidental production access. Production was not queried or changed, and the app was not published.
- The attendance refinement passed the full suite, typecheck, and build; visual verification of the updated icons and shared filter remains for the user in the PR #14 Preview.
