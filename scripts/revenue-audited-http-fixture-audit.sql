-- Read-only diagnostic on the independently verified isolated branch only.
-- Capture this BEFORE scoped cleanup. A false result is not permission to repair
-- fixture rows manually; inspect the failed run, retain evidence, then clean up.
WITH decisions AS (
 SELECT request_id,actor_id,recommended_rate_minor FROM irp_pms.revenue_rate_decisions
 WHERE tenant_id='00000000-0000-4000-8000-000000000001'
 AND property_id='00000000-0000-4000-8000-000000000030'
), facts AS (
 SELECT (SELECT count(*) FROM decisions) decisions,
 (SELECT count(*) FROM decisions WHERE request_id='00000000-0000-4000-8000-000000000020' AND recommended_rate_minor=16100 AND actor_id='7e3ac7b8-3286-4fcb-aaa9-a850390d787c') owner_decisions,
 (SELECT count(*) FROM decisions WHERE request_id='00000000-0000-4000-8000-000000000021' AND recommended_rate_minor=18515 AND actor_id='fe6502af-b9a2-478d-abad-bfbec8539df6') manager_decisions,
 (SELECT count(*) FROM decisions WHERE request_id='00000000-0000-4000-8000-000000000023' AND recommended_rate_minor=14000 AND actor_id='7e3ac7b8-3286-4fcb-aaa9-a850390d787c') compensation_decisions,
 (SELECT count(*) FROM irp_pms.nightly_rates WHERE property_id='00000000-0000-4000-8000-000000000030') nightly_rows,
 (SELECT count(*) FROM irp_pms.nightly_rates n JOIN irp_pms.qualification_write_scope s ON n.stay_date=s.stay_date WHERE n.property_id='00000000-0000-4000-8000-000000000030' AND n.plan_id='00000000-0000-4000-8000-000000000032' AND n.amount_minor=14000) restored_rows,
 (SELECT count(*) FROM irp_pms.rate_plans WHERE property_id='00000000-0000-4000-8000-000000000030' AND id='00000000-0000-4000-8000-000000000032' AND version=4) restored_plan_versions,
 (SELECT count(*) FROM irp_pms.rate_actions WHERE property_id='00000000-0000-4000-8000-000000000030') actions,
 (SELECT count(*) FROM irp_pms.activity WHERE property_id='00000000-0000-4000-8000-000000000030') activities
)
SELECT now() checked_at,to_jsonb(facts) evidence,
 decisions=3 AND owner_decisions=1 AND manager_decisions=1 AND compensation_decisions=1
 AND nightly_rows=1 AND restored_rows=1 AND restored_plan_versions=1
 AND actions=3 AND activities=6 AS passed
FROM facts;
