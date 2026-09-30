# Approval recovery candidate

`lib/revenue-approval-recovery.ts` provides a transport-independent recovery controller for the uninstalled audited approval RPC candidate. It has no active application call sites and does not enable rate writes.

The controller stores the complete reviewed command before sending, under a key scoped to actor, tenant and property. An uncertain response remains `awaiting` across reloads. A second submit is blocked until `recover()` queries the actor-scoped status RPC. A saved receipt must match request ID, property, tenant, plan, stay date and recommended amount before the controller marks the review saved. A not-found response permits retry of the identical stored command; the original request might still commit, so no replacement request ID is generated. A pending review cannot be overwritten or cleared. A confirmed saved receipt remains until explicitly acknowledged.

Transport failures, revoked access, malformed/scoped status mismatches and receipt-storage failures retain recovery state. Failure to persist the awaiting state blocks sending. Corrupted journal data blocks actions. Journal entries contain reviewed pricing inputs and notes; no guest/payment information should be put in these notes.

## Interface integration contract

- Supply storage with durable `getItem`, `setItem` and `removeItem` behavior. Treat storage exceptions as a blocked save, and bind controller lifetime to the authenticated actor/property. Construct a new controller after account or property changes.
- Supply an origin-wide cross-tab exclusive lock, such as `navigator.locks.request`. Lock acquisition failure must block the operation. Do not provide an unlocked fallback. All controllers sharing the journal must use the same lock mechanism.
- Map transport `apply(command)` to `irp_pms_pilot_apply_revenue_decision`; map `status(scope)` to `irp_pms_pilot_revenue_decision_status`. Unwrap successful RPC data and throw RPC/network errors; never convert an error to `found:false`.
- Stage the reviewed canonical server inputs and a newly created request ID once, then submit. Display unknown results as needing a saved-status check. Recovered `ready` permits an explicit same-request retry; it does not certify that an earlier HTTP request has stopped.
- Display a matching saved receipt and refresh current pricing before acknowledging it. Keep ambiguous/unsaved rejected decisions for resolution; an abandon/review replacement workflow requires separate qualification.
- UI/server rounding alignment, authenticated transport, actual browser storage/Web Locks behavior and interface behavior remain to be integrated and tested. This controller validates safe input representation and receipt identity; the SQL RPC remains responsible for authorization, current facts and canonical calculation.

Run `npx vitest run tests/revenue-approval-recovery.test.ts`. Seven tests cover a committed save followed by a lost response/reload, same-request retry after not-found, storage failures before and after sending, two controllers sharing a serialized lock, revoked access, mismatched responses and corrupted/account-scoped journals. The fake transport/lock tests do not prove PostgreSQL overlap or real browser behavior.

The actual PMS candidate remains uninstalled, the private PMS UI is not wired to this controller, Red Roof stays in shadow mode and live rate writeback stays disabled.
