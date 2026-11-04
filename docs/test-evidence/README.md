# Required assignment test evidence

The route-level isolation check exercises server-side identity binding with an isolated test store; the existing PostgreSQL integration test separately verifies database-level account isolation. The dashboard count test ran against the development database, `heliumdb`, using uniquely named test records that it removes in `finally`. No production database or user records are used.

## 1. Data isolation

**Given** Alice and Bob each have a different starred event in separate server-side account records.

**When** Bob requests `/api/account/data?userId=alice` while authenticated as Bob.

**Then** the response contains Bob's event and does not contain Alice's event.

- Focused test: `server/account-routes.test.ts` — `User B cannot read User A's private event list by supplying User A's ID`
- PostgreSQL corroboration: `server/account-store.test.ts` — `PostgreSQL account storage isolates users and local migration is idempotent`
- Plain-English explanation: the account API must take its owner from the verified server-side session. A browser-supplied ID must not let one account read another account's private list.
- Future regression this catches: a route begins using a `userId` query parameter instead of the verified session identity.
- Reproduce the focused test:

  ```sh
  node_modules/.bin/tsx --test --test-name-pattern="User B cannot read User A's private event list" server/account-routes.test.ts
  ```

The RED run temporarily made the `/api/account/data` route trust the query-string `userId`. The same request then returned Alice's event to Bob and the assertion failed. That temporary code change was reverted before the GREEN run.

## 2. Dashboard calculation

**Given** the test user's PostgreSQL account has two starred events, one manual event, and one unstarred candidate.

**When** the existing My Events summary is calculated from the account store's database read.

**Then** it reports three events: two from Discover and one added by the user; the unstarred candidate is excluded.

- Test: `server/account-store.test.ts` — `My Events dashboard count comes from the user's persisted account records`
- Plain-English explanation: the displayed My Events total is derived from the signed-in account's persisted Stars and manual events, rather than a fixed demo total.
- Future regression this catches: a summary change starts counting every Discover event as part of My Events.
- Reproduce the test:

  ```sh
  node_modules/.bin/tsx --test --test-name-pattern="My Events dashboard count comes from the user's persisted account records" server/account-store.test.ts
  ```

The RED run temporarily changed the summary to include unstarred Demo events. The persisted-record test then reported four events instead of three. That temporary calculation bug was reverted before the GREEN run.

## Screenshots

The images are browser captures of the exact targeted test-run output. The RED and GREEN commands are the same for each test; only the temporary bug state differed.

- `data-isolation-red.jpg`
- `data-isolation-green.jpg`
- `dashboard-red.jpg`
- `dashboard-green.jpg`

## Full verification

```sh
npm test
npm run typecheck
npm run build
```
