# Phase 2 — Build Add & Manage Personal Events

Once Phase 1 succeeds, start a new feature branch from the updated GitHub main.

Follow our course workflow:
- Create a GitHub Issue.
- Create a dedicated feature branch from main.
- Save the full prompt in `prompts/personal-event-crud.md`.
- Implement the feature.
- Add automated tests.
- Open a PR with `Closes #<issue number>`.
- Do NOT merge this new PR.

## Product intent

OpenWindow is an event discovery and decision-making app, NOT a replacement for Apple Calendar.

Users should be able to manually add an interesting event they discovered elsewhere, even if it isn't available through our current event provider.

Manually added events are **potential events the user is considering**, not confirmed personal commitments.

## Feature requirements

### 1. Add Event

Provide a `+ Add Event` entry point in My Events and, if it fits naturally, in the Calendar view. Both should open the same form.

Required fields:
- Event title
- Start date and time
- End date and time

Optional fields:
- Location
- Event URL
- Description
- Topic and Format, reusing existing controlled values where practical

Validate required fields, valid dates, end time after start time, and valid optional URLs. Show helpful inline errors.

### 2. My Events integration

- Newly created events appear automatically in My Events.
- Default attendance status: Interested.
- Users can change the status to Planning to Attend or Registered, using the existing status controls.
- Clearly distinguish manually added events from external/provider events where useful, without redesigning the UI.
- Persist all data in the authenticated user's PostgreSQL records.

### 3. Calendar integration

- Show manually added events as Suggested Events, not Existing Commitments.
- Reuse existing calendar rendering and conflict detection.
- Preserve current Existing / Suggested / Conflict colors.
- Show personal attendance-status indicators consistently.
- Never silently write events to Apple Calendar.
- Preserve the existing optional ICS export behavior.

### 4. Edit Event

Allow users to edit events they created manually, including title, dates, location, description, URL, and supported labels.

Editing a manual event must not modify public/provider events or another user's records.

### 5. Delete Event

Allow users to delete their own manually created events with a confirmation step.

Deleting a manual event should remove it from My Events and the Calendar without affecting unrelated events, saved provider events, or personal busy intervals.

Keep existing bookmark/unsave behavior for provider events unchanged.

### 6. Security and data integrity

- Enforce user ownership on the server for create, read, update, and delete.
- Use the existing Clerk authentication and PostgreSQL/Drizzle architecture.
- Preserve the separation between source events, user-owned manual events, saved-event relationships, and Stars.
- Use additive migrations only.
- Handle timestamps and time zones carefully.
- Preserve existing user data and legacy localStorage migration behavior.
- Do not introduce duplicate event records or break existing saved events.

### 7. UX scope

Keep the existing OpenWindow visual style and navigation. Reuse existing components wherever possible.

Do not build a generic calendar editor, recurring events, invitations, reminders, RSVP integrations, or Apple Calendar synchronization.

## Verification

Add focused automated tests covering:
- Successful create, read, update, and delete
- Validation failures
- Server-side ownership and cross-account isolation
- Database persistence
- My Events integration
- Calendar rendering and conflict detection
- Regression protection for existing saved/provider events

Run:
- `npm test`
- `npm run typecheck`
- `npm run build`

Test database changes against the development database only. Never access or modify production data.

Prepare a working feature Preview for manual testing. Verify that it loads and that the Add Event workflow is usable.

## Repository and Preview safety

The original prototype is on `feature/7-luma-mcp-oauth-discovery` and must remain preserved. Draft PR #8 must remain unchanged.

Do not reset, rebase, force-push, rewrite history, or push local prototype configuration commits.

Use a separate feature worktree and Preview process as needed. Do not overwrite the original prototype workflow.

If Preview infrastructure conflicts occur, diagnose safely rather than changing unrelated code or deployment configuration.

## Stop conditions

You may autonomously complete both phases, including implementing and testing the new feature, without waiting for me.

However:
- Only PR #16 is approved for merge.
- Do NOT merge the new Personal Event CRUD PR.
- Do NOT deploy or publish anything to production.
- Do NOT start additional features.
- If a destructive operation, production access, or a major architecture change becomes necessary, stop and explain the blocker rather than proceeding.

## Final report

When finished, provide:

1. PR #16 merge commit and confirmation Issue #15 closed.
2. New Issue, branch, PR URL, and latest commit.
3. Summary of implemented functionality and any design trade-offs.
4. Test, typecheck, and build results.
5. Development database migration verification.
6. Feature Preview URL.
7. A concise manual acceptance checklist for me to run tomorrow.
8. Confirmation that draft PR #8, original prototype, and production remain unchanged.

Please complete as much as safely possible while I'm offline and leave the new PR open for my review.

## Existing PR #18 — Calendar visibility and header correction

I manually tested the Personal Event CRUD feature and found two Calendar UI bugs. Update the existing PR #18 only; do not create another Issue or PR. Extend Day and Week Calendar to cover the full day, with the initial scroll position at approximately 8 AM and vertical scrolling available for early-morning and late-night events. Position event blocks by their actual start and end times, do not clip late events, and split events crossing midnight into the correct daily segments. Fix Week date headers so weekday labels remain above date numbers in all columns; preserve today's purple circle. Keep Month view, event colors, conflicts, attendance markers, existing commitments, and responsive layout intact. Add focused regression tests, run the complete suite, typecheck, and build. Do not merge or deploy; preserve the prototype and draft PR #8.

## Existing PR #18 — Blank Preview cache recovery

When opening the updated Preview, the browser remained blank because it requested a stale immutable Vite module URL for the changed calendar helper. Move the helper to a new module path and update all imports so browsers fetch a fresh module. Verify the transformed module export, inspect browser logs, and confirm the updated Preview renders. Do not change feature behavior or merge/deploy.
