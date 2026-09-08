BEGIN;
-- Complete the remaining scoped staff-write lock coverage after168.
-- Membership changes lock the tenant FOR UPDATE. These functions hold tenant
-- FOR SHARE before property/advisory waits and recheck their existing role gate
-- after the property lock. No signatures, grants, receipts, fees or error codes
-- change. Static definitions preserve all installed142-168 migration bytes.
-- Forward from 202609070146_iratepilot_pms_pilot_operations.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_configure_property(p_tenant uuid,p_property uuid,p_name text,p_time_zone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_time_zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone) THEN RAISE EXCEPTION 'Unknown property time zone'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 UPDATE irp_pms.properties SET name=trim(p_name),time_zone=p_time_zone WHERE tenant_id=p_tenant AND id=p_property RETURNING * INTO prop;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'property_updated',p_property);
 RETURN to_jsonb(prop);
END $$;

-- Forward from 202609070146_iratepilot_pms_pilot_operations.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_room_type(p_tenant uuid,p_property uuid,p_id uuid,p_name text,p_max_guests integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room_type irp_pms.room_types;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_id IS NULL THEN
  INSERT INTO irp_pms.room_types(tenant_id,property_id,name,max_guests) VALUES(p_tenant,p_property,trim(p_name),p_max_guests) RETURNING * INTO room_type;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_id AND status IN('Confirmed','In house') AND guests>p_max_guests) THEN RAISE EXCEPTION 'Guest limit is below existing reservations'; END IF;
  UPDATE irp_pms.room_types SET name=trim(p_name),max_guests=p_max_guests WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_id RETURNING * INTO room_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown room type'; END IF;
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'room_type_saved',room_type.id);
 RETURN to_jsonb(room_type);
END $$;

-- Forward from 202609070146_iratepilot_pms_pilot_operations.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_room(p_tenant uuid,p_property uuid,p_id uuid,p_room_type uuid,p_label text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_id IS NULL THEN
  INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label) VALUES(p_tenant,p_property,p_room_type,trim(p_label)) RETURNING * INTO room;
 ELSE
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown physical room'; END IF;
  IF room.room_type_id IS DISTINCT FROM p_room_type THEN RAISE EXCEPTION 'An existing physical room cannot change room type'; END IF;
  UPDATE irp_pms.rooms SET label=trim(p_label) WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_id RETURNING * INTO room;
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'room_saved',room.id);
 RETURN to_jsonb(room);
END $$;

-- Forward from 202609070155_iratepilot_pms_overdue_inventory.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_capacity(p_tenant uuid,p_property uuid,p_room_type uuid,p_start date,p_end date,p_units integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE physical_count integer; day date; used integer; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 OR p_units IS NULL OR p_units<0 THEN RAISE EXCEPTION 'Invalid capacity dates or units'; END IF;
 PERFORM 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown room type'; END IF;
 SELECT count(*) INTO physical_count FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type;
 IF p_units>physical_count THEN RAISE EXCEPTION 'Capacity exceeds configured physical rooms'; END IF;
 FOR day IN SELECT generate_series(p_start,p_end-1,interval '1 day')::date LOOP
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF p_units<used THEN RAISE EXCEPTION 'Capacity is below existing reservations on %',day; END IF;
  INSERT INTO irp_pms.nightly_capacity(tenant_id,property_id,room_type_id,stay_date,units) VALUES(p_tenant,p_property,p_room_type,day,p_units)
  ON CONFLICT(tenant_id,property_id,room_type_id,stay_date) DO UPDATE SET units=excluded.units;
 END LOOP;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'capacity_updated',p_room_type,jsonb_build_object('start',p_start,'end',p_end,'units',p_units));
 RETURN jsonb_build_object('nights',p_end-p_start,'units',p_units);
END $$;

