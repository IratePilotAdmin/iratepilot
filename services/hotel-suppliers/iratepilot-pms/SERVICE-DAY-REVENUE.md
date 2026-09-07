# Nightly revenue allocation and service-day close — migration160

This is a separate operational revenue allocation ledger for hotels and whole-home properties. It never posts a guest folio charge, changes a guest balance, captures money, or advances the admission/check-in clock. It is not a general ledger, trial balance, tax filing, payment settlement, or a configurable hotel night-audit cutoff.

The existing folio preserves full-stay charges. This ledger assigns those charges to service dates exactly once. `revenue_minor` includes accommodation, hotel fees, and explicitly classified other revenue. Tax and OTA-fee amounts remain separate; the system does not assume that OTA fees are hotel revenue. Quotes supply exact saved nightly rounding and fee timing. Current settings never reprice closed history.

## Initialization and access

All RPCs are in `public` with the `irp_pms_pilot_` prefix. All take the tenant/property UUID scope shown below. Staff may read; owners/managers may approve allocations and close; only owners may initialize.

`start_service_ledger(p_tenant,p_property,p_request,p_first_service_date,p_reason)` requires a reason of4–500 trimmed characters and an explicit first date between today minus31days and today in the property time zone. It returns `initialized`, `first_service_date`, `next_service_date`, `time_zone`, `version`, `historical_backfill:false`, and `replayed`. Initialization creates no revenue entries and never creates entries before that explicitly selected date. Earlier nights on existing stays remain outside this ledger period.

The separate service-day cursor can lag the civil date. Only a finished date (`next_service_date < civil_date`) can close. Changing the property time zone after initialization blocks new closes until the original zone is restored or a reviewed forward migration is supplied; historical dates retain their original zone. This is intentional protection against relabeling history.

Every public route locks tenant then property and rechecks membership. Tenant locks serialize membership removal; property locks serialize operational changes with preview/close. Read operations use shared locks; mutations use the property update lock. Authenticated/service clients cannot directly change the private ledger tables.

## Preview and close

`service_day_preview(p_tenant,p_property)` returns:

```text
initialized, first_service_date, next_service_date, version, time_zone,
civil_date, currency: USD, accounting_scope: service_date_allocation,
operating_date_unchanged: true, can_close, preview_hash, generated_at,
blockers: [{code, reservation_id?}], candidate_count, rows_truncated: false,
rows: [{reservation_id, source, status, guest_name, source_version,
        room_type_id, physical_room_id, occupied_night, pricing_hash,
        financial_basis, allocation_source, blocker, allocation}],
totals: {accommodation_minor, taxes_minor, hotel_fees_minor, ota_fees_minor,
         other_revenue_minor, revenue_minor, total_minor, occupied_nights, complete}
```

An uninitialized response has `initialized:false`, `can_close:false`, null totals/hash and a `ledger_not_initialized` blocker. Partial preview totals have `complete:false` and must not be presented as a completed revenue report.

`close_service_day(p_tenant,p_property,p_request,p_expected_version,p_expected_preview_hash)` revalidates the complete preview under the property lock. The version and lowercase64-character SHA256 hash must match. The hash includes relevant status, pricing, allocation and reconciliation state, but excludes `generated_at`. Stale data raises SQLSTATE40001. A close with blockers fails. A successful close inserts the immutable snapshot and all service entries, advances the cursor by one calendar day and records its activity/receipt in one transaction.

The receipt returns `close_id`, `service_date`, `closed_at`, `next_service_date`, `version`, `totals`, `entry_count`, `folio_changed:false`, `currency`, `accounting_scope`, `replayed`. Preserve the request UUID and exact arguments until its outcome is known. Same actor/command replay returns the original immutable receipt even after later closes; different actor/command reuse fails. Initialization, approvals and closes share the request namespace.

## Allocation sources and unresolved stays

Automatic `allocation_source:quote` is allowed only if the immutable accepted quote's dates, room type, amounts and charge breakdown still match the reservation, and any frozen folio agrees. Its nightly amounts are copied exactly, including separate rounded tax components and first-night per-stay fees. Pre158 quotes retain their explicit legacy aggregate tax. No split is guessed from a full-stay total.

`Confirmed` arrivals on or before the service date block until staff resolve their lifecycle. There is no automatic no-show status or no-show fee. An in-house stay beyond its priced departure blocks until it is extended and its new allocation reviewed. Actual room nights require an assigned room, a recorded check-in on/before the service date, and either an in-house stay or checkout on a later local calendar date.

