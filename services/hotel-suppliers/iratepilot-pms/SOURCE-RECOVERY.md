# Recovering reviewed OTA delivery events

Migration 148 is optional source-side infrastructure requiring migrations 139–141. It does not belong in a core PMS-only installation of 142–147. Applying it does not create a connection, prepare a baseline, enable capture, enable delivery, or run a worker.

The source outbox stops later versions of a booking behind any event in `review`. After correcting an approved connection's missing mapping, credentials, endpoint, or other transport configuration, a trusted backend operator can retry that exact event. Do not change its payload, source version, booking ID, or event ID. The receiver's deduplication and conflict checks remain authoritative.

1. Resolve the operator's approved connection using server-owned configuration. Inspect the event's current `state`, `attempts`, `recovery_count`, and `result_code`. Only `review` is eligible. A browser or hotel staff token cannot call this recovery RPC or read its audit table.
2. Record the reason and correction. Generate one request UUID and retain it across network retries.
3. Call the public-schema service-role RPC `irp_pms_requeue_review` with `p_connection`, `p_event`, `p_request`, `p_expected_attempts`, `p_expected_recovery`, and `p_reference`. The reference must contain 8–200 characters after trimming. The RPC derives OTA property, PMS tenant, and PMS property scope from the configured connection, and requires an exact match to the stored event. These identities are not override parameters.
4. Inspect the returned immutable recovery receipt. It retains the prior attempt count, recovery generation, and result code. The event becomes `retry`, receives a new retry budget (`attempts = 0`), and increments `recovery_count`; the original event payload and version remain unchanged.
5. If delivery was paused, it remains paused. Resume separately through the existing audited delivery control only when ready. The worker retries the earliest unresolved booking version; later versions remain blocked until it is acknowledged.

Reusing a request UUID returns the original recovery receipt without repeating the state change. It cannot reopen an event that subsequently succeeded, was leased, or returned to review. A new recovery requires a new request UUID and the current attempt count and recovery generation. Stale review screens reject instead of resetting a later decision. Different parameters under an existing UUID also reject.

The action audit and event reset commit together. The service role can read `irp_pms_source_recoveries` but cannot rewrite it or directly update outbox state. The migration-148 shutdown script revokes recovery execution while retaining all data; pausing transport is a separate action.

A successfully delivered `review-required` result belongs to the destination PMS review workflow and is not a source transport failure. Use `REVIEW-WORKFLOW.md` for capacity reconciliation. A genuine event/version conflict requires investigation; requeue does not bypass the receiver or alter conflicting data.

Verification: 21 local PGlite checks cover scope, privileges, expected state/generation, retry budget reset, unchanged payload/version, preserved audit, paused behavior, duplicate-safe requests, atomic rollback, ordered unblocking, and shutdown. Real multi-session contention and deployed transport configuration require a connected sandbox test before OTA activation.
