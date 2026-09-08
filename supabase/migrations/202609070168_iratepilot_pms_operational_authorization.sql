BEGIN;
-- Staff membership changes serialize on the organization row via147's
-- pilot_require_owner(...,true). Retain a conflicting tenant SHARE lock for
-- the complete operation, including later property/reservation/room waits.
-- Static forward definitions preserve installed142-167. Deliberate application
-- conflicts use PT409 (HTTP409), not engine serialization code40001, because
-- pre16 PostgREST can retry40001 indefinitely. Actual database errors propagate.
-- Reviewed cancellation separately uses PT412 for a reversible civil-date fence.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_stay_action(p_tenant uuid,p_property uuid,p_reservation uuid,p_action text,p_room uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; res irp_pms.reservations; room irp_pms.rooms; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reservation'; END IF;
 IF p_action='check_in' THEN
  IF res.status='In house' AND res.physical_room_id=p_room THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'Confirmed' OR business_date<res.arrival OR business_date>=res.departure THEN RAISE EXCEPTION 'Reservation cannot check in on this business date'; END IF;
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
  IF NOT FOUND OR room.room_type_id IS DISTINCT FROM res.room_type_id OR room.housekeeping<>'Clean' THEN RAISE EXCEPTION 'A clean room of the booked type is required'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND id<>res.id AND status='In house') THEN RAISE EXCEPTION 'Physical room is occupied'; END IF;
  UPDATE irp_pms.reservations SET status='In house',physical_room_id=p_room,checked_in_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 ELSIF p_action='check_out' THEN
  IF res.status='Checked out' THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'In house' OR business_date<res.arrival THEN RAISE EXCEPTION 'Only an in-house reservation can check out'; END IF;
  UPDATE irp_pms.reservations SET status='Checked out',checked_out_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
  UPDATE irp_pms.rooms SET housekeeping='Dirty' WHERE tenant_id=p_tenant AND property_id=p_property AND id=res.physical_room_id;
 ELSIF p_action='cancel' THEN
  RAISE EXCEPTION 'Cancellation now requires review; use irp_pms_pilot_cancellation_preview and irp_pms_pilot_cancel_reservation';
 ELSE RAISE EXCEPTION 'Unknown stay action';
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),p_action,res.id);
 RETURN to_jsonb(res);
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_housekeeping(p_tenant uuid,p_property uuid,p_room uuid,p_request uuid,p_expected_version bigint,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;prior irp_pms.housekeeping_requests;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_room IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_status IS NULL OR p_status NOT IN('Clean','Dirty','Inspect') THEN RAISE EXCEPTION 'Room, request, expected state version and housekeeping status are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 -- Recheck membership after a possible lock wait before applying a new action.
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.housekeeping_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.room_id IS DISTINCT FROM p_room OR prior.expected_version IS DISTINCT FROM p_expected_version OR prior.requested_status IS DISTINCT FROM p_status THEN RAISE EXCEPTION 'Housekeeping request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped physical room'; END IF;
 IF room.state_version<>p_expected_version THEN RAISE EXCEPTION 'Room state changed; refresh before updating housekeeping' USING ERRCODE='PT409'; END IF;
 IF p_status IN('Clean','Inspect') AND EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status='In house') THEN RAISE EXCEPTION 'Occupied room cannot be marked ready'; END IF;
 UPDATE irp_pms.rooms SET housekeeping=p_status WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 result:=jsonb_build_object('room',to_jsonb(room),'request_id',p_request,'replayed',false);
 INSERT INTO irp_pms.housekeeping_requests(tenant_id,property_id,request_id,room_id,actor_id,expected_version,requested_status,result) VALUES(p_tenant,p_property,p_request,p_room,auth.uid(),p_expected_version,p_status,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'housekeeping_updated',p_room,jsonb_build_object('status',p_status,'previous_version',p_expected_version,'state_version',room.state_version,'request_id',p_request));
 RETURN result;
END $$;

-- Forward from 202609070158_iratepilot_pms_taxes_hotel_fees.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_amend_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest_name text,p_room_type uuid,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.reservation_amendments; opening irp_pms.folio_openings;
 command jsonb; result jsonb; day date; available integer; used integer; guest_limit integer; has_opening boolean; needs_reconciliation boolean; total bigint; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
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

