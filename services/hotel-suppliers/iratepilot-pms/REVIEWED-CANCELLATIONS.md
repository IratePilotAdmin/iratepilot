# Reviewed ordinary cancellation — migration167

The former `stay_action(...,'cancel',...)` acted on the newest reservation without a reviewed version. An operator could open version1, another operator amend dates/amounts to version2, and the stale page could cancel version2. Migration167 replaces that path with a scoped preview, expected source version/date, reason and immutable actor-bound receipt. It changes no financial basis or payment record.

## Eligibility and authority

Owner, manager and staff retain ordinary cancellation permission, matching the previous endpoint. This differs from manager/owner-only no-show marking. A stay must be source `direct` or `migration`, currently `Confirmed`, with both `checked_in_at` and `checked_out_at` NULL and no cancellation disposition. Source-owned OTA cancellation stays at its source. Started/completed stays, no-shows and existing cancellations are rejected by a new cancellation request.

Ordinary cancellation has no automatic date cutoff or no-show classification. An operator may cancel an elapsed never-started stay, but its current/future released commitment count is zero. The result is terminal `Cancelled` with `cancellation_disposition:null`; there is no reinstatement endpoint. Source booking/provider identity, source version/hash, guest fields, dates, physical-room reference, prices, breakdowns and all folio/service history are retained.

## Preview contract

Authenticated `irp_pms_pilot_cancellation_preview(p_tenant uuid,p_property uuid,p_reservation uuid)` returns:

```text
reservation_id, status, source, source_version, arrival, departure,
cancellation_disposition, no_show_recorded_at,
business_date, eligible, blockers, scheduled_stay_elapsed,
current_future_room_nights_released, release_start, release_end,
release_end_exclusive:true, inventory_definition,
folio_available, opening_mode, charges_minor, recorded_paid_minor, balance_minor,
financial_review_required, financial_handling:'separate_review',
service_warning, cancellation_policy, generated_at
```

Blocker codes are `source_owned_ota`, `not_confirmed`, `stay_has_started`, `already_dispositioned` and `stay_dates_unavailable`. Amounts are nullable when financial data is unavailable; never render unknown as zero. This read takes tenant/property shared locks, rechecks current membership, and does not open a folio or create a receipt. It does not expose a `can_close` or payment-ready assertion.

`business_date` is the actual civil date in the property's configured timezone, not the service-ledger cursor. For an eligible stay with future remaining dates, the release interval is `[max(arrival,business_date), departure)`, and the count is its length. Zero release returns null start/end. The count represents one reservation capacity commitment on each displayed night, not the number of physical rooms or a change to configured capacity. A3-night whole-home booking releases3 room-night commitments for its single exclusive unit.

## Commit contract

```text
irp_pms_pilot_cancel_reservation(
 p_tenant uuid, p_property uuid, p_reservation uuid, p_request uuid,
 p_expected_source_version bigint, p_expected_business_date date, p_reason text
) -> jsonb
```

Reason is trimmed,4–500 characters, with control characters rejected. Source version must be a positive safe integer. The command locks tenant, property and reservation in that order, rechecks membership, obtains one timestamp after locking, and requires the current source version and property date to match the preview. The date fence protects the reviewed release interval/count and elapsed label across midnight; it is not a cancellation eligibility cutoff.

Result:

```text
request_id, reservation_id, status:'Cancelled', cancellation_disposition:null,
recorded_at, business_date, source_version,
current_future_room_nights_released, release_start, release_end,
release_end_exclusive:true, capacity_configuration_changed:false,
housekeeping_changed:false, fees_changed:false, folio_changed:false,
financial_review_required, financial_handling:'separate_review', replayed
```

Only reservation status is changed. The immutable receipt and audit reason append in the same transaction. Existing156 occupancy triggers advance the assigned room's readiness revision so stale housekeeping commands cannot ignore the lifecycle change; its actual housekeeping status stays unchanged. No configured capacity row changes. The unchanged source version preserves established local lifecycle and OTA source ownership semantics. Versioned amendments advance the version; check-in/out/no-show changes instead invalidate cancellation through current status and timestamp/disposition checks.

## Exact recovery and civil-date reversals

`irp_pms_pilot_cancellation_request_status(p_tenant uuid,p_property uuid,p_request uuid)` returns exactly `{"found":false}` or `{"found":true,"action":"cancel_reservation","result":<original result>}`. It only returns the original actor's scoped receipt. Another actor receives the same not-found answer as a missing request. Current members can recover their own metadata; revoked membership prevents reads and mutation. Result metadata contains no guest name, cancellation reason, folio amounts or contact payload.

Persist the exact request UUID, reservation/scope IDs, expected source version/date and reason before submission. Retry the same command after uncertainty. A successful receipt is recovered before current date/version/status checks, and cannot cancel a different state again. Another actor or changed command cannot reuse it. A new UUID cannot recancel the same reservation.

Not found is not proof that an earlier request cannot complete. A `40001` response covers both source version and civil-date mismatches. Civil dates may move backward if property timezone changes or a test clock reverses; the suite explicitly demonstrates that a previously rejected date command may later match again. Do not discard a recovered uncertain command solely because a retry returned `40001`. Keep it for exact recovery unless the client has direct evidence that no earlier submission remains unresolved and a new review is appropriate. Recovered results are historical evidence; refresh workspace after recovery.

## Financial and service boundaries

No fee, waiver, refund, payment correction or deposit action occurs. Cancellation preserves immutable folio opening and entries, current reservation pricing and charge history, rate quote/booking receipts, service allocations and close records. Generic cancellation and no-show report labels are unchanged; no-shows remain an explicit subset of generic cancellations.

There is no financial preview hash because cancellation does not decide financial handling. `financial_review_required` is recomputed at commit and becomes true for unavailable amounts, nonzero charges or externally recorded net paid amount, frozen/current pricing drift, or adjusted pricing requiring reconciliation—even when totals are zero. A charge posted after preview can therefore change this flag while the same lifecycle command remains valid. All money remains untouched; show the returned warning and current folio separately.

Cancellation changes service-day preview content, so an earlier service preview hash becomes stale. It neither closes a day nor rewrites allocations. The165 warning remains applicable: decide retained/waived fees and allocation before closing service dates. No-folio or zero-charge cancelled nights are skipped, and a later fee is not covered by fully allocated-stay corrections. Unoccupied accommodation/hotel fees, including Cleaning, require explicit financial/allocation review; cancellation is not automatic revenue recognition.

## Legacy API and deployment

The167 migration contains a static forward definition of `stay_action` with only its cancel branch replaced by a clear error directing the caller to the reviewed APIs. Its check-in/out source text and behavior are retained exactly from155. Legacy cancel fails even for an already-Cancelled row, so an old client cannot interpret a general current-state response as a reviewed request receipt. Coordinate installation with the cancellation UI update.

Install only167 after the existing destination stack through166. No earlier migration file is changed. Use the separate read-only preflight and transaction-only rollback proof with the atomic install bundle;157 source-outbox SQL remains unrelated. The shutdown revokes the new cancel mutation and retains read/recovery plus the disabled legacy cancellation branch. It does not restore the unsafe old path or delete receipts.

`scripts/verify-iratepilot-pms-reviewed-cancellations.mjs` reproduces the pre167 stale-page bug, then tests its rejection, exact recovery, roles/revocation, whole-home/import identity, OTA source authority, check-in/out/no-show transitions, midnight/date reversal, financial preservation, room revision rollback, service preview invalidation and failure atomicity. PGlite competing requests are serialized checks, not multi-session contention or remote execution claims.
