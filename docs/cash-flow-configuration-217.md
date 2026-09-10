# Cash-account configuration candidate 217

Owners can save an explicitly reviewed set of property asset accounts with a reason and expected version. The designation does not infer cash eligibility from account names or codes. Inactive historical assets may be included deliberately. Each immutable version preserves account names, codes and active state; reports must reference the selected configuration ID.

Writes serialize on the property lock and recheck owner authorization. Canonical request replay returns the original version without duplicating activity. Changed request payloads fail; stale expected versions fail with PT409. Managers may read, while staff and unrelated users cannot read or write. Direct table access is revoked.

Validation: cash-flow-217-configuration-test.mjs applied this migration inside a rollback transaction against the restored test database. Hotel and home checks passed: canonical replay, changed replay rejection, stale review rejection, nonasset and foreign-property account rejection, foreign configuration rejection, null/empty/multidimensional array rejection, immutable update/delete history, inactive account snapshots, owner/manager/staff/unrelated role checks, direct access denial and exactly one activity record per new version. All test changes were rolled back.

This migration is not installed in production. The full cash-flow feature still requires a complete journal reader with opening balances, immutable reviewed classifications/splits, configuration provenance in report/export output, concurrency verification, UI integration, reconciliation tests and accountant acceptance. Do not present this foundation as a completed cash-flow statement.
