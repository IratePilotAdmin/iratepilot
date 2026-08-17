# iRatePilot Automation Operations Center — Phase 1

Status: Phase 1 complete; Preview release and authenticated acceptance passed on August 17, 2026

Phase 1 gives administrators one read-only surface for monitoring automation queues, ledger failures, sanitized activity receipts, and private-pilot safety locks. It does not introduce an automation executor or authorize any external action.

## Delivered surface

- Admin route: `/admin/operations`
- Admin-only data route: `/api/admin/operations`
- Six operational lanes:
  1. Transactional communications
  2. Booking operations
  3. Partner onboarding
  4. Support routing
  5. Payment reconciliation
  6. Supplier connectivity
- Summary counts for queued review, recorded failures, healthy/safeguarded lanes, and safety-lock coverage.
- Attention queue that links administrators to the existing source workspace instead of executing an action.
- Sanitized recent receipts from email, Stripe, PMS validation, and SynXis request ledgers.
- Manual refresh only; responses are private and `no-store`.

## Existing data sources

Phase 1 reuses current operational ledgers and creates no database migration:

- `email_outbox`
- `email_delivery_events`
- `bookings`
- `booking_cancellation_requests`
- `partner_applications`
- `contact_messages`
- `stripe_financial_events`
- `booking_financials`
- `pms_connection_test_events`
- `synxis_request_journal`
- `priority_pms_launch_evidence`
- `synxis_crs_launch_evidence`

The response returns counts and sanitized receipt labels only. It does not return credentials, authorization headers, cookies, guest details, message bodies, payment methods, hotel-system payloads, or provider secrets.

## Safety locks

The Operations Center reports whether these private-pilot boundaries are engaged:

- private pilot mode;
- public booking disabled;
- live booking payments disabled;
- live Stripe webhooks disabled;
- live partner payouts disabled; and
- no PMS or SynXis connection authorized for live traffic.

A disengaged lock is a critical review signal. It never becomes automatic authorization for a job, transaction, deployment, or external request.

## Deliberately excluded from Phase 1

- Starting, pausing, scheduling, or editing automation jobs.
- Retrying failed email, Stripe, payout, PMS, or SynXis work.
- Sending email or support responses.
- Approving bookings, cancellations, hotel applications, or publication.
- Creating payments, refunds, transfers, payouts, subscriptions, or Stripe Connect accounts.
- Entering or revealing provider credentials.
- Activating PMS, CRS, supplier, SynXis, public-booking, or Production traffic.
- Predictive AI recommendations or autonomous decisions.

## Verification gates

- [x] Admin authorization occurs before service-role ledger access.
- [x] The API exposes `GET` only and returns private, non-cacheable responses.
- [x] Queue, failure, safety-lock, and receipt normalization is covered by unit tests.
- [x] The UI contains no execute, retry, publish, payment, payout, email-send, or supplier-activation controls.
- [x] Focused lint, TypeScript, and Phase 1 tests pass locally.
- [x] Full repository verification passes: ESLint, TypeScript, 954 tests across 223 files, and the optimized 111-route Next.js build.
- [x] Preview deployment is separately approved and reaches `READY`.
- [x] Authenticated Preview browser acceptance confirms the page and live ledgers render without errors.

## Preview acceptance evidence

- Stable Preview: `https://iratepilotadmin-preview-20260817.vercel.app/admin/operations`
- Accepted deployment: `dpl_HBnrajrrFsE3ATmJY1yg3TmfWqhG`
- Build result: `READY`, with TypeScript and the optimized 111-route Next.js build passing on Vercel.
- Authenticated acceptance: six operational lanes rendered from live Preview ledgers, all six private-pilot safety locks were engaged, and no execute, retry, publish, payment, payout, email-send, or supplier-activation control was exposed.
- Regression correction: evidence-table counts use schema-independent row selection because those ledgers are keyed by `provider_id`, not `id`.

## Later phases

Potential later phases require separate design and approval:

- Phase 2: operator-owned runbooks, acknowledgment, assignment, and incident notes.
- Phase 3: narrowly scoped retry controls with idempotency, approvals, and immutable audit receipts.
- Phase 4: scheduling, escalation policy, service-level objectives, and provider health integrations.
- Phase 5: assisted recommendations with human approval; no autonomous money movement, publication, or supplier activation.
