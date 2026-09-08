# Opening correction workflow — migration 185

Locally validated; not installed in the hosted database.

Adds owner/manager review of opening charge reversals and remaining category amounts, actor-scoped request recovery, and cancellation of unrecorded requests. Cancellation serializes with itemization and blocks delayed writes. Existing itemization writes come from migration 184.

Install after all migrations through 184, in one transaction, before deploying the matching correction UI. Confirm actual hosted migration state first. The last verified hosted site still denied access before PMS login; publishing code alone is not a verified fix.

## Evidence

- Exact tested candidate SHA256: c035ce76a72a1a79f3221b52d503881c812ae8098a28e7cd33ac748f1814aa6e
- Full 22-stage verification passed: invoice-verification-runs/2026-09-08T20-09-41-903Z.
- Candidate installation preserves prior table row hashes; injected failure rolls back; new cancellation table remains private.
- Hotel/home component-to-PostgreSQL tests cover exact itemization, lost-response/remount recovery, City/State/Lodging taxes, resort/technology fees and home cleaning fees.
- Cancellation concurrency tests observe real lock waits and verify both write-first and cancel-first behavior.
- Production UI build passed at the preceding unchanged UI checkpoint.

## Limits and remaining work

Tests use fictional charge breakdowns and mocked authentication through an in-process database adapter. They do not prove browser HTTP authentication, real provider transactions, tax-law correctness, or production restore readiness. Historical property migration and complete operational acceptance remain unfinished.

Cancellation applies only to an unrecorded request. Saved itemization is immutable; this release does not provide a reclassification workflow for an incorrectly saved split. Existing invoice credits and folio adjustments remain separate records and require reconciliation. Validate staff procedures before live hotel use.
