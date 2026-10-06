INSERT INTO auth.users(id) VALUES('00000000-0000-4000-8000-000000000005');
INSERT INTO irp_pms.tenants(id,name) VALUES('00000000-0000-4000-8000-000000000001','Synthetic isolated lock qualification');
INSERT INTO irp_pms.properties(tenant_id,id,name,currency) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Synthetic qualification property','USD');
INSERT INTO irp_pms.memberships VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','owner');
INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Test');
INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label,housekeeping) SELECT '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',n::text,'Clean' FROM generate_series(1,10)n;
INSERT INTO irp_pms.rate_plans(tenant_id,property_id,id,room_type_id,name,tax_basis_points,active) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','Test',0,true);
INSERT INTO irp_pms.nightly_capacity VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','2026-10-01',10);
INSERT INTO irp_pms.nightly_rates VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','2026-10-01',14000);
INSERT INTO irp_pms.reservations(tenant_id,property_id,room_type_id,status,arrival,departure,source,source_booking_id,source_version,payload_hash,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor) SELECT '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Confirmed','2026-10-01','2026-10-02','direct','initial-'||n,1,repeat('a',64),1,14000,0,0,14000 FROM generate_series(1,8)n;

-- Run observer migration next; then submit these statements in separate backend sessions.
-- Schedule, then execute holder, then unschedule as three separate tool calls.
SELECT cron.schedule('receipt-duplicate','1 second',$job$SELECT receipt_qualification.run_worker('duplicate')$job$);
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
SELECT set_config('receipt_qualification.phase','duplicate',true);
SELECT public.irp_pms_pilot_apply_revenue_decision('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004',1,'2026-10-01',14000,16100,7000,21000,NULL,0,10,8,800,1500,'none','["Reviewed inputs"]'::jsonb) AS receipt;
COMMIT;
SELECT cron.unschedule('receipt-duplicate');

-- Schedule, then execute holder, then unschedule as three separate tool calls.
SELECT cron.schedule('receipt-conflict','1 second',$job$SELECT receipt_qualification.run_worker('conflict')$job$);
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
SELECT set_config('receipt_qualification.phase','conflict',true);
SELECT public.irp_pms_pilot_apply_revenue_decision('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000004',2,'2026-10-01',16100,18515,7000,21000,NULL,0,10,8,800,1500,'none','["Reviewed inputs"]'::jsonb) AS receipt;
COMMIT;
SELECT cron.unschedule('receipt-conflict');

SELECT jsonb_build_object('captured_at',clock_timestamp(),'controls',(SELECT jsonb_agg(c ORDER BY phase) FROM receipt_qualification.control c),'observations',(SELECT jsonb_agg(o ORDER BY phase) FROM receipt_qualification.observations o),'cron_runs',(SELECT jsonb_agg(r ORDER BY runid) FROM (SELECT jobid,runid,job_pid,status,return_message,start_time,end_time FROM cron.job_run_details) r),'final',jsonb_build_object('jobs',(SELECT count(*) FROM cron.job),'unfinished',(SELECT count(*) FROM receipt_qualification.control WHERE NOT finished),'failed_runs',(SELECT count(*) FROM cron.job_run_details WHERE status<>'succeeded'),'active_workers',(SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'receipt_qualification_%' AND state='active'),'decisions',(SELECT count(*) FROM irp_pms.revenue_rate_decisions),'rate_actions',(SELECT count(*) FROM irp_pms.rate_actions),'activity',(SELECT count(*) FROM irp_pms.activity WHERE action='revenue_rate_decision_applied'),'rates',(SELECT jsonb_agg(n) FROM irp_pms.nightly_rates n),'plans',(SELECT jsonb_agg(jsonb_build_object('id',id,'version',version)) FROM irp_pms.rate_plans))) evidence;