-- Forward from 202609070155_iratepilot_pms_overdue_inventory.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_create_reservation(p_tenant uuid,p_property uuid,p_request uuid,p_room_type uuid,p_guest_name text,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; request_payload jsonb; prior irp_pms.direct_requests; res irp_pms.reservations; day date; available integer; used integer; guest_limit integer; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request identity is required'; END IF;
 request_payload:=jsonb_build_object('room_type',p_room_type,'guest_name',trim(p_guest_name),'arrival',p_arrival,'departure',p_departure,'guests',p_guests,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor);
 SELECT * INTO prior FROM irp_pms.direct_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'Reservation request identity already used'; END IF;
  SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=prior.reservation_id;
  RETURN to_jsonb(res);
 END IF;
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest or stay dates'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Invalid room type or guest count'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND stay_date=day FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
 END LOOP;
 INSERT INTO irp_pms.reservations(tenant_id,property_id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name)
 VALUES(p_tenant,p_property,'direct',p_request::text,1,repeat('0',64),'Confirmed',p_room_type,p_arrival,p_departure,p_guests,p_accommodation_minor,p_taxes_minor,0,p_accommodation_minor+p_taxes_minor,trim(p_guest_name)) RETURNING * INTO res;
 INSERT INTO irp_pms.direct_requests(tenant_id,property_id,request_id,payload,reservation_id,created_by) VALUES(p_tenant,p_property,p_request,request_payload,res.id,auth.uid());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'reservation_created',res.id);
 RETURN to_jsonb(res);
END $$;

-- Forward from 202609070151_iratepilot_pms_migration_import.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_stage_import(p_tenant uuid,p_property uuid,p_request uuid,p_provider text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE provider text:=lower(trim(p_provider)); prior irp_pms.import_batches; preview jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR provider IS NULL OR provider !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN RAISE EXCEPTION 'A request identity and provider code are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('import-stage:'||p_tenant::text||':'||p_property::text||':'||p_request::text,0));
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF prior.provider IS DISTINCT FROM provider OR prior.source_rows IS DISTINCT FROM p_rows OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Import request identity already used'; END IF;
  RETURN prior.preview||jsonb_build_object('batch_id',prior.id,'provider',prior.provider,'status',prior.status,'replayed',true);
 END IF;
 preview:=irp_pms.validate_import(p_tenant,p_property,provider,p_rows);
 INSERT INTO irp_pms.import_batches(tenant_id,property_id,id,provider,source_rows,preview,created_by) VALUES(p_tenant,p_property,p_request,provider,p_rows,preview,auth.uid());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'import_staged',p_request,jsonb_build_object('row_count',preview->'row_count','error_count',preview->'error_count','provider',provider));
 RETURN preview||jsonb_build_object('batch_id',p_request,'provider',provider,'status','staged','replayed',false);
END $$;

