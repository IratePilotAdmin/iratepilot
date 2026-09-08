# Remaining staff write authorization — migration169

Migration169 completes the remaining organization-lock coverage for existing-property staff writes after168. A staff operation retains a shared organization-row lock before waiting on its property or request advisory lock, then repeats its existing role check after acquiring the property lock. Membership removal or downgrade uses147's conflicting organization `FOR UPDATE` lock. Under ordinary READ COMMITTED RPC transactions, either an authorized operation finishes before revocation, or earlier committed revocation is visible when the operation rechecks permission.

No interface, error code, price, inventory admission rule, stored receipt or historical snapshot changes. This migration contains only15 explicit forward function definitions. It introduces no tables, grants, data backfill, service activation or financial entries. Installed142–168 files remain unchanged; source-only157 is not a destination dependency.

## Exact function coverage

Public names below have the `irp_pms_pilot_` prefix. “Manager” means owner or manager. Existing staff permission for direct creation and eligible amendment is retained.

| Function | Effective prior source | Existing permission | Lock/recheck delta |
|---|---|---|---|
| configure_property |146|Manager|Tenant SHARE; new explicit property UPDATE lock; same-role recheck|
| save_room_type, save_room |146|Manager|Tenant SHARE before property UPDATE; same-role recheck|
| set_capacity |155|Manager|Tenant SHARE before property UPDATE; same-role recheck|
| create_reservation |155|Any member|Tenant SHARE before property UPDATE; same-role recheck|
| stage_import |151|Manager|Tenant SHARE before its existing request advisory lock and property SHARE; same-role recheck|
| commit_import, discard_import |151|Manager|Tenant SHARE before property UPDATE; same-role recheck|
| save_rate_plan, save_rate_plan_v2 |158|Manager|Tenant SHARE; existing post-property recheck retained|
| set_nightly_rate |154|Manager|Tenant SHARE before property UPDATE; same-role recheck|
| post_folio |158|Manager|Tenant SHARE; existing post-property recheck retained|
| amend_reservation |168|Any member; manager for frozen-folio amount changes|Tenant SHARE; existing member-role reassignment retained|
| extend_stay |168|Manager|Tenant SHARE; existing post-property checks retained|
| private irp_pms.reprocess_reservation |145|Manager|Tenant SHARE before property UPDATE and request advisory lock; same can_manage check after its property FOUND guard|

The private review function is directly executable by `authenticated`, so fixing only150's public wrapper would leave a bypass.169 repairs the private function itself. The150 public `reprocess` wrapper remains SECURITY INVOKER and inherits the repaired delegate. Its existing response includes the business date; the private response and immutable review receipt remain unchanged. The private membership error retains its original P0001/message, while pilot_require-based denials retain42501.

The shared global authorization helpers are unchanged. Some existing callers already hold property locks, so adding tenant locks inside a helper could reverse established tenant-to-property ordering. Each repaired entrypoint acquires its tenant lock explicitly. Where a post-property check already existed,169 retains it instead of changing other logic. The existing duplicate manager check in extend_stay is also retained to keep this patch narrowly auditable.

## Preserved operating and financial behavior

Owner and manager configuration still enforces physical room counts, whole-home exclusivity, guest limits and all-night availability. Stage/commit/discard retain the original normalized import validation, sensitive-field rejection, original preview, atomic capacity revalidation and action receipts. No imported amount is recorded as a payment.

Rate-plan and nightly-pricing request replay stays ahead of current version checks. The166 Cleaning/158 Resort and Technology fee snapshots and tax behavior are unchanged. This patch does not modify quote construction or enable any fee.

Folio posting retains its immutable opening, integer bounds, scoped reversals, externally recorded payment/refund distinction, payment-record correction semantics and actor/reference idempotency. A downgraded manager cannot use the manager-only posting function to replay an old financial command. Explicitly restoring manager access permits historical receipt recovery without posting it again.

Amendment/extension keep168's PT409 source-version conflict behavior. Cancellation's PT409/PT412 distinction and all other168 conflict literals are untouched. Their current source-authority, lifecycle, inventory, physical-room and retained-folio reconciliation rules stay intact. Reprocess still applies only its allowed reviewed source event with source-head and capacity checks; it gains no force-apply or source replacement path.

Existing receipt policies are preserved, including older functions whose exact retry returns current reservation or batch state. This migration does not retrofit a new receipt policy into those contracts. Fully revoked users are denied before any repaired write or retry can reach stored data.

## Evidence and limits

`scripts/verify-iratepilot-pms-staff-write-authorization.mjs` passes16 grouped checks. It loads the destination stack through168, creates ordinary operating/import/rate/folio/review fixtures, and compares all PMS table contents before and after169. A complete function-catalog comparison verifies only15 bodies change and that all other function bodies, argument types/names, ACLs, security attributes and volatility remain identical. It also verifies168's18 PT409 and one PT412 literals remain.

Dynamic checks cover all15 direct routes for current staff, manager downgrade, complete removal, unrelated accounts, anonymous and service roles; downgrade/removal occurs through another property in the same organization. Existing manager receipts replay after installation and after explicit membership restoration without duplicate financial or import writes. The public invoker review wrapper is exercised. Configuration, whole-home capacity, invalid import fields, all-night inventory, frozen folio amounts and stale amendment/extension guards remain covered.

These tests are serialized PGlite operations plus static lock-order review. They do not reproduce two native PostgreSQL connections contending while one request is paused. No native PostgreSQL/container runtime was available, and no runtime was installed. The intended serialization relies on ordinary READ COMMITTED RPC transactions and PostgreSQL's documented conflicting row locks; arbitrary long-lived transactions with a fixed snapshot are outside this verification. See [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) and [READ COMMITTED](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED).

The transaction-only deployment proof reuses an existing confirmed owner identity in a new synthetic organization. It creates configuration, rate/import receipts and one synthetic extra folio charge, verifies the original frozen opening, then changes only that temporary membership to staff and removes it. All13 manager-only operations reject staff, and all15 reject the revoked actor. Staff creation/amendment remain allowed before removal. Deferred constraints are forced before the success marker, and the final ROLLBACK removes every fixture. No real auth account, existing membership, hotel configuration, money, message or provider connection changes.

## Install and targeted shutdown

Apply169 only after destination168. The release workspace contains:

- `work/iratepilot-staff-write-authorization-install.sql`: atomic migration and receipt, followed by schema-cache reload notification.
- `work/postgres-test-runtime/staff-write-authorization-preflight.sql`: read-only prerequisite and expected-definition checks.
- `staff-write-authorization-rollback-test.sql`: transaction-only proof with forced deferred constraints and final rollback.
- `verify-staff-write-authorization-rollback.mjs` and `staff-write-authorization-rollback-local-result.json`: local proof validation and retained zero-leak result.

The optional169 shutdown revokes direct execution of these15 repaired functions. It retains their corrected definitions and all data. Revoking private reprocess also stops150's invoker wrapper. This is **not a system-wide write stop**: already-protected SECURITY DEFINER parents, including book_quote, can still call create_reservation as the function owner; signed OTA delivery, lifecycle operations, guest/contact updates and service-ledger routes also retain their separate existing authority. Use an explicit broader operational shutdown when that is the intended action. Never restore the former authorization race or168's retry-class application errors as a rollback shortcut.

No UI source changes are needed for169. Existing permissions and successful responses stay the same. Source preparation and local checks do not install this migration remotely; the release owner reviews and applies the separate bundle.
