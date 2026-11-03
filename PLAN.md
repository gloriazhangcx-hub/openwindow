# OpenWindow — PLAN.md

> **Course development plan (November 2026).** Adapted from the original *OpenWindow Product Planning Document — MVP v0.1* (October 2026), retained unchanged in `docs/`. Initial Discover/Calendar prototyping and GitHub PRs preceded this Markdown version. This document does **not** claim to be the repository's first PR. The sections below describe the intended formal build; complete **Plan vs. Reality** at submission without rewriting the original intentions.

## 1. Pitch

**OpenWindow — Discover what you could do, alongside what you already plan to do.** I'm building a calendar-aware event discovery and tracking app because interesting AI, consumer-tech, career, and social-impact events are scattered across platforms, and checking them against my schedule is tedious. I expect to use it throughout the semester to discover events, save possibilities, and decide what to attend. It may also help other MBA students and young professionals. OpenWindow **informs rather than ranks**: conflicting events stay visible, and users decide for themselves.

## 2. Features — ordered user stories

The first seven stories are the required course spine; the last three are OpenWindow-specific features already explored in the prototype. All must work with real user-owned data where relevant.

1. **Accounts.** As a user, I can sign up, log in, and log out, so my saved events and calendar information are private and persist across sessions.
2. **Relational data.** As a user, I can keep events with multiple **Topic** and **Format** labels and associated personal busy intervals, so the same data supports List and Calendar views.
3. **Event CRUD.** As a user, I can create a personal event, list my events, open details, edit, and delete with confirmation; I can also save an event discovered through a source such as Luma without editing the public source record.
4. **Validation.** As a user, I receive clear errors for missing title/start/end times, invalid date ranges, or malformed URLs rather than saving unusable entries.
5. **Stars.** As a user, I can star/unstar an event and see a Starred view. Stars use a dedicated user–event junction table, separate from simply saving an event.
6. **Find things.** As a user, I can search event titles, filter by multi-select Topic, multi-select Format, and availability (All / Available / Conflict / Unknown), and sort by date. Filters persist when switching List and Calendar views.
7. **Dashboard.** As a user, I see at least one chart (my saved events by Topic) and three calculated figures (saved count, starred count, and conflict-free count), all derived from my own database records.
8. **Custom: Calendar overlay.** As a user, I see existing commitments as **solid** blocks and possible events as **dashed** blocks at their actual times, with day/week/month navigation and event details.
9. **Custom: Conflict detection.** As a user, I see Available, Conflict, or Unknown based on time overlaps, without automatically hiding events. The comparison uses `event.start < busy.end && event.end > busy.start`, handles time zones, and shows Unknown when data is insufficient.
10. **Custom: Explicit calendar export.** As a user, I can download an event as `.ics` and choose whether to add it to my calendar; the app never writes proposed events silently.

**Real-use criterion:** enter at least five genuine events relevant to my semester. Demo fixtures must be visibly labeled and must not be presented as live Luma data. Live Luma discovery and automatic Apple Calendar sync remain optional integrations, not dependencies of the graded core.

## 3. Database design (intended schema)

Use a relational database and server-enforced user ownership. Times are stored as timezone-aware timestamps. Public source events and user-owned records must remain distinct.

**Current implementation status:** PR #12 added Replit-managed Clerk session verification and PostgreSQL persistence through Drizzle and `pg`. The shipped schema uses Clerk-linked users, per-user event snapshots, separate `saved_events` and `stars` relationships, multi-label topic/format relations, busy intervals, preferences, and migration snapshots. The table below remains the intended course-level model; it is not a literal dump of the shipped schema.

