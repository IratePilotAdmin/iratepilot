# Phase 2 payment software evidence — 2026-08-17

This record documents local, non-transactional evidence for the booking and payment phase. It contains no Stripe credentials, object IDs, customer data, or production authorization.

## Verified application controls

- Approved-reservation checkout revalidates the authenticated customer, booking state, total, and prior payment state.
- PaymentIntent creation uses an environment-specific booking idempotency key.
- Payment completion verifies the Stripe object, customer, booking metadata, amount received, and payment mode.
- Stripe webhook signatures are verified from the raw request body.
- Webhook event claims, retries, duplicate delivery, and out-of-order subscription events are fail-closed and idempotent.
- Booking-finalization failure initiates the automatic refund path.
- Refunds, transfers, transfer failures, reversals, and refunded-before-transfer states remain auditable.
- Live partner payouts require explicit live configuration and cannot run in pilot or test mode.

## Read-only readiness audit

- Added a pure payment-readiness evaluator with separate test and production checklists.
- Added the admin-only `/api/admin/payment-readiness` response backed by that evaluator.
- Added a read-only payment-readiness panel to `/admin/settings`.
- The response contains no credential values.
- Conflicting test/live flags resolve to no active payment mode.
- A configuration-complete production result still reports `launchAuthorized: false`.
- The audit creates no PaymentIntent, charge, refund, transfer, payout, subscription, or webhook event.

## Automated evidence

- 43 targeted payment safety tests passed across eight files.
- The complete repository gate passed: ESLint, TypeScript, 935 tests across 220 files, and the optimized 110-route Next.js build.
- A Stripe test-mode configuration resolves to test payment and webhook modes.
- A complete live configuration resolves to live modes while remaining unauthorized for launch.
- Conflicting modes fail closed.
- The payment-readiness endpoint is admin-only and non-cacheable.

## Actions deliberately not performed

- No Stripe API request was sent.
- No test or live Stripe object was created.
- No card, wallet, refund, transfer, payout, Connect onboarding, or subscription action occurred.
- No production environment variable, database, deployment, domain, or traffic flag changed.

## Remaining external evidence

- Configure an approved Preview environment with Stripe test keys and webhook signing secret.
- Run the Stripe scenarios in `docs/COMMERCIAL_SANDBOX_TEST_PLAN.md` under separate external-action approval.
- Record sanitized provider object IDs and reconcile database ledgers.
- Complete hotel, Stripe, supplier, legal, support, and production-release approvals.
