# Historical performance reader candidate 216

Local candidate only; not hosted or complete UI. Endpoint irp_pms_pilot_historical_performance_report requires owner/manager scope, uses the existing closed report for property locks and date/row limits, and returns every requested date with an exclusive end.

Unclosed days carry null occupied nights and amounts, not fabricated zeros. Closed days report original overnight, same-day and other accommodation separately, total original accommodation, signed accommodation corrections, original taxes and property fees. Money uses integer minor-unit strings. Inventory returns the actual saved snapshot or null; status distinguishes unclosed, not_recorded, incomplete, zero_capacity and recorded. Existing reconciliation and pending-approval counts remain visible. This reader does not calculate rates or claim that original room revenue includes corrections.

Evidence in work/accounting-foundation:
- historical-performance-216-access-test.mjs and result: hotel/home scope, explicit unclosed dates/nulls, denied staff/unrelated actor, invalid range rejection; rollback-only on restored database.
- native-performance216-test.mjs and performance216-service-result.json: 26 original service regression checks plus two hotel/home reader checks. Actual itemized close: same-day accommodation 10000, occupied nights 0, overnight amount 0, tax 1430, property fees 2500; snapshot matches reviewed data.
- native-performance216-legacy-test.mjs and performance216-legacy-service-result.json: same 28 checks with migration 215 absent. Closes without inventory data return not_recorded and null snapshot while preserving all revenue. Isolated fixtures, no hosted change.

Remaining: nonzero overnight report result, signed forward corrections in this reader, mixed date/room-type/maintenance coverage, rate calculations and period completeness, UI/export and hosted acceptance. Do not label the statement or full reporting suite complete.
