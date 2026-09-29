# Phase 2 payment software evidence — 2026-08-17

This record documents non-transactional evidence for the booking and payment phase. It contains no Stripe credentials, customer data, or production authorization.

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

## Preview runtime evidence

- The stable Preview deployment's authenticated `/api/admin/payment-readiness` audit reports 10/10 test-mode safeguards ready while production remains unauthorized.
- Preview resolves payment and webhook processing to test mode, with public booking, live booking payments, live webhooks, and live partner payouts disabled.
- The Preview database is reconciled through migration `202608170063`; the payment cancellation and Stripe financial-event tables and privileged completion/refund functions are present.
- Before the signed redelivery, booking, booking-financial, cancellation-request, and Stripe financial-event counts were all zero during the read-only audit.
- Privileged completion and refund functions remain callable by `service_role` and unavailable to `anon` and `authenticated`.
- The current Preview deployment returned no Vercel runtime errors or warnings during the audit window.
- Vercel SSO protection intercepted an unauthenticated external webhook request with HTTP 401 before it reached the application.
- One existing temporary `automation-bypass` entry is scoped to Stripe Preview acceptance. A no-state request using that bypass reached `/api/stripe/webhook`, where the application correctly rejected the intentionally invalid signature with HTTP 400.
- The active Stripe Sandbox destination `iratepilot_preview_sandbox` was updated from an older generated deployment hostname to the stable Preview hostname while preserving the matching Vercel automation bypass and the existing Stripe signing secret.
- One existing Sandbox `refund.created` event was manually resent after the URL correction. This produced exactly one signed delivery and no new Stripe fixture objects.
- The stable Preview endpoint returned HTTP 200 with `received: true` and `mode: test`. Refund reconciliation reported `ignored` because the historical test refund was not linked to an iRatePilot booking.
- The webhook route recorded only the historical Sandbox event in the Preview Stripe event ledger and marked its processing outcome ignored.
- No booking, booking financial, refund, transfer, payout, subscription, or customer record was created or changed by the redelivery.

## Automated evidence

- 43 targeted payment safety tests passed across eight files.
- The complete repository gate passed: ESLint, TypeScript, 935 tests across 220 files, and the optimized 110-route Next.js build.
- A Stripe test-mode configuration resolves to test payment and webhook modes.
- A complete live configuration resolves to live modes while remaining unauthorized for launch.
- Conflicting modes fail closed.
- The payment-readiness endpoint is admin-only and non-cacheable.

## Stripe Sandbox acceptance run

All objects in this section were created in Stripe Sandbox on 2026-08-17, were clearly labelled as Preview acceptance fixtures, and reported `livemode: false`.

- Standard success: PaymentIntent `pi_3U5Y8XC5VbYzL9dp1ObXWziT` succeeded for USD 1.17. Its signed `payment_intent.succeeded` delivery reached the stable Preview endpoint at 4:32:08 PM CDT and returned HTTP 200 in test mode.
- Decline: PaymentIntent `pi_3U5Y8oC5VbYzL9dp3ZL1mrm4` used Stripe's generic-decline test method, returned `card_declined`, and remained `requires_payment_method` for USD 1.18.
- 3DS: PaymentIntent `pi_3U5Y9UC5VbYzL9dp0FhGx7Ja` required a Stripe-hosted test challenge, then succeeded for USD 1.19. Its signed success delivery reached Preview at 4:34:48 PM CDT and returned HTTP 200 in test mode.
- Duplicate delivery: the 3DS success event was resent once. Preview returned HTTP 200 at 4:35:38 PM CDT with `duplicate: true` and created no additional Stripe object.
- Delayed/out-of-order delivery: one older `refund.created` event was delivered after the newer payment events. Preview returned HTTP 200 at 4:36:42 PM CDT and safely ignored the event because its historical booking was not present in the isolated Preview database.
- Refund: a USD 5.00 test-only balance-fixture charge was fully refunded as `re_3U5YHSC5VbYzL9dp1LziMPXe`. The signed `refund.created` delivery reached Preview at 4:42:44 PM CDT, returned HTTP 200 in test mode, and was safely ignored because the fixture had no iRatePilot PaymentIntent reference.
- Booking-finalization refund coverage also has prior sanitized Sandbox evidence: the application reconciled a linked test refund, moved the test booking to refunded, and recorded the automated Preview refund reason.
- Transfer failure and retry: the first USD 1.20 test transfer failed with Stripe's Sandbox insufficient-balance response. After adding a Stripe-documented test-only available-balance fixture, transfer `tr_1U5YHgC5VbYzL9dpto8oyGag` succeeded. Its signed `transfer.created` delivery reached Preview at 4:41:33 PM CDT and returned HTTP 200 in test mode.
- Full reversal: reversal `trr_1U5YI2C5VbYzL9dpbNYawLfF` reversed the full USD 1.20 transfer. Stripe then reported `amount_reversed: 120` and `reversed: true`; the signed `transfer.reversed` delivery reached Preview at 4:41:56 PM CDT and returned HTTP 200 in test mode.
- No credential, signature, card number, customer identifier, booking identifier, or protection-bypass value is retained in this evidence.

## Linked Preview ledger reconciliation

- One clearly labelled USD 25.00 Stripe Sandbox booking fixture was created against an isolated Preview property, room, and single-night inventory row. The provider object was PaymentIntent `pi_3U5YPDC5VbYzL9dp3ANTRrNy`; it reported `livemode: false` and succeeded.
- Signed event `evt_3U5YPDC5VbYzL9dp3lgwpfWj` reached the stable Preview webhook at 4:49:21 PM CDT. Stripe recorded HTTP 200, and the application returned `received: true`, `eventType: payment_intent.succeeded`, and `mode: test`.
- Preview booking `IRP-ACCEPT-0817` is confirmed for USD 25.00 with the same PaymentIntent and `stripe_payment_mode: test`.
- Its single financial row is `eligible`: gross room revenue USD 25.00, partner commission USD 3.50, and partner net USD 21.50.
- The webhook ledger contains exactly one matching event row. Its object ID equals the booking PaymentIntent, it links to the same booking-financial row, its status is `processed`, its attempt count is one, and it has no processing error.
- Transfer status remains `not_started`, no transfer ID exists, and the isolated Preview database has zero payout rows.
- The synthetic property and room were deactivated immediately after reconciliation, their test inventory is zero, and no acceptance email job was queued. The inactive ledger fixture remains only as test evidence and cannot be published or booked.
- The reconciliation used only explicit `SELECT` queries after fixture creation; no production database, migration, schema, credential, or traffic setting was accessed or changed.

## Actions deliberately not performed

- No live-mode or real-money Stripe request was sent.
- Only clearly labelled Stripe Sandbox acceptance objects were created.
- No Vercel protection, bypass, environment-variable, or domain setting changed.
- No real card, wallet, bank account, customer, booking, payout, Connect onboarding, or subscription action occurred.
- No production environment variable, database, deployment, domain, or traffic flag changed.

## Remaining external evidence

- Complete hotel, Stripe, supplier, legal, support, and production-release approvals.
