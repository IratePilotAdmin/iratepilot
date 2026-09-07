# Service-day forward corrections (migration162)

This module records reviewed adjustments to **reported service-date revenue** for a completed, fully allocated stay. It does not post a guest folio charge, change a balance, move cash, process a refund, or create a general-ledger journal. All amounts are exact integer USD minor units. Original nightly entries and close snapshots remain unchanged.

A manager first records the actual charge or reversal in the folio workflow. Its existing financial-change trigger queues service reconciliation. Forward review compares the current folio charge basis (or booked charges before a folio exists) with original allocations **plus every approved forward correction**, including approvals awaiting close. The reviewed difference is approved on the property's next open service date. Closing that date posts each approval exactly once in a separate immutable table. A later change requires another reviewed residual; previous approvals are never edited.

Only Checked out or Cancelled stays whose unchanged arrival-to-departure span is entirely represented by original closed nightly entries qualify. The workflow does not guess revenue for an unresolved arrival, an in-house stay, changed/unserved dates, or a partly closed stay. Partial stays continue to use the existing full-stay allocation approval, preserving every closed night. A fully closed stay must use this forward workflow; a new legacy allocation approval cannot bypass prior corrections. Exact historic receipt replay remains safe.

## Access and durability

Authenticated property staff may read previews and reports. An owner or manager is required for approval and close. Each operation locks the tenant before the property, rechecks membership, and validates tenant/property/reservation scope. Approval and close write an actor-bound canonical request receipt and audit record in the same transaction. Retry the same UUID with the same payload after an uncertain response; changed fields or another actor cannot reuse it. New requests with stale cursor/source versions, pricing hashes, preview hashes, or correction-list hashes fail before writing.

The private tables `service_forward_approvals` and `service_forward_entries` deny application writes and use immutable update/delete guards. `service_forward_entries` references an original close date and approval. The private service role is read-only. One service date, one reservation's lifetime history, and the pending property list each support at most1000 corrections. Reports support at most10000 combined original/correction entries. Exceeding a bound returns an error; rows are never silently truncated.

## RPC contract

All names below use prefix `public.irp_pms_pilot_`. Scope parameters are `p_tenant uuid` and `p_property uuid`. UUID values are JSON strings; dates are `YYYY-MM-DD`; timestamps are ISO strings. Money, source versions, and book versions are JSON numbers within the exact JavaScript integer range. Hashes are64 lowercase hexadecimal characters. The reporting cursor follows the initialized service ledger timezone; it does not change the operational civil date.

```ts
type Components = {
  accommodation_minor: number;
  taxes_minor: number;
  hotel_fees_minor: number;
  ota_fees_minor: number;
  other_revenue_minor: number;
};
type TaxBuckets = {
  legacy: number;
  city: number;
  state: number;
  lodging: number;
  unallocated: number;
};
```

Every input object must contain exactly these five keys and integer values between -999999999999 and999999999999. The tax buckets must sum exactly to `delta.taxes_minor`. Both resulting cumulative component totals and each resulting tax bucket must be nonnegative. `accommodation + hotel_fees + other_revenue` is revenue; tax and OTA fees are reported separately. Hotel fees remain a combined hotel-fee component on forward corrections; no resort/technology classification is inferred for a generic folio adjustment. Original quoted nightly fee items remain available in the original entry details.

When the financial basis has no generic folio charges/reversals, `component_totals_fixed=true`: the resulting five components must exactly equal `target_components`. With generic adjustments, the manager explicitly classifies the signed correction, preserving the exact grand total. Named tax reclassification with a zero grand-total delta is allowed only as an explicit signed bucket correction with a reason. This is a management reporting allocation, not a determination of jurisdictional tax treatment. Original itemized taxes map to their named bucket; old combined-tax quotes map to `legacy`; manually approved aggregate taxes map to `unallocated`.

### `service_forward_preview`

Arguments: scope and `p_reservation uuid`.

```ts
type ForwardPreview = {
  reservation_id: string; guest_name: string | null; status: string;
  arrival: string; departure: string;
  original_service_start: string | null; original_service_end: string | null; // exclusive
  allocated_nights: number; source_version: number;
  book_version: number | null; service_date: string | null; time_zone: string | null;
  currency: 'USD'; accounting_scope: 'service_date_allocation';
  pricing_hash: string; preview_hash: string;
  financial_basis: 'folio_charges' | 'reservation_charges';
  current_total_minor: number | null; component_totals_fixed: boolean;
  target_components: Components; original_components: Components;
  allocated_components: Components; allocated_tax_buckets: TaxBuckets;
  required_total_delta: number | null; suggested_delta: Components | null;
  reconciliation_pending: boolean; eligible: boolean; blockers: string[];
  prior_adjustments: Array<{
    adjustment_id: string; service_date: string; delta: Components;
    tax_buckets: TaxBuckets; reason: string; created_at: string; posted: boolean;
  }>;
  generated_at: string;
};
```

Blocker values: `ledger_not_initialized`, `stay_not_completed`, `stay_not_fully_allocated_with_same_dates`, `charge_data_unavailable`, `approved_correction_posting_missing`, or `tax_bucket_history_mismatch`. An unknown scoped reservation raises an error. Read previews do not mutate the queue or reserve a revision.

### `approve_service_forward`

Arguments, in order: scope, `p_reservation uuid`, `p_request uuid`, `p_expected_book_version bigint`, `p_expected_source_version bigint`, `p_expected_pricing_hash text`, `p_expected_preview_hash text`, `p_delta jsonb`, `p_tax_buckets jsonb`, `p_reason text` (trimmed length4–500).

