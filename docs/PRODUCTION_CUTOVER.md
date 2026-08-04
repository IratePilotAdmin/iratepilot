# iRatePilot Private-Pilot Production Cutover

This checklist controls the first merge and Production deployment of PR #122. It does not authorize public booking, Stripe live mode, or automated hotel payouts.

## Required release roles

Assign before cutover:

- release owner;
- Supabase operator;
- Vercel operator;
- payment and reconciliation reviewer;
- smoke-test operator;
- rollback decision owner.

One person may hold multiple roles during the private pilot, but every responsibility must have a named owner in `docs/RELEASE_EVIDENCE.md`.

## 24-hour readiness gate

- [ ] PR #122 is mergeable and targets `main`.
- [ ] Latest GitHub Actions checks pass for the exact head SHA.
- [ ] Latest Vercel preview succeeds for the exact head SHA.
- [ ] Supabase backup is complete and restorable.
- [ ] `supabase/preflight_20260802.sql` has no unresolved blocker rows.
- [ ] Migrations `202608020001` through `202608020025` are applied in order.
- [ ] `supabase/verify_schema.sql` passes.
- [ ] `supabase/postflight_20260802.sql` passes.
- [ ] `docs/PREVIEW_SMOKE_TEST.md` critical workflows pass.
- [ ] Environment review in `docs/ENVIRONMENT_READINESS.md` is complete.
- [ ] Release evidence and rollback owners are recorded.
- [ ] `docs/GO_NO_GO.md` results in GO.

If any item is incomplete, keep the PR in draft.

## Approved private-pilot configuration

Use these restrictions for the initial Production deployment:

- `PILOT_MODE=true`
- `NEXT_PUBLIC_PUBLIC_BOOKING=false`
- Stripe test keys only
- test checkout enabled only during controlled testing
- automated partner payouts disabled
- only approved pilot properties and verified inventory visible
- administrator access limited to named operators

## Cutover sequence

1. Freeze changes to PR #122.
2. Record the exact head SHA and Vercel preview URL.
3. Re-run required CI and preview checks after the freeze.
4. Confirm database migrations and verification results are attached to the release evidence record.
5. Mark PR #122 ready for review only after every mandatory gate passes.
6. Obtain final release-owner approval.
7. Merge PR #122 using the repository's approved merge method.
8. Confirm Vercel starts a Production deployment from the resulting `main` SHA.
9. Record the Production deployment URL and commit SHA.
10. Verify the canonical domain and HTTPS certificate.
11. Run the post-deployment critical smoke tests below.

## Immediate post-deployment tests

Complete before declaring the cutover successful:

- [ ] Homepage, search, login, and account routes load.
- [ ] Only approved properties with valid future inventory are visible.
- [ ] Customer, partner, and administrator sessions remain isolated.
- [ ] A controlled booking request can be created.
- [ ] The approved partner can review that request.
- [ ] Unauthorized users cannot review or message the booking.
- [ ] Stripe test checkout and webhook finalization work when temporarily enabled.
- [ ] Duplicate webhook delivery does not duplicate booking financial records.
- [ ] Unpaid cancellation restores inventory exactly once.
- [ ] Paid refund workflow remains restricted to the service role.
- [ ] Email worker requires the configured cron secret.
- [ ] Logs contain no exposed secrets or unexplained critical errors.

## Observation window

For the initial pilot observation window:

- keep public booking disabled;
- allow only named test users and approved pilot partners;
- review booking, payment, cancellation, refund, email, and authorization logs after every test transaction;
- reconcile inventory and booking financials daily;
- record all defects and decisions in the release evidence file or linked GitHub issues.

## Success criteria

Cutover is successful when:

- Production runs the intended `main` commit;
- critical smoke tests pass;
- no authorization, financial, or inventory discrepancy is found;
- monitoring remains stable through the observation window;
- the release owner signs the evidence record.

## Failure response

When a critical test fails:

1. stop further pilot transactions;
2. disable booking and test checkout flags;
3. declare NO-GO in the release evidence record;
4. follow `docs/ROLLBACK_RUNBOOK.md`;
5. open a corrective issue or PR with the incident evidence.

Do not enable public booking, live Stripe processing, or automated partner payouts as part of this cutover. Those require separate business, legal, support, payment, reconciliation, and security approval.
