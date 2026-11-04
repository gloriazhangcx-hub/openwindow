# Prompt: Complete the Two Required Assignment Tests and Red/Green Evidence

## Goal

Complete the course's data-isolation and dashboard-calculation acceptance tests, and save reproducible RED/GREEN evidence. Reuse existing coverage rather than duplicating unrelated tests.

## Workflow and scope

- GitHub Issue: #27.
- Base: GitHub `main` at `0797ef9d7e8d67bdf3a7564c21ee807469ea8127`.
- Preserve the prototype worktree, existing user data, and draft Luma PR #8.
- Do not change UI behavior, schema, production configuration, or production data.
- Use the development PostgreSQL database (`heliumdb`) only for database-backed tests.

## Required acceptance tests

1. **Data isolation:** User A has a private event; User B is authenticated and tries to request A's event list by supplying A's ID. The server must return only B's data. Also retain the existing PostgreSQL account-store isolation test.
2. **Dashboard calculation:** create deterministic test-only Star and manual-event records for a test account in the development database, read them back from the account store, and calculate the existing My Events total from those records. Include an unstarred candidate and assert that it is excluded.

For each test, capture:

- Given / When / Then.
- Exact file path and test name.
- Plain-English explanation and the exact command.
- A RED run after temporarily introducing a controlled regression, followed by reverting that regression and capturing a GREEN run of the same test.
- A realistic future change that the test would catch.

Save four screenshots and an evidence README under `docs/test-evidence/`. Do not commit the temporary regression or any private user data.

## Verification

Run the full Node test suite, typecheck, and build. Include any skipped-test count in the PR description. Open a PR with `Closes #27` and wait for manual review; do not merge or deploy.
