# Revenue AI live release gates — September 30, 2026

Red Roof Inn Ridgeland, MS remains private shadow testing. No percentage-complete or launch date is established by passing unit tests.

| Gate | Confirmed work | Required before completion |
| --- | --- | --- |
| Atomic audited rate approval | Reviewed-facts preflight, targeted capacity-row safeguard, scoped/versioned manual rate RPC; decision audit source exists as a candidate | Recompute recommendation on the server, check all authoritative facts within the rate-write transaction, retain exact decision receipt, integrate UI recovery, qualify competing pricing/inventory/auth writes |
| Signed native PMS-to-OTA delivery | Validate-only receiver and sender foundations; mappings and private delivery gates | Configure matching credentials, execute the signed deployed HTTP flow, test duplicate/retry/failure reconciliation and then separately authorize controlled writeback |
| Forecast accuracy | Six-hour prospective recording, pickup windows, finalized-close evaluator and independent health monitor | Accumulate usable history and finalized real stay results, measure error and bias, set pilot acceptance thresholds and calibrate confidence; do not substitute fixtures for actual hotel evidence |
| One-person mobile/portfolio operation | Supervisor queue, claim/reclaim/replay protection, bounded 500-property SQL qualification and PWA foundations | End-to-end phone/PWA checks and sustained concurrent HTTP/portfolio qualification, escalation and operator procedures |
| Controlled production release | Private pilot, passing draft checks and gated live actions | Finish the gates above, reconcile reviewed migrations and UI/backend versions, rehearse restore/rollback, execute a limited supervised pilot and document launch signoff |

## Pricing writer inspection

Catalog inspection found 26 functions with explicit qualified mutations of reservations, rooms, room closures, nightly capacity, nightly rates or rate plans. Twenty-four definitions contain an explicit scoped property `FOR UPDATE` statement. The remaining two, `room_occupancy_revision` and `enqueue_turnover`, modify room state versions/housekeeping rather than the room count or room-type assignment. This is a source inventory, not proof of every execution branch or lock order. Dynamic/unqualified SQL, administrative access and future functions require separate review.

The six source tables deny direct INSERT/UPDATE/DELETE to anonymous and authenticated roles. The service role has all three privileges on nightly capacity and no direct DML on the other five inspected source tables. Consequently, a property lock alone cannot certify capacity stability. The revised preflight locks the target existing capacity row and fails closed when no row was locked. These locks persist only until that transaction ends; a later standalone rate call remains unprotected by an earlier preflight.

The actual PMS still has neither the revenue decision audit table nor its audited apply RPC installed. This inspection did not activate either, change capacity privileges, enable rate writeback or send an OTA request. The signed deployed receiver test remains an unresolved policy-blocked gate; it must not be bypassed through an alternate browser or indirect request.
