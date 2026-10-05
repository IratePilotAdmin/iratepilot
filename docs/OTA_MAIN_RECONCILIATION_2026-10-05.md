# OTA connector on current main — October 5, 2026

The connector commit `a898ee5` was applied without conflicts on current `origin/main` `5fb8d30` in an isolated worktree. The resulting branch commit is `68dcd6a` (`codex/ota-main-reconciled-20261005`). The original rehearsal checkout and its uncommitted database work were not changed.

Local verification on the reconciled branch:

- 44 focused OTA/PMS test files passed, 180 tests total.
- TypeScript `tsc --noEmit` passed.
- Targeted ESLint for the connector API, workers, and services passed.
- `next build --webpack` passed and generated both `/api/ota/capabilities` and `/api/pms/ari` routes.
- `git diff --check` passed; the worktree was clean before this document was added.

This is a source/build milestone, not a production release. The current `www.iratepilot.com` production deployment still returns 404 for those two routes. The earlier protected Preview served capabilities with `trafficEnabled: false`, but was based on the older branch. A fresh protected Preview of this reconciled branch and authenticated route check are needed. Hosted database binding, isolated signed ARI/reservation round trip, backup restore, Red Roof mapping, and external OTA certification remain open. Do not enable connector workers or production booking acceptance based on this local pass alone.
