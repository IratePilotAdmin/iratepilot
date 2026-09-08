# Invoice migration 184

Status: validated locally, not installed in the hosted database. This is an accounting foundation for the pilot, not a hotel launch certification.

## Behavior

Adds immutable itemized invoices and credit notes, invoice numbering, guest-safe document reads, effective-date aging, payment allocations and allocation reversals. Supports exact-request retries, status recovery, and cancellation of unrecorded invoice/allocation/reversal/credit requests. Opening charge reversals can be itemized through an API. Property-level locks and membership rechecks serialize financial writes. New private tables use row-level security with no direct application-role access.

Payment allocation cannot precede invoice issuance or the receipt's property-local date. Historical reconciliation includes dated refunds and payment corrections, preventing later reversals from freeing already-consumed funds for an earlier allocation.

## Prerequisites and deployment

Install migrations through 183 first. Apply this file once as a single transaction through the normal migration process. Deploy the matching PMS UI only after successful database installation. Do not rerun an already-applied migration or remove immutable financial records to undo an operational release. Validate in staging and prepare a restore/recovery plan before production installation.

This repository does not establish that the hosted predecessors have been installed. Last known hosted database was 176; recheck actual migration state before applying anything. The hosted site also has an unresolved access denial before PMS sign-in.

## Validation evidence

- Exact candidate SHA256: edac67c50b282f56006a7d5446202010c299bb5477c725a943db8af083c8cbcb
- 17-stage local verification passed: invoice-verification-runs/2026-09-08T19-54-24-369Z.
- Candidate installation after 183 preserves all existing fixture row hashes. An injected failure rolls back all new tables. Twelve new tables are private and empty after installation.
- Hotel/home UI-to-PostgreSQL tests cover issuance, allocation, reversal, credit and saved-response recovery using the full candidate.
- Native concurrency tests observe actual lock waits for competing writes and cancellations.
- Historical aging boundaries, receipt-date rejection, refund/correction history, component tests and TypeScript checks pass.

Tests use fictional fixtures. UI/database tests use an in-process adapter and mocked authentication; they do not prove browser HTTP authentication, durable recovery after a committed network disconnect, or real payment processing. Test harnesses and detailed logs currently reside in the companion accounting-foundation workspace.

## Remaining invoice and launch work

- Opening reversal itemization UI, correction/recovery operations and operator guidance.
- Historical migration/cutover acceptance and jurisdiction-specific invoice/tax configuration.
- End-to-end browser authentication and production-scale reporting acceptance.
- Hosted migration installation, site access resolution, backups/restore drills and real-property sign-off.
- Payment/OTA/lock/POS/accounting provider selection and live integration acceptance.

Credits reduce invoice receivables; they do not issue processor refunds or automatically change folio charges. Staff need a reconciled operational workflow for folio adjustments and invoice credits before live hotel use.
