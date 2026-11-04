# Calendar Event Scope — Stranger Test Improvement

## User feedback

A real Stranger Test found that Calendar felt crowded when it showed all Discover events. The tester asked for an option to focus on events they selected. The other feedback (external map links and onboarding guidance) is outside this change.

## Decision and scope

- Add a compact scope selector to Calendar.
- **All Events** is the default and includes all filtered Discover events plus the user's manually created events.
- **My Events Only** includes starred/saved events and manually created events; unstarred Discover events are excluded.
- Reuse the existing event filtering, star relationship, account-scoped attendance data, and calendar rendering. Do not add a schema change or a separate collection.
- Keep attendance statuses visible for starred/manual events using the existing attendance map.
- Keep personal-calendar busy intervals independent of the event scope so hiding suggested events never hides commitments or changes conflict calculations.
- Preserve Calendar navigation, colors, details, and account isolation.

## Implementation and verification

The Calendar-specific filter delegates to the existing event filter with its collection mode set from the selected scope. Search, topic, format, and availability filters continue to be applied. The Calendar scope does not inherit the My Events list's attendance-status selector.

Focused tests cover the default All Events scope, inclusion of manual events in both scopes, exclusion of unstarred events from My Events Only, combined filters, and shared attendance statuses in Calendar blocks. Verification completed: 77 tests passed, 0 failed, 0 skipped; typecheck passed; production build passed.

## Workflow

- GitHub Issue: #29
- Feature branch: `feature/29-calendar-event-scope`
- Pull request: https://github.com/gloriazhangcx-hub/openwindow/pull/30
