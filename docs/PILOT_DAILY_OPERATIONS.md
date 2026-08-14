# iRatePilot Private-Pilot Daily Operations

Use this checklist for every active private-pilot day. It does not authorize public booking, live Stripe charges, or automated partner payouts.

## Operating conditions

The pilot may open only when:

- the written release decision is GO;
- the exact active commit is recorded;
- required GitHub and Vercel checks are passing;
- the Supabase rollout and verification evidence is complete;
- named release, support, payment-test, database, and rollback owners are available;
- Stripe remains in test mode;
- public enrollment and public booking remain disabled;
- only approved real pilot properties and inventory are visible.

If any condition is not satisfied, keep the pilot closed and record the blocker.

## Start-of-day opening check

Record the operator, date, time, active commit, and environment.

- [ ] Confirm the preview or pilot URL loads successfully.
- [ ] Confirm customer, partner, and admin authentication works.
- [ ] Confirm role isolation with one approved account for each role.
- [ ] Confirm Stripe test mode and approved test credentials.
- [ ] Confirm automated partner payouts are disabled.
- [ ] Confirm public booking and unrestricted signup are disabled.
- [ ] Confirm approved property, room, rate, policy, tax, fee, and inventory data.
- [ ] Confirm no demonstration property or inventory appears as real availability.
- [ ] Confirm webhook, email, and scheduled-job health.
- [ ] Review unresolved Severity 0, Severity 1, and data-integrity defects.
- [ ] Confirm support and rollback contacts are reachable.

Do not open testing if any mandatory check fails.

## During-day monitoring

Review at opening, after every deployment or migration, after each payment-integrity event, and at least every four operating hours.

Monitor:

- application and API errors;
- authentication and authorization failures;
- booking creation and partner decisions;
- rate, tax, fee, cancellation-policy, and inventory accuracy;
- Stripe test checkout and webhook completion;
- confirmation, cancellation, and refund state transitions;
- inventory decrement and restoration;
- rewards and financial-ledger entries;
- transactional email and scheduled jobs;
- customer-partner messaging;
- support requests, feedback, and defects.

Record unusual behavior even when it self-recovers.

## Booking transaction check

For every test booking sampled or investigated, confirm:

- one customer request maps to one booking record;
- the selected property, room, dates, occupancy, rate, tax, and fees match the displayed offer;
- partner approval or rejection is recorded correctly;
- Stripe remains in test mode;
- the payment and booking states agree;
- confirmation appears in the customer and partner views;
- inventory changes exactly once;
- messages are visible only to authorized participants;
- cancellation or refund restores inventory exactly once;
- ledger and reward entries reconcile.

Pause the affected workflow if any item does not reconcile.

## Support and defect handling

- Acknowledge active pilot support requests within the target in `docs/PILOT_SUCCESS_METRICS.md`.
- Use `docs/PILOT_FEEDBACK_AND_DEFECT_TRIAGE.md` for every defect.
- Never request passwords, full payment-card data, service-role keys, database credentials, or government identification in support messages.
- Move sensitive evidence to an approved secure channel and place only a sanitized reference in GitHub.
- Escalate Severity 0 and Severity 1 incidents immediately.
- Do not close a defect until the fix is deployed, retested, and independently confirmed when required.

## Immediate pause conditions

Pause all pilot booking activity for:

- unauthorized access or cross-account data exposure;
- any real Stripe charge;
- duplicate, missing, or mismatched booking or payment records;
- inventory oversell or incorrect restoration;
- incorrect taxes, mandatory fees, or cancellation terms;
- refund finalization without the intended authorization;
- automated or unauthorized partner payout activity;
- unapproved or demonstration inventory appearing as real availability;
- database migration, integrity, or reconciliation failure;
- unavailable rollback owner or untested rollback path during a material incident.

Use the incident and rollback runbooks before resuming.

## End-of-day reconciliation

Complete `docs/DAILY_RECONCILIATION.md` and confirm:

- all test bookings are accounted for;
- booking, payment, cancellation, and refund states agree;
- inventory movements reconcile;
- rewards and ledger entries reconcile;
- failed webhooks, emails, and scheduled jobs are resolved or assigned;
- every material support request has an owner;
- every defect has severity, owner, next action, and evidence reference;
- no live charge or payout occurred;
- no unapproved inventory was exposed.

Record the result as PASS, PASS WITH FOLLOW-UP, or FAIL.

A FAIL result keeps the next operating day closed until reviewed.

## End-of-day decision

Record one decision:

- **Continue** — all safety and integrity controls pass.
- **Continue with limits** — only noncritical issues remain, with written limits and owners.
- **Pause workflow** — one function is disabled while investigation or remediation proceeds.
- **Pause pilot** — all participant activity stops.
- **Rollback** — follow `docs/ROLLBACK_RUNBOOK.md`.

Include the decision owner, timestamp, evidence reference, unresolved defects, and conditions for reopening.

## Change control during the pilot

Any code, configuration, environment, migration, policy, inventory, or pricing change requires:

- a named owner;
- a written reason;
- the exact commit or change reference;
- applicable automated checks;
- targeted regression testing;
- updated release evidence;
- a fresh operating decision when payment, booking, inventory, access, or data integrity may be affected.

Do not make unrecorded production-like changes during an active test session.

## Weekly review

At least once per active pilot week:

- review `docs/PILOT_SUCCESS_METRICS.md`;
- review participant completion and feedback;
- review defects by severity and recurrence;
- review support response performance;
- review booking, payment, refund, inventory, and reconciliation reliability;
- confirm cohort limits remain appropriate;
- decide whether to continue, reduce scope, pause, rollback, or request controlled expansion.

Expansion requires written approval and does not authorize live payments, public booking, or automated payouts.