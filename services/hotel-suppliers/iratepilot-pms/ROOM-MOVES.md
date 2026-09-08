# Same-type in-house room moves (163)

Owners and managers can move an in-house hotel stay between two physical rooms of its booked room type. The destination must be Clean and unoccupied. Whole-home properties have one exclusive unit and cannot move rooms. Cross-type upgrades, date changes, new charges, door-lock commands and guest messages are outside this endpoint.

## API

All public calls require the authenticated Supabase user's bearer session and existing tenant/property membership. No browser service key is used.

`irp_pms_pilot_move_room(p_tenant uuid, p_property uuid, p_reservation uuid, p_request uuid, p_expected_source_version bigint, p_from_room uuid, p_expected_from_room_version bigint, p_to_room uuid, p_expected_to_room_version bigint, p_reason text)`

- Owner/manager write; reason is trimmed, 4–500 characters and excludes control characters.
- Read `reservation.source_version`, current `physical_room_id`, and both `rooms[].state_version` from workspace immediately before review. Submit the explicit current origin ID as well as both room versions.
- Return: `{request_id, reservation, from_room, to_room, business_date, moved_at, source_version_retained:true, pricing_changed:false, folio_changed:false, replayed}`. Reservation and room values are the full rows at the time of this successful move. Workspace-derived values such as `inventory_overdue` are not embedded in the returned reservation row. Refresh workspace after recovery or success for current state.
- A changed source version, assignment or either room version raises SQLSTATE `40001`. Refresh and review a new move with a new request UUID after a known conflict. A duplicate request with a different actor or normalized command rejects.

`irp_pms_pilot_room_move_request_status(p_tenant uuid, p_property uuid, p_request uuid)`

- Scoped authenticated member read, including a previously authorized actor now downgraded to staff. Revoked membership cannot recover data.
- Found only for the original actor: `{found:true, action:'move_room', result:{request_id,reservation_id,from_room_id,to_room_id,source_version,moved_at}}`.
- Missing requests and requests belonging to another actor both return exactly `{found:false}`. This does not prove an uncertain request cannot still finish. Retain the same UUID and exact original command for retry; never silently generate another command after an uncertain transport outcome.
- Recovery metadata contains no guest name, financial data, room labels or reason. UI retry storage may retain the scoped IDs, versions and reason; it must not store a full reservation, guest contact or folio payload. Clear it when the result is resolved.

## Authority, transaction and occupancy

Physical room assignment is a local PMS operation for direct, imported and OTA stays. The OTA envelope never supplies a physical room. A local move preserves `source`, `source_booking_id`, `source_version`, `payload_hash`, migration provider/ID, stay dates, room type, guests, status and check-in/out timestamps, and every financial field. A later OTA change to an in-house stay still enters the existing source review workflow. The source version is not a local assignment counter.

The transaction locks tenant SHARE, property UPDATE, reservation UPDATE and both rooms in UUID order. It rechecks authorization after the tenant/property locks. The exact actor/command receipt is returned before checking today's current state, so replay remains safe after later moves or checkout. Both expected room revisions are required:156 increments each room's occupancy revision, and making the old room Dirty can increment its revision again. A move A→B→A never makes an earlier request newly valid. Version overflow or any failed receipt/activity write rolls the entire move back.

Any other In house occupant of either selected room rejects, irrespective of its dates or housekeeping flag. Confirmed destination assignments are protected across the remaining effective stay. Due-out guests still physically occupy today's room until checkout. A mover whose departure is earlier than the property business date has unresolved overdue occupancy, so any future destination assignment conflicts. An overdue move to a truly vacant room does not release or reduce overdue inventory. No nightly capacity records change.

The effective move timestamp is captured once under the property lock; the property-local business date is derived from that same timestamp. An immutable private request receipt and `room_moved` activity retain the explicit origin/destination IDs, reviewed versions, reason and timestamp.

## Financial and service-day history

No folio entries, opening balances, nightly price allocations or closed service-day records change. Property occupied-night counts are unchanged. A room move changes the reviewed snapshot for an unclosed service day, so an earlier preview cannot be closed without review again.

The160 service-day entry's physical room reference retains its existing meaning: **assignment at close**, not historical room-night attribution. If a hotel moves a guest before closing an earlier date, that unclosed entry uses the current room. Already closed entries retain their original room. This module does not claim historical room revenue or occupancy by room; immutable move timestamps provide evidence for a later dedicated room-history report.

## Installation and verification

Apply the forward163 migration to the destination PMS after existing156 housekeeping and159 property models, with the normal installed destination stack through161.163 does not depend on162 and never requires the separate source-only157 migration. Never install an entire migrations folder by glob.

Local focused test: `PGLITE_DIST=<pglite/dist> node scripts/verify-iratepilot-pms-room-moves.mjs`.35 checks cover role/property boundaries, exact and stale retries, all source types, historical financial isolation, delayed housekeeping, occupied/overdue/future assignments, failed-write rollback, room-version overflow and shutdown. Competing requests are tested against PGlite's serialized engine; real multi-session lock contention has not been simulated.

Release artifacts under the parent workspace `work/`:

- `iratepilot-room-moves-install.sql`: atomic163-only install and migration receipt.
- `postgres-test-runtime/room-moves-preflight.sql`: read-only preflight.
- `postgres-test-runtime/room-moves-rollback-test.sql`: synthetic transaction-only proof, with existing owner identity used only inside that transaction; no auth account mutation. All fixture operating data, memberships, activity and receipts roll back.
- `postgres-test-runtime/verify-room-moves-rollback.mjs` and `room-moves-rollback-local-result.json`: disposable local proof and evidence.

The shutdown SQL revokes new moves while preserving actor-only receipt recovery and all historical evidence. It does not reverse successful physical moves.
