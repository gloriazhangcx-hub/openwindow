# Feature 7 — Compact Dashboard

## User request

Add compact dashboard summaries without a separate Dashboard page:

- In Full Discover List only, show Total Events, Conflicts, and No Conflicts for the current search, filters, and date horizon.
- Show a compact My Events heading and two horizontal 100% stacked bars: by source (From Discover / Added by Me) and by attendance status (Interested / Planning / Registered).
- Use the existing authenticated, user-scoped event and availability data; update after calendar imports, stars, manual event changes, attendance changes, and refresh.
- Preserve Search, Filter, Sort, Calendar, Star, manual-event, and attendance behavior. Do not merge or deploy.

## Traceability

- Issue: #23 — Add compact event summary and My Events charts
- Feature branch: `feature/23-compact-dashboard`
- Starting GitHub `main`: `b3dafb0b955bee866b7ff60b0b91eccc8e623dbf`

## Clarified counting rule

- Conflicts counts only events with a detected overlap in current calendar data.
- No Conflicts is `Total Events - Conflicts`, so it includes events with unknown availability. It means no overlap was detected in current data, not guaranteed real-world availability.
- Keep exactly three Discover metrics and preserve `Total Events = Conflicts + No Conflicts`.

## Implementation decisions

- Calculate Discover summary values from the existing filtered event set and availability map. Render only in Full Discover List.
- Derive My Events charts from the existing visible model collection: starred Discover events and manual events. Chart the full collection; existing search/status filters continue to determine how many list rows are shown.
- Count missing attendance states as Interested, matching the existing My Events default.
- Use small, responsive CSS stacked bars and text legends; no chart dependency or separate page.
- Keep all calculations derived from the current account-scoped model; do not add persistence or change server/database behavior.

## Verification

- Added tests for empty data, mixed event sources, all attendance statuses, unknown availability, and source/attendance count totals.
- Added Given/When/Then tests showing Discover counts change after an overlapping calendar interval is added, attendance counts change after a status update, and source counts change after star/manual-event changes.
- `npm test`: 62 passed, 0 failed, 0 skipped.
- `npm run typecheck`: passed.
- `npm run build`: passed.
