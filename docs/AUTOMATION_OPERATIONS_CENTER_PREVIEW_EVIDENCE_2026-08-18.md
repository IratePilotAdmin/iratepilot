# Automation Operations Center Preview acceptance evidence

Recorded: August 18, 2026

## Scope

This acceptance applies only to the isolated Vercel project `iratepilotadmin-private-preview` and its isolated Preview data environment. It does not authorize or record a change to the main `iratepilotadmin` project, `iratepilot.com`, public booking, live money movement, partner payouts, or supplier traffic.

## Deployment repair and release

- Framework Preset was corrected from `Other` to `Next.js` in the isolated project.
- Repaired deployment: `DikCL3AJEQM27ecH8uq865oWHPJt`.
- Deployed source commit: `795d633` (`feat: complete automation operations center phases 2-5`).
- Deployment URL: `https://iratepilotadmin-private-preview-6exsgmad2-irate-pilot.vercel.app`.
- Preview-only alias: `https://project-w1cin.vercel.app`.
- The deployment reached `READY`, was promoted only within the isolated project, and became `Current` for that project.
- The Next.js build produced 146 functions, 75 static assets, and one Routing Middleware resource. Both `/admin/operations` and `/api/admin/operations` were present in the deployment resources.

## Authenticated acceptance

An authenticated administrator opened `https://project-w1cin.vercel.app/admin/operations` and confirmed:

- all Automation Operations Center phases 1–5 rendered;
- six operational lanes rendered with four healthy, two safeguarded, and zero requiring attention;
- all six private-pilot safety locks were engaged;
- public booking, live payments, live Stripe webhooks, live payouts, and supplier traffic remained disabled;
- Phase 2 was available with read-only automation coordination;
- Phase 3 was available in `dry_run_only` mode and required two distinct approvals;
- Phase 4 was available in `observation_only` mode with the policy scanner disabled;
- Phase 5 was available in `internal_read_only_sandbox` mode with the application, database, and effective executor switches all disabled; and
- the browser console reported no errors or warnings.

The authenticated API returned `safetyReady=true`, `readOnly=true`, six of six engaged safety locks, zero queued items, and zero recorded failures. No synthetic executor action was run during this acceptance.

## Remaining closeout gates

- [x] Full laptop verification passed on August 18, 2026: ESLint, TypeScript, 978 tests across 227 files, and the optimized 111-page Next.js build.
- [x] Reconcile laptop HEAD `6272bc6` with deployed source commit `795d633`. Both descend from `d6b11b6`, are four commits ahead, change the same 73 paths, and have identical final Git blobs for every changed path. Their different commit hashes do not represent a source-content difference.
- [x] Publish the approved laptop branch and verify local HEAD, upstream, and the private GitHub branch are identical at `0c7540d`.
- [ ] After a third independently authenticated Preview administrator is available and a separate execution approval is recorded, perform one labeled Phase 5 synthetic receipt check, immediately relock both executor switches, and record the immutable result.

The read-only prerequisite audit at `2026-08-18T19:49:37Z` confirmed two administrator operator profiles, zero incidents, zero retry requests, zero sandbox executions, and both executor kill switches disabled. The three-identity approval quorum cannot be met with the current two operators, so no execution or switch change was attempted. See `docs/AUTOMATION_OPERATIONS_CENTER_PHASE_5_SYNTHETIC_CHECK_RUNBOOK.md`.

Production automation remains unauthorized.
