# OpenWindow — PLAN.md

> **Planning document for course submission.** Adapted from the original OpenWindow product plan. This file is being prepared after initial prototyping; it must not be represented as a plan merged before development. Preserve the original Word plan and Git history as evidence. Confirm implementation choices against the actual Replit repository before merging.

## 1. Pitch
I'm building **OpenWindow**, a personal event discovery and tracking app, because I often find interesting AI, tech, and social-impact events on Luma but have to compare them manually with my calendar. I expect to check it several times a week this semester, save events I might attend, and track my choices. Other students and young professionals can use it too.

## 2. Features — user stories in intended build order
1. **Accounts:** As a user, I want to sign up, log in, and log out so my saved events remain private.
2. **Data model:** As a user, I want my events organized by topic so I can keep a structured collection.
3. **Event CRUD:** As a user, I want to add, view details, edit, and delete my saved events (with confirmation) so I can maintain my own event list.
4. **Validation:** As a user, I want clear errors when a required title, start time, or end time is missing or invalid so I don't save unusable events.
5. **Stars:** As a user, I want to star events and see a Starred view so I can quickly find my favorites.
6. **Find things:** As a user, I want to search by title, filter by topic/format/availability, and sort by event date so I can find useful events.
7. **Dashboard:** As a user, I want to see total saved events, starred events, conflict-free events, and a chart of events by topic so I can understand my collection.
8. **Custom — Calendar view:** As a user, I want the existing Day, Week, and Month calendar views to show commitments as solid blocks and potential events as dashed blocks so I can see where events fit.
9. **Custom — Conflict detection:** As a user, I want potential time overlaps flagged without hiding events so I can decide whether to rearrange my schedule.
10. **Custom — Calendar export:** As a user, I want to download an `.ics` file for an event so I can add it to my calendar explicitly.

The course MVP may use manually entered real events; Luma MCP and Apple Calendar automation are not required for grading. At the time of this plan revision, the prototype includes a Luma OAuth flow and a `search_events` call path in open draft PR #8. OAuth and tool discovery succeeded, but actual event records and their response mapping have not been verified end to end; the Luma session is held in server memory and resets after a server restart. The Apple Shortcut upload endpoint is also a prototype and is not connected to the browser conflict view. Demo events must be labeled as demo data. I will enter at least five real events of my own before submission.

## 3. Database design
Use a relational database with user-level access controls. The schema below is the **intended design**, not a claim about what has already been built.

| Table | Columns (name: type) | Primary key | Relationships |
|---|---|---|---|
| `users` | `id: uuid`, `email: text`, `created_at: timestamp` | `id` | One user has many saved events, busy intervals, and stars; authentication may be managed by the hosting/auth provider. |
| `topics` | `id: uuid`, `name: text` | `id` | Topics can be assigned to many events through `event_topics`. |
| `events` | `id: uuid`, `user_id: uuid`, `title: text`, `description: text`, `location: text`, `starts_at: timestamp`, `ends_at: timestamp`, `source_url: text`, `created_at: timestamp` | `id` | Each event belongs to one user and can have multiple topics and formats through junction tables. |
| `event_topics` | `event_id: uuid`, `topic_id: uuid` | Composite (`event_id`, `topic_id`) | Junction table: events ↔ topics; each event can have multiple topics. |
| `event_formats` | `event_id: uuid`, `format: text` | Composite (`event_id`, `format`) | Junction table: events ↔ formats; each event can have multiple formats. |
| `stars` | `user_id: uuid`, `event_id: uuid`, `created_at: timestamp` | Composite (`user_id`, `event_id`) | Junction table: users ↔ events; each user-event pair can be starred once. |
| `busy_intervals` | `id: uuid`, `user_id: uuid`, `starts_at: timestamp`, `ends_at: timestamp`, `source: text` | `id` | Each interval belongs to one user; used for conflict checks. |

For the MVP, events support multiple topics and formats, matching the current `EventItem` model. Store them through `event_topics` and `event_formats`. All queries for private records must be scoped to the authenticated user. Validate `ends_at > starts_at`.

## 4. Required automated tests
- **Data isolation:** Given User A has saved an event and User B is logged in, when User B requests their event list or User A's event detail, then User A's event must not be visible or accessible.
- **Dashboard calculation:** Given a user has five saved events and two starred events, when the dashboard loads, then it displays `Saved events = 5` and `Starred events = 2` based on database records.

For each test, record a plain-English explanation, a real failing run after temporarily introducing a bug (red screenshot), a passing run after fixing it (green screenshot), and one change that would break the test. Save evidence with the relevant PR.

## 5. Technologies
- **Coding agent — Replit Agent:** Builds features iteratively while I review functionality and PRs.
- **Code hosting — GitHub:** Tracks Issues, feature branches, prompts, PRs, and merges; nothing new is committed directly to `main`.
- **Web stack — React + TypeScript + existing CSS:** Reuse the existing responsive OpenWindow styling; do not migrate to Tailwind for the course MVP.
- **Calendar component — existing OpenWindow calendar:** Reuse the current custom calendar, which already supports day, week, and month views and the required solid/dashed event styling; do not replace it with FullCalendar for this course MVP.
- **Database/auth — existing Replit-compatible SQL database and authentication solution, to be verified in the repository:** Stores users, events, topics, stars, and busy intervals with account isolation. Prefer existing working infrastructure over migrating stacks.
- **Hosting — Replit deployment:** Keeps a live URL accessible for the demo and submission.
- **Luma MCP / Apple Shortcuts — deferred for grading:** Keep existing integration prototypes outside the required course scope; current Luma status is recorded in §2.

## 6. Design
A clean, light, minimalist productivity interface inspired by **Luma's event cards** and **Google Calendar's weekly schedule**. Preserve the existing CSS and purple/yellow palette, clear typography, and accessible status labels. Keep **Discover/List** and **Calendar** as switchable views with shared Topic, Format, and Availability filters. Reuse the existing Day/Week/Month calendar component: commitments have **solid** blocks and potential events have **dashed** outlines. Add a simple **My Events** area for CRUD, stars, and dashboard stats. Do not assign AI priority scores or automatically hide conflicts.

## 7. Risks and cuts
**Biggest risk:** adding account-scoped database/auth and manual CRUD while preserving the working UI. **Mitigation:** prioritize manual entry and user-owned busy intervals while reusing the existing React/TypeScript/CSS app and calendar. **First cuts:** further Luma/Apple integration work, advanced classification beyond the existing multi-label model, and extra animations. **Never cut:** authentication/data isolation, CRUD, stars, filters/sort, dashboard, two tests, real data, or PR evidence.

## 8. Plan vs. Reality — complete at the end
**Do not rewrite the sections above to match the shipped app.** Fill this table using the actual GitHub PRs and implementation evidence.

| Planned feature | Shipped / Changed / Cut | Status (Done / Backlogged) | Learning — what changed and why |
|---|---|---|---|
| Accounts | TBD | TBD | TBD |
| Event database and CRUD | TBD | TBD | TBD |
| Validation and stars | TBD | TBD | TBD |
| Search, filters, sorting | TBD | TBD | TBD |
| Dashboard | TBD | TBD | TBD |
| Calendar view | TBD | TBD | TBD |
| Conflict detection | TBD | TBD | TBD |
| ICS export | TBD | TBD | TBD |
| Luma / calendar integrations (deferred) | TBD | TBD | TBD |
