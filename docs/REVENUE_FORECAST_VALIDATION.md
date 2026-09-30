# Revenue forecast evidence evaluation

This module prepares offline, property-scoped forecast scoring. It does not train a forecast, certify accuracy, enable price writes or claim measured pilot results.

Use immutable forecasts recorded before the stay, with model version, source-data cutoff, capacity, predicted occupied rooms and the on-books count at the same cutoff. Supply authoritative property-local check-in/check-out boundaries as UTC instants. Actual occupancy must come from finalized PMS records after that stay ends and before the evaluation cutoff. Do not derive completed-stay actual occupancy from projected future inventory. Repeated imports are rejected rather than counted as independent evidence.

Reports separate model versions and lead-time horizons, room MAE/RMSE, signed bias, occupancy MAE in percentage points and error reduction relative to simply retaining the on-books count. A perfect baseline has no defined percentage improvement. Missing/incomplete actuals, future information, changed capacity and out-of-scope data are reported as excluded evidence. A positive metric in a small sample does not establish reliable accuracy; confidence intervals, minimum evidence volume, cancellation/no-show treatment, event/season coverage and operational review remain necessary.

Integration remains pending: persist the current seven-day pace forecasts, assemble completed-stay PMS actuals, and show evaluation results on the authenticated Revenue AI board. No real Red Roof forecast scores have been calculated by this change. The existing readiness gate remains blocked. The signed native ARI connection test is a separate unresolved gate.