-- Forward from 202609070151_iratepilot_pms_migration_import.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_commit_import(p_tenant uuid,p_property uuid,p_batch uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE batch irp_pms.import_batches; prior irp_pms.import_actions; receipt irp_pms.import_commits; preview jsonb; result jsonb; row jsonb; n jsonb; reservation_id uuid; ids jsonb:='[]'::jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_batch IS NULL THEN RAISE EXCEPTION 'Batch and request identities are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.import_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.batch_id IS DISTINCT FROM p_batch OR prior.action<>'commit' OR prior.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Import action identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO batch FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped import batch'; END IF;
 IF batch.status='discarded' THEN RAISE EXCEPTION 'A discarded import cannot be committed'; END IF;
 SELECT * INTO receipt FROM irp_pms.import_commits WHERE tenant_id=p_tenant AND property_id=p_property AND batch_id=p_batch;
 IF FOUND THEN result:=jsonb_build_object('batch_id',p_batch,'status','committed','reservation_ids',receipt.reservation_ids,'payment_state','not_recorded','replayed',true);
 ELSE
  preview:=irp_pms.validate_import(p_tenant,p_property,batch.provider,batch.source_rows);
  IF (batch.preview->>'error_count')::integer>0 OR (preview->>'error_count')::integer>0 THEN
   -- Preserve the original preview and a separate fresh failure receipt. A new
   -- request can retry a formerly valid stage after inventory is corrected.
   result:=CASE WHEN (batch.preview->>'error_count')::integer>0 THEN batch.preview ELSE preview END||jsonb_build_object('batch_id',p_batch,'status','validation_failed','replayed',false);
   INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'import_validation_failed',p_batch);
  ELSE
   FOR row IN SELECT value FROM jsonb_array_elements(preview->'rows') LOOP
    n:=row->'normalized';reservation_id:=gen_random_uuid();
    INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name,migration_provider,migration_source_id)
    VALUES(p_tenant,p_property,reservation_id,'migration',reservation_id::text,1,encode(sha256(convert_to(n::text,'UTF8')),'hex'),'Confirmed',(n->>'room_type_id')::uuid,(n->>'arrival')::date,(n->>'departure')::date,(n->>'guests')::integer,(n->>'accommodation_minor')::bigint,(n->>'taxes_minor')::bigint,0,(n->>'guest_total_minor')::bigint,n->>'guest_name',batch.provider,n->>'source_id');
    ids:=ids||jsonb_build_array(reservation_id);
   END LOOP;
   INSERT INTO irp_pms.import_commits(tenant_id,property_id,batch_id,request_id,actor_id,reservation_ids) VALUES(p_tenant,p_property,p_batch,p_request,auth.uid(),ids);
   UPDATE irp_pms.import_batches SET status='committed' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch;
   result:=jsonb_build_object('batch_id',p_batch,'status','committed','reservation_ids',ids,'payment_state','not_recorded','replayed',false);
   INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'import_committed',p_batch,jsonb_build_object('row_count',jsonb_array_length(ids),'provider',batch.provider));
  END IF;
 END IF;
 INSERT INTO irp_pms.import_actions(tenant_id,property_id,request_id,batch_id,actor_id,action,result) VALUES(p_tenant,p_property,p_request,p_batch,auth.uid(),'commit',result);
 RETURN result;
END $$;

-- Forward from 202609070151_iratepilot_pms_migration_import.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_discard_import(p_tenant uuid,p_property uuid,p_batch uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE batch irp_pms.import_batches; prior irp_pms.import_actions; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_batch IS NULL THEN RAISE EXCEPTION 'Batch and request identities are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.import_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.batch_id IS DISTINCT FROM p_batch OR prior.action<>'discard' OR prior.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Import action identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO batch FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped import batch'; END IF;
 IF batch.status='committed' THEN RAISE EXCEPTION 'Committed reservations cannot be discarded as a staged import'; END IF;
 result:=jsonb_build_object('batch_id',p_batch,'status','discarded','replayed',batch.status='discarded');
 IF batch.status<>'discarded' THEN
  UPDATE irp_pms.import_batches SET status='discarded' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'import_discarded',p_batch);
 END IF;
 INSERT INTO irp_pms.import_actions(tenant_id,property_id,request_id,batch_id,actor_id,action,result) VALUES(p_tenant,p_property,p_request,p_batch,auth.uid(),'discard',result);
 RETURN result;
END $$;

