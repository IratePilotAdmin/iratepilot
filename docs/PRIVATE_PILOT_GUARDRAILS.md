# Private Pilot Guardrails

## Purpose

These guardrails define the maximum safe operating scope for the first iRatePilot launch. They are release requirements, not optional recommendations.

## Launch mode

- Invite-only private pilot.
- Stripe test mode only.
- Public booking disabled.
- Automated partner payouts disabled.
- Demo inventory must never be represented as live availability.
- Only approved pilot properties may appear in search.

## Access controls

- Customer access is limited to explicitly invited pilot users.
- Partner access is limited to approved pilot partners with verified ownership or management authority.
- Admin access is limited to named operators using individual accounts.
- Shared admin credentials are prohibited.
- Service-role keys and other secrets must never be exposed to browsers, logs, tickets, screenshots, or support messages.

## Recommended pilot caps

Until a written expansion decision is approved:

- Maximum approved pilot partners: 5.
- Maximum live pilot properties: 10.
- Maximum active room types per property: 10.
- Maximum test booking value: USD 2,000.
- Maximum new test bookings per day: 25.
- Maximum invited customer accounts: 100.

Exceeding any cap requires a written review of support capacity, database health, payment reconciliation, and incident readiness.

## Inventory rules

- Every published property must be approved.
- Every published room, rate, and inventory record must be reviewed by the release owner.
- Inventory dates must be future-dated.
- Inventory must not be copied from another OTA without authorization.
- Search results must exclude suspended, incomplete, demonstration, expired, and unapproved inventory.
- A daily inventory reconciliation is required during the pilot.

## Booking and payment rules

- All payment activity must use Stripe test credentials and test payment methods.
- No real card payment may be accepted.
- No hotel payout, transfer, or settlement may be automated.
- Every confirmed test booking must be traceable across booking, inventory, payment, notification, and audit records.
- Refund tests must confirm inventory restoration, financial reversal, and reward-point correction.
- Any duplicate charge, duplicate booking, negative inventory, or cross-account access is a stop condition.

## Customer and partner communications

- Clearly label the service as a private pilot.
- Do not promise real reservations or hotel fulfillment unless a specific pilot property has formally agreed to the test.
- Test confirmation emails must clearly state that no real payment or public reservation was created.
- Support must have a documented path for booking, payment, access, and security incidents.

## Automatic pause conditions

Pause new booking activity immediately when any of the following occurs:

- Severity 0 or Severity 1 incident.
- Database verification failure.
- Incorrect access between customer, partner, or admin accounts.
- Inventory falls below zero or is restored incorrectly.
- Payment, refund, reward, or booking totals fail reconciliation.
- Transactional email or webhook processing is materially delayed or duplicated.
- The named release, support, payment, database, or rollback owner is unavailable.

Resume only after the issue is documented, remediated, verified, and approved by the release owner.

## Expansion gate

The pilot may expand only after:

1. The first 24-hour monitoring period is complete.
2. Daily reconciliation has no unexplained differences.
3. No unresolved Severity 0 or Severity 1 incident remains.
4. Support response and escalation procedures were exercised successfully.
5. A written expansion decision defines the new caps.

## Required evidence

Record the active pilot limits, invited users, approved partners, approved properties, test-booking count, incidents, and expansion decisions in a secrets-safe operating record.
