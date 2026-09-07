# Configurable hotel taxes and fees — destination migration158

Migration158 extends the installed destination PMS142–156 stack. Source-only157 is not a dependency. It adds hotel-entered City, State and Lodging taxes, retains an optional Existing combined tax, and supports fixed Resort and Technology fees per night or per stay. All money is USD integer minor units. It does not infer jurisdiction rates or capture payments.

## Manager configuration

`public.irp_pms_pilot_save_rate_plan_v2(p_tenant uuid, p_property uuid, p_request uuid, p_plan uuid, p_expected_version bigint, p_room_type uuid, p_name text, p_charges jsonb, p_active boolean)` returns the complete plan including `charges`, `version` and `replayed`. New plans use null plan/version. Existing plans require the current version. Only owners/managers can save; every public operation checks authenticated property membership and checks it again after obtaining the property lock.

The entire configuration is required, including disabled categories:

```json
{
  "taxes": {
    "legacy": {"enabled": false, "basis_points": 0},
    "city": {"enabled": true, "basis_points": 125},
    "state": {"enabled": true, "basis_points": 650},
    "lodging": {"enabled": true, "basis_points": 500}
  },
  "fees": {
    "resort": {"enabled": true, "amount_minor": 2000, "basis": "per_night", "taxes": ["city", "state"]},
    "technology": {"enabled": true, "amount_minor": 500, "basis": "per_stay", "taxes": []}
  }
}
```

Unknown keys, missing keys, nested scalar values, duplicate/unknown tax references, fractional values and invalid ranges are rejected before storage. Tax basis points are integers0–10000 per category; fee amounts are integers0–999999999999. Tax lists are canonicalized in legacy/city/state/lodging order. Disabled categories retain their entered settings but contribute zero. Each enabled tax applies to accommodation and only its selected fee bases. No per-person or percentage fee is supported.

Existing `rate_plans.charges IS NULL` means the original `tax_basis_points` combined accommodation tax. Existing rows are not converted automatically. Explicit structured conversion stores scalar tax0 and the complete configuration; a UI must copy any retained combined tax into `charges.taxes.legacy`. The old scalar save RPC rejects new edits to structured plans, but an exact old request receipt still replays before this guard. Changing settings increments the plan version; a canonical no-change save does not. The existing nightly-rate RPC continues to version the same plan.

## Pricing and immutable evidence

Existing `quote_rate` and `book_quote` signatures remain unchanged. Quotes last15minutes and do not hold inventory. Booking rechecks expiry, plan version, guest limit and every night's shared all-source inventory under the same property lock. Quote conversion, direct admission, final charge enrichment, initial snapshot and receipts commit atomically.

Each tax category is rounded half up on each night's **combined** accommodation and taxable fee base: `(base_minor * basis_points + 5000) / 10000`. A per-stay fee belongs to the arrival night exactly once. The configured total, including accommodation, taxes and hotel fees, must not exceed999999999999. For two100.00 nights and the example above, accommodation200.00 + resort40.00 + technology5.00 + city3.00 + state15.60 + lodging10.00 =273.60.

`rate_quotes` and `reservations` expose separate `hotel_fees_minor` and `charge_breakdown`. `ota_fees_minor` remains independent. Each quote includes nightly `taxes` and `fees` arrays with exact bases and charged amounts. Aggregate breakdown shape:

```json
{
  "version": 1, "mode": "configured", "currency": "USD",
  "arrival": "2026-09-10", "departure": "2026-09-12",
  "accommodation_minor": 20000, "taxes_minor": 2860,
  "hotel_fees_minor": 4500, "ota_fees_minor": 0, "total_minor": 27360,
  "taxes": [{"code": "city", "label": "City tax", "basis_points": 125, "taxable_base_minor": 24000, "amount_minor": 300}],
  "fees": [{"code": "resort", "label": "Resort fee", "basis": "per_night", "unit_amount_minor": 2000, "quantity": 2, "amount_minor": 4000, "taxes": ["city", "state"]}]
}
```

The abbreviated arrays above contain all enabled components in actual responses. New quotes on unconverted scalar plans use `mode: "legacy"`. Existing pre158 quotes retain their null breakdown and zero hotel fees, remain bookable until their original expiry/version guard, and are never repriced. Existing accepted booking receipt JSON remains unchanged on replay. Direct, migrated and OTA reservations do not acquire hotel fees from a plan automatically.

`irp_pms.reservation_charge_snapshots` records itemized reservations by scoped reservation/source version. It is private and append-only through public operations. Existing bookings with unknown historical allocation retain null breakdowns; no detail is fabricated. Clients and service roles cannot mutate snapshot, quote or folio evidence directly.

## Amendments, extensions and folios

Confirmed direct/migration amendments and manager in-house extensions retain the booked hotel fee amount. Their totals include accommodation + taxes + OTA fees + retained hotel fees. They do not reprice from current settings. Date, room-type or financial changes to an itemized booking generate an `adjusted` snapshot: taxes become the explicit aggregate `Adjusted tax total` with null percentage/base, fee lines retain their original quantity and amounts with `retained: true`, and `fee_basis_arrival` / `fee_basis_departure` identify the original fee dates. Name-only edits preserve the itemization. Earlier snapshots remain available.

Responses include `hotel_fees_retained` and `pricing_reconciliation_required`, alongside existing `folio_opening_retained` and `financial_reconciliation_required`. Staff still cannot change frozen accommodation/tax amounts. Owner/manager amendments preserve the original folio and flag reconciliation; they do not post automatic adjustments. OTA reservations remain source-owned.

`folio.opening.fees_minor` continues to mean OTA fees only. `opening.hotel_fees_minor` and `opening.charge_breakdown` are separate. The first valid posting freezes all components and the current breakdown. Reads before posting remain previews. Current totals **or snapshot differences**, including same-money date changes, flag `reservation_amounts_changed`. Folio output also includes current `charge_breakdown` and ordered `charge_history`. Additional charges, charge reversals and externally recorded payment/refund/correction entries retain152 rules; cancellation does not automatically void charges or refund money.

## Verification and shutdown

Run `scripts/verify-iratepilot-pms-tax-fees.mjs` with `PGLITE_DIST` pointing to the PGlite distribution. It covers exact category/base rounding, first-night per-stay allocation, disabled settings, permissions/scope, config validation, quote expiry/version and replay, capacity revalidation, forced snapshot failure rollback, frozen folio drift, retained-fee amendment/extension and private evidence ACLs. A separate upgrade audit exercises pre158 receipts, quotes, legacy folios and sparse OTA cancellation.

The158 shutdown SQL revokes rate editing and quote creation/conversion while retaining evidence and corrected financial formulas. It does not drop populated columns, rewrite history, or restore pre158 operations that omit hotel fees. Apply a reviewed forward repair before restoring writes.
