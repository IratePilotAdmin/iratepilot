# Non-retrying application conflicts and operational authorization — migration168

Migration168 gives deliberate application conflicts non-retrying PostgREST error codes and adds organization locks to check-in/out and versioned housekeeping. It also adds the missing membership recheck after the stay-action property lock. All existing signatures, successful results, prices, inventory rules, receipt identities and historical snapshots remain intact.

## Pending stale-review request

The live167 cancellation review found a concrete transport interaction: a reservation amended from source version1 to2 remained Confirmed, with no cancellation receipt, while its rejected version1 request kept running. Read-only session inspection identified PostgREST14.5. The PMS deliberately raised SQLSTATE40001 for a stale review; older PostgREST versions retry that serialization-failure class. The [upstream issue3673](https://github.com/PostgREST/postgrest/issues/3673), [fix4222](https://github.com/PostgREST/postgrest/pull/4222), and [16.0 changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md#160---2026-08-07) document this behavior and its removal. The retained local version evidence is `work/postgrest-version-evidence.json` in the release workspace.

These are application conflicts, so168 uses the documented [PostgREST custom PTxyz error mapping](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes): PT409 returns HTTP409, outside SQLSTATE class40. No exception handler translates real database serialization/deadlock failures. Actual engine40001 and40P01 still propagate as before; this migration does not alter the gateway or PostgreSQL isolation policy.

The effective installed inventory is14 functions containing18 deliberate40001 raises. Static forward definitions replace those with18 PT409 raises and one additional PT412 raise from splitting the cancellation condition:

| Effective function (public names have `irp_pms_pilot_` prefix) | Prior definition | Conflict sites after168 |
|---|---|---|
| set_housekeeping |156|1 PT409|
| amend_reservation, extend_stay |158|1 PT409 each|
| configure_operating_model |159|1 PT409|
| approve_service_allocation |160|1 PT409|
| save_guest_profile, save_reservation_guest |161|1 and2 PT409|
| approve_service_forward |162|1 PT409|
| private irp_pms.service_close |162|3 PT409; both public close wrappers inherit it|
| move_room |163|2 PT409|
| mark_no_show |165|1 PT409|
| save_property_fees, book_quote |166|1 PT409 each|
| cancel_reservation |167|source version PT409, then civil date PT412|

Cancelled source-version mismatch is checked first. Its PT409 identifies a changed monotonic source version. Only if the source version matches does a changed civil business date raise PT412 (HTTP412). An exact actor/command receipt still returns before either live guard. No request is committed or receipt written by either rejected branch.

Client recovery must distinguish these cases. After retrying an uncertain cancellation command, a source-specific PT409 plus an actor-scoped absent receipt can resolve that stale version and permit a fresh review. A recovered PT412 or legacy40001 cannot establish the same fence because a civil-date comparison can change back after clock/timezone changes. Keep that unresolved request identity. Other APIs' PT409 conditions can include hashes, dates or assignments; do not treat every HTTP409 as universal permission to discard an uncertain command. Preserve each module's existing recovery rules.

This changes the error contract; the UI must understand PT409/PT412. No backend mutation is weakened to make an older UI appear successful. An already-running gateway retry may observe the replaced function on a later attempt, but ending that live request and confirming its HTTP response require gateway observation after installation; the local suite does not claim that deployment result.

## Concrete race being closed

Before168, `stay_action` checked membership once, then could wait for its property's row. Another owner request could remove that staff membership through a different property in the same organization while the first request waited. Once resumed, the SECURITY DEFINER function could update the reservation without rechecking authorization.

The156 housekeeping function already rechecked after its property lock, but could then wait for the physical room. A membership removal through a different property could commit during that later wait. The membership was organization-wide, while the two operations otherwise locked different property rows.

The147 membership-management helper acquires `FOR UPDATE` on the organization row before changing memberships. Both repaired operating functions now acquire `FOR SHARE` on that same organization before the property and retain it through subsequent room/reservation waits. They recheck membership after acquiring the property. With the expected READ COMMITTED request isolation, either the authorized operation holds the organization lock until it finishes, or an earlier membership change completes before the recheck and the operation is denied. This coordinates revocation with the operation instead of treating a pre-lock authorization result as permanent.

PostgreSQL documents that these row-lock modes conflict and that row locks normally last through the transaction; READ COMMITTED allows later commands to see newly committed changes. See [row-level locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED). The qualification matters: this change is reviewed for the ordinary READ COMMITTED RPC transaction model, not arbitrary long-lived client transactions using stronger fixed snapshots.

## Exact scope

`irp_pms_pilot_stay_action(uuid,uuid,uuid,text,uuid)` is copied forward from167. The only additions are tenant `FOR SHARE` before its property `FOR UPDATE`, and `pilot_require` immediately after the property lock. Check-in/out logic, idempotent current-state responses and167's fail-closed legacy cancellation branch remain unchanged.

`irp_pms_pilot_set_housekeeping(uuid,uuid,uuid,uuid,bigint,text)` is copied forward from156. It adds tenant `FOR SHARE` before its property lock and changes its explicit stale-room error to PT409. Its existing post-property membership check, exact actor receipt replay, room revision comparison, occupied-room readiness guard and audit append remain unchanged.

The global authorization helpers are not modified. Adding locks there would change callers that already hold property locks and could invert lock order. The authorization fix needs no new UI controls; the error-code change requires the recovery handling described above. All existing grants remain, including private helper restrictions. Owner, manager and staff retain their current operating permissions; no new role is introduced.

The migration introduces no tables, columns, data backfill or financial write. It does not activate providers, affect guest contacts or send messages. Previously stored housekeeping receipts remain exactly recoverable by their currently authorized actor. Revoked actors cannot replay operational RPCs; explicitly restoring membership restores current permission and permits historical receipt recovery without replaying its mutation.

## Validation and limits

`scripts/verify-iratepilot-pms-operational-authorization.mjs` performs27 focused checks against real SQL in local PGlite. A before/after catalog comparison verifies every PMS function body, signature, ACL and security attribute; only the15 reviewed definitions change. It verifies the18 old raise sites, their replacement counts and absence of remaining deliberate40001 guards. Dynamic cases cover stale cancellation/version/date order, no receipt on rejection, fresh exact replay after a date change, amendment/extension, guest profile, fee/quote, both service-close wrappers and housekeeping conflicts. The modeled pre16 retry classifier stops after one PT409 attempt; this is a model around real SQL, not a local PostgREST integration test. A separate manually raised40001 probe verifies unmodified error propagation; it is synthetic, not a reproduced engine serialization conflict.

The same suite checks organization-before-property ordering,147's conflicting membership lock, pre168 housekeeping receipts, check-in/out, readiness guards, cross-property committed revocation, explicit membership restoration, anonymous/nonmember denial, unchanged financial data, the167 legacy cancellation guard and shutdown behavior.

Those role tests use serialized operations. They prove that a membership removed through propertyB denies subsequent propertyA actions and that existing behavior remains intact. They do **not** reproduce a paused request in one native PostgreSQL connection while another connection commits revocation. The local machine had no native PostgreSQL server/client runtime, container runtime or equivalent available, so no real multi-session contention run is claimed. No runtime was installed for this phase.

The static lock-order review supports the intended race fix. A later native PostgreSQL acceptance test should verify both schedules explicitly:

1. Hold an organization-row membership change uncommitted; start a staff action that waits for its tenant lock; commit revocation; the staff action must then fail authorization without changing a room or reservation.
2. Hold a room/property row; let a staff action acquire its tenant lock and wait; attempt owner revocation via a different property. Revocation must wait for the operating transaction, then subsequent staff actions must fail. The housekeeping variant must wait on the room after its existing authorization recheck.

These are unexecuted multi-session acceptance scenarios, not reported test results. The transaction-only deployment proof verifies the source locks, PT409/PT412 cancellation fences, unchanged25000 opening preview, exact receipt replay, service/housekeeping conflicts and a sequential temporary-staff revocation scenario. It reuses a confirmed owner identity only in a new synthetic organization, changes/removes only that synthetic membership, and rolls back all fixture records. No auth account or existing membership changes. It has the same concurrency limitation.

## Deployment

Apply only168 after the destination stack through167. Prior migration files remain frozen. The separate install bundle records168 atomically, and read-only preflight rejects missing prerequisites or an already-repaired definition. The source-only157 migration is not a destination dependency.

The optional operational shutdown revokes the two room-operating entrypoints rather than restoring a known authorization race. It intentionally retains the non-retrying conflict definitions and the separately reviewed cancellation API; restoring40001 application errors would reintroduce the pending-request problem. Reads remain available, and check-in/out/housekeeping writes require an explicit repaired-function reenable. No history is deleted.

Deployment artifacts in the release workspace: `work/iratepilot-operational-authorization-install.sql`, `work/postgres-test-runtime/operational-authorization-preflight.sql`, `operational-authorization-rollback-test.sql`, `verify-operational-authorization-rollback.mjs` and `operational-authorization-rollback-local-result.json`. The install excludes source-only157 and records168 atomically. Root review and installation are separate from this source change.
