# Testing

The rule: **nothing is "done" or "works" without a passing run at every layer that applies.** A layer that was skipped must be named as skipped.

Tests never touch production. They use a separate Supabase project called `zen-test` that holds only fake data. The test settings refuse to run if they point at the production project.

## Layers

| # | Layer | Where | Command | Needs test DB |
|---|---|---|---|---|
| 1 | CI/CD | `.github/workflows/ci.yml` | runs on every PR and branch push | yes (e2e job) |
| 2 | Unit | `tests/*.test.js` | `npm test` | no |
| 3 | Integration (RLS matrix, migrations, Edge Functions) | `tests/integration/*.itest.js` | `npm run test:integration` | yes |
| 4 | End to end (UI → API → logic → DB) | `tests/e2e/*.spec.js` | `npm run test:e2e` | yes |
| 5 | Click-through wizard (every nav item and tab, both roles, phone + desktop) | `tests/e2e/crawl.spec.js` | `npm run test:e2e` | yes |
| 6 | Performance (query speed on big data, load ramp to 100 users, browser speed, memory) | `tests/perf/` | `npm run test:perf:seed` once, then `npm run test:perf` | yes |

**Browsers:** every end-to-end spec runs in Chromium on a desktop and on an iPhone-sized screen (`desktop`, `phone`). The layout specs (`crawl`, `mobile-nav`, `ui-rows`) also run in WebKit, Safari's own engine (`phone-safari`), because Chromium cannot show Safari-only layout problems such as the notch. Locally: `npx playwright install chromium webkit`.

**Shared test database:** CI jobs that rebuild or use `zen-test` (e2e and the weekly perf run) share one queue (`concurrency: zen-test-database`), so two runs never rebuild it at the same time. A run waits for the one in front of it; if three queue up, the middle one is cancelled (re-run it).

Layer 6 also runs weekly and on demand through `.github/workflows/perf.yml` (not on every PR: it is heavy). Baseline numbers and open findings are in `docs/perf-baseline.md`.

**Known gaps** are tests marked `todo`: they run and report, but do not fail the build, because the fix needs an owner decision (see `docs/perf-baseline.md`). A known gap is never deleted; when it is fixed the test must be changed to a normal test. There are none open at the moment.

**Every new test gets a negative control**: break the thing on purpose (on the test database) and confirm the test fails.

## One-time setup of the test database (about 10 minutes)

1. In Supabase, create a **new** project named `zen-test` (free plan, same region as production). Use a new database password; paste it only into your own files.
2. Copy `docs/test-env.example` to `.env.test` in the repository folder and fill it in (project URL, publishable key, secret key, database pooler user/host/password, and invented passwords for the three fake accounts). `.env.test` is git-ignored. Never paste these values into chat.
3. Build and seed it: `npm run test:seed` (applies `.supabase/baseline.sql` first: the six core tables were created by hand in production, so a fresh database needs them before the migrations run).
4. Add the same values as GitHub Actions secrets named `ZEN_TESTDB_*` so CI can run.
4b. Deploy the reminder function to the test project once (`npm run test:functions:deploy`; needs the Supabase CLI login). It also creates a test-only stand-in push service and remembers a throwaway `ZEN_TESTDB_CRON_SECRET` in `.env.test`; add that one as a GitHub secret too.
5. Run `npm run test:e2e` (locally, set `PW_CHANNEL=msedge` to use the installed Edge instead of downloading a browser).

## Feature matrix

Every feature gets a row in the table below with the test that proves it. A feature without a passing row is not finished.

| Feature | Test | Status |
|---|---|---|
| Logged-out splash and role picker | `crawl.spec.js` | passing locally (desktop + phone) |
| Trainer: every sidebar view opens | `crawl.spec.js` | passing locally (desktop + phone) |
| Client: every portal tab opens | `crawl.spec.js` | passing locally (desktop + phone) |
| Permissions: 15 tables x anonymous / client / trainer, read-insert-update-delete, cross-client isolation | `rls-matrix.itest.js` | passing (clients read-only on health_metrics and device_connections) |
| Migrations re-run safely, RLS on every table, anonymous-policy guard fails the deploy | `migrations.itest.js` | passing |
| API speed on 52,000 rows (p95 budgets) | `api.perf.js` | passing (paged loader returns all 52,000 rows; member_id indexes used) |
| Load: 5, 20, 50, 100 concurrent users | `load.perf.js` | passing |
| Browser: load time, slow phone, long history, memory leak (typical and extreme data) | `frontend.spec.js` | passing |
| Paged loader: all pages, stable order, member filter, errors | `tests/fetch-all.test.js` | passing |

