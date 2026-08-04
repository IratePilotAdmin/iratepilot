# iRatePilot Launch Readiness Index

This document is the single entry point for preparing PR #122 for a controlled private-pilot release.

## Current decision

**NO-GO. Keep PR #122 in draft.**

The code branch is mergeable, but database execution evidence, current preview smoke-test results, named owners, and final release approval are still required.

## Required sequence

1. Confirm release owner, database owner, payment owner, support owner, and rollback owner.
2. Confirm Vercel Preview environment values using `docs/ENVIRONMENT_READINESS.md`.
3. Back up Supabase and record the backup in `docs/RELEASE_EVIDENCE.md`.
4. Run `supabase/preflight_20260802.sql` and resolve every blocker.
5. Apply migrations `202608020001` through `202608020025` in filename order.
6. Run `supabase/verify_schema.sql` and `supabase/postflight_20260802.sql`.
7. Execute every critical flow in `docs/PREVIEW_SMOKE_TEST.md` against the exact release commit.
8. Complete `docs/RELEASE_EVIDENCE.md` with deployment, database, test, and defect evidence.
9. Apply the decision rules in `docs/GO_NO_GO.md`.
10. If approved, follow `docs/PRODUCTION_CUTOVER.md` exactly.
11. Monitor using `docs/POST_LAUNCH_MONITORING.md` and reconcile with `docs/DAILY_RECONCILIATION.md`.
12. Use `docs/INCIDENT_SEVERITY.md` and `docs/ROLLBACK_RUNBOOK.md` for any incident.

## Database controls

- `supabase/preflight_20260802.sql`
- `supabase/verify_schema.sql`
- `supabase/postflight_20260802.sql`
- `docs/DEPLOYMENT.md`

Database release is blocked unless all required migrations are confirmed, verification succeeds, and no unresolved blocker query returns rows.

## Application and environment controls

- `docs/ENVIRONMENT_READINESS.md`
- `docs/PREVIEW_SMOKE_TEST.md`
- `docs/RELEASE_EVIDENCE.md`

Do not place secrets in GitHub comments, screenshots, support tickets, or this evidence file.

## Release decision and cutover

- `docs/GO_NO_GO.md`
- `docs/PRODUCTION_CUTOVER.md`
- `docs/ROLLBACK_RUNBOOK.md`

The PR must stay in draft until the evidence file records a GO decision and every mandatory gate is complete.

## Operations after launch

- `docs/POST_LAUNCH_MONITORING.md`
- `docs/INCIDENT_SEVERITY.md`
- `docs/LAUNCH_SUPPORT_PLAYBOOK.md`
- `docs/DAILY_RECONCILIATION.md`

Public booking, Stripe live mode, and automated partner payouts remain outside the approved private-pilot scope unless separately reviewed and authorized.

## Minimum evidence before marking ready for review

- Exact release commit SHA
- Successful GitHub Actions run for that SHA
- Successful Vercel Preview deployment for that SHA
- Supabase backup reference
- Preflight result with no unresolved blockers
- Migration execution record through `202608020025`
- Schema and postflight verification results
- Completed critical customer, partner, admin, payment, cancellation, refund, messaging, and email tests
- Named launch and rollback owners
- Written GO decision

## Current unresolved blockers

- Supabase migrations have not been confirmed as applied.
- Database verification output has not been recorded.
- Critical preview smoke-test evidence has not been recorded.
- Named operational owners have not been recorded.
- The final GO decision has not been recorded.

Do not mark PR #122 ready, merge it, enable public booking, use Stripe live credentials, or enable automated payouts while any blocker remains.