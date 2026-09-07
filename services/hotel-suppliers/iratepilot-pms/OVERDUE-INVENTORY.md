# Overdue inventory and in-house extensions (155)

An unresolved in-house stay with a scheduled departure **before the property's current calendar date** consumes one room-type unit on every current and future night. Checkout releases that inventory. A permitted extension replaces the overdue hold with its newly agreed departure. A departure today retains normal same-day turnover behavior; the room must still be vacant and clean before the arriving guest can check in.

This conservative rule prevents accepting a booking on the assumption that a guest who has already overstayed will leave tomorrow. Existing future bookings may reveal an overcapacity condition after a guest becomes overdue; the system preserves those reservations, exposes the counts, and rejects additional demand. It does not cancel bookings or move guests automatically.

The same private `inventory_occupies` predicate is used by direct admission, OTA application/review, import preview and atomic commit revalidation, confirmed-stay amendment, capacity changes, extensions, and workspace capacity projections. Quote conversion delegates to direct admission. Quotes remain prices without an inventory hold. Every operational property date is captured with `clock_timestamp()` after the property lock, including direct creation and check-in/out repaired by this migration. There is no hotel-specific night-audit cutoff: after-midnight arrival rules require a separate explicit hotel policy.

## Authenticated RPC contract

`public.irp_pms_pilot_extend_stay(p_tenant uuid, p_property uuid, p_reservation uuid, p_request uuid, p_expected_version bigint, p_departure date, p_accommodation_minor bigint, p_taxes_minor bigint, p_reason text)`

Only an owner or manager of the scoped property may extend an `In house` direct or migrated reservation. OTA stays are rejected with an instruction to handle the source-owned stay through review. The RPC preserves guest details, original arrival, room type, physical assignment, source/provider identifiers, status, check-in history and existing fees. Departure must be later than both today and the previous departure, and the entire stay must remain within the existing 30-night limit. An overdue stay beyond that limit requires an operator decision; this endpoint cannot silently bypass the pilot's stay constraint.

The monetary arguments are the **new total accommodation and tax charges for the whole reservation**, in USD integer minor units, not extra-night increments. Each is nonnegative; the total including retained fees must not exceed 999999999999. Reason is trimmed and must contain 4–500 characters. No payment collection, refund, deposit settlement, rate calculation or folio posting is performed.

Response:

```json
{
  "reservation": { "id": "uuid", "source_version": 2, "departure": "2027-01-13" },
  "replayed": false,
  "previous_departure": "2027-01-11",
  "business_date": "2027-01-12",
  "overdue_resolved": true,
  "folio_opening_retained": true,
  "financial_reconciliation_required": true
}
```

`reservation` is the full reservation row. The opening folio and all entries remain unchanged. Reconciliation is flagged when a frozen opening differs from the updated reservation charges. If no folio has opened, reading it continues to show a reservation preview and the eventual first posting freezes the then-current charges.

Preserve one request UUID and its exact command until the result is known. Replaying that same actor and command returns its immutable original receipt even after later extensions or checkout. Reusing the UUID for another command or actor rejects. A fresh command must use the latest reservation `source_version`; a stale version raises SQLSTATE `40001`. The property is locked before reading/revalidating capacity and changing the stay. All remaining nights are checked against every other active reservation, excluding only the reservation's scoped UUID, and physical-room overlaps are rejected. Reservation change, receipt and activity audit commit together.

## Workspace additions

The existing `irp_pms_pilot_workspace` contract keeps its fields and adds:

- `overdue_policy: "block_future_until_resolved"`.
- Each reservation: `inventory_overdue` boolean.
- Each configured future capacity row: `reserved_units`, `available_units` (clamped at zero), and `overdue_units`.

Use these counts for the availability display instead of recomputing demand from scheduled departure alone. Missing capacity rows still mean inventory is unconfigured. A capacity row whose `reserved_units > units` identifies existing demand exceeding its limit; the clamp does not erase the underlying counts. Room rows retain `to_jsonb(room)`, including later room revision fields from 156.

## Verification and containment

`scripts/verify-iratepilot-pms-overdue.mjs` exercises 33 PostgreSQL checks with a controlled property clock: all admission paths, same-day turnover, overdue recurrence, scoped roles, explicit source ownership, extension conflicts, receipt retries, frozen financial history, rollback, and a transaction crossing midnight. The predecessor defect was reproduced using ordinary operating RPCs in a one-room hotel: a guest remained in house beyond departure, the hotel confirmed a new arrival, and that arrival's check-in failed because the physical room was still occupied.

Apply 155 after 154. It contains explicit reviewed forward `CREATE OR REPLACE` definitions and preserves existing grants; raw OTA application remains unavailable to browser/service roles. Earlier migrations stay unchanged. It is compatible with 156's room-revision trigger because an extension changes departure without changing assignment or housekeeping.

The shutdown file revokes only the extension mutation. It deliberately preserves the corrected admission predicates, truthful availability projections, checkout ability, folio history and extension receipts. Restoring the old capacity rule would reintroduce overbooking.
