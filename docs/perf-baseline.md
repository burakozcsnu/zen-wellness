# Performance baseline

Measured 2026-11-10 on the free `zen-test` Supabase project (Frankfurt) from a Windows PC in Turkey. Budgets in the tests are roughly 1.5 to 2 times these numbers. Re-measure when the database plan, region or data model changes.

Two data scales (`npm run test:perf:seed` for typical, `npm run test:perf:seed:extreme` for the stress case):
- **Typical studio:** 52 members, 7,000 measurements, 3,000 workouts.
- **Extreme:** 502 members, 52,000 measurements, 25,500 workouts.

## API (extreme data, 15 samples each)

| Query | p50 | p95 | Budget p95 |
|---|---|---|---|
| Trainer startup, first page of 9 tables in parallel | 738 ms | 1,243 ms | 2,000 ms |
| One member's measurements (100 rows), trainer | 259 ms | 267 ms | 500 ms |
| Client's own measurements (2,000 rows) | 465 ms | 548 ms | 800 ms |
| Client portal load (11 queries in parallel) | 462 ms | 717 ms | 1,200 ms |
| App's paged loader: all 52,000 measurements | 24 s | | checked for completeness |

## Load (12 s per stage, heavy client read of 2,000 rows), after the member_id indexes

| Users | req/s | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| 5 | 10.6 | 464 ms | 615 ms | 673 ms | 0% |
| 20 | 51.2 | 369 ms | 661 ms | 1,202 ms | 0% |
| 50 | 59.6 | 836 ms | 1,436 ms | 1,974 ms | 0% |
| 100 | 62.6 | 1,683 ms | 2,618 ms | 3,245 ms | 0% |

Before the indexes, saturation was about 52 req/s and p95 at 100 users was 4,181 ms. Throughput stops growing past roughly 20 concurrent users (the free database is the bottleneck); no errors at 100 users.

## Browser (Edge/Chromium)

| Scenario | Typical | Extreme | Budget (typical / extreme) |
|---|---|---|---|
| Trainer, desktop: login to member list drawn | 3.9 s | 3.5 s | 4 s / 5 s |
| Trainer, phone (4x slower CPU) | 3.7 s | 4.6 s | 8 s / 10 s |
| Trainer opens a client with 2,000 measurements (true latest shown) | 2.1 s | 2.7 s | 6 s |
| Client portal, 2,000-measurement history | 3.5 s | 3.9 s | 5 s |
| Heap growth after 15 tours of every view | +0.1 MB | +0.1 MB | +15 MB |
| First-load JS + CSS + fonts | 179 KB | 179 KB | 400 KB |

## Fixed on 2026-11-10 (branch `fix/scale-and-permissions`)

1. **Silent data truncation.** Supabase returns at most 1,000 rows per request and the app loaded whole tables without paging (the trainer received 1,000 of 52,000 measurements; a client with 2,000 measurements saw 1,000). `fetchAll` in `data-service.js` now reads every page in a stable order, four pages at a time, and the trainer startup and client portal use it. Cost: correct data takes longer at scale (the old 3.5 s extreme-scale startup was fast only because it was wrong).
2. **No index on `member_id`** for `olcumler`, `antrenmanlar`, `beslenme_planlari`, `dokumanlar`. Added with `CREATE INDEX IF NOT EXISTS`.
3. **Clients could write their own `health_metrics` and `device_connections` rows.** Policies are now SELECT-only (`*_member_read`).

## Fixed on 2026-11-10 (branch `fix/lazy-member-history`)

4. **Startup loaded every row of every table** (6.4 s typical, 28.5 s at 500 members). History (measurements, workouts, diets, documents, health data, sessions) is now loaded for one client when their profile opens, and refreshed on every sync while it stays open. Login now loads only members, programs, schedules, catalogs and device connections: 3.5 s at either scale. The dashboard's "Ölçümü bulunan" figure is read in the background (member ids only) and shows "…" until it arrives; global workout search queries the server. History for other clients is no longer in memory or in the offline cache until their profile has been opened on that device.

## Open findings

1. **Migration scripts take about 55 s each** and run on every deploy. Most of it is catalog seeding in `migrate.js`.
2. **Tab choice is lost on slow loads.** A client who taps a portal tab before the data arrives is returned to the overview when the page re-renders.
