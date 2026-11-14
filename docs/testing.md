# Testing

The rule: **nothing is "done" or "works" without a passing run at every layer that applies.** A layer that was skipped must be named as skipped.

Tests never touch production. They use a separate Supabase project called `zen-test` that holds only fake data. The test settings refuse to run if they point at the production project.

## Layers

| # | Layer | Where | Command | Needs test DB |
|---|---|---|---|---|
| 1 | CI/CD | `.github/workflows/ci.yml` | runs on every PR and branch push | yes (e2e job) |
| 2 | Unit | `tests/*.test.js` | `npm test` | no |
| 2b | Type check (JSDoc via `tsc`, `exercise-domain.js` and `data-service.js`) | `types/tsconfig.json` | `npm run typecheck` | no |
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
| Permissions: 20 tables x anonymous / client / trainer, read-insert-update-delete, cross-client isolation | `rls-matrix.itest.js` | passing (clients read-only on health_metrics, device_connections, push_reminder_deliveries, schedule_notifications; full access to own rows on workout_sessions, workout_session_steps, push_subscriptions) |
| Migrations re-run safely, RLS on every table, anonymous-policy guard fails the deploy | `migrations.itest.js` | passing |
| Migrations are all-or-nothing; a policy the script does not know is refused and nothing is changed | `migrations.itest.js` | passing |
| A new table is protected by the script that creates it, even if the policy script fails | `migrations.itest.js` | passing |
| API speed on 52,000 rows (p95 budgets) | `api.perf.js` | passing (paged loader returns all 52,000 rows; member_id indexes used) |
| Load: 5, 20, 50, 100 concurrent users | `load.perf.js` | passing |
| Browser: load time, slow phone, long history, memory leak (typical and extreme data) | `frontend.spec.js` | passing |
| Paged loader: all pages, stable order, member filter, errors | `tests/fetch-all.test.js` | passing |

| Consent wizard: consent first, cannot skip, nothing saved without it, receipt row + file, trainer sees it, client sees it in Belgeler | `wizard.spec.js` | passing (needs the consent code from `feature/health-ready-ui`) |
| Trainer adds a client, a measurement, a document through the forms; each checked in the database | `trainer-writes.spec.js` | passing |
| Reminder Edge Function: secret required, 1-day and 1-hour reminders sent once, nothing when not due, dead endpoint survived, schedule-change notification | `reminders.itest.js` | passing (needs `npm run test:functions:deploy` once; skips with a message if not deployed) |
| Reminder robustness: a 404/410 subscription is deleted (reminder and schedule-change runs), a 500 keeps it and leaves the notification unsent until a later run succeeds | `reminders.itest.js` (3 tests) | passing (needs `npm run test:functions:deploy`) |

| Libraries are self-hosted: vendor files byte-identical to the npm releases, no request to any host but the app and Supabase | `vendor.test.js`, `self-hosted.spec.js` | passing locally |
| Release check: a changed shell file needs an APP_VERSION bump and matching `?v=` / SHELL_VERSION (CI, pull requests) | `version-bump.test.js`, `scripts/check-version-bump.js` | passing locally |
| Client ticks exercises (and unticks), confirms/declines a session, notification opt-in answers without crashing | `client-actions.spec.js` | passing |
| Trainer: weekly session create + delete (client is notified), edit a client, delete a measurement, delete a document (row + file), delete a client completely (real counts in the confirmation, cascade, files) | `trainer-forms.spec.js` | passing |
| Trainer builds a workout (every set stored) and a diet plan from the food library; the client sees the workout | `trainer-programs.spec.js` | passing |
| Wrong password, role separation (client on trainer door and the reverse), session resume after reload, sign-out, sign-up and password-reset screens, login form reachable on short screens | `auth.spec.js` | passing (sign-up and reset requests are answered by the test: e-mail delivery itself is not tested) |
| Live sync between two trainer windows (add, rename, delete) | `realtime.spec.js` | passing |
| Heavy history: a client with 2,000 measurements shows the true latest one; dashboard figure equals the database | `tests/perf/frontend.spec.js` | passing |

