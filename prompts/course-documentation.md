# Course documentation and implementation-status review

## Goal

Complete the course-facing documentation using the shipped OpenWindow code and verified GitHub history. Do not change application behavior or the database schema.

## Workflow

- GitHub Issue: #31
- Branch: `docs/course-submission-documentation`
- Base: GitHub `main` at `dbdfea6c6e349450adcabe035efd7b651dd13329`
- Pull request must include `Closes #31`.
- Do not merge this PR or republish.

## Requested changes

1. Create `docs/schema.md` from the Drizzle declarations and migration code. Explain the actual tables, keys, ownership, constraints, and the difference between active `stars` and compatibility `saved_events`.
2. Update `README.md` to describe the current app, production URL, local setup, auth/database behavior, features, and verified limits of Luma and calendar integrations.
3. Complete the Plan vs. Reality section in `PLAN.md`, keeping the original product scope and clearly recording shipped work, changed scope, deferred work, and evidence.
4. Check the four existing RED/GREEN test-evidence images against their filenames, test names, commands, and described outputs. Verify merged PR history from GitHub rather than assuming it from local commit order.
5. Keep this PR documentation-only; do not modify app source, schema, secrets, production data, or deployment settings.

## Evidence and accuracy rules

- The current Discover source is mock data; do not claim the sample events are live Luma results.
- Do not infer that five real user-owned records exist. Production account data is not being inspected for this task.
- Treat the existing RED screenshots as archived evidence; do not reintroduce the temporary regressions.
- Preserve the original prototype worktree and draft Luma PR #8.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build` from this branch. Open a PR for review and wait; do not merge or republish.
