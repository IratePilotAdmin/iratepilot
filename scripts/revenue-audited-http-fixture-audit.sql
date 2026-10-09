-- Administrative READ ONLY: independently verify branch ybehrayzwzyufxbxcysq first.
-- Retain with exact run/job/commit provenance BEFORE scoped fixture cleanup.
-- Missing fixture tables produce an error; empty/partial fixtures never pass.
WITH scope AS (
 SELECT '00000000-0000-4000-8000-000000000001'::uuid tenant,
 '00000000-0000-4000-8000-000000000030'::uuid property,
 '00000000-0000-4000-8000-000000000032'::uuid plan
), expected(request_id,actor_id,reviewed_version,old_rate,new_rate) AS (VALUES
 ('00000000-0000-4000-8000-000000000020'::uuid,'7e3ac7b8-3286-4fcb-aaa9-a850390d787c'::uuid,1,14000,16100),
 ('00000000-0000-4000-8000-000000000021'::uuid,'fe6502af-b9a2-478d-abad-bfbec8539df6'::uuid,2,16100,18515),
 ('00000000-0000-4000-8000-000000000023'::uuid,'7e3ac7b8-3286-4fcb-aaa9-a850390d787c'::uuid,3,18515,14000)
), matched AS (
 SELECT d.*,e.reviewed_version,e.new_rate FROM expected e CROSS JOIN scope s
 JOIN irp_pms.qualification_write_scope q ON q.singleton
 JOIN irp_pms.revenue_rate_decisions d ON d.request_id=e.request_id
 AND d.tenant_id=s.tenant AND d.property_id=s.property AND d.plan_id=s.plan
 AND d.actor_id=e.actor_id AND d.reviewed_plan_version=e.reviewed_version
 AND d.stay_date=q.stay_date AND d.current_rate_minor=e.old_rate
 AND d.recommended_rate_minor=e.new_rate
), facts AS (
 SELECT
 (SELECT count(*) FROM irp_pms.qualification_write_scope WHERE singleton) scope_rows,
 (SELECT count(*) FROM irp_pms.revenue_rate_decisions d CROSS JOIN scope s WHERE d.property_id=s.property) decisions,
 (SELECT count(*) FROM matched) matched_decisions,
 (SELECT count(*) FROM irp_pms.rate_actions a CROSS JOIN scope s WHERE a.property_id=s.property) actions,
 (SELECT count(*) FROM matched d JOIN irp_pms.rate_actions a ON a.request_id=d.request_id
  AND a.tenant_id=d.tenant_id AND a.property_id=d.property_id AND a.actor_id=d.actor_id
  AND a.payload->>'action'='set_nightly' AND a.payload->>'plan'=d.plan_id::text
  AND a.payload->>'expected_version'=d.reviewed_version::text
  AND a.payload->>'start'=d.stay_date::text AND a.payload->>'end'=(d.stay_date+1)::text
  AND a.payload->>'amount_minor'=d.new_rate::text
  AND a.result->>'plan_id'=d.plan_id::text AND a.result->>'version'=(d.reviewed_version+1)::text
  AND a.result->>'amount_minor'=d.new_rate::text AND a.result->>'changed'='true'
  AND a.result->>'replayed'='false') matched_actions,
 (SELECT count(*) FROM irp_pms.activity a CROSS JOIN scope s WHERE a.property_id=s.property) activities,
 (SELECT count(*) FROM matched d WHERE
  (SELECT count(*) FROM irp_pms.activity a WHERE a.tenant_id=d.tenant_id AND a.property_id=d.property_id
   AND a.actor_id=d.actor_id AND a.target_id=d.plan_id AND a.action='revenue_rate_decision_applied'
   AND a.details->>'request_id'=d.request_id::text AND a.details->>'stay_date'=d.stay_date::text
   AND a.details->>'reviewed_plan_version'=d.reviewed_version::text
   AND a.details->>'recommended_rate_minor'=d.new_rate::text)=1
  AND (SELECT count(*) FROM irp_pms.activity a WHERE a.tenant_id=d.tenant_id AND a.property_id=d.property_id
   AND a.actor_id=d.actor_id AND a.target_id=d.plan_id AND a.action='nightly_rates_saved'
   AND a.details->>'version'=(d.reviewed_version+1)::text
   AND a.details->>'start'=d.stay_date::text AND a.details->>'end'=(d.stay_date+1)::text)=1
 ) matched_activity_pairs,
 (SELECT count(*) FROM irp_pms.nightly_rates n CROSS JOIN scope s WHERE n.property_id=s.property) nightly_rows,
 (SELECT count(*) FROM irp_pms.nightly_rates n CROSS JOIN scope s JOIN irp_pms.qualification_write_scope q ON q.singleton
  WHERE n.tenant_id=s.tenant AND n.property_id=s.property AND n.plan_id=s.plan
  AND n.stay_date=q.stay_date AND n.amount_minor=14000) restored_rows,
 (SELECT count(*) FROM irp_pms.rate_plans p CROSS JOIN scope s WHERE p.property_id=s.property) plan_rows,
 (SELECT count(*) FROM irp_pms.rate_plans p CROSS JOIN scope s WHERE p.tenant_id=s.tenant
  AND p.property_id=s.property AND p.id=s.plan AND p.version=4) restored_plan_rows
)
SELECT statement_timestamp() checked_at,to_jsonb(facts) evidence,
 scope_rows=1 AND decisions=3 AND matched_decisions=3 AND actions=3 AND matched_actions=3
 AND activities=6 AND matched_activity_pairs=3 AND nightly_rows=1 AND restored_rows=1
 AND plan_rows=1 AND restored_plan_rows=1 AS passed
FROM facts;