| Consent wizard: consent first, cannot skip, nothing saved without it, receipt row + file, trainer sees it, client sees it in Belgeler | `wizard.spec.js` | passing (needs the consent code from `feature/health-ready-ui`) |
| Trainer adds a client, a measurement, a document through the forms; each checked in the database | `trainer-writes.spec.js` | passing |
| Reminder Edge Function: secret required, 1-day and 1-hour reminders sent once, nothing when not due, dead endpoint survived, schedule-change notification | `reminders.itest.js` | passing (needs `npm run test:functions:deploy` once; skips with a message if not deployed) |

| Client ticks exercises (and unticks), confirms/declines a session, notification opt-in answers without crashing | `client-actions.spec.js` | passing |
| Trainer: weekly session create + delete (client is notified), edit a client, delete a measurement, delete a document (row + file), delete a client completely (real counts in the confirmation, cascade, files) | `trainer-forms.spec.js` | passing |
| Trainer builds a workout (every set stored) and a diet plan from the food library; the client sees the workout | `trainer-programs.spec.js` | passing |
| Wrong password, role separation (client on trainer door and the reverse), session resume after reload, sign-out, sign-up and password-reset screens, login form reachable on short screens | `auth.spec.js` | passing (sign-up and reset requests are answered by the test: e-mail delivery itself is not tested) |
| Live sync between two trainer windows (add, rename, delete) | `realtime.spec.js` | passing |
| Heavy history: a client with 2,000 measurements shows the true latest one; dashboard figure equals the database | `tests/perf/frontend.spec.js` | passing |

| Trainer edits a workout template, an exercise and a food; undo ("Geri Al") restores old values; a failed undo reports an error; search survives a client with no branch; an edit made offline waits in the queue and is saved on reconnect | `trainer-edits.spec.js` | passing (desktop + phone) |
| Trainer controls without visible text (add button, search box, filter menus) have screen-reader names | `crawl.spec.js` | passing (desktop + phone) |
| Every trainer view and form: controls at least 44 px and named (no placeholder-only fields), including the rows added by the + buttons | `crawl.spec.js`, `ui-rows.spec.js` | passing (desktop + phone) |
| Phone: swipe right opens / left closes the menu (not from the screen edge, not inside forms), search bar scrolls with the page, client header buttons keep their text inside | `mobile-nav.spec.js` | passing (phone) |
| Phone header with a notch (0, 47 and 59 px, as on an iPhone home-screen app): logo inside its bar, search bar never covers it | `mobile-nav.spec.js` | passing (phone). also runs in WebKit (`phone-safari`); the test simulates the notch by rewriting the CSS function that reads it |
| Client downloads their own data ("Verilerimi Dışa Aktar"): only their own rows | `trainer-edits.spec.js` | passing (desktop + phone) |

Still not covered (UI/UX): focus order with a keyboard only, screen-reader reading order, dark/light system theme, real-device touch feel (owner checklist).

Still not covered: editing an existing diet plan (the app has no edit for diet plans, only create and delete), cardio tests, importing data (the app has no import feature; only the client export exists), the offline queue's conflict and failure paths through the UI (covered by `tests/data-service.test.js` only).

## Bugs these tests found (2026-11-10)

Fixed:
1. **"Session removed" notifications were never created.** The app referenced the session it had just deleted; the database refused (foreign key). Clients were never told. Fix: no reference.
2. **A client's profile header kept the old name and schedule after an edit** until the profile was reopened. Fix: the header refreshes on every sync.
3. **The login form was cut off on short screens:** "Şifremi Unuttum" and the sign-up switch could not be reached on 720 px-high laptops or small phones. Fix: the login screen scrolls.
4. **Clients with more than 1,000 rows lost data** and the trainer screen loaded every client's history at login (paged loading and per-client loading, see `docs/perf-baseline.md`).

Fixed in 1.3.120 (owner approved the Turkish text change):
5. **Raw English errors reached Turkish screens** (failed sign-in, notification opt-in, save and delete alerts). Fix: `trMessage()` in `script.js` maps known Supabase and browser errors to Turkish; anything unknown shows a generic Turkish message and the detail stays in the console.
6. **Global search crashed for everybody** when any client had no branch (`brans` empty). Fix: search tolerates empty names and branches.
7. **"Geri Al" (undo) said "successfully undone" even when the database refused.** Fix: each undo step is checked, and a failure is reported.

Design notes, not bugs: other profile tabs stay locked until the client has a measurement this month; the sign-up form has no name field (the onboarding wizard asks for it).

## What cannot be automated

Real iPhone push delivery, the Apple Watch Shortcut, and how the app feels on a real phone stay as manual checklist items for the owner. List them in the PR description.

## Invariant: reminder times

`send-schedule-reminders` compares whole minutes: a session is reminded only when its start minute equals the minute of the run (modulo 30) and the run is exactly 1 hour or 1 day before. The schedule form offers only :00 and :30 start times and the cron runs every 5 minutes, so every session is covered. **If a start time such as 18:15 or 18:12 is ever offered, check the function and the cron schedule first**, or reminders for those sessions will silently never be sent. `reminders.itest.js` aims at the exact minute for this reason.