-- Forward from 202609070158_iratepilot_pms_taxes_hotel_fees.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_rate_plan(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_room_type uuid,p_name text,p_tax_basis_points integer,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 OR p_tax_basis_points IS NULL OR p_tax_basis_points NOT BETWEEN 0 AND 10000 OR p_active IS NULL OR p_room_type IS NULL THEN RAISE EXCEPTION 'Explicit name, room type, tax basis points, active state and request are required'; END IF;
 command:=jsonb_build_object('action','save_plan','plan',p_plan,'expected_version',p_expected_version,'room_type',p_room_type,'name',trim(p_name),'tax_basis_points',p_tax_basis_points,'active',p_active);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.rate_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Rate request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped room type'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND lower(name)=lower(trim(p_name)) AND (p_plan IS NULL OR id<>p_plan)) THEN RAISE EXCEPTION 'A rate plan with this name already exists for the room type'; END IF;
 IF p_plan IS NULL THEN
  IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'A new rate plan has no previous version'; END IF;
  IF (SELECT count(*) FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property)>=50 THEN RAISE EXCEPTION 'The pilot supports at most 50 rate plans per property'; END IF;
  INSERT INTO irp_pms.rate_plans(tenant_id,property_id,room_type_id,name,tax_basis_points,active) VALUES(p_tenant,p_property,p_room_type,trim(p_name),p_tax_basis_points,p_active) RETURNING * INTO plan;
 ELSE
  SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped rate plan'; END IF;
  IF plan.charges IS NOT NULL THEN RAISE EXCEPTION 'Use the structured tax and fee editor for this rate plan'; END IF;
  IF p_expected_version IS DISTINCT FROM plan.version THEN RAISE EXCEPTION 'Rate plan version changed; refresh before saving'; END IF;
  IF plan.room_type_id<>p_room_type THEN RAISE EXCEPTION 'An existing rate plan cannot change room type'; END IF;
  IF plan.name IS DISTINCT FROM trim(p_name) OR plan.tax_basis_points IS DISTINCT FROM p_tax_basis_points OR plan.active IS DISTINCT FROM p_active THEN
   UPDATE irp_pms.rate_plans SET name=trim(p_name),tax_basis_points=p_tax_basis_points,active=p_active,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan RETURNING * INTO plan;
  END IF;
 END IF;
 result:=to_jsonb(plan)||jsonb_build_object('replayed',false);
 INSERT INTO irp_pms.rate_actions(tenant_id,property_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'rate_plan_saved',plan.id,jsonb_build_object('version',plan.version));
 RETURN result;
END $$;

-- Forward from 202609070158_iratepilot_pms_taxes_hotel_fees.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_rate_plan_v2(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_room_type uuid,p_name text,p_charges jsonb,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb; config jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 OR p_active IS NULL OR p_room_type IS NULL THEN RAISE EXCEPTION 'Explicit name, room type, charges, active state and request are required'; END IF;
 config:=irp_pms.normalize_charges(p_charges);
 command:=jsonb_build_object('action','save_plan_v2','plan',p_plan,'expected_version',p_expected_version,'room_type',p_room_type,'name',trim(p_name),'charges',config,'active',p_active);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.rate_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Rate request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped room type'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND lower(name)=lower(trim(p_name)) AND (p_plan IS NULL OR id<>p_plan)) THEN RAISE EXCEPTION 'A rate plan with this name already exists for the room type'; END IF;
 IF p_plan IS NULL THEN
  IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'A new rate plan has no previous version'; END IF;
  IF (SELECT count(*) FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property)>=50 THEN RAISE EXCEPTION 'The pilot supports at most 50 rate plans per property'; END IF;
  INSERT INTO irp_pms.rate_plans(tenant_id,property_id,room_type_id,name,tax_basis_points,charges,active) VALUES(p_tenant,p_property,p_room_type,trim(p_name),0,config,p_active) RETURNING * INTO plan;
 ELSE
  SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped rate plan'; END IF;
  IF p_expected_version IS DISTINCT FROM plan.version THEN RAISE EXCEPTION 'Rate plan version changed; refresh before saving'; END IF;
  IF plan.room_type_id<>p_room_type THEN RAISE EXCEPTION 'An existing rate plan cannot change room type'; END IF;
  IF plan.name IS DISTINCT FROM trim(p_name) OR plan.charges IS DISTINCT FROM config OR plan.active IS DISTINCT FROM p_active THEN
   UPDATE irp_pms.rate_plans SET name=trim(p_name),tax_basis_points=0,charges=config,active=p_active,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan RETURNING * INTO plan;
  END IF;
 END IF;
 result:=to_jsonb(plan)||jsonb_build_object('replayed',false);
 INSERT INTO irp_pms.rate_actions(tenant_id,property_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'rate_plan_saved',plan.id,jsonb_build_object('version',plan.version));
 RETURN result;
END $$;

-- Forward from 202609070154_iratepilot_pms_rate_plans.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_nightly_rate(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_start date,p_end date,p_amount_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb; business_date date; property_time_zone text; changed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_plan IS NULL OR p_expected_version IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Provide a versioned plan, request, 1 to 366 nights and nonnegative USD minor units'; END IF;
 command:=jsonb_build_object('action','set_nightly','plan',p_plan,'expected_version',p_expected_version,'start',p_start,'end',p_end,'amount_minor',p_amount_minor);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT time_zone INTO property_time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 business_date:=(clock_timestamp() AT TIME ZONE property_time_zone)::date;
 SELECT * INTO prior FROM irp_pms.rate_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Rate request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_start<business_date THEN RAISE EXCEPTION 'Nightly pricing changes must start on or after the property business date'; END IF;
 SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped rate plan'; END IF;
 IF plan.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Rate plan version changed; refresh before saving'; END IF;
 SELECT EXISTS(SELECT 1 FROM generate_series(p_start,p_end-1,interval '1 day') d LEFT JOIN irp_pms.nightly_rates n ON n.tenant_id=p_tenant AND n.property_id=p_property AND n.plan_id=p_plan AND n.stay_date=d::date WHERE n.amount_minor IS DISTINCT FROM p_amount_minor) INTO changed;
 INSERT INTO irp_pms.nightly_rates(tenant_id,property_id,plan_id,stay_date,amount_minor) SELECT p_tenant,p_property,p_plan,d::date,p_amount_minor FROM generate_series(p_start,p_end-1,interval '1 day') d
 ON CONFLICT(tenant_id,property_id,plan_id,stay_date) DO UPDATE SET amount_minor=excluded.amount_minor;
 IF changed THEN UPDATE irp_pms.rate_plans SET version=version+1,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan RETURNING * INTO plan; END IF;
 result:=jsonb_build_object('plan_id',p_plan,'version',plan.version,'start',p_start,'end',p_end,'nights',p_end-p_start,'amount_minor',p_amount_minor,'changed',changed,'replayed',false);
 INSERT INTO irp_pms.rate_actions(tenant_id,property_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'nightly_rates_saved',p_plan,jsonb_build_object('version',plan.version,'start',p_start,'end',p_end));
 RETURN result;
END $$;

-- Forward from 202609070158_iratepilot_pms_taxes_hotel_fees.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_post_folio(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_kind text,p_amount_minor bigint,p_reference text,p_reason text,p_target uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations; opening irp_pms.folio_openings; prior irp_pms.folio_entries; target irp_pms.folio_entries; entry irp_pms.folio_entries;
 reference_value text:=trim(p_reference);reason_value text:=trim(p_reason);additional bigint;reversed bigint;payments bigint;refunds bigint;corrections bigint;against_target bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_kind IS NULL OR p_kind NOT IN('charge','charge_reversal','external_payment','external_refund','payment_correction') OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR reference_value IS NULL OR length(reference_value) NOT BETWEEN 4 AND 200 OR reason_value IS NULL OR length(reason_value) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Valid entry kind, positive USD minor units, request, reference and reason are required'; END IF;
 IF (p_kind IN('charge','external_payment') AND p_target IS NOT NULL) OR (p_kind IN('external_refund','payment_correction') AND p_target IS NULL) THEN RAISE EXCEPTION 'Invalid entry target'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.reservation_id IS DISTINCT FROM p_reservation OR prior.actor_id IS DISTINCT FROM auth.uid() OR prior.kind IS DISTINCT FROM p_kind OR prior.amount_minor IS DISTINCT FROM p_amount_minor OR prior.reference IS DISTINCT FROM reference_value OR prior.reason IS DISTINCT FROM reason_value OR prior.target_entry_id IS DISTINCT FROM p_target THEN RAISE EXCEPTION 'Folio request identity already used'; END IF;
  RETURN jsonb_build_object('entry_id',prior.id,'request_id',prior.request_id,'kind',prior.kind,'amount_minor',prior.amount_minor,'reference',prior.reference,'reason',prior.reason,'target_entry_id',prior.target_entry_id,'created_at',prior.created_at,'payment_recording','external_only','replayed',true);
 END IF;
 IF p_kind IN('external_payment','external_refund') AND EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind=p_kind AND reference=reference_value) THEN RAISE EXCEPTION 'This external transaction reference is already recorded for this reservation and entry kind'; END IF;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  IF res.guest_total_minor IS NULL OR res.accommodation_minor IS NULL OR res.taxes_minor IS NULL OR res.ota_fees_minor IS NULL THEN RAISE EXCEPTION 'Reservation charge data is unavailable'; END IF;
  INSERT INTO irp_pms.folio_openings(tenant_id,property_id,reservation_id,accommodation_minor,taxes_minor,fees_minor,hotel_fees_minor,charge_breakdown,total_minor,reservation_source,source_version,opened_by)
  VALUES(p_tenant,p_property,p_reservation,res.accommodation_minor,res.taxes_minor,res.ota_fees_minor,res.hotel_fees_minor,res.charge_breakdown,res.guest_total_minor,res.source,res.source_version,auth.uid()) RETURNING * INTO opening;
 END IF;
 SELECT coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0)
 INTO additional,reversed,payments,refunds,corrections FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF p_target IS NOT NULL THEN
  SELECT * INTO target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped folio target'; END IF;
 END IF;
 IF p_kind='charge' THEN
  IF additional+p_amount_minor>999999999999 OR opening.total_minor+additional-reversed+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Charge total exceeds supported range'; END IF;
 ELSIF p_kind='charge_reversal' THEN
  IF p_target IS NOT NULL AND target.kind<>'charge' THEN RAISE EXCEPTION 'A reversal must target an added charge or the opening charges'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind='charge_reversal' AND target_entry_id IS NOT DISTINCT FROM p_target;
  IF against_target+p_amount_minor>(CASE WHEN p_target IS NULL THEN opening.total_minor ELSE target.amount_minor END) OR reversed+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Reversal exceeds unreversed target charges'; END IF;
 ELSIF p_kind='external_payment' THEN
  IF payments+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Recorded payments exceed supported range'; END IF;
 ELSE
  IF target.kind<>'external_payment' THEN RAISE EXCEPTION 'A refund or correction must target an externally recorded payment'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind IN('external_refund','payment_correction') AND target_entry_id=p_target;
  IF against_target+p_amount_minor>target.amount_minor OR p_amount_minor>payments-refunds-corrections OR (p_kind='external_refund' AND refunds+p_amount_minor>999999999999) OR (p_kind='payment_correction' AND corrections+p_amount_minor>999999999999) THEN RAISE EXCEPTION 'Refund or payment correction exceeds unrefunded or uncorrected externally recorded payments'; END IF;
 END IF;
 INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,target_entry_id,actor_id)
 VALUES(p_tenant,p_property,p_reservation,p_request,p_kind,p_amount_minor,reference_value,reason_value,p_target,auth.uid()) RETURNING * INTO entry;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'folio_entry_recorded',p_reservation,jsonb_build_object('entry_id',entry.id,'kind',p_kind,'amount_minor',p_amount_minor,'payment_recording','external_only'));
 RETURN jsonb_build_object('entry_id',entry.id,'request_id',entry.request_id,'kind',entry.kind,'amount_minor',entry.amount_minor,'reference',entry.reference,'reason',entry.reason,'target_entry_id',entry.target_entry_id,'created_at',entry.created_at,'payment_recording','external_only','replayed',false);
