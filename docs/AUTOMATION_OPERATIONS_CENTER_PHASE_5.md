# iRatePilot Automation Operations Center — Phase 5

Status: Isolated Preview migrations and authenticated acceptance complete on August 18, 2026; sandbox remains locked; laptop Git closeout pending

Phase 5 completes the Automation Operations Center development sequence with one narrowly scoped sandbox adapter. The adapter checks whether a sanitized UUID identifies an existing `email_outbox` receipt and returns only its status. It cannot send or retry email, reveal recipient data, access the network, invoke Resend, or mutate the outbox.

## Delivered adapter

`email_outbox_receipt_check` is the only registered adapter. It requires:

- a Phase 3 request with retry kind `email_delivery_review`;
- two distinct administrator approvals other than the requester;
- a completed Phase 3 dry-run receipt;
- a unique Phase 3 idempotency fingerprint;
- `AUTOMATION_SANDBOX_EXECUTOR_ENABLED=true` at the application boundary; and
- `automation_executor_registry.enabled=true` at the database boundary.

Migration 067 seeds the database registry entry with `enabled=false`, and `.env.example` sets the application flag to `false`. Applying the migration or deploying the application therefore cannot activate the adapter.

## Execution result

The adapter accepts no message body, recipient, subject, credential, provider payload, or payment information. It reads only `email_outbox.status` for a sanitized UUID and records one of two terminal outcomes:

- `validated`: an internal outbox receipt exists, with its allowlisted status; or
- `blocked`: the UUID is invalid or no internal receipt exists.

Each Phase 3 request can produce only one execution row. Repeating the same action returns the existing execution, and the idempotency key is derived from the approved request fingerprint.

## Database boundary

Migration `202608170067_automation_sandbox_executor.sql` adds:

- `automation_executor_registry` for the database kill switch and fixed adapter guardrails;
- `automation_sandbox_executions` for idempotent terminal outcomes; and
- `automation_sandbox_execution_events` for immutable validated or blocked receipts.

All tables have row-level security enabled and expose no direct access to `anon` or `authenticated`. The execution function is the only authenticated entry point and re-checks `auth.uid()` against an administrator profile inside the transaction. Execution and event history rejects update and delete operations.

Database constraints require:

- `internal_read_only_sandbox` execution mode;
- `network_accessed=false`;
- `external_side_effect_created=false`;
- `message_sent=false`; and
- `money_moved=false`.

## Actions deliberately excluded

- Sending, enqueuing, retrying, suppressing, or modifying email.
- Reading or returning recipients, subjects, templates, message content, errors, or provider identifiers.
- Calling Resend, Stripe, PMS, CRS, SynXis, or any network endpoint.
- Payment, refund, transfer, payout, booking, inventory, publication, or supplier action.
- Installing Workflow DevKit for an atomic database read.
- Enabling either kill switch, applying migrations, deploying, or changing Production.

## Verification gates

- [x] Exactly one adapter is allowlisted and it is internal/read-only.
- [x] Both application and database kill switches default to disabled.
- [x] Eligibility inherits Phase 3 dual approval, requester separation, dry-run completion, and idempotency.
- [x] The adapter reads only `email_outbox.status` and stores no personal or provider data.
- [x] Database constraints prohibit network access, external side effects, message sending, and money movement.
- [x] One immutable execution and event receipt is allowed per approved request.
- [x] Every application and database entry point re-checks administrator authorization.
- [x] Phases 1–4 remain available when migration 067 is absent.
- [x] Full local repository verification passes: ESLint, TypeScript, 978 tests across 227 files, and the optimized 111-page Next.js build.
- [x] Migrations 064–067 were separately approved and applied to the isolated Preview database only.
- [x] The isolated Preview deployment reached `READY` and authenticated browser acceptance passed with both executor kill switches still disabled.
- [x] Reconcile this laptop branch with the deployed source commit; all 73 changed Git blobs match from the common base.
- [ ] Publish the local commits only after separate approval.
- [ ] A separate Preview-only decision enables both kill switches for one labeled synthetic receipt check, followed by immediate relocking and evidence review.

## Completion rule

Phase 5 software completion does not authorize Production automation. Production activation would require separate legal, operational, security, provider, deployment, rollback, and incident-response approval. No autonomous message delivery, money movement, publication, or supplier activation is authorized by this phase.
