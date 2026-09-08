# Dated room maintenance — migration170

Migration170 lets a hotel manager take a physical room, or a whole home's only unit, out of sale for explicit dates and release it early. Availability is calculated from the dated closures. Creating or releasing a closure never rewrites the property's configured selling ceiling, changes housekeeping, moves or evicts a stay, adjusts a price, posts a folio entry or activates an external provider.

Apply only after destination142–147,149–156,158–169. Source-only148 and157 are not dependencies. The migration is a static forward change: two empty tables, their constraints/indexes/history triggers, ten new functions and thirteen changed existing function bodies. All previous migration files remain unchanged. Existing function OIDs, signatures, ACLs, security attributes, volatility and search paths are preserved.

## Capacity and operational rules

For each room type and stay date:

`effective capacity = min(configured selling ceiling, current physical rooms − distinct closed rooms)`

If the configured ceiling is missing, effective capacity stays missing. PostgreSQL's `LEAST(NULL, value)` would incorrectly return the other argument, so the helper uses an explicit null branch. A physical room is counted closed only once even if administrative fixtures contain overlapping intervals. The public creation command rejects redundant overlapping effective intervals; adjacent intervals are allowed. The configured ceiling is never decremented and later restored.

A new closure covers 1–366 nights, starts on or after the current property business date, and ends within 366 days of that date. End dates are exclusive. Reasons must contain 4–500 trimmed characters and no control characters. Creation holds tenant SHARE, property UPDATE and room UPDATE locks, then rechecks role and the reviewed room revision/date. It rejects:

- Existing aggregate commitments above the resulting effective capacity on any affected night. Existing demand with missing configured capacity requires reconciliation before a closure can be created.
- An overlapping future physical assignment, an in-house stay whose dates overlap, an unresolved overdue occupant, or a current occupant when the closure begins today—even when the scheduled departure is today.
- A stale room revision (`PT409`) or different current business date (`PT412`). Real PostgreSQL engine errors are not rewritten.

Every admission path uses the same effective capacity: direct creation; booking a quote through its direct-admission delegate; amendment; extension; import staging and commit through the shared validator; and the signed OTA SQL receiver and manager reprocessing through the shared apply function. Quotes remain price-only and do not hold inventory. Booking rechecks every night. An existing retained OTA physical assignment is checked separately from aggregate capacity. Capacity-setting cannot bypass closures or reduce effective inventory below demand.

Physical check-in checks the complete remaining stay. A room move checks the destination through departure, including today for a due-out guest; an unresolved overdue guest has an unbounded future check. Extension checks the assigned physical room as well as aggregate capacity. Existing check-in replay and immutable move/extension/quote/amendment receipts remain ahead of the new maintenance gates.

Both creation and release advance the physical room revision once. Renaming a room now also advances that revision, invalidating an older review of its label. Room type changes are blocked at the database trigger while a current/future nonzero effective closure exists. After intervals have ended, the historical closure retains its original scoped room-type snapshot; the new foreign keys do not impose a permanent type-change prohibition. The older normal `save_room` API continues its own existing rule that an established room cannot change type.

Property model conversion is blocked while a current/future effective closure remains. A timezone change is blocked if a nonzero interval is current/future under either the old or proposed timezone, including a civil-date change that would resurrect an elapsed interval. Released zero-night records do not block unrelated configuration changes.

## Release, expiry and history

The original scheduled interval and creation metadata are immutable. One early release records who released it, when, the reason and that action's business date. Its effective end becomes `max(scheduled_start, min(scheduled_end, current_business_date))`. A future closure can therefore become a zero-night effective interval while retaining its original schedule and audit history. A partial release preserves earlier closed nights. An elapsed closure cannot be retroactively released.

A bounded closure expires automatically at its scheduled end. **That restores dated availability; it does not certify a completed repair or housekeeping readiness.** Managers must review the end date before it expires if work continues, and create another reviewed interval where necessary. Release also leaves housekeeping unchanged. The PMS never silently evicts a later overstaying guest. Current occupancy conflicts and reserved-over-effective shortfalls remain visible for staff resolution.

Closure and request tables have RLS enabled and no direct application writes. `service_role` may select them for trusted operations but cannot insert/update/delete. Creation captures the room's current scoped type. History triggers prohibit deleting or rewriting creation records and prohibit updating/deleting receipts. Public mutation entrypoints are the only application writers.

## Public contracts and recovery

All names below use the `public.irp_pms_pilot_` prefix:

| RPC | Purpose and permission |
|---|---|
| `maintenance(tenant, property, start, end)` | Any current member; complete closure/inventory review for 1–366 nights |
| `create_room_closure(tenant, property, room, request, expected_room_version, expected_business_date, start, end, reason)` | Current owner/manager; reviewed dated closure |
| `release_room_closure(tenant, property, closure, request, expected_room_version, expected_business_date, reason)` | Current owner/manager; reviewed early release |
| `maintenance_request_status(tenant, property, request)` | Any current member; original actor's receipt only |

Create and release share a property-scoped request namespace. A different actor, action or command cannot adopt an existing request. Exact replay returns the immutable original result before current room-version and date checks, but still requires current owner/manager authority. A downgraded staff member can inspect their own receipt through the status RPC but cannot issue or replay a manager mutation. Removed membership denies both operations and receipt inspection. This matches the existing room-move authority policy.

The result contains tenant/property/request/action, the closure snapshot, room id/revision, business date, `replayed`, and explicit false flags for housekeeping, financial and configured-capacity changes. The saved closure snapshot intentionally represents the original command result; clients refresh the current workspace after recovery.

