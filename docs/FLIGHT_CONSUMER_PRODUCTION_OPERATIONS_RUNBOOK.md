# Flight Consumer Production monitoring and incident runbook

## Status and authority boundary

This runbook covers the flight-specific monitoring foundation in
`lib/monitoring/flight-consumer-production.ts`.

The implemented code is a pure, fail-closed evaluator. It accepts one strict,
aggregate-only operational snapshot plus a separate trusted monitoring context
and returns typed alerts. The trusted context carries the finance-approved
Duffel reserve policy and authoritative collection receipts for every source.
It performs no Stripe, Duffel, email, database, network, payment, order, ticket,
refund, or release action. A passing monitoring report means only that the
snapshot and trusted context passed this monitoring gate. It never authorizes
consumer release.

Production staffing, provider collectors, alert delivery, dashboards, feature
flag control, settlement funding, and commercial activation remain separate
requirements.

## What is implemented

| Capability | Implemented behavior |
| --- | --- |
| Input validation | Strict Production-only aggregate schema plus a separately validated trusted context; missing, extra, partial, contradictory, stale, future-dated, misordered, or digest-mismatched evidence blocks the monitoring gate. |
| Source receipts | Every snapshot section must exactly match an authoritative source receipt digest collected no later than the snapshot and inside the five-minute freshness bound. Embedded occurrence timestamps cannot post-date their receipt; ticket deadlines are exempt because they are prospective. |
| Stripe webhook health | Detects missing/stale endpoint verification, processing lag, and failed events. |
| Payment attempt health | Detects stuck and ambiguous attempts. |
| Commerce integrity | Detects authorization or capture without an order, order without ticket, and ticket without captured payment. |
| Ticket deadline | Escalates deadlines inside the warning window and expired deadlines. |
| Duffel balance | The untrusted snapshot supplies only current balance evidence. Currency and minimum reserve come from the separate finance-approved policy; missing/stale evidence, currency drift, or insufficient balance blocks. |
| Refund and dispute health | Detects delayed or failed refunds and unacknowledged disputes. |
| Schedule changes | Warns immediately for an unacknowledged change and escalates it after the acknowledgement threshold. |
| Traveler notifications | Detects delayed and failed notifications. |
| Safe output | Emits aggregate counts, ages, thresholds, severity, response target, runbook section, and the digest binding the accepted trusted context only. It emits no raw provider identifiers, traveler data, credentials, or payment data. |

## What is not implemented

The evaluator does not collect its own evidence or deliver its own alerts.
Before commercial launch, all of the following still require implementation,
provider setup, named ownership, and acceptance evidence:

- a durable aggregate snapshot query over Production payment, order, ticket,
  webhook, refund, dispute, schedule-change, and notification ledgers;
- an authoritative receipt issuer for each source query. The caller must build
  the trusted context from these server-side receipts, never from a consumer
  request or from fields copied out of the untrusted snapshot;
- an authenticated Stripe endpoint-verification and webhook-lag collector;
- a Duffel Balance collector or an approved operator receipt with the correct
  settlement currency and a finance-approved minimum reserve. The approval
  receipt digest, currency, reserve amount, and exact derived policy digest
  belong only in the trusted context;
- an alert sink, paging policy, dashboard, retention policy, and delivery test;
- primary and backup on-call owners for incident command, payments, Duffel,
  ticketing, traveler support, notifications, privacy/security, and executive
  release decisions;
- Stripe and Duffel escalation contacts and support entitlements;
- runbook drills using test data, including after-hours disruption coverage;
- separately approved feature-flag, kill-switch, rollback, and release
  procedures.

No live order, charge, capture, ticket, cancellation, refund, provider call, or
public release should be inferred from this foundation.

## Code-reviewed threshold policy

The evaluator uses fixed engineering baselines. They cannot be weakened by a
runtime snapshot. The Duffel reserve amount and currency are separately bound
to a finance approval receipt in the trusted context and are never accepted
from the snapshot. Named operational, finance, supplier, and support owners
must review the baselines before launch; changing them requires a reviewed code
change or, for the reserve policy, a new approved receipt.

| Signal | Threshold |
| --- | ---: |
| Aggregate snapshot age | 5 minutes |
| Per-source authoritative receipt age | 5 minutes |
| Allowed future clock skew | 1 minute |
| Stripe endpoint verification age | 15 minutes |
| Stripe webhook processing lag | 5 minutes |
| In-progress payment attempt age | 10 minutes |
| Ticket deadline warning window | 60 minutes |
| Duffel balance evidence age | 15 minutes |
| Pending refund age | 24 hours |
| Schedule-change acknowledgement age | 15 minutes |
| Pending traveler notification age | 15 minutes |

Every alert blocks this monitoring gate. P0 produces `critical`; P1 and P2
produce `degraded`; no alerts produces `healthy`. The report always returns
`consumerReleaseAuthorized: false`.

## Severity and response targets

| Severity | Target acknowledgement | Flight examples |
| --- | ---: | --- |
| P0 | 15 minutes | Captured payment without order, ticket without captured payment, expired ticket deadline, insufficient or wrong-currency Duffel reserve, invalid trusted context, and stale/misordered/digest-mismatched monitoring evidence. |
| P1 | 30 minutes | Stripe webhook failure/lag, stuck or ambiguous payment, unresolved order without ticket, refund failure/lag, dispute, overdue schedule change, notification failure/lag. |
| P2 | 4 business hours | Newly received schedule change awaiting acknowledgement inside its escalation window. |

These are engineering targets, not evidence that people are assigned. Do not
activate commercial flight booking until primary and backup owners have accepted
the targets and an end-to-end page test has succeeded.

## Universal response procedure

