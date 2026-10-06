# OTA connector main-line reconciliation — October 5, 2026

This gate reconciles the isolated OTA-to-PMS connector candidate with the code serving the live OTA domain. It does not enable live connector traffic or change either live domain.

## Live read-only observations

- Vercel project `iratepilotadmin` owns verified `www.iratepilot.com`; the apex `iratepilot.com` redirects there with HTTP 308. Its latest Ready Production deployment was `dpl_4932mxa3iLtXwhhtiYZp7SsBjJL8`, built from `main` commit `499b83a4801670d9c805d6c07de52162757ff1de`.
- `GET https://www.iratepilot.com/api/health` returned JSON HTTP 200 with database `reachable`. `GET /api/ota/capabilities` returned HTTP 404, and the response HTML identified the same Production deployment. The connector route was therefore absent from the live OTA deployment at this check.
- `GET https://pms.iratepilot.com/release-status` returned HTTP 401 through Cloudflare. This confirms the PMS site is protected; it does not identify its database, release version, or readiness without an authenticated check.
- The OTA Vercel Production environment contains named PMS destination and sync settings, but the sync switch is a Secret and its value was not available through the read-only metadata response. No value or target Supabase project ref is inferred from the variable names. The branch-specific Preview sync switch is `false`.

## Branch reconciliation

- Before reconciliation, `codex/ota-main-integration` was 14 commits behind current `origin/main`. A dry-run merge found two textual conflicts: the pinned non-flight migration allowlist and the test's expected final migration version.
- Merged `origin/main` into the connector branch candidate, preserving both new hotel-payment migrations (`202610050163`, `202610050164`) before the later partner-review migration (`20261005203527`). The test continues to expect that later version as the final sorted migration.
- Checks on the reconciled tree: TypeScript `tsc --noEmit` passed; targeted ESLint passed; 23 focused test files / 137 tests passed; `scripts/replay-migrations.mjs` replayed 150 migrations; `next build` completed with `/api/ota/capabilities`, `/api/pms/ari`, and `/api/cron/native-pms-reservations` included. A full 541-file Vitest invocation did not finish and was stopped; it is **not** counted as a pass.

## Fresh protected Preview — October 6 UTC

- Vercel Preview deployment `dpl_DMaKzAuxRh3qW9qyZ8eMcchHn7dk` is Ready at commit `83aeab07b6065a99265fdf70621e13fc42e67170`. Its Preview alias is branch-scoped; neither live iRatePilot domain was assigned to it.
- The branch-specific `NEXT_PUBLIC_SUPABASE_URL` points to isolated OTA source `onbdizzwwubfdgkgaphx`; `IRP_PMS_DESTINATION_URL` points to isolated PMS receiver `wjosvslkselpauyftias`. `IRP_PMS_SYNC_ENABLED=false` and `ENABLE_TEST_STRIPE_WEBHOOKS=false`. Credential values were not recorded.
- Through the signed-in protected deployment, `GET /api/health` returned `ok:true` and database `reachable`. `GET /api/ota/capabilities` returned the connector contract with native PMS ARI `available` but `trafficEnabled:false`, Booking.com `development_only`, and Expedia and other major OTA providers `not_implemented`. `GET /api/pms/ari` returned `method_not_allowed`; an unauthenticated `GET /api/cron/native-pms-reservations` returned `Unauthorized.`
- These are route-presence, isolation, and fail-closed checks. They do not constitute a signed ARI update, a new booking, a payment, or a live OTA rollout.

## Remaining before live traffic

Review the merged draft PR. Confirm the exact live OTA and PMS database bindings, populated-data restore, Stripe TEST checkout/webhook, operational controls, and live switch values before any production promotion or sync activation. Expedia and Booking.com require their own partner/certification and mapping gates. The older isolated Supabase `default` server key remains pending an explicitly confirmed revocation; this gate did not delete it.
