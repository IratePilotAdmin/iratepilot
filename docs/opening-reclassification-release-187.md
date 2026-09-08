# Opening classification corrections — migration 187

Adds append-only revisions to opening reversal classifications. Original saved receipts remain unchanged. Effective invoice sources and category reviews use the latest revision, and review responses include the classification revision for optimistic concurrency.

Owners and managers can submit a confirmed correction with the expected revision and a unique request ID. The correction preserves the reversal total, checks original category capacity and net invoiced amounts after credits, and rejects outdated revisions. Exact request retries return the saved receipt. The request-status endpoint only returns the requesting actor's receipt within the selected tenant and property.

An unrelated unclassified reversal does not prevent correcting an existing classification. Invoice issuance remains blocked until all opening reversals are classified. The correction changes category attribution, not the original folio reversal or guest balance.

Local verification uses all numbered migrations through 187 for both hotel and whole-home fixtures. It covers invalid amounts, duplicate and unknown categories, role and scope restrictions, stale revisions, exact retries, historical receipt recovery, unrelated unclassified reversals, and protection of already invoiced amounts. Installation tests inject a failure and confirm rollback restores replaced functions and existing data; successful installation preserves existing records and denies direct application-role access to revision storage.

Concurrent PostgreSQL sessions observed ten actual lock waits across hotel and home fixtures. They verify stale competing edits, exact retry recovery, retry after rollback, invoice issuance using an outdated source snapshot, and a correction attempting to reduce an already invoiced category.

Not installed in hosted Supabase. Correction UI, cancellation of unresolved requests, general-ledger category treatment, and real-property acceptance remain outstanding. This migration alone is not evidence of launch readiness.
