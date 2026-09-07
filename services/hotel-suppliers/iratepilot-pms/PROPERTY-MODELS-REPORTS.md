# Hotel and whole-home operating models — destination migration159

Migration159 adds property operating models and current operational reports. It requires the installed destination PMS stack through158; source-only157 is not a dependency. No prior migration or public operating function is replaced.

## Property management

Existing properties default to `operating_model: "hotel"`, `operating_model_version: 1` and `whole_home_max_guests: null`. Existing room types, rooms, reservations, pricing and integrations remain in place. The current workspace's `property` object exposes these fields automatically.

Public authenticated contracts:

- `operating_profile(p_tenant, p_property)` returns `{tenant_id, property_id, property, mode, version, max_guests, room_type_id, room_id}`. Owner, manager and staff can read. Unit IDs and maximum guests are null for hotels.
- `configure_operating_model(p_tenant, p_property, p_request, p_expected_version, p_mode, p_max_guests)` is owner/manager only. It returns the same profile plus `replayed`. Valid modes are `hotel` with null maximum guests, or `whole_home` with an integer maximum from1 to20.
- `create_property(p_tenant, p_request, p_name, p_time_zone, p_mode, p_max_guests)` is owner only and creates another property within the existing organization. It returns the same profile plus `replayed`. The time zone must be a PostgreSQL-supported zone. Currency remains USD. Existing organization members can access the new property through their existing roles; no user or membership is created.

All function names above have the `public.irp_pms_pilot_` prefix. Request IDs are UUIDs, expected versions are bigint, names/modes/zones are text and guest limits are integers. Create and configure receipts share a tenant/request identity and require the same actor and command on replay. Replaying returns the original result before stale-version checks. A different request with a stale version fails. Model versions increase only when the model or whole-home guest limit changes.

Creation serializes through the tenant lock and rechecks ownership. Configuration locks the tenant for share, then the property for update, and rechecks membership. This ordering also serializes membership changes and concurrent property writes. Property creation rejects a normalized duplicate name and limits the organization to100 properties.

## Exclusive whole-home inventory

A whole-home property has exactly one sellable room type and one physical unit. An empty property gains a room type named `Entire home` and a physical unit labeled `HOME`, initially Dirty. A compatible existing unit is reused, retaining its names. Capacity is not automatically opened; configure zero or one unit for the intended dates through the existing inventory editor.

A model conversion requires no Confirmed or In-house reservations. Converting to whole-home also rejects multiple room types, multiple physical units or any stored capacity above one. The system does not delete inventory, rewrite historical bookings, cancel stays or silently reduce availability to make a conversion possible. Historical Cancelled/Checked-out stays remain unchanged. Changing a whole-home guest limit without changing its model is allowed when every active reservation fits the new limit.

Database triggers enforce these rules through existing room/type/capacity RPCs: no second type/unit, capacity no greater than one, and room-type guest limits equal the configured property maximum. A deferred constraint checks the complete whole-home unit structure at commit. Existing all-night direct, OTA, import, quote-booking, amendment and extension inventory gates then reserve the exclusive unit. Overdue In-house stays retain155's all-future blocking behavior. Per-room/per-bed/shared-home sales are outside this model.

## Operational reports

`public.irp_pms_pilot_operational_report(p_tenant uuid, p_property uuid, p_start date, p_end date)` accepts1–366 days, with an exclusive end date. Owner, manager and staff can read the same scoped guests and booked charges already available in workspace and folio views. It returns a full report or an explicit limit error, never partial arrays disguised as complete exports. The limits are10,000 matching reservations,1,000 physical units, and a booked-value aggregate within the exact JSON/JavaScript integer range. Narrow the date range if a report exceeds a limit.

Response:

```text
{
  property, period: {start, end, end_exclusive: true},
  business_date, generated_at, summary,
  arrivals: Reservation[], departures: Reservation[],
  in_house: Reservation[], cancellations: Reservation[],
  housekeeping: Room[], daily_occupancy: DailyOccupancy[],
  booked_value_forecast, definitions
}
```

Reservation rows include current full reservation fields and `inventory_overdue`. Housekeeping rows include current full room fields, `room_type_name` and nullable `current_reservation_id`. Daily occupancy rows contain `stay_date`, `capacity_units`, `reserved_units`, `available_units`, `overdue_units`, `unconfigured_room_types` and nullable `occupancy_percent`.

The summary contains `arrivals`, `departures`, `in_house`, `cancelled_arrivals`, `undated_cancellations`, `clean_units`, `dirty_units`, `inspect_units`, `capacity_unit_nights`, `reserved_unit_nights`, `available_unit_nights`, `overdue_unit_nights`, `unconfigured_type_nights`, `booked_value_minor` and `booked_value_unknown_reservations`.

Reports deliberately distinguish their date bases:

- Arrivals/departures select noncancelled reservations by their scheduled dates in the chosen period, including historical checked-out stays.
- In-house and housekeeping show current state at generation, independently of the chosen period. Business date uses actual clock time in the property's time zone after locks are acquired.
- Cancellations select currently Cancelled reservations by scheduled arrival in the period. This is not a cancellation-event-date report; the separate undated-cancellation count spans the property's history.
- Occupancy shows current Confirmed/In-house commitments, using scheduled nights and unresolved overdue blocking. It is not historical actual occupancy. Missing capacity is explicit; percentages may exceed100 when overdue demand conflicts with later bookings.
- `booked_value_forecast` uses `basis: "active_stays_arriving_in_period_full_stay"`, `currency: "USD"`, current Confirmed/In-house `rows`, separate accommodation/taxes/hotel-fees/OTA-fees amounts and `total_minor`. It sums full stay charges for arrivals in the period. It does not prorate, recognize earned revenue, assert payment settlement or close a business day. Cancelled and Checked-out stays are excluded. Current fee snapshots remain intact.

The `definitions` object embeds these explanations for UI/CSV exports.160 financial service-date close is a separate subsystem and does not change these operational clock semantics.

## Verification and shutdown

Run `scripts/verify-iratepilot-pms-property-models.mjs` with `PGLITE_DIST` pointing to the local PGlite distribution. The focused suite covers roles/tenants, same-organization creation, immutable request replay and stale versions, whole-home guards across existing writers, all-source exclusive admission, historical conversion, rollback on receipt failure, overdue capacity, report date/forecast semantics, explicit report limits and midnight clock behavior.

The159 shutdown revokes creation and model configuration while retaining profile/report reads and exclusivity guards. It does not reopen capacity, delete evidence or revert populated properties to hotels.
