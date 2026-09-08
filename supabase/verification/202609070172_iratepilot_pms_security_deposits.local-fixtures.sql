-- LOCAL SCRATCH TEST ONLY. Never run against the connected database.
-- Complete synthetic row pairs for bound and historical-date tests.
CREATE FUNCTION pg_temp.deposit172_seed(p_tenant uuid,p_property uuid,p_count integer,p_amount bigint,p_at timestamptz,p_actor uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE zone text;mode text;first_res uuid;
BEGIN
 SET CONSTRAINTS ALL DEFERRED;
 SELECT time_zone,operating_model INTO zone,mode FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 CREATE TEMP TABLE IF NOT EXISTS deposit172_fixture(i integer,reservation_id uuid,book_id uuid,event_id uuid,request_id uuid) ON COMMIT DROP;
 TRUNCATE pg_temp.deposit172_fixture;
 INSERT INTO pg_temp.deposit172_fixture SELECT g,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid() FROM generate_series(1,p_count) g;
 INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,guest_name)
 SELECT p_tenant,p_property,reservation_id,'direct','TEST172-bulk:'||reservation_id,1,repeat('b',64),'Cancelled','TEST bounds fixture' FROM pg_temp.deposit172_fixture;
 INSERT INTO irp_pms.security_deposit_books(tenant_id,property_id,id,reservation_id,version,recording_time_zone,creation_operating_model,created_at,created_by,updated_at,received_minor,refunded_minor,reduced_minor)
 SELECT p_tenant,p_property,book_id,reservation_id,1,zone,mode,p_at,p_actor,p_at,p_amount,0,0 FROM pg_temp.deposit172_fixture;
 INSERT INTO irp_pms.security_deposit_events(tenant_id,property_id,id,book_id,reservation_id,request_id,kind,amount_minor,recorded_method,reference,reason,actor_id,recorded_at,recording_time_zone,recording_date,from_version,to_version)
 SELECT p_tenant,p_property,event_id,book_id,reservation_id,request_id,'external_receipt',p_amount,'cash','TEST synthetic bounds','Trusted local bounds fixture',p_actor,p_at,zone,(p_at AT TIME ZONE zone)::date,0,1 FROM pg_temp.deposit172_fixture;
 INSERT INTO irp_pms.security_deposit_requests(tenant_id,property_id,request_id,reservation_id,actor_id,outcome,book_id,event_id,command,result,recorded_at)
 SELECT p_tenant,p_property,e.request_id,e.reservation_id,p_actor,'recorded',e.book_id,e.id,
  irp_pms.normalize_security_deposit_command(jsonb_build_object('reservation_id',e.reservation_id,'expected_version',0,'expected_recording_time_zone',zone,'expected_recording_date',e.recording_date,'kind','external_receipt','amount_minor',p_amount,'method','cash','reference',e.reference,'reason',e.reason,'target_event_id',null,'confirmed',true)),
  irp_pms.security_deposit_result_json(p_tenant,p_property,e.id),p_at
 FROM irp_pms.security_deposit_events e JOIN pg_temp.deposit172_fixture f ON f.event_id=e.id WHERE e.tenant_id=p_tenant AND e.property_id=p_property;
 SELECT reservation_id INTO first_res FROM pg_temp.deposit172_fixture ORDER BY i LIMIT 1;
 RETURN first_res;
END $$;