| Trainer edits a workout template, an exercise and a food; undo ("Geri Al") restores old values; a failed undo reports an error; search survives a client with no branch; an edit made offline waits in the queue and is saved on reconnect | `trainer-edits.spec.js` | passing (desktop + phone) |
| Logout warns about unsent changes and removes personal data from the device, also with no connection (the session is then removed from the device itself) | `safety-net.spec.js`, `data-service.test.js` | passing (desktop + phone) |
| Uncaught errors and unhandled promise rejections show a Turkish toast (at most 3 at once, no duplicates, tap or timeout removes it); on phones it stays above the add button | `safety-net.spec.js` | passing (desktop + phone) |
| Chart point colours: green is better, red is worse (body fat: lower is better; exercise weight: higher is better; weight and other unclear metrics stay neutral); a set without a weight draws no point | `safety-net.spec.js` | passing (desktop + phone) |
| Version tag shows the real app version, not a stale number | `safety-net.spec.js` | passing (desktop + phone) |
| Trainer controls without visible text (add button, search box, filter menus) have screen-reader names | `crawl.spec.js` | passing (desktop + phone) |
| Every trainer view and form: controls at least 44 px and named (no placeholder-only fields), including the rows added by the + buttons | `crawl.spec.js`, `ui-rows.spec.js` | passing (desktop + phone) |
| Phone: swipe right opens / left closes the menu (not from the screen edge, not inside forms), search bar scrolls with the page, client header buttons keep their text inside | `mobile-nav.spec.js` | passing (phone) |
| Phone header with a notch (0, 47 and 59 px, as on an iPhone home-screen app): logo inside its bar, search bar never covers it | `mobile-nav.spec.js` | passing (phone). also runs in WebKit (`phone-safari`); the test simulates the notch by rewriting the CSS function that reads it |
| Client downloads their own data ("Verilerimi Dışa Aktar"): only their own rows | `trainer-edits.spec.js` | passing (desktop + phone) |
| A change saved offline (new workout, edited food, deleted exercise) shows in the lists at once, with the "1 değişiklik gönderilmeyi bekliyor" status and toast, survives refreshes, and is sent on reconnect | `offline-core.spec.js` | passing (desktop + phone) |
| The data cache is written per user after a sync; another user's or a 15-day-old cache is removed; the offline status says "Çevrimdışı · Son güncelleme: ..." or "Bu cihazda kayıtlı veri yok" | `offline-core.spec.js` | passing (desktop + phone) |
| A write that never gets an answer ends in the queue within 20 s (15 s request timeout), shows in the list, and is sent later | `offline-core.spec.js` | passing (desktop + phone) |
| Queue messages are toasts (waiting, login expired as `role="alert"`, change failed), not alert boxes | `offline-core.spec.js` (waiting and failed toasts in the list tests; login-expired toast test) | passing (desktop + phone) |
| A button shows how many changes wait or failed; its list shows waiting items, failed items with a Turkish reason, "Tekrar dene" (sends it) and "Sil" (sends nothing), and the empty text. The conflict reason line ("Bu kayıt başka bir cihazda değiştirilmiş.") in the list is not tested | `offline-core.spec.js` (pending button and list; failed change) | passing (desktop + phone) |
| The pending button is at least 44 px and covers neither the logo bar, the search bar nor the client header, with a simulated notch of 0, 47 and 59 px | `offline-core.spec.js` (pending button layout, phone) | passing (phone) |
| The pending button sits under open modals: the workout modal's "+ Egzersiz Ekle" and submit button are clickable and the modal is the top element at the button's spot; in the client portal "Belgeler" and the last control are clickable | `offline-core.spec.js` (pending button layout, phone: modal and portal) | passing (phone) |
| Client portal offline: an exercise ticked offline shows `Tamamlandı ✓` at once, the pending button counts, unticking shows `Tamamla` again, the last choice is in the database after reconnect, the portal reloads and no trainer-only table (`programlar`, `master_besinler`) is ever read | `offline-core.spec.js` (client portal: tick) | passing (desktop + phone) |
| Client portal offline: a session answered offline shows `Katılacağım ✓` at once and is saved on reconnect | `offline-core.spec.js` (client portal: session) | passing (desktop + phone) |
| Client portal cache: the last load is kept per user; with every read failing the portal opens from it with `Çevrimdışı · Son güncelleme: ...`, without a cache it says `Bağlantı yok ve bu cihazda kayıtlı veri bulunmuyor.` (a real offline reload waits for the service-worker milestone) | `offline-core.spec.js` (client portal: fresh start) | passing (desktop + phone) |
| The offline event shows the same honest status as a refresh | `offline-core.spec.js` (the cache is written per user...) | passing (desktop + phone) |
| A change made offline after the login token expired (saved session's `expires_at` moved into the past, then offline; simulation, not a real hour-long wait) shows at once, is queued under this user (pending button counts it) and reaches the database exactly once after reconnect, for the trainer (new workout) and the client (tick) | `offline-core.spec.js` (trainer and client "token expired" tests) | passing (desktop + phone) |
| The client portal loader opens the cache at once, without waiting for the login check, when offline with an expired token (queue event with the online flag faked) | `offline-core.spec.js` (client portal: opens the cache at once) | passing (desktop + phone) |
| A queued change is labelled with the last signed-in user from the auth events (cleared on sign-out) without asking `getSession()` | `tests/data-service.test.js` (labelled with the last known user) | passing |
| A network or timeout error stops the queue flush: later changes are not sent and the order is kept | `tests/data-service.test.js` (a connection error stops the flush) | passing |
| A deleted client's measurements and other history do not stay in the trainer's device cache | `offline-core.spec.js` (a deleted client leaves no history in the device cache) | passing (desktop + phone) |
| The service worker caches only same-origin shell files under one name `zen-shell-<version>` (no Supabase response, no `sw.js`); with no signal a reload shows the login screen, the trainer's member list from the device copy and the client portal; a logout made offline then a reload shows the login screen | `offline-shell.spec.js` | passing (desktop + phone) |
| Kill switch: the code in `docs/service-worker.md` deletes the `zen-shell-*` caches, removes the worker and reloads; the app works online afterwards | `offline-shell.spec.js` (kill switch) | passing (desktop + phone) |
| A new release waits and is offered with the bar `Yeni sürüm hazır.` (`Yenile` / `Sonra`, 44 px buttons); a first install shows no bar; `Sonra` hides it until the next load; `Yenile` reloads once and the new worker controls the page; an unsent change survives it | `update-prompt.spec.js` (serves a changed `sw.js` through `tests/helpers/app-server.js`; enters the app first and clicks the real buttons) | passing (desktop + phone) |
| Icons: the manifest has an `id`, 192 and 512 (`any`) and 512 (`maskable`) icons of the declared pixel size; the apple-touch-icon is 180 px; the splash logo is under 80 KB; all load with status 200; icons and splash logo are in the service worker shell list | `tests/icons.test.js`, `install-hint.spec.js` (first test) | passing (desktop, phone, phone-safari) |
| iPhone install card (`Uygulamayı ana ekrana ekleyin...`, `Tamam` 44 px): shown once after login on an iPhone browser, not again after `Tamam`, never on desktop or when installed (standalone) | `install-hint.spec.js` | passing on desktop, phone (Chromium with iPhone UA) and phone-safari (WebKit). Real iPhone: cannot be automated |
| Tests never reach production: any response from the production Supabase host fails the spec (WebKit skips `page.route` under a service worker, so the `phone-safari` project blocks service workers) | `fixtures.js` guard, every e2e spec | passing; negative control: guard pointed at the test host fails every request (16 hits) |
| A workout saved by the trainer form (one entry per set) shows `60 kg × 8` in the client's exercise row; the older `{ad, set, tekrar}` shape still works | `client-actions.spec.js` (trainer form), `tests/exercise-domain.test.js` (planSets, formatSet) | passing (desktop + phone) |
| Set-logging helpers: number parsing, plan to sets, grouping, last numbers, rest clock | `tests/exercise-domain.test.js` | passing |
| The paged loader accepts a list filter (`in`) and returns `[]` for an empty list without a request | `tests/fetch-all.test.js` | passing |
| `workout_session_steps` is in the live-sync publication and its policy is required by the migration | `migrations.itest.js` | passing |
| Client session screen: `Antrenmanı Başlat` / `Devam Et` on a workout with sets, no button without sets (`Bu antrenmanda egzersiz yok.`), rows with `Hedef:` text, `+` steps weight by 2,5, `Tamam` saves one step row (session `active` with the workout id) | `set-logging.spec.js` (start, fields, save one set; a workout without sets) | passing (desktop + phone) |
| Rest countdown after a set: `Dinlenme: 0:30` from an end time, `+15 sn`, `Geç`, `Dinlenme bitti` for 5 s then gone, rest setting in 15 s steps (0 = off) | `set-logging.spec.js` (rest countdown) | passing (desktop + phone) |
| `Düzelt` saves over the same row (same id, one row per step); an invalid number shows `Geçerli bir sayı girin.` and saves nothing; an empty weight is stored as no weight | `set-logging.spec.js` (Düzelt; invalid number) | passing (desktop + phone) |
| Reload mid-session: `Devam Et` shows the saved sets, one session only; `Kapat` leaves it active and returns focus to the start button | `set-logging.spec.js` (reload mid-session) | passing (desktop + phone) |
| `Antrenmanı Bitir`: `completed` with `ended_at` and toast, or `cancelled` with no saved set; the next session shows `Geçen sefer:` and starts with those numbers | `set-logging.spec.js` (finish) | passing (desktop + phone) |
| A set saved offline shows as saved at once, the pending button counts it, and after reconnect the database has the step exactly once | `set-logging.spec.js` (saved offline) | passing (desktop + phone) |
| Session screen on a phone: every button at least 44 px, no sideways scroll at 375 px, the rest bar never covers the last row's `Tamam` | `set-logging.spec.js` (phone layout) | passing (desktop + phone) |
| Client portal on a phone (width up to 820 px): the seven section tabs are a bottom bar (icon above label, active tab marked by a top bar and bold text), at the screen's bottom edge at 375 and 320 px, each at least 44 px high, no horizontal scroll, also with a simulated home-indicator inset (0 and 34 px); the last element of the longest section scrolls clear of it; the pending button and toasts sit above it; the session screen covers it; on desktop it stays a normal row | `portal-bar.spec.js` | passing (phone, desktop) |
| Session screen keyboard: Tab / Shift+Tab wrap inside the screen (40 presses never leave it), Escape closes it and focus returns to the start button | `set-logging.spec.js` (keyboard) | passing (desktop) |
| Bottom-bar labels are not cut off at 320 and 375 px, are at least 10 px, and every tab has the same height | `portal-bar.spec.js` (no tab label is cut off) | passing (phone) |
| Device features with stubbed browser APIs: wake lock requested at start and again after the page was hidden, beep booked on the audio clock (`audioSession` = playback), vibration `[200,100,200]` and the haptic switch at rest end, `Geç` cancels the beep with no vibration, `Kapat` releases the lock; with every API missing the flow runs with no errors. Real devices cannot be automated | `set-logging.spec.js` (device features) | passing (desktop + phone) |
| Coach card (Gelişim tab): `Katılım (son 4 hafta)` counts planned sessions minus declined ones and days with a logged set; `Bu haftanın hacmi` per muscle (a set counts for each of its muscles, uncatalogued exercises under `Diğer`, cancelled sessions ignored); `Kişisel rekorlar` with `Tahmini 1TM`, `Yeni` badge only for a real new record (not a tie, not a first entry), `Tümünü göster` past 8 rows | `coach-insights.spec.js` (card; more than eight records) | passing (desktop + phone) |
| `Son antrenmanı tekrarla`: opens the workout form dated today with the last workout's sets prefilled, saves nothing until `Kaydet`, then the database has a new row with identical sets, rpe, tempo and rest | `coach-insights.spec.js` (Son antrenmanı tekrarla) | passing (desktop + phone) |
| Coach card and repeat button are trainer-only (a client login shows neither); at 320 px no sideways scroll, new buttons at least 44 px | `coach-insights.spec.js` (client login; 320 px) | passing (desktop + phone) |
| Trainer profile tabs: a client with no measurement opens on `Ölçümler` and exactly one tab looks selected; switching tabs keeps exactly one | `trainer-tabs.spec.js` | passing (desktop + phone) |
| No blocking pop-ups: every `alert()` is a toast, and any alert dialog fails every e2e spec (guard in `fixtures.js`); a refused form value (end time before start) shows its toast | `fixtures.js` guard, `trainer-feedback.spec.js` | passing (desktop + phone) |
| `Antrenman kaydedildi!` / `Ölçüm kaydedildi!` / `Test kaydedildi!` only when the change was really sent (a queued save shows only the waiting message); the save button is disabled while saving (a double click on a slow save makes one row); a conflicted change in the pending list has `Sil` but no `Tekrar dene` | `trainer-feedback.spec.js` | passing (desktop + phone); measurement and cardio forms share the same code, tested through the workout form |
| Trainer profile, workouts tab: card `Danışan kayıtları` shows the client's newest sessions (workout name, `Devam ediyor`, `2 set`, `E2E Squat: 60 kg × 8 · 62,5 kg × 8`), the empty text when none, updates live when the client logs another set (`3 set`) without a reload, and never shows another client's sets | `realtime.spec.js` (a set the client logs reaches the open trainer profile) | passing (desktop + phone) |
| The back button closes the top layer instead of leaving the app, for both roles: an open modal, then the client session screen (as `Kapat`, session stays active), then a portal tab (back to `Özet`), then a trainer page (profile to list); a modal closed by its own button leaves no stale entry (the next back acts on the page below); the app stays loaded and logged in | `back-button.spec.js` | passing (desktop + phone) |
| Every modal is an accessible dialog: `role=dialog`, `aria-modal`, `aria-labelledby`; focus moves in on open, Tab and Shift+Tab stay inside, Escape closes it like its close button and focus returns to the opener; the close control is a labelled `Kapat` button that works from the keyboard; the workout modal keeps typed values while Tab cycles | `modal-a11y.spec.js` | passing (desktop + phone smoke) |

Still not covered (UI/UX): focus order with a keyboard only, screen-reader reading order, dark/light system theme, real-device touch feel (owner checklist).

Still not covered: editing an existing diet plan (the app has no edit for diet plans, only create and delete), cardio tests, importing data (the app has no import feature; only the client export exists). The offline queue's conflict path is covered by `tests/data-service.test.js` only (the conflict reason line in the list is not tested); the failure path is covered through the UI (the failed item is seeded, not driven through five real refusals).

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

Real iPhone push delivery, the Apple Watch Shortcut, and how the app feels on a real phone stay as manual checklist items for the owner. Also on real phones only: the rest-end beep (including silent-switch behaviour on iPhone), vibration, the iPhone haptic tick and the screen wake lock of the session screen (the tests cover the countdown and the screen, not these device features). List them in the PR description.

## Invariant: reminder times

`send-schedule-reminders` compares whole minutes: a session is reminded only when its start minute equals the minute of the run (modulo 30) and the run is exactly 1 hour or 1 day before. The schedule form offers only :00 and :30 start times and the cron runs every 5 minutes, so every session is covered. **If a start time such as 18:15 or 18:12 is ever offered, check the function and the cron schedule first**, or reminders for those sessions will silently never be sent. `reminders.itest.js` aims at the exact minute for this reason.