| Table | Columns (type; `PK` / `FK` noted) | Relationships / purpose |
|---|---|---|
| `users` | `id UUID PK`, `email TEXT UNIQUE NOT NULL`, `created_at TIMESTAMPTZ` | One user owns many personal events, busy intervals, and stars; auth credentials handled by chosen provider. |
| `events` | `id UUID PK`, `user_id UUID FK`, `title TEXT`, `description TEXT`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`, `location TEXT`, `source_url TEXT`, `source_event_id TEXT NULL`, `created_at TIMESTAMPTZ` | User-owned saved/manual events. `user_id → users.id`. A source ID is optional; no source data is treated as user-private until saved. |
| `topics` | `id UUID PK`, `name TEXT UNIQUE` | Shared controlled vocabulary. |
| `event_topics` | `event_id UUID FK`, `topic_id UUID FK`, composite PK | Many-to-many: events ↔ topics; preserve original multi-label filters. |
| `formats` | `id UUID PK`, `name TEXT UNIQUE` | Shared format vocabulary (workshop, networking, etc.). |
| `event_formats` | `event_id UUID FK`, `format_id UUID FK`, composite PK | Many-to-many: events ↔ formats. |
| `stars` | `user_id UUID FK`, `event_id UUID FK`, `created_at TIMESTAMPTZ`, composite PK (`user_id`, `event_id`) | A user can star a saved event once; verify ownership on every write/read. |
| `busy_intervals` | `id UUID PK`, `user_id UUID FK`, `starts_at TIMESTAMPTZ`, `ends_at TIMESTAMPTZ`, `source TEXT`, `created_at TIMESTAMPTZ` | User-private calendar busy windows for conflict checks; avoid collecting event titles, attendees, or notes. |

Require `ends_at > starts_at`. All event, star, and busy-interval reads/writes must be scoped to the authenticated user; UI filtering alone is insufficient. A user may have multiple topics and formats per event. Public Luma records can be loaded through an adapter, with a clearly marked mock fallback, rather than copied indiscriminately into private records.

## 4. Two automated acceptance tests (Given / When / Then)

**A — Data isolation.** **Given** User A owns an event and User B is logged in, **when** B requests A's event detail by ID or lists personal events, **then** A's event is inaccessible and absent. This must test the server/data-access layer, not just UI visibility.

**B — Dashboard correctness.** **Given** one user owns five saved events, of which two are starred, **when** the dashboard summary is computed, **then** saved count is five and starred count is two (without double-counting multi-topic joins).

For each: save a plain-English explanation, an actual failing **red** run after temporarily introducing a controlled bug, a passing **green** run after fixing it, screenshots linked in the PR, and a sentence describing what regression the test would catch.

## 5. Technologies and development process

- **AI coding agent:** Replit Agent, to implement small features iteratively while I inspect and approve changes.
- **Frontend:** retain the existing React + TypeScript app and plain CSS. Reuse the current Discover/List and custom Calendar components, which already support Day, Week, and Month views with solid commitments and dashed possible events; do not migrate to Tailwind or replace the calendar with FullCalendar.
- **Backend/database/auth:** retain the existing Express + TypeScript server. **Implemented in PR #12:** Replit-managed Clerk for signup, login, logout, and verified session identity; PostgreSQL through `DATABASE_URL`, accessed with Drizzle and the Node `pg` driver; and account routes that enforce ownership from the server-verified Clerk user. Existing localStorage migration preserves the original raw values. The existing `SESSION_SECRET` is only used for Luma OAuth session cookies, not app login. Event CRUD, attendance status, Stars UI, and the remaining course stories are still planned work.
- **Event integration:** existing Luma MCP adapter and mock provider. OAuth and tool discovery have been verified, but authenticated real `tools/call` event retrieval is **not yet confirmed**; do not label fixture events as live.
- **Calendar input:** current calendar-import prototype; Apple Calendar Shortcut busy-only sync is a later integration, with minimal private data collection.
- **Hosting:** existing Replit deployment for the live demo. **Version control:** existing private GitHub repository; every new change follows Issue → branch → saved prompt (`prompts/<feature>.md`) → PR with `Closes #N` → review/merge → deploy. Never commit directly to `main`. GitHub `main` includes the merged course plan and PR #12; course branches start from verified GitHub `main`, separately from the preserved local prototype worktree and draft Luma PR #8.

## 6. Design and experience

Keep the original **Discover List ↔ Calendar Overlay** navigation and shared multi-select Topic/Format/Availability filters. List cards show title, time, location, labels, availability, details, Save, and source link. Add a modest **My Events** area for user-owned CRUD and Starred items, plus a simple dashboard; do not turn the app into a generic task manager. Calendar uses solid personal commitments and dashed possible events, with readable overlaps and a legend. Keep conflicts visible, Unknown explicit, and `.ics` export opt-in. Maintain a clean, responsive interface and avoid AI priority scores, forced rankings, or silent calendar writes.

## 7. Risks, trade-offs, and cuts

**Risk:** live Luma MCP calls or Apple Calendar automation may not be reliable by the deadline. **Response:** preserve the adapter and prototype work but allow manual entry of at least five real events; use clearly labeled demo fallback only for development. **Risk:** existing saved items and busy windows live in browser storage or memory, not durable per-user storage. **Response:** prioritize authentication, SQL persistence, ownership checks, and migration behavior before polishing UI. **Risk:** multi-label events can inflate dashboard counts. **Response:** use distinct event IDs and test summaries. **Risk:** local Git history diverges from GitHub. **Response:** reconcile safely before feature work; do not force-push or erase the draft Luma PR.

**Cut first if needed:** live Luma retrieval, automated Apple Calendar Shortcut, travel-time conflicts, AI ranking, extra visual polish. **Do not cut:** accounts and isolation, related database tables, CRUD, validation, stars, search/filter plus sort, dashboard chart/stats, two required tests and red/green evidence, five real records, PR workflow, or reflection evidence.

## 8. Plan vs. Reality — complete at the end

Preserve sections 1–7 as the formal plan; fill this table with actual implementation status and supporting PRs, including the gap between the October Word plan, prototype work, and this later course-format plan.

| Planned feature | Shipped / Changed / Cut | Done / Backlogged | What changed and why; evidence |
|---|---|---|---|
| Accounts, database, isolation | Shipped | Done | PR #12 added Clerk authentication, PostgreSQL/Drizzle persistence, server-side ownership checks, and local-storage migration. The user manually verified sign-in, save, refresh persistence, sign-out, and account isolation. |
| Event CRUD and validation | TBD | TBD | TBD |
| Stars and Starred view | TBD | TBD | TBD |
| Search, multi-label filters, sort | TBD | TBD | TBD |
| Dashboard | TBD | TBD | TBD |
| Calendar overlay, conflict detection, ICS | TBD | TBD | TBD |
| Luma and Apple Calendar integrations | TBD | TBD | TBD |
