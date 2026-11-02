# OpenWindow

OpenWindow helps you discover nearby events alongside your existing schedule. Conflicting events remain visible, and the app does not rank opportunities or add them to a calendar automatically.

## Run locally

Requirements: Node.js 20.19+.

```bash
npm install
npm run dev
```

The app and API run together on port `5000`. For a production build:

```bash
npm run build
npm start
```

## What is in this MVP

- List and week-calendar views share topic, format, and availability filters.
- Demo events and busy intervals are seeded and clearly labeled.
- Conflict status is based on interval overlap: `event.start < busy.end && event.end > busy.start`.
- If calendar data or event times are missing, availability is `Unknown`.
- Topic and format labels are separate; the deterministic classifier prefers recognized native labels and otherwise uses title/description keyword rules. Unclassified events remain unlabeled.
- Saved events, preferences, and locally imported busy intervals use browser `localStorage`.
- Event details include a direct `.ics` download; downloading is an explicit user action.
- The mock source remains active while the app-side Luma OAuth flow and read-only MCP tool discovery are being validated.

The demo listings are fictional sample data. Their “Open on Luma” links go to the Luma homepage, not a real event registration page. The app discovers the OAuth endpoints from Luma's MCP challenge and published metadata, then uses a Client ID Metadata Document, authorization-code/PKCE, and the MCP resource parameter. After sign-in it can inspect read-only MCP tool definitions. Public event search and result mapping are not enabled until the actual Luma tool schema and response have been verified. OAuth tokens stay in server memory and are cleared when the server restarts. No live search or registration data is claimed.

Luma sign-in requires `SESSION_SECRET` and a public HTTPS app origin. Development uses `REPLIT_DEV_DOMAIN`; production must set `OPENWINDOW_PUBLIC_URL` to the app's canonical origin.

## Calendar data and privacy

The browser does not request Apple Calendar access. For a functional demo, open **Preferences → Import calendar JSON** and select a file containing either a `busy` array, a `busyIntervals` array, or a bare array. Each item requires ISO timestamps:

```json
{
  "busy": [
    {
      "start": "2026-10-26T18:00:00-07:00",
      "end": "2026-10-26T19:00:00-07:00",
      "timeZone": "America/Los_Angeles",
      "sourceId": "work"
    }
  ]
}
```

Imported calendar times stay in this browser and are stored locally. Keep only start/end times, time zone, and an optional anonymous source ID in the file. Do not include event titles, attendees, or notes.

### Apple Shortcut upload endpoint

The app includes a token-protected busy-only webhook for an iOS Shortcut:

- `POST /api/calendar/busy`
- Header: `Authorization: Bearer <CALENDAR_SYNC_TOKEN>`
- Header: `Content-Type: application/json`
- Body: exactly one `busy` array with up to 500 entries. Each entry may contain only `start`, `end`, `timeZone`, and `sourceId`.
- Request limit: 64 KiB. Start/end must be ISO-8601 timestamps with an explicit UTC offset or `Z`; end must be after start; dates must be within one year of receipt.

Set `CALENDAR_SYNC_TOKEN` as a Replit Secret (or as a server environment variable locally). The endpoint returns `503` until it is configured and `401` for an incorrect token. Never commit the token to this repository or put it in frontend code.

Suggested iPhone Shortcut setup:

1. Create a Shortcut and use **Find Calendar Events** to select the calendars and date range you want to sync.
2. Repeat over the results and build one dictionary per event containing only `start`, `end`, `timeZone`, and an optional anonymous `sourceId`. Do not add titles, attendees, or notes. Assemble the dictionaries into a `busy` array.
3. Add **Get Contents of URL**, set the method to `POST`, use your app URL followed by `/api/calendar/busy`, and send the JSON body with the `Authorization` header above.
4. Run the Shortcut manually to test it. The response includes the accepted interval count and sync time, not the intervals themselves.

The webhook keeps the most recent upload in server memory only. It is a secure ingestion prototype: data is lost when the server restarts and is not yet connected to the browser's conflict view. For the working MVP conflict view, use the local JSON import. Durable or multi-user calendar sync needs user-scoped secure storage and access controls before production use.

The status endpoint (`GET /api/calendar/status`) returns only the last sync time and interval count. `GET /api/calendar/config` reports whether the upload token is configured; neither endpoint returns interval data or secrets.

## Architecture

- `src/data/events.ts`: relative-date demo event and busy-interval seed data, defaults, and event-source adapters.
- `src/lib/classification.ts`: deterministic, independent topic and format classification.
- `src/lib/calendar.ts`: time-zone-safe interval comparison and availability.
- `src/lib/useOpenWindow.ts`: local persistence for saved events, preferences, and demo/imported intervals.
- `src/App.tsx`: responsive list/calendar experience, filters, event detail, preferences, local import, and `.ics` download.
- `server/index.ts`: Express API, health/config endpoints, and validated Shortcut upload.

## Verification

```bash
npm test
npm run build
```

## Known limitations and next steps

- Event listings remain demo data until Luma sign-in, public search, and event mapping are verified end to end.
- Shortcut uploads are in-memory and do not currently drive the browser conflict view.
- There is no multi-user authentication or persistent server database in this first version.
- Direct Apple Calendar writeback is out of scope. Use the explicit `.ics` download if you choose to add an event.
