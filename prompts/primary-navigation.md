# Primary Navigation: Discover, My Events, Calendar

## Request

Promote My Events to the same level as Discover and Calendar. Replace the List tab and separate small My Events control with three consistent primary tabs in this order: Discover, My Events, Calendar. Discover must be the initial view. Preserve existing search, filters, sorting, calendar behavior, My Events data and actions, and responsive usability. Switching tabs must not clear user data or reset filters.

## Traceability

- Issue: #25 — Make My Events a primary navigation tab
- Feature branch: `feature/25-primary-navigation`
- Starting GitHub `main`: `3a970cf3df9949c4b2b64e49d5d54cc4a174c7bb`

## Implementation

- Added a single active-tab state with Discover as its initial value. The existing event list and My Events collection still use the same list rendering and filtering logic.
- Added three equally styled, keyboard-focusable buttons with visible active styling and accessible pressed state. The My Events tab retains a small collection count.
- Ordered the tabs as Discover, My Events, Calendar.
- Removed the separate My Events toggle and the redundant Full Discover return control; Discover is always available as a primary tab.
- Tab changes update only the active view. Search, topic/format/availability selections, sort order, attendance filter, and user data remain in their existing state. Selecting Calendar continues the established Today/Week reset behavior.
- Added responsive styling so all three navigation choices fit on small screens.
- No event model, API, database, or persistence changes.

## Verification

- Added tests for Discover as the initial workspace tab, mapping all three tabs to their existing content, and rendering exactly three equally styled choices in the requested order with one active state.
- `npm test`: 65 passed, 0 failed, 0 skipped.
- `npm run typecheck`: passed.
- `npm run build`: passed.