END $$;

-- Forward from 202609070168_iratepilot_pms_operational_authorization.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_amend_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest_name text,p_room_type uuid,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.reservation_amendments; opening irp_pms.folio_openings;
 command jsonb; result jsonb; day date; available integer; used integer; guest_limit integer; has_opening boolean; needs_reconciliation boolean; total bigint; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_version',p_expected_version,'guest_name',trim(p_guest_name),'room_type_id',p_room_type,'arrival',p_arrival,'departure',p_departure,'guests',p_guests,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor);
 SELECT * INTO prior FROM irp_pms.reservation_amendments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Amendment request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 IF previous.source NOT IN('direct','migration') THEN RAISE EXCEPTION 'Amend an OTA reservation at its source'; END IF;
 IF previous.status<>'Confirmed' THEN RAISE EXCEPTION 'Only confirmed unstarted reservations can be amended'; END IF;
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before amending' USING ERRCODE='PT409'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest name or future stay dates'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Invalid scoped room type or guest count'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 has_opening:=FOUND;
 IF has_opening AND member_role NOT IN('owner','manager') AND (p_accommodation_minor IS DISTINCT FROM previous.accommodation_minor OR p_taxes_minor IS DISTINCT FROM previous.taxes_minor) THEN RAISE EXCEPTION 'Owner or manager required to amend amounts after the folio opens' USING ERRCODE='42501'; END IF;
 IF previous.physical_room_id IS NOT NULL THEN
  IF previous.room_type_id IS DISTINCT FROM p_room_type OR previous.arrival IS DISTINCT FROM p_arrival OR previous.departure IS DISTINCT FROM p_departure THEN RAISE EXCEPTION 'Assigned-room date or room-type changes require separate room reassignment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=previous.physical_room_id AND room_type_id=p_room_type) THEN RAISE EXCEPTION 'Assigned physical room does not match this room type'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND physical_room_id=previous.physical_room_id AND (status IN('Confirmed','In house') AND arrival<p_departure AND departure>p_arrival OR status='In house' AND departure<business_date AND p_departure>business_date)) THEN RAISE EXCEPTION 'Assigned physical room overlaps another active stay'; END IF;
 END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND stay_date=day FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND room_type_id=p_room_type AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
 END LOOP;
 UPDATE irp_pms.reservations SET guest_name=trim(p_guest_name),room_type_id=p_room_type,arrival=p_arrival,departure=p_departure,guests=p_guests,
 accommodation_minor=p_accommodation_minor,taxes_minor=p_taxes_minor,guest_total_minor=total,source_version=source_version+1,
 payload_hash=encode(sha256(convert_to(command::text,'UTF8')),'hex')
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO changed;
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor OR opening.hotel_fees_minor IS DISTINCT FROM changed.hotel_fees_minor OR opening.charge_breakdown IS DISTINCT FROM changed.charge_breakdown);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false));
 INSERT INTO irp_pms.reservation_amendments(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result)
 VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_amended',p_reservation,
 jsonb_build_object('previous_version',previous.source_version,'source_version',changed.source_version,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false)));
 RETURN result;