1. Open an incident record with the alert code, aggregate counts, first observed
   time, incident commander, and next update time. Do not paste credentials,
   traveler PII, payment methods, raw provider payloads, or client secrets.
2. Keep public flight release disabled. If already enabled, use the separately
   approved narrow flight kill switch or feature flag; the evaluator does not
   change flags.
3. Establish authoritative evidence from the durable application ledger and the
   relevant provider using approved, read-only operator access first.
4. Never blind-retry a payment, order, capture, ticket, cancellation, or refund.
   Reconcile ambiguous or in-progress attempts by their exact stored
   idempotency and provider receipts.
5. Record customer impact and assign a traveler-support owner. State only
   confirmed facts and the next update time.
6. Apply compensation only through a separately reviewed workflow with exact
   amount, order, payment, ticket, and provider bindings.
7. Close only after the application and provider sources of truth agree,
   affected travelers have been contacted where required, and follow-up work has
   an owner and due date.

## Alert-specific response

### Monitoring evidence failure

Codes: `monitor_clock_invalid`, `monitoring_snapshot_invalid`,
`monitoring_trusted_context_invalid`, `monitoring_snapshot_stale`,
`source_collection_receipt_after_snapshot`,
`source_collection_receipt_stale`,
`source_collection_receipt_binding_mismatch`,
`source_signal_after_collection_receipt`, `signal_timestamp_in_future`.

- Treat observability loss as a P0 release blocker.
- Verify the collector clock, query completion, schema version, and last
  successful snapshot without replacing missing values with zeros.
- Verify every source receipt against the immutable collector record and confirm
  its section digest, receipt time, and snapshot time before regenerating the
  trusted context. Never mint a replacement receipt from request data.
- Do not declare commerce healthy from provider dashboards alone.

### Stripe webhook health

Codes: `stripe_webhook_endpoint_unverified`,
`stripe_webhook_endpoint_verification_stale`,
`stripe_webhook_processing_lag`, `stripe_webhook_delivery_failed`.

- Keep new payment mutations disabled until endpoint verification and durable
  ingestion are current.
- Compare Stripe delivery evidence with the local webhook inbox and processor
  leases. Preserve event-ID idempotency and raw-body signature verification.
- Retrieve the exact PaymentIntent before resolving out-of-order or ambiguous
  events. Do not mark success from delivery status alone.

### Payment attempt recovery

Codes: `payment_attempt_stuck`, `payment_attempt_ambiguous`.

- Block retry until the exact PaymentIntent and durable attempt journal have
  been reconciled.
- Reuse only the original idempotency key when the reviewed recovery workflow
  explicitly permits it.
- Escalate captures, refunds, or disputes found outside the stored attempt.

### Payment, order, and ticket integrity

Codes: `payment_authorized_without_order`,
`payment_captured_without_order`, `order_without_ticket`,
`ticket_without_captured_payment`.

- Stop new transactions and build an exact per-order reconciliation package.
- Confirm payment authorization/capture, Duffel order state, booking reference,
  ticket documents, settlement liability, and traveler notification separately.
- Do not create a replacement order or payment while either source is
  ambiguous. Assign approved void/refund or ticket-servicing action only after
  liability is known.

### Ticket deadline protection

Codes: `ticket_deadline_at_risk`, `ticket_deadline_expired`.

- Assign the ticketing owner immediately and keep the traveler-support owner
  informed.
- Verify whether the order is ticketable, already ticketed, canceled, or needs
  supplier intervention.
- After expiry, treat the itinerary as unconfirmed until provider evidence
  proves otherwise; reconcile payment exposure and contact the traveler.

### Duffel balance protection

Codes: `duffel_balance_policy_currency_mismatch`,
`duffel_balance_evidence_missing`, `duffel_balance_evidence_stale`,
`duffel_balance_below_threshold`.

- Do not place new balance-funded orders.
- The finance owner must confirm the settlement currency, pending liabilities,
  required reserve, approval receipt, and replenishment receipt through
  approved Duffel access. Snapshot fields cannot change the approved policy.
- Re-run the collector only after funding is final; a pending transfer is not
  available balance.

### Refund and dispute response

Codes: `refund_pending_lag`, `refund_failed`, `dispute_unacknowledged`.

- Assign payments and traveler-support owners and retrieve the exact refund,
  PaymentIntent, charge, and dispute state.
- Never submit a second refund merely because the first response was lost.
- Track regulatory/provider response deadlines and record customer
  communications without sensitive payment data.

### Schedule-change response

Codes: `schedule_change_pending_acknowledgement`,
`schedule_change_acknowledgement_lag`.

- Verify the latest itinerary and ticket documents with Duffel before informing
  the traveler of accepted options.
- Assign servicing ownership, response deadline, and traveler contact status.
- Do not auto-accept, exchange, cancel, or refund without the separately
  approved servicing workflow and fare-rule evidence.

### Traveler notification response

Codes: `notification_delivery_lag`, `notification_delivery_failed`.

- Verify the outbox, provider delivery event, destination suppression/bounce
  state, and whether the underlying booking state is still current.
- Use an approved alternate contact path for time-sensitive disruption or
  ticket-deadline notices; never include payment credentials or unnecessary PII.
- A delivered email does not prove the order, payment, or ticket succeeded.

## Evidence required to close the monitoring launch gate

- one current, valid snapshot with every required aggregate signal populated;
- a separately assembled trusted-context digest binding the finance-approved
  reserve policy and fresh exact receipt for all nine sources;
- zero alerts from the evaluator;
- a recorded alert-delivery test for each severity;
- named primary and backup owners with acknowledged response targets;
- Stripe webhook loss/replay and payment-ambiguity drills;
- Duffel low-balance and ticket-deadline drills;
- refund, dispute, schedule-change, and notification-failure drills;
- a separate release approval. The monitoring report itself cannot provide it.
