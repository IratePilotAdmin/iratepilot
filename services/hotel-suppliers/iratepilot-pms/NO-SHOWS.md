# Reviewed elapsed-stay no-shows (165)

This first workflow lets an owner or manager record that a direct or imported reservation never started after its **scheduled departure is on or before the current property civil date**. It supports hotels and whole homes. It does not decide a property's evening arrival cutoff or payment policy. A multi-night guest retains the existing late-arrival check-in window while `arrival <= property_date < departure`.

The stored lifecycle becomes `Cancelled` with `cancellation_disposition:'no_show'` and `no_show_recorded_at`. There is no fifth status that could bypass existing inventory, occupancy or service-allocation predicates. Both check-in and check-out timestamps must be null; a Confirmed label alone is insufficient. Ordinary cancellations cannot be retrospectively relabeled by this endpoint. OTA-owned cancellations remain at the source, and no-show marking rejects OTA reservations.

## Stable API

All calls are public Supabase RPCs using the authenticated user's bearer session. Tenant/property membership is checked again after tenant SHARE and property SHARE/UPDATE locks. Reads follow existing staff access; marking requires owner or manager.

`irp_pms_pilot_no_show_preview(p_tenant uuid,p_property uuid,p_reservation uuid)` returns:

`{reservation_id,status,source,source_version,arrival,departure,cancellation_disposition,no_show_recorded_at,business_date,eligible,blockers,folio_available,opening_mode,charges_minor,recorded_paid_minor,balance_minor,financial_review_required,financial_handling:'separate_review',service_warning,late_arrival_policy,generated_at}`.

Blocker codes are `source_owned_ota`, `not_confirmed`, `stay_has_started`, `stay_dates_unavailable`, and `late_arrival_window_open`. Money is nullable when unavailable. The financial review flag includes unavailable or nonzero charges/payments, frozen-opening discrepancies, and an explicit adjusted-pricing review flag even when the charge amount is zero. Preview reads the existing folio without opening one, recording a fee, approving an allocation or declaring the service day ready to close. Use its `source_version` and `business_date` in the reviewed command.

`irp_pms_pilot_mark_no_show(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_expected_business_date date,p_reason text)` returns:

`{request_id,reservation_id,status:'Cancelled',cancellation_disposition:'no_show',recorded_at,business_date,source_version,capacity_configuration_changed:false,current_future_inventory_released_units:0,fees_changed:false,folio_changed:false,financial_review_required,financial_handling:'separate_review',replayed}`.

Reason is trimmed,4–500 characters, without control characters. The transaction locks the reservation after tenant/property locks, captures the actual property date once, and checks both reviewed source version and business date. A changed review raises SQLSTATE `40001`. No service-book cursor is substituted for the property clock. Exact actor/command receipt replay occurs before current-state/date checks and remains valid on a later date. Another command or actor cannot reuse the request ID. A new request cannot mark the same terminal disposition again.

`irp_pms_pilot_no_show_request_status(p_tenant uuid,p_property uuid,p_request uuid)` returns `{found:true,action:'mark_no_show',result:<original metadata result>}` only for the original actor, otherwise exactly `{found:false}`. The result contains no guest data, reason or financial amounts. A downgrade to staff permits recovery of the actor's previous receipt but prevents new manager actions; revoked membership denies recovery. Not-found does not establish that an uncertain request cannot still complete. Keep the same request UUID and original scoped IDs, reviewed versions/date and reason for an exact retry. Do not store guest or folio payloads in retry storage.

`irp_pms_pilot_no_show_report(p_tenant uuid,p_property uuid,p_start date,p_end date)` covers1–366 **scheduled arrival dates**, excluding end. Return:

`{property,period:{start,end,end_exclusive:true,basis:'scheduled_arrival'},generated_at,rows,count,rows_truncated:false,definition}`.

Each row contains `{reservation_id,source,source_booking_id,status,arrival,departure,cancellation_disposition,no_show_recorded_at,recorded_by,reason,request_id}` and is sorted by scheduled arrival and reservation ID. It is not a recording-date event report. More than10,000 matching reservations rejects instead of truncating. Existing159 cancellation rows and totals **already include these no-shows**; consumers must not add the generic cancellation count and this subset count. Workspace/159 reservation JSON exposes the new columns automatically. Explicit forward copies of164 reports add the same two labels to current activity/balance rows without changing financial mathematics, period filters or exact-number limits. Activity labels describe current disposition, not disposition at original entry time.

## Preserved state and recovery limits

Marking preserves source/provider IDs, source version and payload hash; all dates, guests, price components and immutable price snapshots; check-in/out timestamps; physical-room reference and housekeeping status; capacity configuration; folio openings and entries; and closed service-day records. The existing156 status-change trigger advances the revision of an assigned room so stale housekeeping actions cannot cross the lifecycle change. No room is automatically made Dirty or Clean.

Because eligible stays have already reached scheduled departure, they have no current/future reserved nights to release. Historical current-commitment views stop counting the Cancelled row; this does not rewrite actual occupied-night history. The immutable receipt and activity identify who reviewed the disposition and when.

There is no automatic reinstatement or undo. A guest arriving after this terminal action needs a new capacity-checked booking under current dates/rates and an explicit separate review of the prior financial record. This module does not copy a payment or void prior charges.

## Financial decision must remain separate

No-show marking never creates a fee, captures or refunds money, waives an amount, reclassifies room revenue or approves a tax treatment. Current balances retain known booking/folio amounts with their existing meaning. A nonzero frozen opening still requires explicit review; marking alone does not clear every service-day blocker.

Under160, an unoccupied night cannot automatically receive accommodation or hotel-fee revenue. A fixed original component basis also cannot be silently renamed as a penalty through manual allocation. Any retained or waived charge and its service allocation require the existing explicit financial review workflow.

**Decide fees and allocations before closing the affected service dates.** Cancelled stays without a folio, or with a zero charge basis, are skipped rather than receiving zero-valued original entries. If a fee is added only after those dates close,160 does not enqueue that previously unallocated stay and162 cannot apply its fully-allocated-stay correction flow. A dedicated late-fee recognition feature is outside165; neither preview nor mark promises that such a later fee is covered.

## Verification and release artifacts

Run `PGLITE_DIST=<pglite/dist> node scripts/verify-iratepilot-pms-no-shows.mjs`.35 focused checks cover property midnight, actual late check-in, all source/role/whole-home boundaries, money/history preservation, zero-charge pricing review flags, paired-null and immutable constraints, stale/exact retries, downgrade/revocation recovery, failed activity rollback, competing terminal writes, explicit report limits, existing report labels and the documented allocation limits. PGlite exercises serialized competing requests; it does not prove multi-session contention behavior.

Apply only165 to the destination; installed142–164 files remain unchanged. `work/postgres-test-runtime/build-165-report-labels.mjs` generates explicit source SQL copies, never runtime database definitions. Source-only157 is not a prerequisite. Parent workspace artifacts: `work/iratepilot-no-shows-install.sql` and `work/postgres-test-runtime/no-shows-preflight.sql`, `no-shows-rollback-test.sql`, `verify-no-shows-rollback.mjs`, `no-shows-rollback-local-result.json`.

The rollback proof uses a new transaction-local tenant/property and one deliberately historical synthetic Confirmed stay to exercise elapsed-date eligibility. Existing confirmed owner identity is used only inside that transaction; no auth account changes or real booking backdating occurs. All fixture data rolls back. Shutdown disables only new no-show marking while preserving report distinctions and receipt recovery. It does not undo recorded no-shows.
