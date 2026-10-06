# Isolated PostgreSQL pricing qualification — September 30, 2026

## Environment and cleanup

The user selected iRatePilot Group, LLC. Supabase quoted $0.01344/hour and its cost-confirmation tool returned the confirmation used for creation. Temporary branch `revenue-atomic-qualification-20260930` was created at 2026-09-30T20:42:50.651567Z from PMS `eiqmdldjnedqgbtoozqa`, with `with_data=false`. Its separate reference was `uedwnomelmynxmyymlcq`; neither the PMS nor OTA live reference was targeted for test writes.

The branch reported healthy but had **zero PMS tables/functions and an empty migration history**. Automatic migration replay therefore did not reproduce the parent. No claim of full PMS parity is made. Only the previously captured 18-table pricing dependency slice was installed, together with four current functions read from the actual PMS catalog: `pilot_require`, `inventory_occupies`, `maintenance_capacity` and `irp_pms_pilot_set_nightly_rate`. The latest preflight and audited approval candidate were then installed. Supabase Auth was native to the branch; test identity claims were set through SQL, not through an authenticated browser or HTTP JWT flow.

The branch ran PostgreSQL **17.11**, versus the previously observed live PMS **17.6**. Direct table/private-function access was revoked from PUBLIC, anon and authenticated for isolation. Synthetic local UUIDs, one property, one plan, ten rooms and eight reservations were used; no production records, credentials or guest data were copied. The tested stay date was October 1, 2026 in America/Chicago.

After checks, the development branch was deleted successfully. A subsequent branch listing contained only the default main branch. No test branch was merged. The actual PMS audited approval candidate remains uninstalled and live rate writeback remains disabled.

## Confirmed server results

| Scenario | Result |
| --- | --- |
| Same request submitted through two calls | Backend PIDs 5584 and 5586 returned the same receipt, first `replayed=false`, second `replayed=true`; saved at 20:46:15.838626Z |
| State after replay | Exactly one decision and one rate action; rate 16100 minor units; plan version 2 |
| Forced audit failure | A temporary NOT VALID `CHECK(false)` on the decision table rejected the next audit with SQLSTATE 23514 |
| Rollback after audit failure | Counts remained one decision/one action, rate 16100 and version 2; forced constraint removed afterward |
| Two different request IDs using version 2 and rate 16100 | One saved rate 18515 at 20:47:33.905783Z; the other failed with 40001, pricing facts changed |
| State after those requests | Exactly two total decisions and two rate actions; rate 18515; plan version 3 |
| Capacity trial | Preflight on PID 5627 matched ten units/eight reserved and returned write_authorized=false; update on PID 5632 later reported nine units |
| Replay after membership demotion | Setting synthetic manager membership to staff caused the original receipt request to fail with 42501 |
| Changed payload under a saved request ID | Failed with 23505 after manager access was restored in that request |
| Final readback | Two decisions, two actions, rate 18515, plan version 3, capacity nine |

The SQL tool returned different backend PIDs, confirming separate server sessions for the successful calls. Calls were issued concurrently from the client and one save/preflight was held with `pg_sleep`. However, the third-session observer returned **no matching active sessions or blocking evidence**. The connector's dispatch timing and actual transaction overlap were not established. These outcomes confirm server replay, stale-fact rejection and rollback behavior, **not a proven concurrent lock race**.

## Open qualification

- Establish actual overlap with a direct independent-session runner or isolated server workers, record waiting/blocking PIDs, and qualify rate, reservation, capacity and membership writers while approval holds locks.
- Test authorization demotion while approval is waiting, rather than only after demotion commits.
- Restore the complete PMS schema/functions/grants/RLS into a test environment and compare metadata. The development-branch empty replay needs investigation before relying on it for full-system tests.
- Verify authenticated HTTP authorization, browser timeout recovery and client/SQL rounding alignment.
- Keep signed deployed OTA delivery, prospective forecast accuracy, phone/portfolio tests and coordinated restore/live activation as separate gates.

