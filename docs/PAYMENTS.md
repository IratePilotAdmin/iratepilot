# Payments

iRatePilot uses Stripe PaymentIntents for reservation payments, Stripe Checkout for test subscriptions, verified webhooks for asynchronous reconciliation, and Stripe Connect or contract-based settlement for partner payouts.

Payment code being present does not authorize a charge, refund, transfer, payout, subscription, or production activation.

## Operating modes

The reservation payment gate fails closed unless exactly one approved mode resolves:

| Mode | Required configuration | Prohibited configuration |
| --- | --- | --- |
| Disabled | Default when no complete mode passes | No Stripe operation should be created |
| Test | `PILOT_MODE=true`, `ENABLE_TEST_CHECKOUT=true`, matching Stripe test keys | Public booking, live payments, live webhooks, and live payouts |
| Live | `PILOT_MODE=false`, public booking enabled, live booking enabled, matching Stripe live keys | Test checkout or mixed test/live keys |

`getApprovedBookingPaymentMode` rejects mixed or incomplete configurations. Stripe webhook processing independently resolves through `getStripeWebhookMode` and always requires raw-body signature verification.

## Reservation payment flow

1. A hotel partner approves a reservation request.
2. The authenticated customer opens the approved-reservation payment page.
3. The server rechecks booking ownership, status, total, and existing payment state.
4. The server creates one idempotent PaymentIntent for the approved booking and environment.
5. Stripe Elements handles card or eligible wallet details; iRatePilot does not store card numbers.
6. The completion route retrieves and verifies the succeeded PaymentIntent, user, booking, amount, and metadata mode.
7. The database records the payment transactionally.
8. Duplicate completion calls return the already recorded booking.
9. If payment succeeded but booking finalization fails, the system attempts an automatic refund and records reconciliation evidence.

## Webhook and reconciliation controls

- The webhook route reads the raw request body and verifies the Stripe signature before processing.
- Stripe event IDs are claimed in an idempotent financial-event ledger.
- Processed or ignored duplicates return without repeating side effects.
- Stale failed claims can be retried without allowing concurrent duplicate work.
- Out-of-order subscription events are ignored when they are older than the last synchronized event.
- Refund events must match the booking payment mode and linked PaymentIntent.
- Transfer creation, failure, reversal, and refunded-before-transfer states remain separately auditable.
- Live partner transfers require the live-payout flag, pilot mode off, a live Stripe key, and a verified live Connect account.

## Read-only operator audit

Administrators can inspect `/admin/settings`, which calls `/api/admin/payment-readiness` and displays two separate checklists:

- Stripe test-mode validation readiness.
- Production configuration readiness.

The audit returns booleans and safe descriptions only. It never returns credential values and never creates Stripe objects. Even when every production configuration check passes, the dashboard reports that launch remains unauthorized until external approvals are recorded.

## Test-mode acceptance required

Before any commercial activation, run the separately approved Stripe sandbox scenarios in `docs/COMMERCIAL_SANDBOX_TEST_PLAN.md`:

1. Successful card payment.
2. Declined payment.
3. 3DS authentication.
4. Duplicate, delayed, and out-of-order webhooks.
5. Booking-finalization failure followed by an automatic test refund.
6. Eligible Connect test transfer, retry, and reversal.
7. Cancellation and complete ledger reconciliation.

Record only non-secret Stripe object IDs, timestamps, expected/actual outcomes, and the operator. Never record keys, signatures, card data, bank information, or Connect credentials.

## Production stop conditions

Keep production payments and payouts disabled when any of the following is true:

- Test checkout remains enabled in Production.
- Pilot mode remains enabled.
- Public booking or live-payment approval is missing.
- Stripe key modes do not match.
- Webhook signature verification or reconciliation evidence is incomplete.
- Supplier booking, refund, support, legal, or hotel approval is incomplete.
- The production database, environment variables, deployment, or monitoring evidence has not been independently reviewed.

Production activation requires a separate explicit approval after every stop condition is cleared.
