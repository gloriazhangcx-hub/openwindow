# Feature 6 — Date Sorting

## User request

Add a compact sort dropdown to the Discover List with:

- Date: Soonest first (default)
- Date: Latest first

Sort by each event's start date and time. Keep search and the existing filters working without resetting their selections. Preserve the date-grouped layout and make date groups follow the selected order. Do not change Calendar behavior, Stars, My Events, manual events, or attendance status behavior. Keep identical start times in a consistent order.

## Traceability

- Issue: #21 — Add date sorting to the Discover list
- Feature branch: `feature/21-date-sorting`
- Starting GitHub `main`: `cf32810a23fa27bb6740813c8762205b558fc5e9`

## Implementation decisions

- Keep `filterEvents` unchanged so Calendar and My Events retain their existing ascending order and filtering behavior.
- Sort a copy of the already-filtered events only when rendering the Full Discover List. The dropdown is hidden in Calendar and My Events.
- Build date groups from the sorted list so both group order and event order within each group follow the selected direction.
- Preserve incoming order for equal start times in either sort direction. Keep invalid starts after valid dates in both directions.
- Sorting is independent UI state and does not clear search, topic, format, or availability selections.

## Verification

- Added tests for both directions, default order, stable ties, date-group order, invalid times, and unchanged search/filter matches.
- `npm test`: 56 passed, 0 failed, 0 skipped.
- `npm run typecheck`: passed.
- `npm run build`: passed.
