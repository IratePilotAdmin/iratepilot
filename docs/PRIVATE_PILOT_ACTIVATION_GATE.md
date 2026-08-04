# Private Pilot Activation Gate

This checklist is the final control before activating any external hotel partner or customer tester.

## Current status

**NO-GO until every mandatory gate below is complete and evidenced against the exact release commit.**

## Release identity

- [ ] Exact release commit SHA recorded.
- [ ] PR #122 remains open, draft, and unmerged during validation.
- [ ] GitHub Actions passed for the exact release commit.
- [ ] Vercel Preview passed for the exact release commit.
- [ ] No unreviewed commits were added after evidence collection.

## Repository governance

- [ ] Issue #128 is complete.
- [ ] `main` requires pull requests.
- [ ] Required checks block merge when missing or failing.
- [ ] Review conversations must be resolved.
- [ ] Direct pushes, force pushes, and branch deletion are restricted.

## Database and environment

- [ ] Issue #127 is complete.
- [ ] Recoverable Supabase backup exists and was verified.
- [ ] Preflight completed without unresolved blockers.
- [ ] Migrations `202608020001` through `202608020025` were applied in order.
- [ ] Schema verification passed.
- [ ] Postflight verification passed.
- [ ] Required environment variables were reviewed without exposing values.
- [ ] Stripe remains in test mode.
- [ ] Public booking remains disabled.
- [ ] Automated partner payouts remain disabled.

## Product smoke testing

- [ ] Customer registration and login passed.
- [ ] Partner onboarding and property setup passed.
- [ ] Approved inventory search passed.
- [ ] Booking request and partner decision passed.
- [ ] Stripe test checkout and webhook completion passed.
- [ ] Trips and payment history passed.
- [ ] Messaging passed.
- [ ] Unpaid cancellation passed.
- [ ] Paid test refund and inventory restoration passed.
- [ ] Rewards and reconciliation passed.
- [ ] Admin, customer, and partner access isolation passed.
- [ ] Transactional email and cron execution passed.

## Ownership and incident readiness

- [ ] Issue #130 is complete.
- [ ] Every required role is assigned and acknowledged.
- [ ] Support and incident owners are available during the activation window.
- [ ] Rollback owner reviewed the rollback runbook.
- [ ] Workflow-pause and full-pilot-pause procedures were tested or rehearsed.

## Legal and privacy readiness

- [ ] Issue #131 is complete.
- [ ] Customer pilot terms are approved.
- [ ] Partner participation terms are approved.
- [ ] Privacy notice and consent language are approved.
- [ ] Simulated-booking and test-payment disclosures are implemented.
- [ ] Hotel content permission is recorded.
- [ ] Data retention, deletion, incident, and participant-withdrawal procedures are documented.

## Cohort readiness

- [ ] Issue #129 participant qualification requirements are satisfied.
- [ ] At least one qualified partner is ready.
- [ ] At least five invited customer testers are ready.
- [ ] Every participant completed the correct onboarding checklist.
- [ ] No public enrollment, paid advertising, or bulk outreach is enabled.
- [ ] Cohort size remains inside the approved private-pilot ceiling.

## Evidence and defects

- [ ] `docs/RELEASE_EVIDENCE.md` references the exact release commit.
- [ ] No unresolved Severity 0 or Severity 1 defect exists.
- [ ] No unresolved payment, inventory, access-control, privacy, or reconciliation defect exists.
- [ ] All accepted residual risks have an owner and written approval.
- [ ] Rollback criteria and recovery evidence are current.

## Final activation decision

Complete only after every mandatory item above is satisfied.

- Decision: `GO FOR PRIVATE PILOT ONLY` / `NO-GO`
- Exact release commit:
- Approved cohort limits:
- Activation date and window:
- Executive release owner:
- Database operator:
- Payment test owner:
- Support owner:
- Incident commander:
- Rollback owner:
- Decision evidence reference:

A GO decision authorizes only the controlled private pilot. It does not authorize public booking, Stripe live mode, automated payouts, unapproved inventory, or expansion beyond the documented cohort limits.