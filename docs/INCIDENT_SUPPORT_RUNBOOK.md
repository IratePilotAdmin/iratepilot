# Incident and customer-support runbook

## Severity and response targets

| Severity | Example | Acknowledge | Update cadence |
| --- | --- | --- | --- |
| P0 | Incorrect charge, duplicate payout, confirmed booking missing at hotel, broad data exposure | 15 minutes | 30 minutes |
| P1 | Booking, refund, payout, or transactional email flow unavailable | 30 minutes | 60 minutes |
| P2 | Single-account defect with a workaround | 4 business hours | Daily |
| P3 | Question, content correction, or enhancement | 1 business day | As agreed |

These are launch targets and require named staffing before commercial activation.

## Roles

- Incident commander coordinates decisions and timestamps.
- Payments owner reconciles Stripe objects, refunds, transfers, and webhook events.
- Supplier owner contacts the hotel/vendor and verifies the reservation source of truth.
- Support owner communicates with the traveler and property without exposing internal secrets.
- Engineering owner checks runtime logs, `/api/admin/operational-readiness`, database ledgers, and rollback options.

## Procedure

1. Create an incident record; classify severity and affected booking IDs without copying payment credentials.
2. For P0/P1, disable the narrowest relevant feature flag. Never enable another integration as a workaround.
3. Correlate booking, Stripe event, transfer, email outbox, delivery-event, and supplier request identifiers.
4. Do not manually mark payment, refund, payout, or reservation success without provider evidence.
5. Communicate confirmed facts, customer impact, next update time, and safe alternatives.
6. Close only after reconciliation, customer/property confirmation, and a follow-up action owner are recorded.

## Escalation prerequisites

Before commercial launch, assign primary and backup contacts for customer support, payments, each active supplier, database recovery, privacy/security, and executive decisions. Test the escalation tree quarterly.
