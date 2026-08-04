# Private-Pilot Feedback and Defect Triage

Use this process for every hotel-partner, customer-tester, administrator, payment, inventory, or support issue discovered during the private pilot.

## Safety rules

- Never place passwords, API keys, service-role keys, payment-card data, bank details, government IDs, or full customer personal information in GitHub.
- Use internal booking, property, and user reference IDs instead of names or email addresses where possible.
- Redact screenshots before attaching them.
- Keep Stripe in test mode, public booking disabled, automated payouts disabled, and demonstration inventory non-public while the release remains private pilot.

## Intake fields

Every actionable report must include:

- Reporter type: customer, partner, administrator, support, monitoring, or automated check.
- Environment: local, Vercel Preview, private-pilot production, or database console.
- Exact release commit SHA.
- Date and time, including timezone.
- Affected workflow: authentication, onboarding, property setup, inventory, search, booking, payment, webhook, cancellation, refund, messaging, email, rewards, reconciliation, or administration.
- Expected result.
- Actual result.
- Reproduction steps.
- Frequency: once, intermittent, or every attempt.
- Safe evidence reference.
- Business impact.
- Temporary workaround, if any.

## Classification

Classify each item as one of:

- Defect: the system behaves incorrectly.
- Security or privacy concern: unauthorized access, data exposure, permission failure, or unsafe handling.
- Data-integrity concern: duplicate booking, stale inventory, incorrect financial record, or reconciliation mismatch.
- Operational issue: support, onboarding, configuration, or process failure.
- Usability issue: confusing or inefficient behavior without incorrect data.
- Feature request: desired behavior not included in the approved pilot scope.

## Severity

### Severity 0 — critical incident

Examples:

- Unauthorized data or administrative access.
- Real Stripe charge or payout during the test-only pilot.
- Duplicate confirmed booking or material inventory corruption.
- Exposure of secrets or sensitive personal information.
- Widespread inability to access or safely stop the platform.

Required action: stop affected pilot activity immediately, follow the incident and rollback playbooks, notify named owners, and do not resume without written authorization.

### Severity 1 — major blocker

Examples:

- Booking, payment-test, cancellation, refund, or reconciliation cannot complete reliably.
- Incorrect total, tax, fee, commission, reward, or inventory restoration.
- Partner or customer access isolation failure without confirmed exposure.
- Repeated webhook or email failure affecting critical workflows.

Required action: pause the affected workflow and expansion. Assign an owner and fix before continuing that workflow.

### Severity 2 — significant defect

Examples:

- A workflow succeeds only with a workaround.
- Incorrect non-financial display data.
- Intermittent messaging, notification, or onboarding failure.
- Material usability issue likely to cause pilot errors.

Required action: triage within one business day and schedule before cohort expansion unless risk is explicitly accepted.

### Severity 3 — minor issue or improvement

Examples:

- Cosmetic defects, wording, low-impact usability friction, or nonessential enhancement requests.

Required action: record, prioritize, and review during regular pilot planning.

## Triage workflow

1. Confirm the report is secrets-safe.
2. Reproduce against the exact active commit when safe.
3. Assign classification, severity, owner, and next action.
4. Link related bookings, properties, tests, commits, or incidents using non-sensitive reference IDs.
5. Decide: continue, pause workflow, pause pilot, or rollback.
6. Record the fix and validation evidence.
7. Re-run the relevant smoke tests and reconciliation checks.
8. Close only after the reporter or an independent reviewer confirms the expected result.

## Required issue format

Use a separate GitHub issue for every Severity 0, Severity 1, security/privacy concern, data-integrity concern, or recurring defect. Include:

- Clear title naming the workflow and symptom.
- Severity and classification.
- Exact commit and environment.
- Reproduction steps.
- Expected and actual results.
- Impact and affected scope.
- Owner and target action.
- Safe evidence links.
- Validation and reconciliation results before closure.

Do not combine unrelated failures into one issue.

## Review cadence

- Review Severity 0 and Severity 1 items immediately.
- Review open Severity 2 items daily during active testing.
- Review Severity 3 items and feature requests weekly.
- Compare trends against `docs/PILOT_SUCCESS_METRICS.md` before any cohort expansion.

## Expansion gate

Do not expand the pilot while:

- any Severity 0 or Severity 1 item is open;
- any unresolved security, privacy, payment-integrity, inventory-integrity, or reconciliation concern exists;
- repeated Severity 2 failures affect the same critical workflow;
- validation evidence does not reference the exact active commit.

A closed issue is not evidence by itself. The related workflow must be retested successfully and the result recorded.
