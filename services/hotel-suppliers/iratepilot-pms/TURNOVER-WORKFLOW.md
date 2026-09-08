# Hotel and whole-home turnover — migration171

Migration171 adds assigned cleaning work, a saved checklist, manager inspection, and immutable action history for physical rooms and whole-home rentals. Actual checkout and a room move create work for the vacated room. Scheduled departures remain planning information. No existing rooms are changed and no task is backfilled when the migration installs.

Apply after the installed142–147,149–156,158–170 sequence. Source-only148 and157 are not dependencies. The new migration creates four empty operational tables and ten private/public functions, and replaces six existing function bodies with static forwards. Old migration files, function identities, permissions, pricing, nightly capacity and financial records remain intact.

## Work and readiness

A room has at most one open task. The states are queued, in progress, awaiting inspection, completed and cancelled. Task revision starts at1 and advances once per accepted action. Work generation also starts at1; returning work for cleaning or accepting a new unique vacancy/Dirty cause advances the generation and clears the current submission. Earlier answers remain in immutable events. Assignment and due-date changes retain the generation and room revision. Redundant assignment or due-date changes reject.

Manual creation requires a vacant physical room and explicitly marks it Dirty, advancing its room revision even if it was already Dirty. Actual checkout/move already advances the occupancy revision; the enqueue helper captures the final revision after any additional Clean/Inspect-to-Dirty change, without adding an unnecessary second Dirty bump. A repeated checkout or exact room-move receipt does not dispatch again. Stable provenance is the scoped reservation id for checkout and the move request id for a room move.

The hotel checklist contains linen, bathroom, surfaces, waste and supplies. Whole-home work also requires the kitchen. The task snapshots its creation operating model, timezone, room label/type and checklist. New assignment/due-date changes do not silently replace that snapshot. Staff may create unassigned/self-assigned manual work and start/submit their assigned tasks; owner/manager may work on all tasks and control assignment, due dates, inspection, return and cancellation.

Starting requires queued work, a Dirty vacant room and no active maintenance closure. Submission requires in-progress work and all saved checklist keys exactly true, with no extra keys. It changes readiness to Inspect and saves the resulting room revision. Approval requires manager authority, the submitted task, a vacant Inspect room, no active maintenance and exactly the room context that was submitted. A later rename, occupancy change, closure or release invalidates the earlier attestation; work must return for cleaning confirmation before approval. Approval changes readiness to Clean and closes the task. Cancellation records a reason, retains the generation and leaves the room Dirty, advancing its room revision even if already Dirty.

Open work blocks physical check-in and room-move destinations even if an inconsistent administrative fixture says the room is Clean. Existing Clean rooms without tasks can still receive guests. Turnover does not decrement configured selling capacity, cancel reservations, post cleaning fees, adjust a folio or change any price. Maintenance170 remains the dated sale-availability mechanism; opening/releasing/expiring a maintenance closure does not certify housekeeping readiness.

New direct Clean/Inspect commands through `set_housekeeping` reject with no side effects. The existing immutable housekeeping receipt lookup remains before that guard, so a saved old exact command still recovers its original full room result. Its returned historical readiness is not a new readiness change. New vacant Dirty commands create/reset work; occupied Dirty retains earlier behavior without dispatching vacancy work. Assigned cancellation, OTA cancellation, no-show, amendments, projected departure dates and retained physical ids on checked-out records do not count as actual vacancy events.

## Public contracts and recovery

All names below use `public.irp_pms_pilot_`:

| RPC | Purpose |
|---|---|
| `turnovers(tenant, property, start, end)` | Current-member queue, completed history, eligible assignees, projected departures and arrival demand |
| `create_turnover(tenant, property, room, request, expected_room_version, expected_business_date, due_date, assignee, reason)` | Reviewed manual preparation of a vacant room |
| `update_turnover(tenant, property, task, request, expected_task_version, expected_room_version, expected_business_date, action, details)` | Versioned task transition |
| `turnover_request_status(tenant, property, request)` | Current member's own immutable action receipt, or `found:false` |

Actions are `assign`, `set_due_date`, `start`, `submit_cleaning`, `approve_inspection`, `return_for_cleaning`, and `cancel`. Every action rejects unknown detail keys. Reasons are trimmed4–500 characters without controls. Optional notes are at most1000 characters, allowing newline/tab only among controls. Due dates must be today through366 days ahead. Approval requires both `work_reviewed:true` and `room_ready:true`.

New commands use tenant SHARE, property UPDATE, room UPDATE, then task UPDATE locking. Membership is rechecked after waits. The task's scoped immutable room id is read before its row lock to preserve room-first ordering. The private lifecycle enqueue helper relies on its authorized parent's tenant/property locks and never acquires them in reverse order. Stale room/task revisions use `PT409`; a changed civil business date uses `PT412`. Other preconditions retain `P0001`; engine serialization/deadlock errors are not rewritten.

Create/update share a request namespace. A different actor, action or normalized payload cannot adopt a used request. Exact historical replay precedes current state, revision, due-date or assignee checks but requires current action authority. A manager who becomes staff can recover their original creation, even if it assigned another subsequently removed member. A start/submission receipt can be recovered by its original current member after reassignment. Manager-only actions still require current manager authority to replay; a downgraded actor may read their own saved receipt through the status endpoint. Removed members cannot read or replay. A current list row is never proof that an uncertain command succeeded or failed.