The sum of the five signed components must exactly equal the preview's `required_total_delta`. An entirely zero correction is accepted only when it acknowledges a remaining financial reconciliation; a new redundant zero request without a queue is rejected. Meaningful zero-sum component/tax reclassification is permitted under the validation above.

Result: `{adjustment_id,reservation_id,service_date,delta,tax_buckets,total_minor,allocated_components_after,allocated_tax_buckets_after,pricing_hash,book_version,posted:false,folio_changed:false,reason,replayed}`. The durable approval's original response still says `posted:false` on replay after a later close; fetch a fresh preview or report for current posted status.

### `service_day_preview_v2`

Arguments: scope. Keeps all original160 fields including `rows`, `blockers`, `can_close`, `version`, `next_service_date`, `preview_hash`, and `generated_at`. Adds `api_version:2`, `ordinary_totals`, `correction_totals`, `pending_adjustments`, and `corrections_hash`. `totals` includes original rows plus signed corrections; its occupied nights count only original rows. Correction totals contain the five components, `revenue_minor`, `total_minor`, `occupied_nights:0`, and `correction_rows`. Before initialization, ordinary/combined totals and the close cursor remain null.

Each pending adjustment contains `{adjustment_id,reservation_id,service_date,source_version,pricing_hash,delta,tax_buckets,total_minor,reason,approved_by,approved_at,original_service_start,original_service_end}`. Display this list and its effective date before close. The signed sum may be negative. Unresolved subsequent financial changes still block close until reviewed. A pending approval with a date different from the next cursor blocks with `approved_correction_date_mismatch`.

### `close_service_day_v2`

Arguments: scope, `p_request uuid`, `p_expected_version bigint`, `p_expected_preview_hash text`, `p_expected_corrections_hash text`. Both hashes must come from the same reviewed v2 preview. Result retains160 close fields (`entry_count` remains original rows only) and adds `api_version:2`, `ordinary_entry_count`, `correction_entry_count`, `corrections_hash`, `ordinary_totals`, and `correction_totals`. `totals` is combined. Only a finished local calendar day may close. Cursor advance, original rows, forward rows, receipt and audit are atomic.

### `service_day_report_v2`

Arguments: scope, `p_start date`, `p_end date`, with an exclusive end and1–366 days. Keeps original `days`, `entries`, scope/currency/timezone/date metadata, `reconciliation_pending`, `rows_truncated:false`, and `generated_at`. Adds `api_version:2`, `forward_entries`, `ordinary_totals`, `correction_totals`, and current-property `pending_adjustments`. `totals` combines only **posted entries within the requested dates**. Current pending approvals are listed separately and excluded from period totals.

Each day retains original close identity/totals and adds `ordinary_entry_count` and `correction_entry_count`. For a v2 close, its immutable snapshot totals already include corrections. A forward entry is `{tenant_id,property_id,service_date,adjustment_id,reservation_id,...Components,total_minor,tax_buckets,details}`. Details contain `reason`, `approved_by`, `approved_at`, `source_version`, `pricing_hash`, `original_service_start`, `original_service_end`, `guest_name`, and `financial_basis`. Use `service_date` as the correction's reporting date and disclose the original span. Do not merge correction rows into occupied-night counts or display them as original nightly room charges.

## Small exact example

A two-night quote has room202, city tax103, and hotel fees3 (total308). After both nights are closed, a folio charge of15 is reviewed as room10 and city tax5. The signed delta is `{accommodation_minor:10,taxes_minor:5,hotel_fees_minor:0,ota_fees_minor:0,other_revenue_minor:0}`; tax buckets are `{legacy:0,city:5,state:0,lodging:0,unallocated:0}`. Approval makes the effective allocated amount323 and queues a15 correction for the next open day. Closing that day adds a separate15 reporting row; the original nightly308 remains unchanged. A subsequent reversal of that15 requires a new delta of room-10/city tax-5 on a later open day. A payment or refund record by itself creates no revenue delta.

## Older clients and shutdown

The original close API stays usable when no pending corrections exist, and old exact receipts replay unchanged. A fresh legacy close with pending corrections fails and its legacy preview reports `forward_adjustments_require_updated_client`. A legacy report requesting dates containing posted correction rows fails rather than omitting them; use v2. Existing periods without corrections remain readable through160's API.

The shutdown SQL revokes both versions of close and forward approval, preserving all immutable history and read APIs. It does not delete corrections, alter folios, or reinstall an older unsafe close function.

## Verification

`scripts/verify-iratepilot-pms-forward-corrections.mjs` runs40 local PostgreSQL checks through PGlite with `PGLITE_DIST` pointing to its installed distribution. It covers exact quoted pennies, fully/partly closed stays, cancelled charges, retained hotel/OTA fees, named and unallocated tax buckets, multiple pending and posted changes, negative reporting days, canonical and conflicting retries, current-day/timezone blockers, role/tenant isolation, the1000-history guard, failure rollback, legacy-client guards and shutdown preservation. Concurrent Promise submissions exercise version and duplicate behavior in PGlite's serialized engine; they are not a real multi-session lock-contention test.

The separate installation rehearsal applies the complete transaction containing162 and its migration receipt, then runs an isolated rollback-only proof based on a real calculated27360-minor-unit quote. It posts a100 reporting correction, verifies unchanged original history and exact27460 combined total, approves a later-100 residual on the current unclosed day, then rolls every synthetic operating row back. That SQL session uses an isolated synthetic membership and is not evidence of a real staff JWT or an actual hotel stay. UI and live authenticated evidence must be recorded separately.
