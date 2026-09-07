# Delivery pause and resume

Implemented locally, not applied to Supabase. Migration 141 follows 139 and 140. No worker was deployed and no live integration was enabled.

The service-role RPC irp_pms_set_delivery(property UUID, request UUID, expected current boolean, desired boolean, review reference) changes only delivery_enabled. Capture remains enabled and booking edits accumulate in the outbox. Resume requires a previously released baseline and active sandbox capture. References must contain 8–200 characters after trimming.

Operator sequence:
1. Read the current connection state and retain a new request UUID and incident/review reference.
2. Pause using expected=true, desired=false. Stop the worker and reconcile already leased or sent HTTP requests. The database gate prevents new claims but cannot recall an in-flight request.
3. Inspect pending/retry/review events and receiver acknowledgements. Resolve the underlying incident; do not edit immutable event payloads or mark deliveries successful without evidence.
4. Resume using a NEW request UUID, expected=false, desired=true, and the reviewed incident reference. Restart the worker and verify acknowledgements and version order.
5. For uncertain RPC responses, repeat the exact original request. The returned audit receipt describes that operation, not necessarily the current connection state: a replay never reapplies it. Read current state separately. Changed parameters under the same UUID are rejected. The expected boolean detects an immediate state mismatch; it is not a monotonic revision or protection against intervening pause/resume cycles.

Audit receipts are append-only through the service-role API. Anonymous/authenticated roles cannot read or invoke this control. A review reference is an operator attestation, not automated reconciliation or individual human identity; attribution relies on the trusted backend/operator access logs. Database administrators can still change database state directly.

Rollback order: stop worker and reconcile in-flight deliveries, then run 141 rollback, 140 rollback, and optionally 139 rollback. Rollback 141 closes delivery and removes the control RPC while retaining capture and receipts. It does not restore an earlier function that bypasses the delivery gate. Rollback is not a normal pause/resume mechanism.

Verification: 24 local PGlite PostgreSQL checks passed (13 baseline prerequisites plus 11 delivery-control checks), covering permission boundaries, continued capture, blocked claims, ordered resume, request replay, review prerequisite and rollback retention. No remote execution, hosted PMS writes, multi-session concurrency test, production cutover or performance validation occurred.
