# Whole-home Cleaning fee — migration166

Migration166 adds an optional property-wide Cleaning fee to new rate-plan quotes for whole homes. It is disabled by default. It does not configure a cleaning provider, schedule housekeeping, create deposits, charge cards, issue refunds or change existing bookings.

## Property setting contract

All public functions use the `irp_pms_pilot_` prefix and Supabase authenticated sessions. Every read and write rechecks current membership after taking tenant then property locks. Read and recovery allow owner, manager and staff; saving requires owner or manager. No browser service-role key is needed or permitted by these RPC grants.

`property_fees(p_tenant uuid,p_property uuid)` returns:

```json
{
  "tenant_id": "uuid",
  "property_id": "uuid",
  "operating_model": "whole_home",
  "version": 2,
  "currency": "USD",
  "cleaning": {
    "enabled": false,
    "amount_minor": 7500,
    "basis": "per_stay",
    "taxes": ["city", "state"]
  }
}
```

`save_property_fees(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_cleaning jsonb)` returns the same object plus `request_id` and `replayed`. `p_cleaning` has exactly the four fields above. Amount is an integer0–999999999999 USD cents; the complete quote has the same maximum total. Only `per_stay` is accepted. Categories are a unique subset of City, State and Lodging, canonicalized in that order. Unknown fields, nested scalar values, duplicate categories, fractional amounts and legacy tax applicability are rejected before storage. An enabled zero amount is valid. Disabling preserves entered amount and applicability settings.

Enabling is allowed only for a whole-home property. Disable Cleaning before changing that property to hotel; existing159 active-stay/conversion checks still apply. Canonical configuration changes or hotel/whole-home transitions increment `properties.property_fees_version`. No-op saves retain the version. A new whole-home creation first inserts a hotel then converts it through159, so its fee version is2; upgraded properties initially have version1. Always use the returned version rather than hardcoding it. The existing workspace and operating-profile property objects expose `cleaning_fee` and `property_fees_version` through their generic property projection.

## Exact recovery

Persist the request UUID, scope, expected version and exact canonical fee command before submitting. This configuration contains no guest/contact/payment credentials. Reuse the same UUID and command after an uncertain response. A changed command or different actor cannot reuse its receipt. Recovery occurs before current version/model checks, so an earlier successful enable can be recovered even after a later disable/conversion without enabling the fee again.

`property_fee_request_status(p_tenant uuid,p_property uuid,p_request uuid)` returns either exactly `{"found":false}` or:

```json
{"found":true,"action":"save_property_fees","result":{"request_id":"uuid","tenant_id":"uuid","property_id":"uuid","operating_model":"whole_home","version":3,"currency":"USD","cleaning":{"enabled":true,"amount_minor":7500,"basis":"per_stay","taxes":["city","state"]},"replayed":false}}
```

Only the original actor can recover this metadata; another actor gets the same not-found response as a missing UUID. A downgraded staff member can read their receipt but cannot execute the manager mutation. Revoked membership prevents both read and recovery. Not found does not prove a request was never submitted: keep its UUID while retrying. A recovered result is historical evidence, not current configuration; refresh `property_fees` afterward. Immutable receipts and the activity append commit atomically with the property change.

## Quote and booking behavior

The166 migration contains explicit forward definitions of the existing `quote_rate` and `book_quote` signatures. Rate-plan `charges` and both existing plan-save contracts remain unchanged: Resort and Technology stay plan-specific. Cleaning applies to every newly quoted plan for that whole-home property. Direct manual reservation entry, imports and source-owned OTA amounts are not supplemented or repriced by this setting; operators must use a rate-plan quote when they want this configured fee applied.

New quote rows pin `property_fees_version` and `operating_model_version` in addition to the existing plan version. Booking checks all applicable versions under the property lock, along with expiry, current property-local arrival, guest limits and current all-night inventory. A quote does not hold inventory. Changing a fee, toggling it, or changing the operating model requires a fresh quote. A model guest-limit revision also fences new quotes. The original quote and booking receipt are returned before present configuration/expiry checks on an exact retry.

Pre166 quotes receive fee version1 and a null model version without changing their money, nights or breakdown. An unconsumed quote remains bookable until its original expiry while the default fee configuration remains untouched and the existing plan guards pass. The first fee or operating-model transition makes it stale. Pre166 consumed bookings, legacy plan saves and nightly-rate receipts remain exactly recoverable. No migration recalculates previous quote/booking/folio payloads.