The UI must retain an uncertain exact command until it reconciles its original actor receipt. A recovered PT409 from a monotonic room revision plus an absent receipt can permit fresh review. A recovered PT412 is not proof that a request can be discarded: civil dates can change. Do not convert real serialization/deadlock/connection errors into monotonic application conflicts.

The read RPC returns property timezone/business date, current role/management permission, generated timestamp, exclusive period, closure records, inventory rows and definitions. Closures are selected by their original scheduled interval so a future released record remains visible. More than 1,000 closures or 10,000 inventory rows rejects explicitly; nothing is silently truncated. Workspace maintenance intervals include nonzero effective intervals ending after today, including ones that began earlier; more than 10,000 such property intervals rejects explicitly.

Each inventory row exposes configured, physical, closed, effective, reserved, available and shortfall units. Per-type missing configured/effective/available/shortfall values remain null. Workspace retains `capacity.units` as the configured ceiling and uses effective capacity for availability. Operational daily reports add configured/physical/closed/shortfall units; `capacity_units` now means effective capacity. Corresponding summary fields are `configured_unit_nights`, `physical_unit_nights`, `closed_unit_nights`, `shortfall_unit_nights` and existing `capacity_unit_nights`. Aggregates sum known configured values while retaining unconfigured-type warnings and suppressing an incomplete occupancy percentage.

These reports apply current room/selling configuration and recorded closures to the selected dates. They do not reconstruct historical physical-room assignment or historical actual occupancy. Financial/service-day reports and immutable monetary snapshots are unchanged.

## Verification and deployment artifacts

Run with Node24 and an installed PGlite distribution, using the existing verification runtime convention:

```powershell
$env:PGLITE_DIST = 'C:/path/to/node_modules/@electric-sql/pglite/dist'
node scripts/verify-iratepilot-pms-maintenance.mjs
node scripts/verify-iratepilot-pms-maintenance-rollback.mjs
```

The main runner executes **59 named checks against the final migration** in isolated local databases: 31 core/authority/history checks, 20 admissions/report/physical-room checks, and 8 catalog/data/legacy-replay checks. Counts are grouped assertions, not 59 independent production workflows. The catalog suite seeds an existing169 property, booking, pricing receipt and frozen folio, compares every PMS table row across installation, and proves exactly thirteen existing bodies change plus ten named functions appear. Existing metadata and grants stay identical. Dynamic tests cover the full admission paths, whole-home zero capacity, overlap/missing capacity, partial release after a ceiling edit, later overstay shortfall, label/type/timezone review, role downgrade/removal, actor/scope recovery, bounds, natural expiry and historical exact receipts.

The separate deployment-proof runner mirrors the **observed** Supabase169 grant profile and validates the exact atomic install rendering, read-only preflight and transaction-only proof. Eight older public functions retain explicit `service_role` EXECUTE grants that were absent in the plain local fixture. The migration does not narrow or expand those old ACLs. The pinned inventory is in `supabase/preflights/202609070170_iratepilot_pms_room_maintenance.grants.json`; the preflight checks the actual profile, not a weaker blanket exception. The proof confirms a service role with no authorized hotel actor is denied by all eight existing member checks.

The read-only preflight checks all 26 destination receipts through169, absence of170 storage/receipt, and 21 exact effective function bodies, signatures, execution attributes and role permissions. Body hashes normalize line endings only. Any mismatch requires investigation; do not discard the check or recreate an old function to make it pass.

The rollback-only proof uses an existing confirmed test owner identity in a newly created synthetic organization. It exercises public whole-home and hotel closure/release commands, direct/quote/amend/import/receiver/reprocess rejection, physical check-in/move/extension rejection, explicit release followed by normal booking/extension, immutable request replay, report reconciliation and role downgrade/removal. Deferred constraints are forced before its success marker. Final ROLLBACK removes every temporary property, stay, closure, receipt and audit row; all preexisting PMS rows are compared unchanged locally. No auth account is created or altered remotely, no existing membership is edited, and no payment, message or provider activation occurs.

Release files:

- `supabase/migrations/202609070170_iratepilot_pms_room_maintenance.sql`: final atomic migration.
- `supabase/preflights/202609070170_iratepilot_pms_room_maintenance.sql`: read-only expected169 preflight.
- `supabase/verification/202609070170_iratepilot_pms_room_maintenance.rollback.sql`: rollback-only deployment proof.
- `scripts/verify-iratepilot-pms-maintenance*.mjs`: reproducible final-source suites and proof validator; they do not depend on an agent workspace or draft files.
- The separately rendered install bundle contains the preflight, final migration, migration receipt and PostgREST schema-cache notification in one transaction. Its release hash must match the exact reviewed source.

Local tests are serialized PGlite operations and static lock-order/catalog review. They do not reproduce two native PostgreSQL sessions contending while a request is paused. No native PostgreSQL/container runtime was available or installed. SQL receiver tests do not establish an external OTA HTTP connection or activate source delivery. Live SQL proof and browser acceptance remain release-owner steps; source preparation is not evidence that those steps happened.

## Targeted shutdown

`supabase/rollbacks/202609070170_iratepilot_pms_room_maintenance.shutdown.sql` revokes only the two new create/release mutation entrypoints from application roles. Maintenance reads and original-actor receipt inspection remain available. Existing closure records, dated capacity enforcement, automatic scheduled expiry and every other PMS operation remain in effect.

This is not a system-wide write stop and does not stop the clock on scheduled expiry. Do not drop the closure tables/helpers or restore old admission definitions: that would silently make closed inventory sellable. A broader operating shutdown requires a separately reviewed action.
