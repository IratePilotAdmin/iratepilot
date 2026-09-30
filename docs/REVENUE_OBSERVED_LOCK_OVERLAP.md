# Observed PostgreSQL lock overlap — September 30, 2026

## Environment

After the user's existing organization selection and Supabase cost confirmation ($0.01344/hour), temporary branch `revenue-lock-overlap-qualification-20260930` was created at 21:47:35.866535Z, reference `lhjdpntcnkbsxgwhirmk`, from PMS `eiqmdldjnedqgbtoozqa`, without production data. Its replay status was MIGRATIONS_FAILED; readback found zero PMS tables/functions and zero Auth users. PostgreSQL reported 17.11. This is not a complete restored PMS.

The captured pricing slice, four current pricing dependencies from the live catalog, capacity-lock preflight and audited approval candidate were installed only in this isolated branch. Synthetic identity/property/plan/room/reservation records were used. All qualification functions and tables were private with public/client grants revoked. pg_cron supplied actual independent background sessions; there were no outbound HTTP calls.

## Captured results

The candidate's transaction reached its audit insertion after acquiring its production-code property, capacity and membership locks. An isolated BEFORE INSERT test trigger took an advisory synchronization marker and polled for a background writer actually waiting on that approval PID. The marker coordinates test timing; it does not replace the production row locks. The trigger recorded the wait and allowed the existing candidate transaction to commit.

| Scenario | Holder / waiter PID | Observed wait and outcome |
| --- | --- | --- |
| Capacity update during approved save | 5657 / 5655 | transactionid; blockers=[5657] at 21:52:27.655576Z. Inventory worker completed at 21:52:27.659086Z, changing units to nine after the audited save of rate 16100/version 2. |
| Stale reviewed capacity after that update | SQL caller | The next reviewed command still assumed ten units and was rejected with 40001 before another save. Capacity was reset to ten for the independent next trial. |
| Membership demotion during approved save | 6287 / 6285 | transactionid; blockers=[6287] at 21:53:16.028755Z. Demotion completed at 21:53:16.031372Z after the audited save of rate 18515/version 3. Exact replay after demotion was denied with 42501. |
| Approval waits behind a demotion transaction | 6308 / 6312 | Worker held the property row, demoted the synthetic membership without committing, and exposed its synchronization marker. Caller passed its initial check against the committed owner membership, then waited on transactionid/blockers=[6308] at 21:54:17.841761Z. Worker committed demotion at 21:54:17.842082Z; candidate's post-wait authorization check denied the approval with 42501. No third decision/action or rate/version change occurred. |

Final state: three observation rows with distinct holder/waiter PIDs and matching blocking PID arrays, two audit decisions, two rate actions, rate 18515 and plan version 3. These are real captured overlapping row-lock waits, unlike the earlier connector-dispatch test that did not establish overlap.

## Background-run discrepancy and cleanup

The final cleanup query returned remaining_jobs=0, proven_waits=3, decisions=2, actions=2, **failed_runs=1** in cron.job_run_details. The branch was deleted before that failed run's error/status detail was inspected. Its cause is therefore unknown. The three successful captured scenarios above remain evidenced, but the qualification must not be described as a clean all-runs pass. Reproduce with run-detail collection and inspect the failed job before cleanup; do not infer that it was harmless or merely cancellation.

All three temporary jobs were unscheduled. Native branch deletion succeeded and subsequent listing contained only the default main branch. Neither qualification branch was merged into production. The live PMS audited candidate is still uninstalled and Red Roof remains in shadow mode.

## Reproduction and open gates

`scripts/qualify-revenue-isolated-lock-overlap.sql` defines the executed private worker/observer harness. It refuses a database lacking the exclusive synthetic fixture or exactly 19 pricing tables; never run it on either live project. It requires the captured fixture plus audited candidate, one synthetic property/owner, ten rooms/eight reservations and initial rate 14000/version 1 for October 1, 2026. It is not an automatically replayed application migration.

1. Use a cost-confirmed temporary branch with no production data; inspect replay status and metadata before installing any test code.
2. Schedule run_worker('capacity') as a temporary one-second job, then invoke the initial candidate command with request.jwt.claim.sub set to the synthetic owner and revenue_qualification.phase='capacity'. Unschedule and read observations/control/current facts.
3. Verify the subsequent ten-unit reviewed command is stale. Restore synthetic capacity to ten, schedule run_worker('membership'), and invoke version-2/rate-16100 command with phase='membership'. Unschedule, read results, and verify demoted replay denial.
4. Restore synthetic membership to owner, schedule run_worker('demotion_before_save'), confirm its advisory marker exists in pg_locks, then invoke the version-3/rate-18515 command with application_name='revenue_qualification_approval_waiter'. Unschedule and confirm post-wait denial and unchanged decision/action/rate/version counts.
5. **Before deleting**, collect all matching cron.job_run_details fields (jobid/runid/status/return_message/start_time/end_time), observation rows and control rows. Investigate any failed run. Verify no active jobs remain, then delete the branch.

Open: failed-background-run reproduction; supported reservation/nightly-rate writer races and receipt conflicts under observed overlap; complete PMS schema/functions/RLS/grants parity; authenticated HTTP/browser timeout recovery and real storage/Web Locks; broader prospective forecast/phone/portfolio/delivery/restore gates. These three narrowly scoped lock scenarios do not establish comprehensive live readiness.
