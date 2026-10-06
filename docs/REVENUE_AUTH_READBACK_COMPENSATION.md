# Isolated authenticated readback and compensation candidate

Prepared October 4, 2026. Candidate only: not installed, not run against hosted
Auth, and not permission to activate Red Roof or OTA rate writes.

The audited HTTP suite expands from 21 to 27 cases. Six new cases verify owner
price/version readback, manager price/version readback, unchanged price/version
after audit failure, an audited compensating restoration, restored PMS readback,
and exact compensation replay followed by unchanged version readback.

The synthetic sequence is $140.00/version 1 → $161.00/version 2 →
$185.15/version 3 → $140.00/version 4. The restoration uses a new request ID,
current version and reviewed minimum/maximum both equal to the starting price.
It passes through the existing server calculation and atomic audited writer.
This is an explicit test restoration, not a normal recommendation or live policy.
Original and compensating audit records remain until audit evidence is captured.

The expiring fixture wraps the existing pricing-facts preflight for authenticated
readback. It permits only the three existing genuine test identities, synthetic
tenant/property/plan and fixture date. Staff remain subject to the original
preflight's manager authorization. Both wrapper paths expire after 30 minutes.
Cleanup restores the original functions and disables their API execution.

The workflow now checks out its dispatch commit for audited-http as well as
supervisor-review. Browser modes retain their previously reviewed pinned source.
Updating this draft does not dispatch or rerun a workflow.

## Local validation

TypeScript syntax and workflow YAML parse passed. Setup and cleanup executed in
a local PGlite reduced schema with stub original functions and a null Auth identity.
The local check proved fixture inserts, readback ACLs, null-identity denial,
cleanup, restored original preflight definition hash, and disabled readback ACL.
No request claims were set. No hosted project was changed. This validation does
not prove genuine Auth, the full original PMS functions, production schema parity,
concurrency, rate calculations or the 27 HTTP scenarios.

## Execution checklist

1. Independently verify the non-default, data-free isolated branch metadata and
   target baseline. Its reduced schema remains distinct from full PMS parity.
2. Review this exact draft revision and native security checks. Reconfirm the
   protected environment contains the three genuine test accounts and a current
   manifest without revealing credentials or session tokens.
3. Install the matching expiring setup SQL, then dispatch audited-http at the
   reviewed commit. Do not rerun a partially used fixture.
4. Require all 27 HTTP cases to pass. Before cleanup, run the read-only
   `scripts/revenue-audited-http-fixture-audit.sql`: it expects three decisions,
   three rate actions, six activities, one restored nightly row and plan version 4.
   A missing audit/readback result leaves the gate open even if the runner passed.
5. Capture redacted run and audit results, execute matching scoped cleanup after
   success/failure/expiry, and verify original hashes, disabled ACLs and removal
   of disposable fixture rows. Preserve the original unrelated read-only fixture.

Lost-response server races, full-schema parity, nightly actuals and forecast
accuracy remain independent release requirements. Do not label this candidate
as executed evidence or merge the draft merely because local checks passed.
