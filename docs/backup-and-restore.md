# Backup and restore

The Supabase free plan keeps **no backups**. Run a backup **before any database change** (SQL, migration, or a deploy that changes migration scripts) and about once a week.

## Make a backup (about 1 minute)

**With a `.env` file** (see [local-setup.md](local-setup.md)), run in PowerShell from the repository folder. No prompts:

```powershell
npm ci --ignore-scripts
node scripts/backup.js
```

**Without a `.env` file**, type the password into a hidden prompt. It is kept only in this window:

```powershell
$env:SUPABASE_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host "DB password" -AsSecureString)))
npm ci --ignore-scripts
node scripts/backup.js
Remove-Item Env:SUPABASE_DB_PASSWORD
```

Without `ZEN_TRAINER_EMAIL` and `ZEN_TRAINER_PASSWORD` in `.env`, the script then asks for the trainer (admin) email and password to download the document files. Use `node scripts/backup.js --skip-files` for a database-only backup.

**Success looks like:** `Backup complete and verified: … tables, … rows, … accounts, … files.`
**Anything else** (`Backup FAILED`) means the backup is not usable: delete that folder and run again.

## What is saved

Each run creates `Documents\zen-backups\<date-time>\` (change the location with `$env:ZEN_BACKUP_DIR`):

| Folder | Contents |
|---|---|
| `data/` | Every row of every `public` table, one JSON file per table, from a single consistent snapshot |
| `auth/users.json` | Login accounts: id, email, roles, sign-up dates. **No password hashes** (clients reset their password after a restore) |
| `schema/` | Columns, constraints, indexes, RLS policies, functions, triggers, storage file list |
| `files/dokumanlar/` | Every uploaded document, in its member folder |
| `manifest.json` | Row counts and SHA-256 checksums; the script re-checks every file against it |

## Keep backups safe

Backups contain client health data (KVKK special category).
- Keep them only on an encrypted drive (Windows: turn on BitLocker or Device Encryption), never in the repository, email, chat or an unencrypted USB stick.
- Delete backups you no longer need. Keeping the last 4 weekly backups plus any taken before a change is enough.

## Restore

There is no one-click restore yet. Restoring writes to the live database, so it falls under CLAUDE.md B2/B4:
1. Stop. Do not edit data by hand.
2. Ask an agent to prepare a restore of **only the affected tables or rows** from the backup folder, as re-runnable `INSERT … ON CONFLICT` SQL.
3. Review the SQL and approve that exact command, as for any production SQL.
4. Take a fresh backup first, so the restore itself can be undone.

A tested restore procedure needs a second, non-production database (planned as a staging project).
