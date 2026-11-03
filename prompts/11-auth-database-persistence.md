# Prompt Log — Authentication and Database Persistence

- Issue: https://github.com/gloriazhangcx-hub/openwindow/issues/11
- Branch: `feature/11-auth-db-persistence`
- Base commit: `02ea7eaefcb350814ad2cd3471c87e1be2222068` (GitHub `main`).
- Status: setup-only branch and prompt log; awaiting architecture approval. No application code changed; no PR opened.

## User request

> Review the merged PLAN.md and current codebase; create an Issue; branch from verified GitHub main at `02ea7ea`; preserve Discover/List, Day/Week/Month Calendar, filters, conflict detection, ICS export, localStorage data, and draft Luma PR #8. Add signup/login/logout using Replit-managed Clerk if available, PostgreSQL persistence, server-side user isolation, and tests including isolation. Report architecture/configuration and actual Clerk/PostgreSQL availability before implementing. Wait for approval before code changes and do not merge without review.

## Audit findings

- Reviewed root `PLAN.md` and source from GitHub `main` at the specified SHA.
- Existing stack is React + TypeScript + plain CSS with an Express server and Node's built-in test runner (`tsx --test`).
- No application login or database client/schema is wired into GitHub `main`.
- Existing browser keys are `openwindow.preferences.v1`, `openwindow.saved.v1`, and `openwindow.busy.v1`. The busy-import initialization currently removes the key when parsing fails, so migration must preserve raw content before invoking that behavior.
- PostgreSQL development database is reachable: read-only `SELECT 1` succeeded. The app is not connected to it yet.
- Replit-managed Clerk reports `not_configured`. It is compatible with the React/Express stack; Replit provisions the keys during setup, so no manual secrets should be requested. Setup remains pending user approval.
- On GitHub `main`, event discovery currently uses mock/demo data; the live Luma integration remains separate in draft PR #8. Do not change or rebase that PR.

## Proposed architecture — pending user approval

- Replit-managed Clerk for browser signup/login/logout; Express session middleware verifies the Clerk cookie. Personal endpoints derive the user only from the verified identity.
- Replit PostgreSQL with Drizzle ORM and the `pg` driver for a typed relational schema and queries. This is compatible with the merged plan's PostgreSQL/`pg` proposal and Replit's documented managed-database workflow.
- Keep the plan's internal UUID `users.id` and add a unique Clerk subject (text) mapping. Use that mapped internal user ID in all private tables and predicates.
- Persist saved event snapshots and busy intervals. Decide with the user before implementation whether to add a `user_preferences` table for local preferences.
- Safely import local saved IDs/preferences/busy intervals idempotently; preserve original raw localStorage keys until server persistence is confirmed, including malformed busy data. Keep demo/public source events separate from personal records.
- Preserve existing Discover/List and calendar modes, filters, conflict detection, `.ics` export, and styling. Keep the landing/discovery view available while requiring auth for personal writes/reads.
- Add server-side cross-user isolation tests and migration-safety tests with the existing Node test runner.

## Workflow

Issue → branch from the verified GitHub `main` SHA above → prompt log → implementation after user approval → PR with `Closes #11` → review/merge. No code changes or PR before approval.