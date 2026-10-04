# Observed receipt races — September 30, 2026

The audited approval candidate passed two receipt races in an isolated Supabase development branch. No live PMS rates or reservations were changed. Audited saving and automatic rate writeback remain disabled.

| Scenario | Observed holder / waiter | Result |
| --- | --- | --- |
| Same actor, request ID and complete payload | 6202 / 6200, transactionid wait | Original saved timestamp and receipt returned with replayed=true |
| Same actor and request ID, changed explanation | 6215 / 6213, transactionid wait | SQLSTATE 23505, saved-result conflict |

Final state: two decisions, two rate actions, two approval activity records, rate 18515 minor units, plan version 3. Neither competing request added a write. All 14 cron runs succeeded; zero scheduled jobs, unfinished controls, failed runs or active workers remained. Full run IDs, messages and timestamps were captured before branch deletion in `evidence/revenue-receipt-races-20260930.json`.

## Method

The branch initially contained zero irp_pms tables and zero Auth users. Installation used the captured 18-table pricing fixture, four freshly read existing PMS dependency definitions, the capacity preflight repair and the uninstalled audited approval candidate. The candidate added the nineteenth table. Synthetic room inventory was 10, reservations 8, initial rate 14000/version 1.

A private BEFORE INSERT audit trigger held the real candidate transaction open. A private cron worker detected an advisory timing marker and called the candidate from another backend. The trigger required an actual Lock wait whose blocking PID matched the holder before allowing its transaction to commit. The advisory marker coordinated timing; candidate property row locking provided serialization. Identical replay used request 6; conflict used request 7 with only its explanations changed. Expected unique_violation was caught explicitly; other worker errors propagated.

`scripts/qualify-revenue-isolated-receipt-races.sql` is the executed observer migration. `scripts/run-revenue-isolated-receipt-races.sql` packages the executed seed, schedule/holder/unschedule statements and final collection query; follow its separate-call boundaries rather than submitting it as one transaction. The packaged driver itself was assembled after execution, not separately rerun.

## Limits

This qualifies these two races against the actual candidate SQL in the isolated pricing slice. It does not establish full-schema trigger compatibility, authenticated HTTP/RLS behavior, browser Web Locks/storage recovery, sustained portfolio concurrency, signed PMS-to-OTA delivery, or live readiness. The real-browser local fixture remains blocked by browser URL policy. The earlier unrelated failed cron run remains unexplained; this new test does not establish its cause.

Temporary branch zaqaptgroluvesuwtlol was deleted after preserving complete diagnostics; production candidate installation remains pending.
