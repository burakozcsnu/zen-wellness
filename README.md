# Trainer Pro — Zen Wellness Club

Turkish-language trainer/gym management panel. Vanilla JS single-page PWA (iPad-first), Supabase backend, hosted on GitHub Pages.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `style.css`, `script.js` | App shell, styling, app logic |
| `data-service.js` | Supabase wrapper with offline write queue and conflict detection |
| `exercise-domain.js` | Exercise catalog normalization and filtering |
| `sw.js`, `manifest.webmanifest` | PWA manifest and push-notification service worker |
| `.supabase/` | Node database migrations (`pg`) and seed catalogs |
| `supabase/functions/send-schedule-reminders/` | Edge Function that sends session reminder pushes |
| `.github/workflows/deploy-pages.yml` | On push to `main`: run migrations, then deploy to Pages |

## Secrets

Never commit credentials. They live only in:

- **GitHub Actions secret** `SUPABASE_DB_PASSWORD` — used by the migrations on every deploy.
- **Supabase Edge Function secrets** — `DATABASE_SECRET_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`.

The Supabase URL and publishable key in `script.js` are public by design; data access is enforced by Row Level Security (`.supabase/migrate_auth.js`).

## Run locally

```
npx serve .
```

Back up before any database change: see [docs/backup-and-restore.md](docs/backup-and-restore.md) (`scripts/backup.js`).

Run migrations manually (PowerShell, password kept only in this session):

```
$env:SUPABASE_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host "DB password" -AsSecureString)))
npm ci
node .supabase/migrate.js; node .supabase/migrate_nutrition.js; node .supabase/migrate_auth.js
Remove-Item Env:SUPABASE_DB_PASSWORD
```
