# Feature 5 — Bookmark and My Events verification

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

- Existing Bookmark behavior is persisted through `saved_events`; it drives My Events and stores the attendance status. Signed-out bookmarks continue to use the existing local-only flow.
- The database already had a separate `stars` junction table, but the app had no Star API, state, control, or Starred view. Therefore, Bookmark/My Events alone did not meet Feature 5.
- Added an authenticated, server-owned Star relationship. Star/unstar writes never create or delete a `saved_events` row; unbookmarking leaves a Star intact, and unstarring leaves a bookmark intact. Both junctions are scoped to the verified Clerk user and point to that user’s event snapshot.
- Added an independent Star control in Discover/event details and a Saved/Starred tab within the existing My Events view. Stars require sign-in; signed-out Bookmark behavior remains unchanged.
- Starred events load from the account API after sign-in and are isolated during account switching. Starred collections are not hidden by discovery city/date-horizon preferences. The Starred Calendar filter keeps personal calendar busy intervals and manually added commitments visible.
- No database schema change or migration was needed: `saved_events` and `stars` already exist as separate user/event junction tables. The only change to account persistence is reading and writing the existing `stars` relationship.
- Added route, PostgreSQL persistence/reload, user-isolation, save/star independence, and collection-filtering tests. Development database identity was confirmed as `heliumdb`; integration tests use disposable `test_` accounts and clean them up.
- Latest verification: 49 tests passed, 0 skipped; typecheck and build passed.
