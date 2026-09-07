# Versioned housekeeping requests

Migration 156 closes the unversioned housekeeping endpoint and adds durable, scoped request receipts. Apply it after the destination pilot stack through migration 155. It does not modify files for previously installed migrations.

An old successful Clean request may be retried after check-in and checkout. That retry must return its original receipt without marking the newly Dirty room ready. A new readiness command must use the room's current revision and passes the current occupancy check.

## Authenticated RPC contract

`public.irp_pms_pilot_set_housekeeping(p_tenant uuid, p_property uuid, p_room uuid, p_request uuid, p_expected_version bigint, p_status text)`

Members with owner, manager, or staff roles can call this method for their property. The response is `{ "room": <full room row>, "request_id": <UUID>, "replayed": false }`. The room row includes `state_version`, an integer from 1 through 9007199254740991, and `housekeeping`, one of `Clean`, `Dirty`, or `Inspect`. The workspace's existing `rooms` array also exposes `state_version`.

Client sequence:

1. Read the current workspace and retain the selected room's `state_version`.
2. Create a request UUID for the user's intent. Submit the UUID, room, observed version and chosen status together.
3. If the response is uncertain, retry exactly that command and UUID. Reusing a request with a different actor, room, version or status is rejected.
4. Refresh the workspace after a successful response. An exact replay returns the historical room from its receipt with `replayed: true`; it is not a current room snapshot and must not overwrite freshly fetched room state.
5. A new command with an outdated expected version fails with SQLSTATE `40001` and “Room state changed; refresh before updating housekeeping”. Refresh and obtain a new deliberate intent before submitting a new UUID at the latest version. Do not silently update the version and retry a stale Clean command.

The old `irp_pms_pilot_housekeeping(uuid, uuid, uuid, text)` endpoint has all client execution privileges revoked and its body always raises. A stale client cannot bypass revision protection. The current UI must use the new method before housekeeping is enabled after deployment.

## Revision and occupancy rules

Existing and new rooms start at revision 1. Actual housekeeping or room-type changes advance it. Reservation assignment, status, stay dates, and check-in/check-out timestamp changes advance the revisions of both prior and current assigned rooms. This covers a checkout whose room was already Dirty, stay extensions, and room assignment transfers. Label-only room edits and unrelated reservation fields leave the revision unchanged. No-op readiness requests receive an immutable receipt without advancing the revision.

Revision values are opaque monotonic tokens. They are not an event count: checkout from Clean advances through both the occupancy transition and the Dirty update. Lifecycle retries that make no changes do not advance them.

Clean and Inspect are rejected whenever the room has an In house reservation, including an overdue stay. Dirty remains allowed while occupied. The property lock serializes readiness with reservation operations; the room lock and version comparison execute inside the same transaction as the update, receipt and audit activity. A failed receipt or activity insert rolls everything back. Membership is checked again after acquiring the property lock.

`irp_pms.housekeeping_requests` is private with RLS enabled. Authenticated users and service credentials cannot insert, update or delete receipts or directly update room revisions. Service credentials can read receipts for operational inspection. Current property membership is required even for replay of a previously successful request.

## Verification and shutdown

Run `scripts/verify-iratepilot-pms-housekeeping.mjs` with `PGLITE_DIST` pointing to the installed PGlite distribution. The 37 checks cover migration backfill, roles and tenant boundaries, exact receipts, stale Clean replay after checkout, occupied readiness rejection, actual migration-155 stay extensions, assignment invalidation, failed-activity rollback, permission boundaries and shutdown. Tests run only against a disposable local PostgreSQL runtime. Assignment-transfer and revision-tampering cases use explicitly privileged local fixtures; they are not public API capabilities.

`supabase/rollbacks/202609070156_iratepilot_pms_housekeeping_requests.shutdown.sql` revokes the new write endpoint while retaining room revisions, triggers and request evidence. It deliberately does not restore the unsafe legacy endpoint.
