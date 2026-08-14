# iRatePilot Pilot Rollback Runbook

Use this runbook only after a release owner declares a rollback. Keep Stripe in test mode, public booking disabled, and automated partner payouts disabled throughout recovery.

## Rollback triggers

Rollback immediately when any of the following occurs after deployment:

- customer, partner, or administrator authentication is broadly unavailable;
- unauthorized cross-account data access is observed;
- booking totals, inventory, commissions, payments, refunds, or rewards are materially incorrect;
- Stripe webhook processing creates duplicate or inconsistent records;
- a migration leaves required tables, policies, constraints, or functions unavailable;
- error rates or latency make critical booking operations unreliable;
- secrets are exposed or a privileged credential is suspected to be compromised.

## Owners and evidence

Before starting, record in `docs/RELEASE_EVIDENCE.md`:

- incident start time;
- person declaring rollback;
- deployed commit SHA;
- previous known-good production deployment;
- database backup identifier;
- primary symptoms and affected workflows.

Never paste credentials, tokens, complete customer records, or payment details into GitHub.

## Phase 1: Contain

1. Set `NEXT_PUBLIC_PUBLIC_BOOKING=false`.
2. Set `NEXT_PUBLIC_ENABLE_TEST_CHECKOUT=false` and `ENABLE_TEST_CHECKOUT=false` if payment testing is contributing to the incident.
3. Keep `PILOT_MODE=true`.
4. Disable scheduled email or background processing only when it is producing unsafe duplicate work.
5. Do not delete bookings, payments, refunds, messages, or audit records to hide symptoms.
6. Preserve application, Vercel, Supabase, Stripe, and email-provider logs.

## Phase 2: Application rollback

1. Identify the last known-good Vercel Production deployment.
2. Promote or redeploy that exact immutable commit.
3. Confirm the canonical domain points to the restored deployment.
4. Verify login, account isolation, search, and administrator access before reopening any pilot workflow.
5. Record the restored deployment URL and commit SHA.

Application rollback does not automatically reverse database migrations.

## Phase 3: Database decision

Prefer forward repair over destructive migration rollback when the new schema remains compatible with the previous application.

Before modifying the database:

1. Take a new incident-time backup.
2. Compare it with the pre-release backup.
3. Determine whether the problem is schema-only, data-only, or application/schema interaction.
4. Confirm whether the previous application can safely operate against the migrated schema.
5. Obtain explicit release-owner approval for any restore or destructive SQL.

Do not manually drop columns, tables, policies, constraints, indexes, or functions during an active incident without a reviewed recovery script.

## Phase 4: Reconciliation checks

After restoring application service, reconcile:

- open booking counts and statuses;
- inventory units across each affected stay date;
- Stripe Checkout Sessions and PaymentIntents against bookings;
- booking financial records and commission totals;
- cancellation and refund states;
- reward-ledger totals against profile balances;
- transactional-email jobs and delivery attempts;
- partner and administrator audit events.

Create corrective entries rather than rewriting financial history whenever possible.

## Phase 5: Recovery validation

Run the critical sections of `docs/PREVIEW_SMOKE_TEST.md` against the restored environment:

- authentication and role isolation;
- public search with approved inventory only;
- booking request creation and partner decision;
- Stripe test payment and webhook finalization when enabled;
- messaging authorization;
- unpaid cancellation and paid refund handling;
- administrator and partner access boundaries.

Run `supabase/verify_schema.sql` and `supabase/postflight_20260802.sql` when the migrated database remains in use.

## Phase 6: Close or continue incident

Service can be declared stable only when:

- the known-good application is serving production;
- no critical authorization or financial inconsistency remains;
- reconciliation is complete or has an assigned remediation owner;
- monitoring shows no recurrence;
- the release evidence record contains the rollback result.

Keep PR #122 in draft or revert its merge if the incident occurred after merge. Create a separate corrective PR; do not silently patch `main` without review.

## Database restore warning

A full Supabase restore can remove legitimate records created after the backup. Before approving a restore, export and reconcile post-backup bookings, payments, refunds, messages, partner updates, and audit records. Treat restoration as a last resort when forward repair cannot safely recover the system.
