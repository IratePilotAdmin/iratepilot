# Configured rates and reservation quotes

Migration 154 adds hotel-entered USD nightly prices and one accommodation tax percentage per room-type rate plan. It requires the authenticated operating foundation in 146 and does not change existing migrations. It does not infer local taxes, alter OTA channel prices, contact a provider, collect payment, or hold inventory.

Owners and managers configure plans and prices. All current property staff can read configured rates, create a price quote, and convert a valid quote into a direct reservation. Private tables have no authenticated or service-role mutation grants; all changes pass through scoped RPCs. The same property transaction lock serializes pricing changes and reservation admission.

## Plan and price configuration

```text
irp_pms_pilot_save_rate_plan(
 p_tenant uuid, p_property uuid, p_request uuid,
 p_plan uuid, p_expected_version bigint, p_room_type uuid,
 p_name text, p_tax_basis_points integer, p_active boolean)

irp_pms_pilot_set_nightly_rate(
 p_tenant uuid, p_property uuid, p_request uuid,
 p_plan uuid, p_expected_version bigint,
 p_start date, p_end date, p_amount_minor bigint)
```

For a new plan, `p_plan` and `p_expected_version` are null. Existing plans require their current version. A plan cannot change room type. Names are trimmed and unique without case distinctions within the same property and room type. The same name may be used for a different room type. A property supports up to 50 plans, including inactive plans.

The hotel must explicitly supply `p_tax_basis_points`; there is no tax default. One basis point is 0.01%, so 825 means 8.25%. Supported input is 0–10000 basis points. This is a technical input range, not a tax recommendation. Only accommodation is taxable in this version. Additional fees, compound taxes, exemptions, and jurisdiction rules require separate configuration work.

Nightly amounts are nonnegative integer USD minor units. Zero is allowed for an explicitly configured complimentary night. Both date ranges and stays exclude the ending date. A price write covers 1–366 nights and must begin on or after the property's current business date. Missing dates have no inferred or fallback price.

Price or plan changes increment its version; identical values do not. Any version change invalidates all unconsumed quotes for the plan, even when the changed price date is outside a particular quoted stay. Existing reservations retain their accepted amounts. The request UUID records an immutable operation receipt; repeat the exact request after an uncertain response. A replay returns its original result without overwriting later changes. A new edit needs a new request UUID and the current version.

## Reading and quoting

```text
irp_pms_pilot_rates(p_tenant uuid, p_property uuid, p_start date, p_end date)
irp_pms_pilot_quote_rate(
 p_tenant uuid, p_property uuid, p_request uuid,
 p_plan uuid, p_arrival date, p_departure date, p_guests integer)
```

`rates` reads 1–366 nights and returns `currency`, `tax_rounding`, `start`, `end`, `plans`, and `nightly_rates`. Plan objects include `id`, `room_type_id`, `name`, `tax_basis_points`, `active`, and `version`. Nightly objects include `plan_id`, `stay_date`, and `amount_minor`.

A quote requires an active plan, 1–30 nights beginning on or after the property business date, a valid room-type guest count, and every nightly price. Quotes do not require available inventory and do not reserve it. Tax is rounded **half up for each night**, then summed:

```text
night_tax_minor = floor((night_amount_minor * tax_basis_points + 5000) / 10000)
```

For two nights at 101 cents each and 5000 basis points, each night's tax is 51 cents: accommodation 202, tax 102, total 304 cents. Rounding the entire stay would produce a different result and is not used here. Quoted total cannot exceed 999999999999 minor units.

The quote response contains flat `accommodation_minor`, `taxes_minor`, and `total_minor` fields, plus `id`, `plan_id`, `plan_version`, `room_type_id`, `arrival`, `departure`, `guests`, `tax_basis_points`, `created_at`, and `expires_at`. `nights` contains `{date, accommodation_minor, taxes_minor, total_minor}` for each night. Metadata includes `currency: USD`, `tax_rounding: half_up_per_night`, and `inventory_held: false`.

Each quote expires 15 minutes after creation. Retrying the same quote request returns the same snapshot and expiry; it does not refresh prices or extend validity. Changed inputs or another actor cannot reuse that creation request identity. Obtain a new quote with a new UUID when needed.

## Converting a quote

```text
irp_pms_pilot_book_quote(
 p_tenant uuid, p_property uuid, p_quote uuid,
 p_request uuid, p_guest_name text)
```

The request has no amount, tax, date, room-type, or guest-count overrides. It reuses the quote snapshot and atomically verifies current plan version/active state, expiry, property business date, current room-type guest limits, and current inventory. The existing direct-reservation admission function creates the reservation. Another quote or direct request cannot claim the same conversion request, and each quote can create at most one reservation.

The response includes `quote_id`, `request_id`, `reservation`, `quoted_total_minor`, `currency: USD`, `payment_state: not_recorded`, and `replayed`. The successful response is retained as an immutable receipt. Retrying the same conversion returns that receipt even after its quote expires, rates change, or the reservation is later amended/cancelled; it never creates another reservation. Read the workspace separately for the reservation's current state. A different actor or changed guest/quote cannot reuse the accepted request UUID.

Failed conversion leaves the quote unconsumed. Inventory may change before a retry. If the quote expires or the plan changes, obtain a new quote; if the original request outcome is uncertain, retry that exact request first. The reservation, direct request, quote booking receipt, and activity records commit or roll back together.

This optional quoted flow does not change the existing manual-price reservation RPC or the explicit reservation amendment process. Accepted quote prices remain historical evidence after an authorized amendment; they are not a live link that reprices a reservation.

## Verification and shutdown

The local PostgreSQL suite covers roles, cross-property scope, normalized plan uniqueness, optimistic versions, date/amount bounds, per-night tax rounding, quote expiry, stale prices, missing rates, sold-out and changed-guest-limit admission, duplicate requests, immutable receipts after amendment, injected audit rollback, and direct-write denials. It does not claim production multi-session contention testing or verify any hotel's actual tax obligations.

The migration-154 shutdown script revokes plan/price/quote/conversion writes while retaining configured reads, accepted reservations, immutable quote snapshots, and request history. It does not cancel bookings or erase evidence.