END $$;

-- Forward from 202609070168_iratepilot_pms_operational_authorization.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_extend_stay(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_departure date,p_accommodation_minor bigint,p_taxes_minor bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.stay_extensions; opening irp_pms.folio_openings;
 command jsonb; result jsonb; business_date date; day date; available integer; used integer; has_opening boolean; needs_reconciliation boolean; total bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_version',p_expected_version,'departure',p_departure,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.stay_extensions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Extension request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 IF previous.source NOT IN('direct','migration') THEN RAISE EXCEPTION 'Extend an OTA reservation through its source; local source-owned stay changes require review'; END IF;
 IF previous.status<>'In house' THEN RAISE EXCEPTION 'Only an in-house reservation can be extended'; END IF;
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before extending' USING ERRCODE='PT409'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_departure IS NULL OR p_departure<=previous.departure OR p_departure<=business_date OR p_departure-previous.arrival>30 THEN RAISE EXCEPTION 'Extension must depart after today and the existing departure, within 30 total nights'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Provide an extension reason of 4 to 500 characters'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=previous.physical_room_id AND room_type_id=previous.room_type_id) THEN RAISE EXCEPTION 'In-house physical room does not match the booked room type'; END IF;
 -- Validate all remaining nights with the same scope and predicate as every
 -- other admission. Exclude only this reservation, never a source booking ID.
 FOR day IN SELECT generate_series(business_date,p_departure-1,interval '1 day')::date LOOP
  SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=previous.room_type_id AND stay_date=day FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND room_type_id=previous.room_type_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND physical_room_id=previous.physical_room_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date)) THEN RAISE EXCEPTION 'Physical room overlaps another active stay on %',day; END IF;
 END LOOP;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 has_opening:=FOUND;
 UPDATE irp_pms.reservations SET departure=p_departure,accommodation_minor=p_accommodation_minor,taxes_minor=p_taxes_minor,guest_total_minor=total,source_version=source_version+1,
 payload_hash=encode(sha256(convert_to(command::text,'UTF8')),'hex')
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO changed;
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor OR opening.hotel_fees_minor IS DISTINCT FROM changed.hotel_fees_minor OR opening.charge_breakdown IS DISTINCT FROM changed.charge_breakdown);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'previous_departure',previous.departure,'business_date',business_date,'overdue_resolved',previous.departure<business_date,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false));
 INSERT INTO irp_pms.stay_extensions(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result) VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'stay_extended',p_reservation,
 jsonb_build_object('previous_departure',previous.departure,'departure',changed.departure,'previous_version',previous.source_version,'source_version',changed.source_version,'reason',trim(p_reason),'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false)));
 RETURN result;
END $$;

-- Forward from 202609070145_iratepilot_pms_inbound_events.sql; tenant serialization and same-role recheck only.
CREATE OR REPLACE FUNCTION irp_pms.reprocess_reservation(p_tenant uuid,p_property uuid,p_event text,p_request uuid,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt irp_pms.inbound_events; action irp_pms.review_actions; latest irp_pms.inbound_events; applied text; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR NOT irp_pms.can_manage(p_tenant) THEN RAISE EXCEPTION 'Manager membership required'; END IF;
 IF p_request IS NULL OR p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Review request and reference required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 IF actor IS NULL OR NOT irp_pms.can_manage(p_tenant) THEN RAISE EXCEPTION 'Manager membership required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,1));
 SELECT * INTO action FROM irp_pms.review_actions WHERE request_id=p_request;
 IF FOUND THEN
  IF action.tenant_id<>p_tenant OR action.property_id<>p_property OR action.event_id IS DISTINCT FROM p_event OR action.actor_id<>actor OR action.reference<>trim(p_reference) THEN RAISE EXCEPTION 'Review request identity already used'; END IF;
  RETURN jsonb_build_object('eventId',p_event,'requestId',p_request,'applicationOutcome',action.outcome);
 END IF;
 SELECT * INTO receipt FROM irp_pms.inbound_events WHERE tenant_id=p_tenant AND property_id=p_property AND event_id=p_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review event required'; END IF;
 IF coalesce(receipt.resolution_outcome,receipt.application_outcome) NOT IN('review:capacity_missing','review:sold_out') OR receipt.normalized_record IS NULL THEN RAISE EXCEPTION 'This review requires a new corrected source event or manual reconciliation'; END IF;
 SELECT * INTO latest FROM irp_pms.inbound_events WHERE tenant_id=p_tenant AND property_id=p_property AND booking_id=receipt.booking_id AND application_outcome<>'review:version_conflict' ORDER BY source_version DESC LIMIT 1;
 IF latest.source_version>receipt.source_version THEN applied:='stale';
 ELSIF latest.source_version<>receipt.source_version OR latest.payload_hash<>receipt.payload_hash THEN RAISE EXCEPTION 'Review head conflicts with source';
 ELSE applied:=irp_pms.apply_reservation(p_tenant,p_property,receipt.normalized_record);
 END IF;
 -- Keep the original receipt and reason; resolution is a separate audit result.
 UPDATE irp_pms.inbound_events SET resolution_outcome=applied,resolved_at=CASE WHEN applied NOT LIKE 'review:%' THEN now() END WHERE tenant_id=p_tenant AND property_id=p_property AND booking_id=receipt.booking_id AND source_version=receipt.source_version AND payload_hash=receipt.payload_hash AND application_outcome IN('review:capacity_missing','review:sold_out');
 INSERT INTO irp_pms.review_actions(request_id,tenant_id,property_id,event_id,actor_id,reference,outcome) VALUES(p_request,p_tenant,p_property,p_event,actor,trim(p_reference),applied);
 RETURN jsonb_build_object('eventId',p_event,'requestId',p_request,'applicationOutcome',applied);
END $$;
COMMIT;
