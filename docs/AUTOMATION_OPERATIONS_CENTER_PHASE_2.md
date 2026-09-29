# iRatePilot Automation Operations Center — Phase 2

Status: Isolated Preview migration, authenticated acceptance, and laptop Git closeout complete on August 18, 2026

Phase 2 adds accountable operator coordination to the Phase 1 monitoring surface. Administrators can follow bounded runbooks and create, acknowledge, assign, document, and resolve internal incidents. The workflow records decisions only; it cannot execute automation or authorize an external action.

## Delivered workflow

- Six operator runbooks aligned to communications, bookings, partner onboarding, support, payments, and supplier connectivity.
- Admin-only incident creation with a sanitized title, severity, runbook, and optional non-secret source reference.
- Explicit acknowledgment before resolution.
- Assignment only to current administrator profiles.
- Immutable operator notes and immutable incident event receipts.
- A required immutable resolution note.
- Graceful Phase 1 operation when migration 064 is not present; incident writes remain disabled until the migration is applied.

## Database boundary

Migration `202608170064_automation_incident_workflow.sql` adds:

- `automation_incidents` for current ownership and lifecycle state;
- `automation_incident_notes` for append-only sanitized notes;
- `automation_incident_events` for append-only creation, acknowledgment, assignment, note, and resolution receipts; and
- authenticated security-definer functions that re-check `auth.uid()` against an administrator profile inside each transaction.

The tables have row-level security enabled and expose no direct access to `anon` or `authenticated`. Only the narrowly scoped functions are executable by authenticated users. Notes and event receipts reject update and delete operations.

## Sensitive-data safeguards

Both the server actions and database constraints reject credential-shaped, token-shaped, and payment-card-shaped text. Operators are instructed not to record:

- passwords, secrets, API keys, tokens, authorization headers, or cookies;
- card, bank, payout, or payment-method data;
- guest details or message bodies; or
- PMS, CRS, SynXis, or other provider payloads.

## Actions deliberately excluded

- Starting, pausing, scheduling, or retrying automation.
- Sending email or support responses.
- Approving bookings, cancellations, partners, hotel publication, or manager access.
- Creating payments, refunds, transfers, payouts, or subscriptions.
- Changing public-booking, live-payment, webhook, payout, supplier, PMS, CRS, or Production traffic flags.
- Entering provider credentials or performing provider tests.
- Reopening or deleting immutable incident history.

## Verification gates

- [x] Every server action validates input and re-checks administrator authorization.
- [x] Incident creation, acknowledgment, assignment, notes, and resolution use transactional database functions.
- [x] Resolution requires prior acknowledgment and an immutable resolution note.
- [x] Notes and event receipts are append-only and private.
- [x] Six runbooks preserve separate-approval boundaries for external action.
- [x] Missing migration 064 degrades to runbooks-only mode without breaking Phase 1 monitoring.
- [x] Full local repository verification passes: ESLint, TypeScript, 960 tests across 224 files, and the optimized 111-route Next.js build.
- [x] Migration 064 was separately approved and applied to the isolated Preview database only.
- [x] The isolated Preview deployment reached `READY` and authenticated browser acceptance passed.
- [x] Reconcile this laptop branch with the deployed source commit; all 73 changed Git blobs match from the common base.
- [x] Publish the approved laptop branch and verify local/remote synchronization at `0c7540d`.

## Later phases

Phases 3–5 are implemented and accepted in the same isolated Preview environment. Their dry-run, scanner, and executor controls remain fail-closed as recorded in `docs/AUTOMATION_OPERATIONS_CENTER_PREVIEW_EVIDENCE_2026-08-18.md`.
