# iRatePilot laptop migration handoff

Snapshot date: 2026-08-16

This file preserves the local development state needed to continue iRatePilot work on the new laptop. It intentionally contains no passwords, API keys, access tokens, or private environment-variable values.

## Repository state on the desktop

- Repository: `https://github.com/IratePilotAdmin/iratepilot.git`
- Backup branch: `agent/desktop-to-laptop-backup-2026-08-16`
- Remote base: `main` at `8c3adb8` (`Fix Resend webhook source correlation (#282)`)
- The desktop's equivalent local work commit was `d306926` (`fix:correlate-resend-webhook-sources`).
- The desktop's `origin/main` tracking reference was stale at `887fb5c`; GitHub already contained the Resend work in `8c3adb8` when the backup branch was published.
- The backup branch preserves the current remote application code and the documentation listed below without merging or deploying them.

Local working-tree items that must be preserved:

- Modified: `docs/FIRST_HOTEL_ONBOARDING_RUNBOOK.md`
- New: `docs/hotel-manager-pilot/README.md`
- New: `docs/hotel-manager-pilot/MEETING_CHECKLIST.md`
- New: `docs/hotel-manager-pilot/FIRST_PILOT_ACCEPTANCE_FORM.md`
- New: `docs/LAPTOP_MIGRATION_HANDOFF.md`

Local cache folders that do not need to move:

- `.eas-local-state/`
- `.npm-cache/`
- `node_modules/`
- `.next/`

## Development environment

- Node.js: `24.x` (desktop snapshot: `v24.18.0`)
- npm: `11.16.0`
- Git: `2.55.0.windows.3`
- GitHub CLI: `2.96.0`

## Safe laptop setup

1. Install the Codex desktop app and sign in with the same OpenAI account.
2. Install Git, GitHub CLI, and Node.js 24.x.
3. Sign in to GitHub, then clone `IratePilotAdmin/iratepilot`.
4. Fetch and check out `agent/desktop-to-laptop-backup-2026-08-16`.
5. Run `npm ci` in the repository.
6. Run `npm run check` before making new changes.
7. Sign in separately to Vercel, Supabase, Stripe, Resend, Expo/EAS, Gmail/Yahoo, and Sabre as needed. Use the existing provider accounts; do not place credentials in this file.
8. Retrieve deployment environment variables through the authorized provider or CLI after sign-in. Do not email or store secrets in an ordinary ZIP archive.

## Final retirement gate

Do not erase, reset, sell, or trade in the desktop until all of the following are verified on the laptop:

- The repository opens on the expected branch with the local-only files present.
- `npm ci` and `npm run check` succeed.
- GitHub and Vercel access work.
- The required Supabase, Stripe, Resend, and Expo/EAS accounts are reachable.
- Personal documents and photos are present.
- Browser bookmarks and needed saved sign-ins are available.
- The Codex task history needed for ongoing work is accessible, or its essential context has been preserved in project documentation.

Keep the desktop unchanged for at least 14 days after successful laptop verification.

