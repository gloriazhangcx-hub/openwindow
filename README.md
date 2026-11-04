# OpenWindow

OpenWindow helps people discover events alongside their existing schedules. It keeps conflicts visible, supports a personal event collection, and never adds a suggested event to a calendar automatically.

**Live app:** [https://open-window.replit.app](https://open-window.replit.app)

## Current features

- **Discover:** case-insensitive title/description search; multi-select Topic and Format filters; availability filtering; and date sorting from soonest or latest.
- **My Events:** one Star action for discovered events, user-created personal events, attendance statuses (Interested, Planning to Attend, Registered), and compact collection summaries.
- **Calendar:** Day, Week, and Month views. **All Events** is the default and includes Discover events plus the user's manual events. **My Events Only** shows starred Discover events and manual events. Attendance status and conflict information remain tied to the same account data in every view.
- **Conflict detection:** compares event intervals with known busy intervals using `event.start < busy.end && event.end > busy.start`. Events with detected overlaps are marked Conflict; missing information can remain Unknown. Dashboard “No Conflicts” means no conflict was detected in the currently known calendar data, not guaranteed real-world availability.
- **Event details:** explicit `.ics` download and a Luma link only when a valid stored URL is available. Demo fixtures link to the Luma homepage, not to a specific event registration page.
- **Preferences and calendar context:** import a JSON file containing `busy` or `busyIntervals` (or a bare array) of ISO-8601 intervals. Keep only start/end, optional time zone, and optional anonymous source ID; do not include event names, attendees, or notes.

## Data and integration status

All ten current Discover fixtures are fictional demo events. The active event provider is the mock source; the Luma live-search adapter is disabled, so the app does not claim these listings are real Luma results. The app can display a valid event-specific Luma URL when one is present in stored event data, but no live Luma event retrieval is currently verified.

Sign-up, sign-in, and sign-out use Replit-managed Clerk. Private account operations are served by the Express/TypeScript API and persisted in PostgreSQL through Drizzle and `pg`. The server verifies Clerk sessions and scopes private records to the authenticated account. Signed-out demo discovery remains available; signed-out Star behavior is local to that browser. Legacy browser values are snapshotted and migrated without automatically deleting the original localStorage values.

The Drizzle schema and relationship notes are in [`docs/schema.md`](docs/schema.md). The test requirements and RED/GREEN evidence are documented in [`docs/test-evidence/README.md`](docs/test-evidence/README.md).

### Calendar import and Shortcut prototype

The Preferences JSON import is the supported way to provide busy intervals to the conflict view. When signed in, the intervals are also stored under that user's account. No direct Apple Calendar read or write is performed.

There is also an optional token-protected `POST /api/calendar/busy` endpoint for an iOS Shortcut. Set `CALENDAR_SYNC_TOKEN` as a Replit Secret to enable it; never commit the token or put it in frontend code. This separate prototype retains the latest upload in server memory and does not feed the browser's conflict view. `GET /api/calendar/status` exposes only the last sync time and interval count; `GET /api/calendar/config` reports whether token-based upload is enabled.

## Run locally

Requirements: Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

The Vite client and Express API run together on port `5000`. To build and run the production-mode server:

```bash
npm run build
npm run start
```

To exercise sign-in and private persistence, configure the Replit-managed Clerk development instance and a **development** PostgreSQL `DATABASE_URL`. Do not use the production database for local development or tests. Do not commit secrets. Public demo discovery can run without private database configuration; private account writes require authentication and configured storage.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The persistence integration tests require the development database. They use uniquely identified test accounts and remove their test records; keep production credentials out of the test environment.

## Project structure

- `src/App.tsx`: Discover, My Events, Calendar, filters, event details, and Preferences.
- `src/data/events.ts`: fictional demo fixtures and the mock/disabled Luma event sources.
- `src/lib/event-filtering.ts`, `event-sorting.ts`, `calendar-event-scope.ts`: shared search, filters, sorting, and Calendar scope behavior.
- `src/lib/useOpenWindow.ts`: client-side account-session state, localStorage preservation, API synchronization, and local calendar import.
- `server/account-routes.ts` and `server/account-store.ts`: authenticated account API and user-scoped PostgreSQL access.
- `server/db/schema.ts`: Drizzle schema declarations.
- `docs/schema.md`: readable schema reference.
- `PLAN.md`: course plan and implementation status.