-- Forward from 202609070158_iratepilot_pms_taxes_hotel_fees.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_extend_stay(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_departure date,p_accommodation_minor bigint,p_taxes_minor bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.stay_extensions; opening irp_pms.folio_openings;
 command jsonb; result jsonb; business_date date; day date; available integer; used integer; has_opening boolean; needs_reconciliation boolean; total bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
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

-- Forward from 202609070159_iratepilot_pms_property_models_reports.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_configure_operating_model(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_mode text,p_max_guests integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; prior irp_pms.operating_model_requests; command jsonb; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Request and current operating model version are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','configure','property_id',p_property,'expected_version',p_expected_version,'mode',p_mode,'max_guests',p_max_guests);
 SELECT * INTO prior FROM irp_pms.operating_model_requests WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Operating model request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF prop.operating_model_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Operating model changed; refresh before saving' USING ERRCODE='PT409'; END IF;
 PERFORM irp_pms.apply_operating_model(p_tenant,p_property,p_mode,p_max_guests);
 result:=irp_pms.operating_profile(p_tenant,p_property)||jsonb_build_object('replayed',false);
 INSERT INTO irp_pms.operating_model_requests(tenant_id,property_id,request_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 IF prop.operating_model IS DISTINCT FROM p_mode OR prop.whole_home_max_guests IS DISTINCT FROM p_max_guests THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'operating_model_configured',p_property,jsonb_build_object('previous_model',prop.operating_model,'mode',p_mode,'max_guests',p_max_guests,'version',result->'version'));
 END IF;
 RETURN result;
END $$;

-- Forward from 202609070160_iratepilot_pms_service_day_revenue.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_approve_service_allocation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_expected_pricing_hash text,p_lines jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE data jsonb;r irp_pms.reservations;book irp_pms.service_books;prior irp_pms.service_requests;command jsonb;result jsonb;line jsonb;normalized jsonb:='[]';values_sum bigint:=0;row_sum bigint;amount numeric;key text;date_value date;previous_date date;normalized_line jsonb;approval irp_pms.service_allocation_approvals;closed irp_pms.service_day_entries;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_source_version IS NULL OR p_expected_pricing_hash IS NULL OR p_expected_pricing_hash!~'^[a-f0-9]{64}$' OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR octet_length(p_lines::text)>65536 OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Provide versioned pricing,1 to30 explicit nightly allocations and a reconciliation reason'; END IF;
 FOR line IN SELECT x FROM jsonb_array_elements(p_lines) x LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(line))<>6 OR NOT(line ?& ARRAY['date','accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor']) OR jsonb_typeof(line->'date') IS DISTINCT FROM 'string' OR (line->>'date')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Unexpected nightly allocation fields'; END IF;
  date_value:=(line->>'date')::date;
  IF previous_date IS NOT NULL AND date_value<>previous_date+1 THEN RAISE EXCEPTION 'Allocation dates must be unique, contiguous and ordered'; END IF;previous_date:=date_value;
  row_sum:=0;normalized_line:=jsonb_build_object('date',date_value);
  FOREACH key IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor'] LOOP
   IF jsonb_typeof(line->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Allocation amounts must be integer USD minor units'; END IF;
   amount:=(line->>key)::numeric;
   IF amount<>trunc(amount) OR amount NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Allocation amount is outside the supported range'; END IF;
   row_sum:=row_sum+amount::bigint;normalized_line:=normalized_line||jsonb_build_object(key,amount::bigint);
  END LOOP;
  values_sum:=values_sum+row_sum;
  IF values_sum>999999999999 THEN RAISE EXCEPTION 'Allocation total exceeds supported USD amount'; END IF;
  normalized:=normalized||jsonb_build_array(normalized_line||jsonb_build_object('total_minor',row_sum,'tax_allocation','manager_aggregate','taxes','[]'::jsonb,'fees','[]'::jsonb));
 END LOOP;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','approve_allocation','reservation_id',p_reservation,'expected_source_version',p_expected_source_version,'pricing_hash',p_expected_pricing_hash,'lines',normalized,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used'; END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Initialize the service ledger first'; END IF;
 data:=irp_pms.service_pricing(p_tenant,p_property,p_reservation);r:=jsonb_populate_record(NULL::irp_pms.reservations,data->'reservation');
 IF r.source_version IS DISTINCT FROM p_expected_source_version OR data->>'pricing_hash' IS DISTINCT FROM p_expected_pricing_hash THEN RAISE EXCEPTION 'Reservation pricing changed; refresh before approval' USING ERRCODE='PT409'; END IF;
 IF r.arrival IS NULL OR r.departure IS NULL OR (normalized->0->>'date')::date<>r.arrival OR previous_date<>r.departure-1 THEN RAISE EXCEPTION 'Allocation must cover every original stay date exactly'; END IF;
 IF (data->>'total_minor') IS NULL OR values_sum IS DISTINCT FROM (data->>'total_minor')::bigint THEN RAISE EXCEPTION 'Allocation must equal the current folio charge total, or booked total before a folio opens'; END IF;
 IF (data->>'component_totals_fixed')::boolean THEN
  FOREACH key IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor'] LOOP
   SELECT sum((x->>key)::bigint) INTO amount FROM jsonb_array_elements(normalized) x;
   IF amount IS DISTINCT FROM (data->'component_totals'->>key)::numeric THEN RAISE EXCEPTION 'Known charge component totals must be preserved; nightly allocation cannot reclassify tax or fees';END IF;
  END LOOP;
 END IF;
 FOR closed IN SELECT * FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation LOOP
  SELECT x INTO line FROM jsonb_array_elements(normalized) x WHERE (x->>'date')::date=closed.service_date;
  IF NOT FOUND OR (line->>'accommodation_minor')::bigint<>closed.accommodation_minor OR (line->>'taxes_minor')::bigint<>closed.taxes_minor OR (line->>'hotel_fees_minor')::bigint<>closed.hotel_fees_minor OR (line->>'ota_fees_minor')::bigint<>closed.ota_fees_minor OR (line->>'other_revenue_minor')::bigint<>closed.other_revenue_minor THEN RAISE EXCEPTION 'Closed service-day allocations are immutable; a separate forward adjustment is required'; END IF;
 END LOOP;
 INSERT INTO irp_pms.service_allocation_approvals(tenant_id,property_id,reservation_id,request_id,actor_id,source_version,pricing_hash,lines,reason) VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),r.source_version,p_expected_pricing_hash,normalized,trim(p_reason)) RETURNING * INTO approval;
 DELETE FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 UPDATE irp_pms.service_books SET version=version+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING * INTO book;
 result:=jsonb_build_object('reservation_id',p_reservation,'approval_id',approval.id,'pricing_hash',p_expected_pricing_hash,'lines',normalized,'total_minor',values_sum,'version',book.version,'replayed',false);
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_allocation_approved',p_reservation,jsonb_build_object('approval_id',approval.id,'reason',trim(p_reason),'pricing_hash',p_expected_pricing_hash));
 RETURN result;