Results contain tenant/property/request/action, an immutable task/event snapshot, room id/revision/readiness, business date, `replayed`, a room-state-change flag and explicit false financial/configured-capacity flags. Event details store the normalized action input; creation/reset events also record origin/reservation/source-version/reason/assignment/due-date context. Missing optional notes normalize to an empty string. There is no new housekeeping status RPC: saved old Clean/Inspect commands recover by exact retry through the existing housekeeping endpoint.

## Dates, bounded reporting and configuration

All new reviews use the property's current civil date, computed after acquiring operation locks. Due dates are civil dates, not implicit cleaner arrival times. Reports use a1–366 day period with exclusive end. Every open task is returned regardless of date. Terminal history is selected by its actual close timestamp interpreted in the current property timezone. Projected departures show Confirmed/In-house scheduled departures in the period plus overdue In-house stays, including overdue records before the requested start. A Confirmed future room assignment is not physical occupancy. Arrival demand retains aggregate unassigned hotel arrivals.

Reports reject more than1000 open tasks,5000 selected closed tasks,1000 eligible members,10000 relevant source reservation records,10000 combined projected-departure and grouped-arrival output records, or50000 attached task events. Nothing is silently truncated. A single task mutation also rejects once its existing event history reaches50000, preventing an unbounded response. Lifecycle checkout does not build that response or suppress required vacancy work. At these administrative limits operators need a deliberate history/read-scope workflow; a scheduler or archival subsystem is not included in171.

Workspace rooms add `open_turnover_task:{id,version,state}|null` alongside their existing maintenance intervals. Task blockers distinguish actual occupancy, active maintenance, removed assignee and changed submitted room context. These are calculated at read time. Terminal snapshots retain creation timezone/model even after later configuration changes.

Open tasks prevent a property timezone or operating-model change; name-only edits remain allowed. A narrow property trigger also preserves170's maintenance constraints for trusted direct updates: model changes reject while a current/future nonzero closure exists, and timezone changes check both old and proposed civil dates to prevent resurrecting elapsed intervals. Existing service table grants alone did not prove a usable bypass: the effective166 fee guard already denies service execution of its private normalizer. That permission is preserved. The new trigger is defense in depth for trusted owner/definer updates, not a grant expansion.

## Verification and release

The reproducible local suites use an installed PGlite distribution:

```powershell
$env:PGLITE_DIST = 'C:/path/to/node_modules/@electric-sql/pglite/dist'
node scripts/verify-iratepilot-pms-turnover.mjs
node scripts/verify-iratepilot-pms-turnover-independent.mjs
node scripts/verify-iratepilot-pms-turnover-rollback.mjs
```

There are **39 core checks plus20 independently authored checks**, each group run against the exact171 file in separate scratch databases. They include every queue/event bound, hotel/home lifecycle, legacy recovery, stale review/conflict codes, removed/downgraded roles, scope and request identity, immutable/malformed history, actual vacancy versus cancellation/amendment/no-show, maintenance/room-context changes, and zero changes to preexisting data on install. Catalog comparisons prove exactly six existing bodies change while their OIDs, owner and ACLs remain. Counts represent named groups of assertions, not independent production workflows.

The release validator mirrors the eight previously observed inherited service EXECUTE grants, checks the read-only34-definition/27-receipt preflight, renders the exact atomic install, and compares every old function's identity/owner/ACL/role matrix across installation. It executes the public transaction-only hotel/home proof, forces deferred constraints and compares all PMS, auth identity and migration-receipt rows after ROLLBACK. The proof first self-tests its rejection helper: successful SQL cannot satisfy an expected rejection, the intended error passes, and a wrong SQLSTATE propagates. The proof uses an existing confirmed test owner only within a new temporary organization; it does not create/alter an auth account or change an existing hotel or membership. A separate retained fixture execution inside scratch PGlite checks targeted shutdown behavior. No local test contacts an external provider, sends a message or charges a payment.

Native PostgreSQL contention evidence is maintained separately by the release owner: seven scenarios with six observed lock waits cover inspection/check-in, checkout/stale manual creation, Dirty/stale inspection, duplicate inspection replay, role downgrade, maintenance/submission, and no financial posting. That evidence must pin the final migration hash; single-session PGlite does not establish concurrency behavior.

Files:

- `supabase/migrations/202609070171_iratepilot_pms_turnover_workflow.sql`: atomic schema/functions.
- `supabase/preflights/202609070171_iratepilot_pms_turnover_workflow.sql` and `.grants.json`: expected effective170 source/permission profile.
- `supabase/verification/202609070171_iratepilot_pms_turnover_workflow.install.sql`: atomic migration plus receipt and schema reload; release owner performs the live install.
- `supabase/verification/202609070171_iratepilot_pms_turnover_workflow.rollback.sql`: public transaction-only proof ending ROLLBACK.
- `supabase/rollbacks/202609070171_iratepilot_pms_turnover_workflow.shutdown.sql`: targeted task-command stop.

The shutdown script revokes only manual create/update execution. Reads and original-actor receipt lookup remain available; actual checkout/move and explicit vacant Dirty still record required work. Open-task physical readiness guards and new Clean/Inspect rejection remain. It is not a complete PMS write stop, and restoring old readiness setters or dropping task/history helpers is not a valid rollback. Restoring task-command access requires a reviewed operational decision.

No scheduled cleaner dispatch, external cleaner account, reminder, SMS/email, integration with a cleaning vendor, or notification delivery is included. These are separate capabilities from the internal task workflow.