Cancelled stays with no posted folio or zero net charges contribute no revenue entries. Other cancelled or nonoccupied nights require explicit manager allocation; accommodation and hotel-fee revenue must be zero for those nights. A documented cancellation/other charge can be classified as other revenue only through reviewed financial allocation, not inferred automatically. Early checkout or late arrival therefore cannot silently turn unoccupied booked nights into occupied room revenue.

## Manager allocation and reconciliation

`service_allocation(p_tenant,p_property,p_reservation)` returns the current `reservation`, `pricing_hash`, `financial_basis` (`folio_charges` or `reservation_charges`), `total_minor`, `component_totals`, `component_totals_fixed`, `allocation_source`, `lines`, `reason`, `has_folio`, and immutable `closed_lines`. Regular lines use `date`; closed entries use `service_date`. A line contains the five amount components, computed `total_minor`, `tax_allocation`, `taxes`, and `fees`.

`approve_service_allocation(p_tenant,p_property,p_reservation,p_request,p_expected_source_version,p_expected_pricing_hash,p_lines,p_reason)` is a manager reconciliation decision. Supply every date of the complete current stay, ordered and contiguous, with exactly these fields:

```json
[{"date":"2027-01-10","accommodation_minor":10000,"taxes_minor":1000,
  "hotel_fees_minor":2000,"ota_fees_minor":0,"other_revenue_minor":0}]
```

The array must cover1–30nights; no unknown keys, duplicate dates, fractional or negative amounts are accepted. Each amount and the whole-stay total are at most999999999999minor units. The total must equal the current folio charge total if a folio exists, otherwise the reservation total. Payments, refunds and payment-record corrections do not change this charge basis.

When `component_totals_fixed:true`, every known component total must also match. A manager cannot move known tax into revenue just by preserving the grand total. Generic folio charges/reversals do not identify a tax/revenue component; when these exist, `component_totals_fixed:false`, and approval explicitly classifies the full adjusted folio charge total. The UI must show this responsibility and require a meaningful reason. This does not calculate legal tax treatment. Manual lines are labeled `tax_allocation:manager_aggregate` and do not fabricate City/State/Lodging itemization.

The pricing hash covers current stay/pricing, frozen opening and financial adjustments; a changed fingerprint/source version rejects approval. Accepted approvals and receipts are immutable. Approval increments the service-book version, invalidating older previews. Reapproving must preserve every component of every already closed date exactly.

Pricing changes or new folio charges/reversals after a close create a scoped reconciliation flag. Closed reports remain unchanged. An approved current allocation that preserves closed amounts may allocate a corrected remainder to still-open dates and clear the flag. Changes requiring different already closed totals, including changes to a fully closed stay, require a separate forward-adjustment workflow; this release refuses to rewrite history. External payment/refund records do not create false revenue changes.

## Closed reports and limits

`service_day_report(p_tenant,p_property,p_start,p_end)` reads1–366days with an exclusive end. It returns `days` (close date/id/actor/time, totals and entry count), immutable `entries`, aggregate `totals`, `first_service_date`, `next_service_date`, `time_zone`, `reconciliation_pending`, `generated_at`, `end_exclusive:true` and `rows_truncated:false`.

Entry details retain the original quote's nightly tax/fee arrays or the explicit manager aggregate classification, plus the guest/source/status snapshot. Current operational reservations are not substituted into closed reports. Missing days are unclosed/outside the initialized period, not silently zero-revenue closes. `reconciliation_pending` is a current property-wide warning even when reading an older period.

Preview supports at most1000candidate stays and1000pending reconciliations. Reports support at most10000entry rows,1000pending reconciliations and aggregate amounts within the exact JSON safe-integer limit9007199254740991. Exceeding a limit raises an explicit error; no output is truncated. All displayed money is integer USD minor units.

## Validation and shutdown

Run `scripts/verify-iratepilot-pms-service-days.mjs` with `PGLITE_DIST` set. The38focused checks cover exact quote rounding/full totals, manual component preservation, idempotent/cross-action receipts, roles/tenant scope, stale version/hash, competing queued requests, audit rollback, lifecycle/overdue/cancellation handling, post-close reconciliation, whole-home operation, international offsets, DST, immutable reports, and shutdown. The queued-request test uses one PGlite connection; it does not claim production multi-session load or contention testing.

The160 shutdown script revokes initialization, allocation approval and close mutations while retaining read access, reconciliation tracking, guest folios and all historical evidence. No existing migration or operating RPC is replaced.
