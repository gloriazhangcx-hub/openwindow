# Event Search Implementation Prompt

- GitHub issue: #15 — Add case-insensitive event search to Discover
- Feature branch: `feature/15-event-search`
- Base: GitHub `main` at `a4f97f60115c3c7d5563601c17cc0bd7a22111f5` (the merge commit for PR #14)

## Request

Implement Event Search in the existing OpenWindow project:

- Add a simple search field above the existing filters in Discover.
- Search event titles and descriptions using case-insensitive keyword matching.
- Combine search with Topic, Format, and Availability filters.
- Show a friendly empty state when no events match; clearing the search restores the results from the other filters.
- Preserve the search query when switching between List and Calendar.
- In Calendar, apply search to suggested events only; never hide existing personal commitments.
- Keep the existing Calendar colors, conflict detection, My Events attendance statuses, and saved-event behavior unchanged.
- Use the current event provider; do not require live Luma integration.
- Reuse the existing components and filtering logic.
- Add focused automated tests and run the full test suite, typecheck, and build.
- Open a PR with `Closes #15`; do not merge or deploy.
- Prepare a Preview for manual UI testing without overwriting the prototype workflow or draft PR #8.

## Implementation notes

- Keep the search query as App-level view state so switching List/Calendar does not reset it.
- Extend the existing `filterEvents` path rather than adding another event-source or search subsystem.
- Match normalized query terms case-insensitively against the combined title and description.
- Pass filtered suggested events to Calendar while continuing to pass personal busy intervals separately and unchanged.
- Retain existing filter reset behavior while making sure it also clears the search query.
- Use the existing Node test runner and add focused tests for matching, combined filters, clearing the query, and calendar commitment/conflict invariants.
