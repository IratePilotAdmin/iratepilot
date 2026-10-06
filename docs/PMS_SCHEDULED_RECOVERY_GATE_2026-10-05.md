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

## Remaining release check

This is a branch candidate. The hosted scheduled route has **not** run against the two isolated projects, and Vercel cron does not fire for Preview. Do not enable `IRP_PMS_SYNC_ENABLED` or promote the OTA connector on the basis of this gate alone. The next isolated test should invoke the protected route with a synthetic queued booking, force a transient receiver failure, then confirm due-time retry, one destination reservation, and source acknowledgement. Production rollout additionally needs verified environment binding, populated-data restore, a real Stripe TEST checkout/webhook, and operational review.
