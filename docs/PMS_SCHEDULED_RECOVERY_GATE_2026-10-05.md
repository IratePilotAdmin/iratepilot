# Native PMS scheduled recovery candidate — October 5, 2026

The previous hosted gate proved that the isolated OTA source can deliver a queued synthetic booking to the isolated PMS receiver through the packaged one-shot Node worker. It did not exercise an unattended scheduler. This gate prepares the OTA application's own scheduled worker for that test; it does not activate production sync.

## Change

- `vercel.json` now schedules `GET /api/cron/native-pms-reservations` every five minutes instead of scheduling the older one-property `/api/cron/pms-outbox` route once a day. The connected IratePilot Vercel team reports the Pro plan. [Vercel cron documentation](https://vercel.com/docs/cron-jobs) confirms cron requests target production deployments; a Preview deployment does not prove automatic execution.
- The scheduled route remains guarded by `CRON_SECRET` and `IRP_PMS_SYNC_ENABLED=true`. It requires the encrypted per-property registry, server key, destination endpoint, and destination publishable key. With the switch off, it returns `disabled` before database access.
- Each invocation processes at most three events and stops on idle, retry, review, or lease loss. The route's 180-second maximum is shorter than its five-minute schedule to avoid overlapping invocations under the configured request timeouts. A retry or lease loss returns HTTP 503 to make failure visible to cron monitoring. The response contains only outcome codes, not booking or event IDs. The source outbox's due time, retry limit, and lease fencing still decide when the event is eligible again.
- Supabase modern `sb_secret_` keys are sent in the `apikey` header without a JWT Bearer header, matching the successful hosted one-shot worker. Legacy service-role JWTs retain the Bearer header. An invalid HTTP-200 PMS acknowledgement now enters the bounded retry path instead of immediately entering operator review.

## Verification

- Focused Vitest: 27 tests passed across the worker, route, cron configuration, and automation files.
- TypeScript `tsc --noEmit` and targeted ESLint passed.
- The new tests verify modern server-key transport, bounded draining through a delivery then retry, retry response without event ID, and the five-minute cron path.

## Hosted lost-acknowledgement recovery — October 5, 2026

- Reused only synthetic booking `88000000-0000-4000-8000-000000000088` in isolated OTA project `onbdizzwwubfdgkgaphx` and isolated PMS receiver `wjosvslkselpauyftias`. Changed the booking's guest count from two to one while delivery was held, creating pending source version 3 behind delivered versions 1 and 2.
- Temporarily enabled the exact sandbox connection and source delivery. A one-use local process ran the packaged scoped source worker. Its first HTTPS gateway request returned `200 reservation-staged` and committed the PMS update, but the process deliberately discarded that acknowledgement to model a network loss. The source recorded a durable `retry` and due-time backoff. After the backoff, the same worker reclaimed the same event and the PMS returned `duplicate`; the source acknowledged it.
- Source event `63bf0b13-1990-407a-af48-4c6107f90ad0` is now `delivered` with two attempts, result code `duplicate`, and no live lease. The PMS still has exactly one Confirmed reservation, now at source version 3, one guest, and the unchanged $119 guest total. No card charge, real guest, or third-party OTA was involved.
- Source delivery and both connections were disabled again; the receiver signing secret was rotated. Final reads found zero unfinished events for the test booking and one PMS reservation. The temporary one-use process exited, its files and result output were removed, and browser and OS clipboards were cleared.

This verifies **hosted durable retry and idempotent PMS receipt with the packaged worker**. The Vercel scheduled route still has not run against these projects; Vercel cron only invokes production deployments, and this branch remains a draft candidate with sync off.

## Remaining release check

This is a branch candidate. The hosted scheduled route has **not** run against the two isolated projects, and Vercel cron does not fire for Preview. Do not enable `IRP_PMS_SYNC_ENABLED` or promote the OTA connector on the basis of this gate alone. The next isolated test should invoke that exact protected route with scoped encrypted registry credentials and verify its response and source ledger. Production rollout additionally needs verified environment binding, populated-data restore, a real Stripe TEST checkout/webhook, and operational review.
