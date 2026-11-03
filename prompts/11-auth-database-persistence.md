# Prompt Log — Authentication and Database Persistence

- Issue: https://github.com/gloriazhangcx-hub/openwindow/issues/11
- Branch: `feature/11-auth-db-persistence`
- Base commit: `02ea7eaefcb350814ad2cd3471c87e1be2222068` (GitHub `main`).
- Status: implementation complete on the feature branch; PR creation is pending final verification.

## User request

> Review the merged PLAN.md and current codebase; create an Issue; branch from verified GitHub main at `02ea7ea`; preserve Discover/List, Day/Week/Month Calendar, filters, conflict detection, ICS export, localStorage data, and draft Luma PR #8. Add signup/login/logout using Replit-managed Clerk if available, PostgreSQL persistence, server-side user isolation, and tests including isolation. Report architecture/configuration and actual Clerk/PostgreSQL availability before implementing. Wait for approval before code changes and do not merge without review.

## Audit findings

- Reviewed root `PLAN.md` and source from GitHub `main` at the specified SHA.
- Existing stack is React + TypeScript + plain CSS with an Express server and Node's built-in test runner (`tsx --test`).
- No application login or database client/schema is wired into GitHub `main`.
- Existing browser keys are `openwindow.preferences.v1`, `openwindow.saved.v1`, and `openwindow.busy.v1`. The busy-import initialization currently removes the key when parsing fails, so migration must preserve raw content before invoking that behavior.
- PostgreSQL development database is reachable: read-only `SELECT 1` succeeded. The app is not connected to it yet.
- Replit-managed Clerk was initially unconfigured. After the user approved the architecture, Replit-managed Clerk was provisioned for this workspace. Never inspect or expose its secret values.
- On GitHub `main`, event discovery currently uses mock/demo data; the live Luma integration remains separate in draft PR #8. Do not change or rebase that PR.

## Approved architecture

- Replit-managed Clerk for browser signup/login/logout; Express session middleware verifies the Clerk cookie. Personal endpoints derive the user only from the verified identity.
- Replit PostgreSQL with Drizzle ORM and the `pg` driver for a typed relational schema and queries. This is compatible with the merged plan's PostgreSQL/`pg` proposal and Replit's documented managed-database workflow.
- Keep the plan's internal UUID `users.id` and add a unique Clerk subject (text) mapping. Use that mapped internal user ID in all private tables and predicates.
- Persist saved event snapshots and busy intervals, plus preferences in a JSONB `user_preferences` row per user.
- Safely import local saved IDs/preferences/busy intervals idempotently; preserve original raw localStorage keys until server persistence is confirmed, including malformed busy data. Keep demo/public source events separate from personal records.
- Preserve existing Discover/List and calendar modes, filters, conflict detection, `.ics` export, and styling. Keep the landing/discovery view available while requiring auth for personal writes/reads.
- Add server-side cross-user isolation tests, Clerk-auth middleware tests, and migration-safety tests with the existing Node test runner.

## Workflow

Issue → branch from the verified GitHub `main` SHA above → prompt log → implementation after approval → PR with `Closes #11` → review/merge. Do not merge without review.

## Implementation record

- Added Replit-managed Clerk sign-in and sign-up routes, account links, and sign-out while leaving public discovery and demo event data accessible without an account.
- Mounted Clerk's Express middleware and the Clerk proxy, then derived every private account identity from the verified server session. Private account endpoints cover account data, saved event snapshots, preferences, busy intervals, and local-data migration.
- Added a typed Drizzle/PostgreSQL schema for users, saved event snapshots, stars, preferences, busy intervals, and raw migration snapshots. Database connection is lazy so public/demo routes still start when private storage is not configured; private routes return a clear 503 in that case.
- Captured the exact raw values of all three legacy localStorage keys before React starts. Kept original keys intact, stored durable local backups, and made server migration idempotent with unique constraints and conflict-safe inserts.
- Preserved Discover/List, Day/Week/Month Calendar, filters, conflict detection, ICS export, mock data, and the existing purple/yellow visual system. Added only account controls and sync feedback to the existing UI.
- Left `.replit`, README, Product Plan DOCX, draft Luma PR #8, and its branch unchanged.

## Verification

- `npm run typecheck` — passed.
- `npm test` — 26 passed, including PostgreSQL migration/idempotency and per-user isolation tests.
- `npm run build` — passed.
- `npm run db:push` — applied the development schema after confirming there were no existing public tables.
- `npm audit` — no known vulnerabilities after pinning the shared `esbuild` version; production dependency audit also reports zero.
- HTTP smoke checks — public health endpoint returned 200 in demo mode; unauthenticated private account data returned 401.
- Screenshots — public discovery and the Clerk sign-in screen rendered on the isolated feature-branch server. The actual interactive sign-up/sign-in flow was not completed with a real user session.

## Remaining setup and review

- Replit-managed Clerk development keys and the development PostgreSQL connection are available in this workspace; their values are intentionally not recorded here.
- Production database configuration/schema and a real sign-in should be verified before publishing.
- This branch has not been merged. Open the resulting PR and review it before merging Issue #11.