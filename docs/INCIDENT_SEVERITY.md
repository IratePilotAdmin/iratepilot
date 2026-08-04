# iRatePilot Incident Severity and Response

Use this matrix during preview testing, private-pilot launch, and the first 24-hour observation period.

## Severity 0 — Critical

Examples:

- Cross-account or unauthorized access to customer, partner, admin, booking, message, or payment data.
- Exposed service-role, Stripe secret, webhook, email-provider, cron, or other production credential.
- Incorrect payment capture, duplicate charge, duplicate refund, or unreconciled financial movement.
- Confirmed double booking or inventory below zero.
- Database corruption, material record loss, or inability to determine booking truth.
- Automated partner transfer or payout occurring without approval.
- Production outage affecting booking, authentication, or payment with no safe workaround.

Required response:

1. Disable the affected capability immediately.
2. Stop new checkout or booking traffic when financial or inventory integrity is uncertain.
3. Notify the release and rollback owners.
4. Preserve logs and identifiers without copying secrets or full payment data.
5. Follow `docs/ROLLBACK_RUNBOOK.md`.
6. Do not resume until the root cause is understood, reconciliation is complete, and written approval is recorded.

Release consequence: automatic NO-GO or rollback.

## Severity 1 — High

Examples:

- A critical workflow consistently fails for a subset of authorized pilot users.
- Payment webhook processing fails but no incorrect charge or booking finalization has occurred.
- Confirmations, cancellations, or refunds are materially delayed.
- Partner or admin operations are blocked with no reasonable workaround.
- Repeated 5xx errors affect search, booking, account, or reservation management.
- Inventory or financial data is inconsistent but can still be fully reconciled.

Required response:

1. Assign an owner immediately.
2. Contain the affected workflow or feature flag.
3. Reconcile all affected records.
4. Decide whether to forward-fix or roll back.
5. Record the incident and decision in `docs/RELEASE_EVIDENCE.md`.

Release consequence: keep PR in draft or pause the pilot until resolved and retested.

## Severity 2 — Medium

Examples:

- Non-critical page or dashboard failure with a safe workaround.
- Delayed non-financial notification.
- Incorrect analytics, reporting, formatting, or non-authoritative counts.
- Mobile, offline, calendar, or install behavior fails without affecting booking integrity.
- A single recoverable support issue that does not expose data or alter money, booking, or inventory truth.

Required response:

1. Record reproduction steps and affected users.
2. Assign an owner and target resolution.
3. Confirm the issue cannot escalate into security, payment, booking, or inventory risk.
4. Retest after repair.

Release consequence: may continue only with release-owner approval and a documented workaround.

## Severity 3 — Low

Examples:

- Cosmetic layout issue.
- Minor copy, spacing, accessibility, or non-blocking usability defect.
- Isolated logging or observability improvement.
- Non-critical documentation inconsistency.

Required response:

- Record and prioritize normally.
- Fix before broader public release when appropriate.

Release consequence: does not independently block the private pilot.

## Escalation rules

Escalate an incident by at least one severity level when:

- It affects multiple users or properties.
- It repeats after a retry or apparent repair.
- The scope cannot be determined quickly.
- Logs or records disagree about the outcome.
- A workaround requires manual production data changes.
- Customer trust, privacy, booking truth, or financial reconciliation may be affected.

When uncertain between two levels, use the higher severity until evidence supports lowering it.

## Incident record

Every Severity 0, 1, or 2 incident must record:

- Incident identifier
- Detection time and source
- Severity and rationale
- Affected environment and release commit
- Affected users, properties, bookings, or workflows
- Containment actions
- Data and financial reconciliation results
- Root cause
- Corrective change and validation
- Rollback or continuation decision
- Owner and approval
- Closure time

Never place passwords, secret keys, full card details, or sensitive personal data in the incident record.