END $$;

-- Forward from 202609070161_iratepilot_pms_guest_billing_profiles.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_guest_profile(p_tenant uuid,p_property uuid,p_request uuid,p_guest uuid,p_expected_version bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE guest irp_pms.guest_profiles;prior irp_pms.guest_requests;normalized_data jsonb;hash text;result jsonb;changed boolean;created boolean:=p_guest IS NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR (p_guest IS NULL AND p_expected_version IS NOT NULL) OR (p_guest IS NOT NULL AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991)) THEN RAISE EXCEPTION 'Provide a request and the exact guest version, or null guest/version to create'; END IF;
 normalized_data:=irp_pms.normalize_guest_data(p_data,'profile');
 hash:=encode(sha256(convert_to(jsonb_build_object('action','save_profile','guest_id',p_guest,'expected_version',p_expected_version,'data',normalized_data)::text,'UTF8')),'hex');
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.guest_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'Guest request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_guest IS NULL THEN
  INSERT INTO irp_pms.guest_profiles(tenant_id,property_id,data,created_by,updated_by) VALUES(p_tenant,p_property,normalized_data,auth.uid(),auth.uid()) RETURNING * INTO guest;changed:=true;
 ELSE
  SELECT * INTO guest FROM irp_pms.guest_profiles WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_guest;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped guest profile'; END IF;
  IF guest.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Guest profile changed; refresh before saving' USING ERRCODE='PT409'; END IF;
  changed:=guest.data IS DISTINCT FROM normalized_data;
  IF changed THEN UPDATE irp_pms.guest_profiles SET data=normalized_data,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_guest RETURNING * INTO guest; END IF;
 END IF;
 result:=jsonb_build_object('guest_id',guest.id,'version',guest.version,'created',created,'replayed',false);
 INSERT INTO irp_pms.guest_requests(tenant_id,property_id,request_id,actor_id,action,command_hash,result) VALUES(p_tenant,p_property,p_request,auth.uid(),'save_guest_profile',hash,result);
 IF changed THEN INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'guest_profile_saved',guest.id,jsonb_build_object('version',guest.version,'created',created)); END IF;
 RETURN result;
END $$;

