# Feature 5 — Starred My Events

## User request

Please review and verify our existing Bookmark and My Events functionality against Feature 5 (Stars and Starred View) in the course assignment.

The goal is to verify and strengthen what already exists, not to build duplicate functionality.

- Review the complete Bookmark/Unbookmark flow, including the frontend, API, database persistence, and My Events view.
- Check that users can bookmark and unbookmark events, see bookmarked events in My Events, and retain bookmarks after refreshing or signing back in.
- Verify bookmarks are isolated by user.
- Review the database schema and confirm whether the implementation satisfies the assignment requirement for a separate junction table connecting users and events. Explain the roles of `saved_events` and `stars`.
- Identify gaps, bugs, or missing test coverage.
- Add automated tests for existing Bookmark/My Events functionality, including persistence and user isolation where feasible.
- Make only minimal fixes for confirmed bugs or assignment-compliance gaps.
- Preserve the current user experience. Do not add another Star button or a separate Starred page unless a specific requirement cannot be satisfied by the existing functionality.
- Do not modify unrelated features, disturb draft PR #8, or deploy.
- Run relevant tests, typecheck, and build.
- Create a GitHub Issue and a dedicated feature branch from latest `main`, then open a PR with a clear requirement-by-requirement explanation and evidence from code and tests.
- Do not merge before user review and approval.

## Traceability

- Issue: #19 — Verify bookmarks and My Events against Feature 5 Stars
- Feature branch: `feature/19-verify-bookmarks-feature-5`
- Starting GitHub `main`: `9ed82a81809fc65ecb540423eb3a83aa694b1adb`

## Audit and implementation notes

- The user revised the design after reviewing the first PR #20 implementation:

> Replace Bookmark with one Star action. Keep the existing My Events view as the only Starred View; do not add another collection or Saved/Starred tabs. Preserve saved-event records, manual events, and attendance statuses. Use the `stars` junction, make migration idempotent without duplicate relationships or overwritten statuses, and never delete manual events when unstarring. Update this same Issue #19 / PR #20 only. Do not run production migrations, deploy, or merge.

- The revised UI has one Star action in the existing event-action locations and one My Events collection containing starred suggestions and all manual events.
- `stars` is the active user/event junction and stores attendance status for suggested events. Manual-event status remains in `manual_events`.
- The additive migration copies legacy `saved_events` membership and status into `stars`; it does not delete legacy rows or original localStorage values. The composite key prevents duplicates. Conflicting attendance values abort the migration rather than overwriting either value.
- Existing local-only stars continue using the original storage key and account-ownership safeguards. Sign-in imports those values idempotently into the authenticated user’s `stars`.
- Server reads and writes derive the account from the verified Clerk session. Unstar removes only the Star relationship and never targets `manual_events`.
- Tests cover sign-in migration idempotency, Star/Unstar, persisted attendance after reload, cross-account isolation, conflict-safe data migration, manual-event survival, route validation, and collection filtering.
- Development database identity was confirmed as `heliumdb`; integration tests use disposable `test_` accounts and clean them up. No production migration or deployment is performed.
