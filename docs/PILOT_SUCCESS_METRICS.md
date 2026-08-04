# iRatePilot Private-Pilot Success Metrics

Use this scorecard to decide whether the private pilot should continue, pause, roll back, or expand. Measure only against the exact active release commit and approved pilot cohort.

## Decision states

- **Continue:** no critical safety issue, metrics are within thresholds, and defects are understood.
- **Pause:** a material operational, inventory, payment, security, or support issue requires correction before further testing.
- **Rollback:** a Severity 0 or Severity 1 incident, data-integrity failure, unauthorized access, unreconciled payment state, or inventory corruption occurs.
- **Expand:** all expansion gates are met for two consecutive review periods and written approval is recorded.

## Safety and integrity metrics

These are mandatory. Any failure blocks expansion.

| Metric | Target | Pause threshold | Rollback threshold |
| --- | --- | --- | --- |
| Unauthorized data access | 0 | Any suspected exposure | Confirmed exposure |
| Duplicate confirmed bookings | 0 | Any unresolved duplicate | Inventory or customer impact |
| Incorrect inventory restoration | 0 | Any mismatch | Repeated or unrecoverable mismatch |
| Unreconciled payment/refund records | 0 | Any unresolved mismatch after review | Material or repeated integrity failure |
| Live Stripe charges | 0 | Any accidental attempt | Any completed live charge |
| Automated partner payouts | 0 | Any attempted activation | Any completed unapproved payout |
| Demo inventory shown as real | 0 | Any exposure | Any customer relied on it |

## Reliability metrics

Measure using completed pilot scenarios, not page views alone.

- Registration and login completion rate: at least 95%.
- Approved partner setup completion rate: at least 90% without administrator database intervention.
- Search-to-booking-request completion rate: at least 85% for valid test scenarios.
- Partner booking decision completion rate: at least 90%.
- Stripe test checkout completion rate: at least 95% for valid test cards.
- Webhook-to-confirmed-booking completion: at least 99% with no manual database repair.
- Cancellation and refund workflow completion: 100% for executed test cases.
- Booking message delivery and visibility: at least 99%.
- Transactional email job completion: at least 98% within the documented processing window.
- Daily reconciliation completion: 100% on every active pilot day.

## Support and usability metrics

- Median first support response: 30 minutes or less during declared pilot support hours.
- Severity 1 acknowledgement: 10 minutes or less.
- At least 80% of invited testers complete one assigned end-to-end scenario.
- At least 80% of participating partners complete onboarding without abandoning the pilot.
- Average tester clarity rating: at least 4 out of 5 for booking status, payment status, and cancellation outcome.
- No unresolved issue that prevents a participant from understanding whether a booking is confirmed, cancelled, or refunded.

## Defect thresholds

- Severity 0: zero allowed; immediately stop and roll back or isolate the affected system.
- Severity 1: zero unresolved; pause all affected workflows.
- Severity 2: no more than two open at one time, each with an owner and correction plan.
- Severity 3: may remain open only when documented, non-blocking, and scheduled.
- Repeated defects with the same root cause count as a systemic issue, not separate minor defects.

## Pilot review cadence

Review the scorecard:

1. Before the first participant is activated.
2. After the first complete customer-to-partner booking scenario.
3. At the end of each active pilot day.
4. Immediately after any Severity 0, 1, or payment-integrity event.
5. Before adding a new partner, property, or customer wave.

Record the date, exact commit SHA, reviewer, cohort size, completed scenarios, metric results, defects, decision, and next action. Do not include secrets or sensitive personal information.

## Minimum evidence for expansion

Expansion beyond the initial cohort requires:

- two consecutive review periods with no Severity 0 or Severity 1 incident;
- all safety and integrity metrics at target;
- at least 20 successful end-to-end test bookings across at least two approved properties;
- at least five successful cancellation or refund scenarios;
- 100% daily reconciliation completion;
- no unresolved database, webhook, inventory, payment, access-control, or email blocker;
- participating partner and customer feedback reviewed;
- support capacity confirmed for the larger cohort;
- a written expansion decision naming the approver and new limits.

Expansion approval does not authorize public booking, Stripe live mode, or automated partner payouts. Each requires a separate reviewed release decision.