Cleaning is one fee line in `charge_breakdown.fees`:

```json
{"code":"cleaning","label":"Cleaning fee","basis":"per_stay","unit_amount_minor":7500,"quantity":1,"amount_minor":7500,"taxes":["city","state"]}
```

It contributes to `hotel_fees_minor`, never `ota_fees_minor`. Its entire amount appears in the scheduled arrival night's `nights[].fees`; later nights contain no Cleaning line. Each selected tax applies only when that named category is enabled in the chosen plan. Selecting a disabled City/State/Lodging category does not turn it on. Existing combined/legacy tax is intentionally not a Cleaning applicability option and therefore never silently taxes Cleaning. Tax percentages are entered by the operator; no jurisdiction-specific rate or legal conclusion is supplied.

For each enabled category, each night's accommodation plus all applicable Resort/Technology/Cleaning amounts form one tax base. Integer half-up rounding is applied once to that combined base: `(base_minor*basis_points+5000)/10000`. Fees are not separately rounded into tax. Example:2×$100 accommodation, $20/night Resort taxable by City/State, $5/stay untaxed Technology, $75/stay Cleaning taxable by City/State, City1.25%, State6.5%, Lodging5% yields **$354.42**, split into arrival-night$220.12 and second-night$134.30. This is a synthetic arithmetic example, not a suggested tax policy.

## Historical snapshots and service allocation

Booking stores the exact quote breakdown and fee total atomically with admission and its receipt. The existing158 charge snapshots and frozen folio opening retain these values. Property/plan edits do not change them or create reconciliation work for booked stays. Existing reservation amendment and in-house extension retain fee amounts and quantity, mark their breakdown adjusted/retained, and require pricing reconciliation; they do not recalculate Cleaning for changed stay dates. Adjusted current breakdowns retain original fee-basis dates but may omit property/model version metadata; the original quote, booking receipt and original charge snapshot preserve that provenance.

The160 automatic service allocator already copies generic quote fee arrays. Cleaning therefore reaches immutable `service_day_entries.details.fees` on the arrival service date without a service-ledger schema change. This allocation convention does not assert when a cleaning vendor performed work. All existing occupancy, frozen-basis and financial-review checks remain active.

Manual nightly allocation and162 forward corrections conserve the existing combined `hotel_fees_minor` component, but do not assign that adjustment to Resort, Technology or Cleaning. Their fee-category allocation is unknown. Do not turn an empty detail array into a zero Cleaning adjustment or claim a complete net Cleaning total across such corrections. A no-show/cancellation does not waive Cleaning or make it earned automatically. Decide charges and allocations before closing service dates: the existing skipped-zero/no-folio and unoccupied-charge limitations remain as documented in NO-SHOWS.md.

## UI and exports

Property settings owns the Cleaning control. Show that it applies once per new quoted stay, the property USD amount, and selected plan tax applicability. Keep disabled fields editable and visible. Existing pricing/folio UI should render fee lines generically and add the `cleaning` code/label to any strict frontend union. Display stored fee snapshots, not current settings, for a reservation or folio.

Original itemized quote/folio/service detail exports can include Cleaning as a separate line. Operational booked-value totals and current balance reports continue to include it in their existing hotel-fee amount. Folio activity reports contain ledger postings, not synthetic opening fee rows. Manual/forward adjustments must remain labeled hotel fees without category allocation; do not export a purported fully reconciled Cleaning subtotal. CSV safety, explicit range limits, unknown financial values and stale-result export gates remain unchanged.

## Verification and deployment

Run `scripts/verify-iratepilot-pms-cleaning-fee.mjs` with `PGLITE_DIST` set to the PGlite distribution. It upgrades a real pre166 fixture containing consumed and unconsumed quotes, checks frozen history, validates exact mixed-fee arithmetic and services across both nights, and exercises roles/revocation, strict input, model fences, stale commands, failure rollback and fee overflow. Competing requests use serialized PGlite execution; this is not a claim of multi-session stress testing.

Apply only the166 destination migration after142–147,149–156,158–165.157 belongs to the separate source outbox and is not a dependency. The generated install bundle wraps166 plus its migration receipt atomically. Read-only preflight and the transaction-only rollback proof are separate operator artifacts. Do not run a folder glob that includes shutdown SQL.

The shutdown revokes new property-fee saves, quote creation and quote booking while retaining reads, fee receipt recovery and all historical data. It deliberately does not restore older quote code that could omit configured Cleaning. There is no automatic deployment, provider activation or money movement.