-- Forward from 202609070161_iratepilot_pms_guest_billing_profiles.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_reservation_guest(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest uuid,p_guest_expected_version bigint,p_contact jsonb,p_billing_party jsonb,p_keep_existing_contact boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE party irp_pms.reservation_parties;guest irp_pms.guest_profiles;prior irp_pms.guest_requests;contact_data jsonb;billing_data jsonb;hash text;result jsonb;recorded boolean;changed boolean;target_guest uuid:=p_guest;target_guest_version bigint:=p_guest_expected_version;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740991 OR p_keep_existing_contact IS NULL OR
  (p_keep_existing_contact AND (p_guest IS NOT NULL OR p_guest_expected_version IS NOT NULL OR p_contact IS NOT NULL)) OR
  (NOT p_keep_existing_contact AND ((p_guest IS NULL AND (p_guest_expected_version IS NOT NULL OR p_contact IS NULL)) OR
  (p_guest IS NOT NULL AND (p_guest_expected_version IS NULL OR p_guest_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_contact IS NOT NULL)))) THEN RAISE EXCEPTION 'Provide a versioned stay contact, either explicit local contact, a versioned guest profile to copy, or keep the existing saved contact'; END IF;
 IF NOT p_keep_existing_contact AND p_guest IS NULL THEN contact_data:=irp_pms.normalize_guest_data(p_contact,'contact'); END IF;
 billing_data:=irp_pms.normalize_guest_data(p_billing_party,'billing');
 hash:=encode(sha256(convert_to(jsonb_build_object('action','save_reservation_guest','reservation_id',p_reservation,'expected_version',p_expected_version,'guest_id',p_guest,'guest_expected_version',p_guest_expected_version,'contact',contact_data,'billing_party',billing_data,'keep_existing_contact',p_keep_existing_contact)::text,'UTF8')),'hex');
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.guest_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'Guest request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO party FROM irp_pms.reservation_parties WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;recorded:=FOUND;
 IF (CASE WHEN recorded THEN party.version ELSE 0 END) IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Reservation contact or billing changed; refresh before saving' USING ERRCODE='PT409'; END IF;
 IF p_keep_existing_contact THEN
  IF NOT recorded THEN RAISE EXCEPTION 'A saved reservation contact is required before keeping it'; END IF;
  contact_data:=party.contact;target_guest:=party.guest_id;target_guest_version:=party.guest_profile_version;
 ELSIF p_guest IS NOT NULL THEN
  SELECT * INTO guest FROM irp_pms.guest_profiles WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_guest;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped guest profile'; END IF;
  IF guest.version IS DISTINCT FROM p_guest_expected_version THEN RAISE EXCEPTION 'Guest profile changed; refresh before linking' USING ERRCODE='PT409'; END IF;
  contact_data:=guest.data;
 END IF;
 changed:=NOT recorded OR party.contact IS DISTINCT FROM contact_data OR party.billing_party IS DISTINCT FROM billing_data OR party.guest_id IS DISTINCT FROM target_guest OR party.guest_profile_version IS DISTINCT FROM target_guest_version;
 IF NOT recorded THEN
  INSERT INTO irp_pms.reservation_parties(tenant_id,property_id,reservation_id,guest_id,guest_profile_version,contact,billing_party,created_by,updated_by) VALUES(p_tenant,p_property,p_reservation,target_guest,target_guest_version,contact_data,billing_data,auth.uid(),auth.uid()) RETURNING * INTO party;
 ELSIF changed THEN
  UPDATE irp_pms.reservation_parties SET guest_id=target_guest,guest_profile_version=target_guest_version,contact=contact_data,billing_party=billing_data,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation RETURNING * INTO party;
 END IF;
 result:=jsonb_build_object('reservation_id',p_reservation,'version',party.version,'guest_id',party.guest_id,'guest_profile_version',party.guest_profile_version,'replayed',false);
 INSERT INTO irp_pms.guest_requests(tenant_id,property_id,request_id,actor_id,action,command_hash,result) VALUES(p_tenant,p_property,p_request,auth.uid(),'save_reservation_guest',hash,result);
 IF changed THEN INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_guest_saved',p_reservation,jsonb_build_object('version',party.version,'guest_id',party.guest_id,'guest_profile_version',party.guest_profile_version)); END IF;
 RETURN result;
END $$;

-- Forward from 202609070162_iratepilot_pms_service_forward_corrections.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_approve_service_forward(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_book_version bigint,p_expected_source_version bigint,p_expected_pricing_hash text,p_expected_preview_hash text,p_delta jsonb,p_tax_buckets jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.service_requests;book irp_pms.service_books;command jsonb;data jsonb;delta jsonb;tax_buckets jsonb;after_components jsonb;after_taxes jsonb;result jsonb;approval irp_pms.service_forward_approvals;k text;n bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_book_version IS NULL OR p_expected_source_version IS NULL OR p_expected_pricing_hash IS NULL OR p_expected_pricing_hash!~'^[a-f0-9]{64}$' OR p_expected_preview_hash IS NULL OR p_expected_preview_hash!~'^[a-f0-9]{64}$' OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Provide scoped versioned pricing, both reviewed hashes, request and a correction reason';END IF;
 delta:=irp_pms.service_delta(p_delta);tax_buckets:=irp_pms.service_delta(p_tax_buckets,true);
 IF irp_pms.service_vector_sum(tax_buckets)<>(delta->>'taxes_minor')::bigint THEN RAISE EXCEPTION 'Signed tax buckets must sum exactly to the tax correction';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','service_forward','reservation_id',p_reservation,'expected_book_version',p_expected_book_version,'expected_source_version',p_expected_source_version,'pricing_hash',p_expected_pricing_hash,'preview_hash',p_expected_preview_hash,'delta',delta,'tax_buckets',tax_buckets,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 data:=irp_pms.service_forward_data(p_tenant,p_property,p_reservation);
 IF NOT(data->>'eligible')::boolean THEN RAISE EXCEPTION 'Only completed stays with every unchanged service date already allocated can use a forward correction';END IF;
 IF (data->>'book_version')::bigint IS DISTINCT FROM p_expected_book_version OR (data->>'source_version')::bigint IS DISTINCT FROM p_expected_source_version OR data->>'pricing_hash' IS DISTINCT FROM p_expected_pricing_hash OR data->>'preview_hash' IS DISTINCT FROM p_expected_preview_hash THEN RAISE EXCEPTION 'Forward correction data changed; refresh and review again' USING ERRCODE='PT409';END IF;
 IF irp_pms.service_vector_sum(delta) IS DISTINCT FROM (data->>'required_total_delta')::bigint THEN RAISE EXCEPTION 'Signed component delta must equal the current unallocated charge difference';END IF;
 after_components:=irp_pms.service_vector_add(data->'allocated_components',delta);after_taxes:=irp_pms.service_vector_add(data->'allocated_tax_buckets',tax_buckets);
 FOR k,n IN SELECT key,(value#>>'{}')::bigint FROM jsonb_each(after_components) LOOP IF n NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Correction would make a cumulative charge component negative or excessive';END IF;END LOOP;
 FOR k,n IN SELECT key,(value#>>'{}')::bigint FROM jsonb_each(after_taxes) LOOP IF n NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Correction would make a cumulative tax bucket negative or excessive';END IF;END LOOP;
 IF (data->>'component_totals_fixed')::boolean AND after_components IS DISTINCT FROM data->'target_components' THEN RAISE EXCEPTION 'Known charge component totals must be preserved';END IF;
 IF NOT(data->>'reconciliation_pending')::boolean AND NOT EXISTS(SELECT 1 FROM jsonb_each(delta) WHERE (value#>>'{}')::bigint<>0) AND NOT EXISTS(SELECT 1 FROM jsonb_each(tax_buckets) WHERE (value#>>'{}')::bigint<>0) THEN RAISE EXCEPTION 'No financial correction or unresolved review remains';END IF;
 IF (SELECT count(*) FROM irp_pms.service_forward_approvals a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation)>=1000 THEN RAISE EXCEPTION 'At most1000 forward corrections can be approved for one stay';END IF;
 IF (SELECT count(*) FROM irp_pms.service_forward_approvals a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.service_date=(data->>'service_date')::date)>=1000 THEN RAISE EXCEPTION 'At most1000 forward corrections can be approved on one service day';END IF;
 INSERT INTO irp_pms.service_forward_approvals(tenant_id,property_id,reservation_id,service_date,request_id,actor_id,source_version,pricing_hash,preview_hash,delta,tax_buckets,reason,review_snapshot) VALUES(p_tenant,p_property,p_reservation,(data->>'service_date')::date,p_request,auth.uid(),p_expected_source_version,p_expected_pricing_hash,p_expected_preview_hash,delta,tax_buckets,trim(p_reason),(data-'prior_adjustments')||jsonb_build_object('prior_adjustment_count',jsonb_array_length(data->'prior_adjustments'),'prior_adjustments_hash',encode(sha256(convert_to((data->'prior_adjustments')::text,'UTF8')),'hex'))) RETURNING * INTO approval;
 DELETE FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 UPDATE irp_pms.service_books SET version=version+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING * INTO book;
 result:=jsonb_build_object('adjustment_id',approval.id,'reservation_id',p_reservation,'service_date',approval.service_date,'delta',delta,'tax_buckets',tax_buckets,'total_minor',irp_pms.service_vector_sum(delta),'allocated_components_after',after_components,'allocated_tax_buckets_after',after_taxes,'pricing_hash',p_expected_pricing_hash,'book_version',book.version,'posted',false,'folio_changed',false,'reason',trim(p_reason),'replayed',false);
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_forward_approved',p_reservation,jsonb_build_object('adjustment_id',approval.id,'service_date',approval.service_date,'delta',delta,'tax_buckets',tax_buckets,'reason',trim(p_reason)));
 RETURN result;
END $$;

-- Forward from 202609070162_iratepilot_pms_service_forward_corrections.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION irp_pms.service_close(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_expected_preview_hash text,p_expected_corrections_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE book irp_pms.service_books;prior irp_pms.service_requests;command jsonb;data jsonb;result jsonb;row_data jsonb;line jsonb;close_row irp_pms.service_day_closes;a irp_pms.service_forward_approvals;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_preview_hash IS NULL OR p_expected_preview_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'A request, expected close version and reviewed preview hash are required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=CASE WHEN p_expected_corrections_hash IS NULL THEN jsonb_build_object('action','close','expected_version',p_expected_version,'preview_hash',p_expected_preview_hash) ELSE jsonb_build_object('action','close_v2','expected_version',p_expected_version,'preview_hash',p_expected_preview_hash,'corrections_hash',p_expected_corrections_hash) END;
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Initialize the service ledger first';END IF;
 IF book.version<>p_expected_version THEN RAISE EXCEPTION 'Service close version changed; refresh the preview' USING ERRCODE='PT409';END IF;
 IF p_expected_corrections_hash IS NULL THEN
  IF jsonb_array_length(irp_pms.service_pending_forward(p_tenant,p_property))>0 THEN RAISE EXCEPTION 'Use the updated close workflow to review pending forward corrections';END IF;
  data:=irp_pms.service_day_data(p_tenant,p_property);
 ELSE
  data:=irp_pms.service_day_data_v2(p_tenant,p_property);
  IF data->>'corrections_hash' IS DISTINCT FROM p_expected_corrections_hash THEN RAISE EXCEPTION 'Forward corrections changed; refresh and review before closing' USING ERRCODE='PT409';END IF;
 END IF;
 IF data->>'preview_hash'<>p_expected_preview_hash THEN RAISE EXCEPTION 'Service-day data changed; refresh and review the preview' USING ERRCODE='PT409';END IF;
 IF NOT (data->>'can_close')::boolean THEN RAISE EXCEPTION 'Resolve all service-day blockers before closing';END IF;
 INSERT INTO irp_pms.service_day_closes(tenant_id,property_id,service_date,request_id,actor_id,preview_hash,snapshot) VALUES(p_tenant,p_property,book.next_service_date,p_request,auth.uid(),p_expected_preview_hash,data) RETURNING * INTO close_row;
 FOR row_data IN SELECT x FROM jsonb_array_elements(data->'rows') x LOOP
  line:=row_data->'allocation';
  INSERT INTO irp_pms.service_day_entries(tenant_id,property_id,service_date,reservation_id,source_version,pricing_hash,allocation_source,room_type_id,physical_room_id,occupied_night,accommodation_minor,taxes_minor,hotel_fees_minor,ota_fees_minor,other_revenue_minor,total_minor,details)
  VALUES(p_tenant,p_property,book.next_service_date,(row_data->>'reservation_id')::uuid,(row_data->>'source_version')::bigint,row_data->>'pricing_hash',row_data->>'allocation_source',(row_data->>'room_type_id')::uuid,(row_data->>'physical_room_id')::uuid,(row_data->>'occupied_night')::boolean,(line->>'accommodation_minor')::bigint,(line->>'taxes_minor')::bigint,(line->>'hotel_fees_minor')::bigint,(line->>'ota_fees_minor')::bigint,(line->>'other_revenue_minor')::bigint,(line->>'total_minor')::bigint,line||jsonb_build_object('guest_name',row_data->>'guest_name','source',row_data->>'source','status',row_data->>'status'));
 END LOOP;
 FOR a IN SELECT ap.* FROM irp_pms.service_forward_approvals ap WHERE ap.tenant_id=p_tenant AND ap.property_id=p_property AND ap.service_date=book.next_service_date AND NOT EXISTS(SELECT 1 FROM irp_pms.service_forward_entries e WHERE e.tenant_id=ap.tenant_id AND e.property_id=ap.property_id AND e.adjustment_id=ap.id) ORDER BY ap.created_at,ap.id LOOP
  INSERT INTO irp_pms.service_forward_entries(tenant_id,property_id,service_date,adjustment_id,reservation_id,accommodation_minor,taxes_minor,hotel_fees_minor,ota_fees_minor,other_revenue_minor,total_minor,tax_buckets,details)
  VALUES(p_tenant,p_property,book.next_service_date,a.id,a.reservation_id,(a.delta->>'accommodation_minor')::bigint,(a.delta->>'taxes_minor')::bigint,(a.delta->>'hotel_fees_minor')::bigint,(a.delta->>'ota_fees_minor')::bigint,(a.delta->>'other_revenue_minor')::bigint,irp_pms.service_vector_sum(a.delta),a.tax_buckets,jsonb_build_object('reason',a.reason,'approved_by',a.actor_id,'approved_at',a.created_at,'source_version',a.source_version,'pricing_hash',a.pricing_hash,'original_service_start',a.review_snapshot->'original_service_start','original_service_end',a.review_snapshot->'original_service_end','guest_name',a.review_snapshot->'guest_name','financial_basis',a.review_snapshot->'financial_basis'));
 END LOOP;
 UPDATE irp_pms.service_books SET next_service_date=next_service_date+1,version=version+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING * INTO book;
 result:=jsonb_build_object('close_id',close_row.id,'service_date',close_row.service_date,'closed_at',close_row.closed_at,'next_service_date',book.next_service_date,'version',book.version,'totals',data->'totals','entry_count',jsonb_array_length(data->'rows'),'currency','USD','accounting_scope','service_date_allocation','folio_changed',false,'replayed',false);
 IF p_expected_corrections_hash IS NOT NULL THEN result:=result||jsonb_build_object('api_version',2,'ordinary_entry_count',jsonb_array_length(data->'rows'),'correction_entry_count',jsonb_array_length(data->'pending_adjustments'),'corrections_hash',p_expected_corrections_hash,'ordinary_totals',data->'ordinary_totals','correction_totals',data->'correction_totals');END IF;
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_day_closed',close_row.id,jsonb_build_object('service_date',close_row.service_date,'entry_count',jsonb_array_length(data->'rows'),'preview_hash',p_expected_preview_hash));
 RETURN result;
END $$;

-- Forward from 202609070163_iratepilot_pms_room_moves.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_move_room(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_from_room uuid,p_expected_from_room_version bigint,p_to_room uuid,p_expected_to_room_version bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;res irp_pms.reservations;old_room irp_pms.rooms;new_room irp_pms.rooms;prior irp_pms.room_move_requests;command jsonb;result jsonb;business_date date;moved_at timestamptz;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_from_room IS NULL OR p_to_room IS NULL OR p_from_room=p_to_room OR p_expected_source_version IS NULL OR p_expected_source_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_from_room_version IS NULL OR p_expected_from_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_to_room_version IS NULL OR p_expected_to_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide distinct scoped rooms, expected stay and room versions, a request and a4 to500 character reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('reservation_id',p_reservation,'source_version',p_expected_source_version,'from_room_id',p_from_room,'from_room_version',p_expected_from_room_version,'to_room_id',p_to_room,'to_room_version',p_expected_to_room_version,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.room_move_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Room move request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF prop.operating_model<>'hotel' THEN RAISE EXCEPTION 'Whole-home properties have one exclusive unit and cannot move rooms';END IF;
 moved_at:=clock_timestamp();business_date:=(moved_at AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 IF res.source_version<>p_expected_source_version OR res.physical_room_id IS DISTINCT FROM p_from_room THEN RAISE EXCEPTION 'Stay assignment or source version changed; refresh before moving' USING ERRCODE='PT409';END IF;
 IF res.status<>'In house' OR res.arrival>business_date THEN RAISE EXCEPTION 'Only a currently in-house stay can move rooms';END IF;
 -- Same stable room ordering as156 occupancy revision. The property lock also
 -- serializes legacy check-in/out, housekeeping, bookings and all room moves.
 PERFORM 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id IN(p_from_room,p_to_room) ORDER BY id FOR UPDATE;
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped origin room';END IF;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped destination room';END IF;
 IF old_room.state_version<>p_expected_from_room_version OR new_room.state_version<>p_expected_to_room_version THEN RAISE EXCEPTION 'Room state changed; refresh before moving' USING ERRCODE='PT409';END IF;
 IF old_room.room_type_id IS DISTINCT FROM res.room_type_id OR new_room.room_type_id IS DISTINCT FROM res.room_type_id THEN RAISE EXCEPTION 'Both rooms must match the booked room type';END IF;
 IF new_room.housekeeping<>'Clean' THEN RAISE EXCEPTION 'The destination room must be Clean';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id IN(p_from_room,p_to_room) AND r.status='In house') THEN RAISE EXCEPTION 'A selected room is occupied by another in-house stay';END IF;
 -- A due-out guest still physically occupies today's room until checkout.
 -- An overdue stay has no resolved end, so all future assignments conflict.
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id=p_to_room AND r.status='Confirmed' AND r.departure>business_date AND (res.departure<business_date OR r.arrival<greatest(res.departure,business_date+1))) THEN RAISE EXCEPTION 'Destination room has an overlapping assigned reservation';END IF;
 UPDATE irp_pms.reservations SET physical_room_id=p_to_room WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 UPDATE irp_pms.rooms SET housekeeping='Dirty' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 result:=jsonb_build_object('request_id',p_request,'reservation',to_jsonb(res),'from_room',to_jsonb(old_room),'to_room',to_jsonb(new_room),'business_date',business_date,'moved_at',moved_at,'source_version_retained',true,'pricing_changed',false,'folio_changed',false,'replayed',false);
 INSERT INTO irp_pms.room_move_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'room_moved',p_reservation,command||jsonb_build_object('request_id',p_request,'from_room_version_after',old_room.state_version,'to_room_version_after',new_room.state_version,'business_date',business_date,'moved_at',moved_at));
 RETURN result;
END $$;

-- Forward from 202609070165_iratepilot_pms_no_shows.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_mark_no_show(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_expected_business_date date,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations;prior irp_pms.no_show_requests;command jsonb;context jsonb;recorded_at timestamptz;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_source_version IS NULL OR p_expected_source_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide a scoped stay, request, expected source version and business date, and a4 to500 character review reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_source_version',p_expected_source_version,'expected_business_date',p_expected_business_date,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.no_show_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'No-show request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 recorded_at:=clock_timestamp();context:=irp_pms.no_show_context(p_tenant,p_property,p_reservation,recorded_at);
 IF res.source_version<>p_expected_source_version OR (context->>'business_date')::date<>p_expected_business_date THEN RAISE EXCEPTION 'Reservation or property business date changed; refresh before no-show review' USING ERRCODE='PT409';END IF;
 IF NOT(context->>'eligible')::boolean THEN RAISE EXCEPTION 'Only never-started direct or imported Confirmed stays with elapsed scheduled dates can be marked no-show';END IF;
 UPDATE irp_pms.reservations SET status='Cancelled',cancellation_disposition='no_show',no_show_recorded_at=recorded_at WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 result:=jsonb_build_object('request_id',p_request,'reservation_id',p_reservation,'status','Cancelled','cancellation_disposition','no_show','recorded_at',recorded_at,'business_date',p_expected_business_date,'source_version',res.source_version,'capacity_configuration_changed',false,'current_future_inventory_released_units',0,'fees_changed',false,'folio_changed',false,'financial_review_required',context->'financial_review_required','financial_handling','separate_review','replayed',false);
 INSERT INTO irp_pms.no_show_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result,recorded_at) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result,recorded_at);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'no_show_recorded',p_reservation,command||jsonb_build_object('request_id',p_request,'recorded_at',recorded_at,'financial_handling','separate_review'));
 RETURN result;
END $$;

-- Forward from 202609070166_iratepilot_pms_cleaning_fee.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_property_fees(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_cleaning jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config jsonb;command jsonb;prior irp_pms.property_fee_requests;prop irp_pms.properties;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Request and current property fee version are required';END IF;
 config:=irp_pms.normalize_cleaning_fee(p_cleaning);
 command:=jsonb_build_object('expected_version',p_expected_version,'cleaning',config);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.property_fee_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Property fee request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF prop.property_fees_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Property fees or operating model changed; refresh before saving' USING ERRCODE='PT409';END IF;
 IF (config->>'enabled')::boolean AND prop.operating_model<>'whole_home' THEN RAISE EXCEPTION 'Only whole-home properties can enable Cleaning';END IF;
 IF prop.cleaning_fee IS DISTINCT FROM config THEN UPDATE irp_pms.properties SET cleaning_fee=config WHERE tenant_id=p_tenant AND id=p_property;END IF;
 result:=irp_pms.property_fees(p_tenant,p_property)||jsonb_build_object('request_id',p_request,'replayed',false);
 INSERT INTO irp_pms.property_fee_requests(tenant_id,property_id,request_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'property_fees_saved',p_property,jsonb_build_object('request_id',p_request,'previous_version',prop.property_fees_version,'version',result->'version','cleaning',config));
 RETURN result;
END $$;

-- Forward from 202609070166_iratepilot_pms_cleaning_fee.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_book_quote(p_tenant uuid,p_property uuid,p_quote uuid,p_request uuid,p_guest_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;quote irp_pms.rate_quotes; prior irp_pms.quote_bookings; plan irp_pms.rate_plans; result jsonb; reservation jsonb; business_date date; property_time_zone text;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_quote IS NULL OR p_request IS NULL OR p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Quote, request and guest name are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 property_time_zone:=prop.time_zone;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE property_time_zone)::date;
 SELECT * INTO prior FROM irp_pms.quote_bookings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.quote_id IS DISTINCT FROM p_quote OR prior.guest_name IS DISTINCT FROM trim(p_guest_name) THEN RAISE EXCEPTION 'Quote booking request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO quote FROM irp_pms.rate_quotes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_quote;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped quote'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.quote_bookings WHERE tenant_id=p_tenant AND property_id=p_property AND quote_id=p_quote) THEN RAISE EXCEPTION 'Quote is already booked; recover the original request receipt'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.direct_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Request identity already belongs to a direct reservation'; END IF;
 IF clock_timestamp()>=quote.expires_at THEN RAISE EXCEPTION 'Quote expired; request a new quote'; END IF;
 IF quote.arrival<business_date THEN RAISE EXCEPTION 'Quote arrival is now in the past'; END IF;
 IF quote.property_fees_version<>prop.property_fees_version OR (quote.operating_model_version IS NOT NULL AND quote.operating_model_version<>prop.operating_model_version) THEN RAISE EXCEPTION 'Quoted property fees or operating model changed; request a new quote' USING ERRCODE='PT409';END IF;
 SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=quote.plan_id;
 IF NOT FOUND OR NOT plan.active OR plan.version<>quote.plan_version OR plan.room_type_id<>quote.room_type_id THEN RAISE EXCEPTION 'Quoted rate plan changed; request a new quote'; END IF;
 reservation:=public.irp_pms_pilot_create_reservation(p_tenant,p_property,p_request,quote.room_type_id,trim(p_guest_name),quote.arrival,quote.departure,quote.guests,quote.accommodation_minor,quote.taxes_minor);
 -- Admission, snapshot enrichment and receipt commit as one transaction under
 -- the same property lock. Legacy quotes retain their original null breakdown.
 UPDATE irp_pms.reservations AS r SET hotel_fees_minor=quote.hotel_fees_minor,guest_total_minor=quote.total_minor,charge_breakdown=quote.charge_breakdown
 WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id=(reservation->>'id')::uuid RETURNING to_jsonb(r) INTO reservation;
 result:=jsonb_build_object('quote_id',p_quote,'request_id',p_request,'reservation',reservation,'currency','USD','quoted_total_minor',quote.total_minor,'payment_state','not_recorded','replayed',false);
 INSERT INTO irp_pms.quote_bookings(tenant_id,property_id,request_id,quote_id,reservation_id,guest_name,actor_id,result) VALUES(p_tenant,p_property,p_request,p_quote,(reservation->>'id')::uuid,trim(p_guest_name),auth.uid(),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'quoted_reservation_created',(reservation->>'id')::uuid,jsonb_build_object('quote_id',p_quote,'plan_id',quote.plan_id,'plan_version',quote.plan_version));
 RETURN result;
END $$;

-- Forward from 202609070167_iratepilot_pms_reviewed_cancellations.sql; application conflict codes only.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_cancel_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_expected_business_date date,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations;prior irp_pms.cancellation_requests;command jsonb;context jsonb;recorded_at timestamptz;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_source_version IS NULL OR p_expected_source_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide scoped stay, request, expected source version and business date, and a 4 to 500 character cancellation reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_source_version',p_expected_source_version,'expected_business_date',p_expected_business_date,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.cancellation_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Cancellation request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 recorded_at:=clock_timestamp();context:=irp_pms.cancellation_context(p_tenant,p_property,p_reservation,recorded_at);
 IF res.source_version<>p_expected_source_version THEN RAISE EXCEPTION 'Reservation source version changed; refresh cancellation review' USING ERRCODE='PT409';END IF;
 IF (context->>'business_date')::date<>p_expected_business_date THEN RAISE EXCEPTION 'Property business date changed; refresh cancellation review' USING ERRCODE='PT412';END IF;
 IF NOT(context->>'eligible')::boolean THEN RAISE EXCEPTION 'Only never-started direct or imported Confirmed stays can be cancelled through this reviewed API';END IF;
 UPDATE irp_pms.reservations SET status='Cancelled' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 result:=jsonb_build_object('request_id',p_request,'reservation_id',p_reservation,'status','Cancelled','cancellation_disposition',NULL,'recorded_at',recorded_at,'business_date',p_expected_business_date,'source_version',res.source_version,
 'current_future_room_nights_released',context->'current_future_room_nights_released','release_start',context->'release_start','release_end',context->'release_end','release_end_exclusive',true,
 'capacity_configuration_changed',false,'housekeeping_changed',false,'fees_changed',false,'folio_changed',false,'financial_review_required',context->'financial_review_required','financial_handling','separate_review','replayed',false);
 INSERT INTO irp_pms.cancellation_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result,recorded_at) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result,recorded_at);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_cancelled',p_reservation,command||jsonb_build_object('request_id',p_request,'recorded_at',recorded_at,'current_future_room_nights_released',context->'current_future_room_nights_released','financial_handling','separate_review'));
 RETURN result;
END $$;

-- Existing authenticated-only grants and response/receipt contracts remain.
COMMIT;
