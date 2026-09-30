# Revenue forecast evidence evaluation

This module prepares offline, property-scoped forecast scoring. It does not train a forecast, certify accuracy, enable price writes or claim measured pilot results.

Use immutable forecasts recorded before the stay, with model version, source-data cutoff, capacity, predicted occupied rooms and the on-books count at the same cutoff. Supply authoritative property-local check-in/check-out boundaries as UTC instants. Actual occupancy must come from finalized PMS records after that stay ends and before the evaluation cutoff. Do not derive completed-stay actual occupancy from projected future inventory. Repeated imports are rejected rather than counted as independent evidence.

Reports separate model versions and lead-time horizons, room MAE/RMSE, signed bias, occupancy MAE in percentage points and error reduction relative to simply retaining the on-books count. A perfect baseline has no defined percentage improvement. Missing/incomplete actuals, future information, changed capacity and out-of-scope data are reported as excluded evidence. A positive metric in a small sample does not establish reliable accuracy; confidence intervals, minimum evidence volume, cancellation/no-show treatment, event/season coverage and operational review remain necessary.

Integration remains pending: obtain sufficient history for seven-day pace predictions, assemble completed-stay PMS actuals, and show evaluation results on the authenticated Revenue AI board. No real Red Roof forecast scores have been calculated by this change. The existing readiness gate remains blocked. The signed native ARI connection test is a separate unresolved gate.

## Prospective PMS recording

Applied `pms-migrations/20260930133338_revenue_forecast_recording.sql` to the actual PMS project `eiqmdldjnedqgbtoozqa`. This folder is deliberately outside the OTA `supabase/migrations` chain. Do not apply this migration to the OTA project.

The existing six-hour snapshot cron now records private forecasts after capturing source data. Recording uses the current issue time, fresh source snapshots (at most seven hours old), the next 30 property-local calendar nights, positive known capacity and valid on-books counts. Rerunning against the same source snapshot creates no duplicate evidence. Old snapshots are never relabeled as historical issued forecasts. Calendar-night boundaries are not guest arrival/departure appointment times; completed-stay evaluation must use a matching operational-night definition.

Two models are stored independently: `on-books-v1` retains current booked rooms as a comparison forecast; `seven-day-pace-v1` projects positive seven-day pickup, capped at capacity. The pace model requires a matching currency, source basis and capacity baseline within three hours of seven days before the current snapshot. Without that baseline it stores `insufficient_history` and a null prediction, which must not be scored as a forecast. No confidence certification is supplied.

Initial live recording produced 90 on-books baseline forecasts and 90 insufficient-history pace records covering October 1–30, 2026, across three room types with positive capacity. The database repeat capture inserted zero duplicates. Anonymous, authenticated and service-role clients cannot read this table or execute its recording function; it is an internal cron operation. RLS without a policy is intentional for this internal table.

The manager-only database evidence reader and finalized-close adapter are implemented below. The authenticated board display was published in PMS version 199. No real pilot accuracy score has been calculated. Live rate writeback remains disabled.


## Finalized occupancy connection

Applied PMS-only migration `20260930133921_revenue_forecast_evidence_reader.sql`. Authenticated owners/managers can call `irp_pms_pilot_forecast_evidence` with `p_tenant`, `p_property`, `p_from`, and `p_to`. It reuses PMS property membership authorization and restricts access to this private pilot. Date ranges are at most 31 calendar nights, and more than 1000 forecasts raises an error rather than silently truncating. It returns the latest issued forecast per room type, stay date and model; reports based on this selection are not all historical forecast vintages.

The reader projects closed-day occupancy fields without guest names, reservation IDs or financial amounts. It includes the captured inventory configuration and physical-room identities needed to reject double counting. Direct table permissions stay revoked. Anonymous and service-role execution are revoked. The security advisor flags authenticated SECURITY DEFINER execution; this is intentional for this membership-guarded API with fixed search_path, not unrestricted table access. Missing identity and a signed-in nonmember were both denied in database verification.

`evaluatePmsForecastEvidence` connects the reader payload to offline scoring. Only complete, untruncated service-day closes count. It verifies matching service dates, local calendar-midnight boundaries (including DST), room-type capacity and total overnight counts. Same-day use and unoccupied reservations do not add overnight occupancy. Duplicate physical rooms, unresolved blockers, inconsistent totals, missing capacity, changed capacity and closes before the night ends or after the evaluation cutoff are excluded. Forward financial corrections do not add occupied nights in the existing PMS service-day v2 implementation.

Twelve unit tests and focused TypeScript checks passed. An additional temporary integration check passed using the actual database reader response: 180 forecast records, no closed days, 90 pending-history records, zero eligible accuracy samples, and 90 baseline forecasts excluded for missing actuals. No synthetic closed days were inserted into the PMS and no service ledger was initialized or closed by this work.

The reader and adapter are wired into the private PMS Revenue AI board in version 199 (source commit 07f4445fb10c49b49411d4b1bf96afdcc921fcc0). The panel offers upcoming or previous 30-night review, explicit missing-history/actuals states, five-minute reader freshness checks and no writeback action. The same evaluator and adapter sources remain available for review in draft PR #322. Live readiness and signed native ARI validation remain pending; no pricing certification or writeback is enabled.


## Forecast health and shared exceptions

Applied PMS-only migration `20260930135432_revenue_forecast_health.sql`. A separate 15-minute cron monitor detects missing/stale PMS captures (seven-hour limit), incomplete current-capture forecast recording and pace records awaiting comparable seven-day history. It observes the existing shared supervisor issue store and is also invoked during a manager's queue refresh. The monitor only enrolls the private Red Roof pilot, owns four explicit issue keys and never retires another subsystem's exceptions. Anonymous, authenticated and service-role callers cannot execute it directly.

Missing recording coverage is critical. Missing seven-day history is attention-level and never means zero pickup or a valid prediction. The same unresolved condition retains acknowledgment and assignment; resolution retires it, and recurrence reopens it through the existing revision/fingerprint workflow. Source staleness uses the existing capture-stale issue identity to avoid duplicate alerts. Acknowledgment cannot certify forecasts or permit price writes.

Database verification passed for normal live conditions, missing recorder coverage, stale source detection, resolved-condition retirement and stable acknowledgment/revision retention. The failure fixtures ran in a transaction that was rolled back; the actual 180 forecasts remained intact and no fabricated failure stayed active. The manager queue returned the new history exception. Security advisors reported no finding for the new internal observer.

The monitor is configured and its immediate/manual execution was verified; a scheduled invocation has not yet been observed. No email, push notification or external alert is sent by this monitor. Live pricing, signed ARI validation and a 500-property load test remain separate release gates.
