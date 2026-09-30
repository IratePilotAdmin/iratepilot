# Supervisor review concurrency qualification

This qualification tests database review semantics for one authorized supervisor using simultaneous requests. It does not test two different staff identities, HTTP authentication, mobile rendering, 500 concurrent properties or sustained throughput.

The initial connector requests were serialized by the tool path. One claim succeeded and the later claim was rejected for stale revision, but their server execution intervals did not overlap. Those requests are not reported as proof of concurrent execution.

Two temporary pg_cron workers then ran at the same minute against one isolated test exception. Each attempted the same expected revision with a different request ID. The winning worker held its transaction for three seconds so the competing worker overlapped and waited on the existing property advisory lock. Exactly one claim applied and advanced revision from 1 to 2. The other worker was rejected for stale revision after the winner committed.

| Worker outcome | Start (UTC, September 30, 2026) | Finish (UTC) |
| --- | --- | --- |
| Applied | 14:27:00.168989 | 14:27:03.230021 |
| Stale revision rejected | 14:27:00.173832 | 14:27:03.232439 |

These intervals prove overlap for this controlled case. The three-second hold is an artificial test mechanism, not a performance measurement.

A second pair of workers retried the winning request ID with its original expected revision. Both returned the stored receipt with `replayed=true`, revision 2 and the same request ID. The issue remained at revision 2, with exactly one `claim` event.

| Retry | Start (UTC, September 30, 2026) | Finish (UTC) |
| --- | --- | --- |
| A: replayed | 14:29:00.194985 | 14:29:03.207925 |
| B: replayed | 14:29:00.196121 | 14:29:06.214213 |

These intervals also overlap. This verifies a competing claim conflict and duplicate-request idempotency under real database lock contention. It does not measure representative latency because the artificial transaction hold is deliberate.

The temporary fixture was committed briefly so independent database workers could see it. It used a new isolated tenant/property and an existing authorized owner's membership, without creating a new user or modifying real hotel rates, reservations or forecasts. After verification, both temporary cron jobs were unscheduled and all fixture events, issues, property, membership and tenant records were deleted. Cleanup queries returned zero for every fixture category and confirmed five real properties, 2,250 snapshots and 180 forecasts remained. Normal cron execution history was retained.

For reproduction, create an isolated property and a `capture_missing` issue using the current supervisor schema, then run two independent transactions against the same issue/revision. Use different request IDs for the competing-claim case and the winning request ID for the replay case. Record start/finish times in each transaction; serialized connector calls alone are insufficient. Any temporary scheduled workers must be stopped and every fixture record removed after the test. Do not run this experiment against an operational hotel issue.

The database conflict/replay gate passed for one supervisor and one exception. The subsequent controlled membership-demotion race also passed; see [review authorization qualification](REVENUE_REVIEW_AUTHORIZATION.md). Different staff identities, other permission-change scenarios, interrupted transport, browser behavior and concurrent portfolio-scale traffic remain open. The private pilot still has no validated forecast accuracy or completed signed PMS-to-OTA HTTP test, and rate writeback remains disabled.
