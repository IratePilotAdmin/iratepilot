# Inventory snapshot candidate 215

Local candidate only. Not installed on hosted Supabase and not a complete historical performance report.

Migration 202609100215 adds a private service_inventory_snapshot helper and includes its deterministic result in service_day_data before preview hashing. Existing service_close recomputes that hash while holding the property update lock, and stores the entire reviewed result. No new close table or historical backfill is introduced. Existing closed_at supplies capture time; a volatile timestamp must not be placed in the preview hash.

Basis is inventory_configuration_at_close: room types, configured ceiling, current physical units, dated closed units and effective units. Missing configuration or no types yields incomplete/unknown totals; configured zero is complete zero. These are configuration figures reviewed at close, not reconstructed past physical inventory. Existing closes lack the new data and must remain explicitly unavailable in future performance reporting.

Local restored PostgreSQL test: work/accounting-foundation/inventory-snapshot-215-test.mjs; result inventory-snapshot-215-result.json. Both hotel/home passed missing/zero capacity distinction, stale preview rejection, saved snapshot equality, same-request close replay and preservation after a capacity change. Private helper execution denied to authenticated. Entire migration and test changes rolled back. The first assertion expected SQLSTATE 40001; current installed RPC correctly returns PT409, and the harness was corrected to the current contract.

Still required: preview UI that visibly reviews these figures; closed report RPC/UI, historical unavailable handling, concurrent-session serialization tests, nonzero stays and multiple types/dated closures, export acceptance and hosted deployment. Do not deploy this candidate alone as complete performance reporting. Preserve the existing modified invoice-aging and same-day release documentation in this worktree.

## Concurrency and nonzero regression follow-up

Two concurrent authenticated RPC sessions passed in isolated clone irp_inventory_1789001882695, for both hotel and home. The test observed active PostgreSQL lock waits through pg_stat_activity. Writer-first: capacity mutation held the property lock; close waited, then rejected stale review with PT409 after writer commit, with no close inserted. Close-first: capacity update waited for close commit, then changed live capacity from zero to one while the saved reviewed snapshot stayed zero. Evidence: inventory-concurrency-215-test.mjs and inventory-concurrency-215-result.json in work/accounting-foundation. Original restored database was not modified.

Candidate 215 also passed the existing 26 actual PostgreSQL service scenarios in a fresh isolated fixture, including same-day/nonzero allocation, overnight controls, missing/reversed timestamps, cancellation, itemized named tax/fee posting, balanced general ledger, replay and source preservation. Evidence: native-inventory215-service-test.mjs and inventory215-service-regression-result.json. Separate inventory215 hotel/home report fixtures preserve these results without overwriting release 214 fixtures.

These supersede the pending concurrent-session and nonzero regression statements above. Preview/report UI, multiple-room-type and maintenance scenarios, exported denominator validation and hosted acceptance are still required.
