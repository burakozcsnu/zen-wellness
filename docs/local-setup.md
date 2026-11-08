# Local setup: secrets without typing them every time

Enter each secret **once** into a git-ignored file on this PC. Scripts read it themselves, so nothing is typed into prompts, the dashboard or chat.

| File (on this PC only) | Template | Used for |
|---|---|---|
| `.env` (repository folder) | [`docs/env.example`](env.example) | Backups (`scripts/backup.js`), later automated tests |
| `supabase/.env.functions` | [`docs/functions.env.example`](functions.env.example) | Uploading the Edge Function secrets |

Both names are in `.gitignore`, so git never commits them. AI agents are blocked from reading them (see "Agent access" below).

## One-time setup

1. Copy `docs\env.example` to `.env` in the repository folder. Open it in Notepad and fill in the values after the `=` signs. Save.
2. Do the same with `docs\functions.env.example` → `supabase\.env.functions`.
3. Log in to the Supabase command-line tool once. A browser window opens; approve it:
   ```powershell
   npx supabase@2.122.1 login
   ```

## Everyday commands (PowerShell, repository folder)

**Backup, no prompts:**
```powershell
node scripts/backup.js
```

**Upload the function secrets** (after changing `supabase/.env.functions`):
```powershell
npx supabase@2.122.1 secrets set --env-file supabase/.env.functions --project-ref mdcvljbbnoxqsfwcjvqz
```

**Deploy the reminder function from the repository** (replaces editing code in the dashboard):
```powershell
npx supabase@2.122.1 functions deploy send-schedule-reminders --project-ref mdcvljbbnoxqsfwcjvqz --use-api --no-verify-jwt
```
`--no-verify-jwt` is required: the timer sends `CRON_SECRET`, not a user login. Without it, every timer call is rejected before the function runs.

## Safety

- The files hold passwords in plain text. Keep a Windows login password and turn on BitLocker or Device Encryption.
- If this PC is lost or shared: change the database password, the trainer password and `CRON_SECRET`, and create new keys under API Keys.
- Never copy these files into the repository, email, chat or screenshots.
- Production changes still need the owner's explicit approval (CLAUDE.md B2). Saved passwords do not change that.

## Agent access

Claude Code is denied from reading `.env` and `supabase/.env.functions` by a local setting in `.claude/settings.local.json` (not committed). Agents may **run** scripts that use these files, but must never open, print or quote them.
