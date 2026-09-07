BEGIN;
-- Explicit forward definitions: 142-154 remain immutable. An unresolved overdue
-- in-house stay blocks every current/future night until checkout or extension.
-- A scheduled departure today still permits normal same-day room turnover.
CREATE FUNCTION irp_pms.inventory_occupies(p_status text,p_arrival date,p_departure date,p_day date,p_business_date date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT coalesce((p_status IN('Confirmed','In house') AND p_arrival<=p_day AND p_departure>p_day)
 OR (p_status='In house' AND p_departure<p_business_date AND p_day>=p_business_date),false)
$$;
REVOKE ALL ON FUNCTION irp_pms.inventory_occupies(text,date,date,date,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION irp_pms.apply_reservation(p_tenant uuid,p_property uuid,p_data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE incoming irp_pms.reservations; previous irp_pms.reservations; day date; available integer; used integer; property_data jsonb; type_data jsonb; business_date date;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) AS k WHERE k NOT IN('source_booking_id','source_version','payload_hash','status','room_type_id','arrival','departure','guests','accommodation_minor','taxes_minor','ota_fees_minor','guest_total_minor')) THEN RAISE EXCEPTION 'Unexpected reservation field'; END IF;
 incoming:=jsonb_populate_record(NULL::irp_pms.reservations,p_data);
 IF incoming.source_booking_id IS NULL OR length(incoming.source_booking_id) NOT BETWEEN 1 AND 128 OR incoming.source_version IS NULL OR incoming.source_version NOT BETWEEN 1 AND 9007199254740991 OR incoming.payload_hash IS NULL OR incoming.payload_hash !~ '^[a-f0-9]{64}$' OR incoming.status IS NULL OR incoming.status NOT IN('Confirmed','Cancelled') THEN RAISE EXCEPTION 'Invalid source identity or status'; END IF;
 -- Serialize all admissions for a property, including first booking creation.
 SELECT to_jsonb(p) INTO property_data FROM irp_pms.properties p WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 business_date:=(clock_timestamp() AT TIME ZONE (property_data->>'time_zone'))::date;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND source='iratepilot-ota' AND source_booking_id=incoming.source_booking_id FOR UPDATE;
 IF FOUND THEN
  IF incoming.source_version<previous.source_version THEN RETURN 'stale'; END IF;
  IF incoming.source_version=previous.source_version THEN
   IF incoming.payload_hash=previous.payload_hash THEN RETURN 'duplicate'; END IF;
   RETURN 'review:version_conflict';
  END IF;
  IF previous.status IN('In house','Checked out') THEN RETURN 'review:stay_started'; END IF;
  IF previous.status='Cancelled' AND incoming.status='Confirmed' THEN RETURN 'review:reinstatement'; END IF;
  IF incoming.status='Confirmed' AND to_jsonb(previous)->>'physical_room_id' IS NOT NULL AND
    (previous.room_type_id IS DISTINCT FROM incoming.room_type_id OR previous.arrival IS DISTINCT FROM incoming.arrival OR previous.departure IS DISTINCT FROM incoming.departure) THEN RETURN 'review:assigned_room_change'; END IF;
  -- A cancellation changes lifecycle state; retain the original stay and money
  -- for reconciliation, while its Cancelled status releases capacity.
  IF incoming.status='Cancelled' THEN
   incoming.room_type_id:=previous.room_type_id;incoming.arrival:=previous.arrival;incoming.departure:=previous.departure;incoming.guests:=previous.guests;
   incoming.accommodation_minor:=previous.accommodation_minor;incoming.taxes_minor:=previous.taxes_minor;incoming.ota_fees_minor:=previous.ota_fees_minor;incoming.guest_total_minor:=previous.guest_total_minor;
  END IF;
 END IF;
 IF incoming.status='Confirmed' THEN
  IF incoming.room_type_id IS NULL OR incoming.arrival IS NULL OR incoming.departure IS NULL OR incoming.departure<=incoming.arrival OR incoming.departure-incoming.arrival>30 THEN RAISE EXCEPTION 'Invalid stay'; END IF;
  -- Later pilot migrations add these operational limits. Older installations
  -- remain compatible; configured hotels enforce their actual limits.
  SELECT to_jsonb(t) INTO type_data FROM irp_pms.room_types t WHERE tenant_id=p_tenant AND property_id=p_property AND id=incoming.room_type_id;
  IF type_data->>'max_guests' IS NOT NULL AND incoming.guests>(type_data->>'max_guests')::integer THEN RETURN 'review:guest_limit'; END IF;
  IF property_data->>'time_zone' IS NOT NULL AND incoming.arrival<business_date THEN RETURN 'review:past_arrival'; END IF;
  FOR day IN SELECT generate_series(incoming.arrival,incoming.departure-1,interval '1 day')::date LOOP
   SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=incoming.room_type_id AND stay_date=day FOR SHARE;
   IF NOT FOUND THEN RETURN 'review:capacity_missing'; END IF;
   SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=incoming.room_type_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date) AND (source<>'iratepilot-ota' OR source_booking_id<>incoming.source_booking_id);
   IF used>=available THEN RETURN 'review:sold_out'; END IF;
  END LOOP;
 END IF;
 INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor)
 VALUES(p_tenant,p_property,coalesce(previous.id,gen_random_uuid()),'iratepilot-ota',incoming.source_booking_id,incoming.source_version,incoming.payload_hash,incoming.status,incoming.room_type_id,incoming.arrival,incoming.departure,incoming.guests,incoming.accommodation_minor,incoming.taxes_minor,incoming.ota_fees_minor,incoming.guest_total_minor)
 ON CONFLICT(tenant_id,property_id,source,source_booking_id) DO UPDATE SET source_version=excluded.source_version,payload_hash=excluded.payload_hash,status=excluded.status,room_type_id=excluded.room_type_id,arrival=excluded.arrival,departure=excluded.departure,guests=excluded.guests,accommodation_minor=excluded.accommodation_minor,taxes_minor=excluded.taxes_minor,ota_fees_minor=excluded.ota_fees_minor,guest_total_minor=excluded.guest_total_minor;
 RETURN 'applied';
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_capacity(p_tenant uuid,p_property uuid,p_room_type uuid,p_start date,p_end date,p_units integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE physical_count integer; day date; used integer; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_create_reservation(p_tenant uuid,p_property uuid,p_request uuid,p_room_type uuid,p_guest_name text,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; request_payload jsonb; prior irp_pms.direct_requests; res irp_pms.reservations; day date; available integer; used integer; guest_limit integer; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_stay_action(p_tenant uuid,p_property uuid,p_reservation uuid,p_action text,p_room uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; res irp_pms.reservations; room irp_pms.rooms; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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
  IF res.status='Cancelled' THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'Confirmed' THEN RAISE EXCEPTION 'A started stay cannot be cancelled'; END IF;
  IF res.source='iratepilot-ota' THEN RAISE EXCEPTION 'Cancel an OTA reservation at its source'; END IF;
  UPDATE irp_pms.reservations SET status='Cancelled' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 ELSE RAISE EXCEPTION 'Unknown stay action';
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),p_action,res.id);
 RETURN to_jsonb(res);
END $$;

CREATE OR REPLACE FUNCTION irp_pms.validate_import(p_tenant uuid,p_property uuid,p_provider text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; raw jsonb; errors jsonb; rows jsonb:='[]'::jsonb; normalized jsonb; source_id text; guest_name text; type_id uuid;
 arrival date; departure date; guest_count integer; max_guests integer; accommodation bigint; taxes bigint; business_date date; valid_count integer;
BEGIN
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR octet_length(p_rows::text)>1048576 THEN RAISE EXCEPTION 'Provide 1 to 500 reservation rows within 1 MiB'; END IF;
 -- Reject unsupported/sensitive fields and nested payloads before any caller
 -- persists source_rows, previews, actions or activity. Invalid scalar values
 -- still receive the normal row-specific preview errors below.
 FOR raw IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(raw)='array' THEN RAISE EXCEPTION 'Import rows cannot contain nested arrays or objects'; END IF;
  IF jsonb_typeof(raw)='object' THEN
   IF EXISTS(SELECT 1 FROM jsonb_each(raw) f WHERE f.key NOT IN('source_id','guest_name','room_type_id','arrival','departure','guests','currency','accommodation_minor','taxes_minor') OR jsonb_typeof(f.value) IN('object','array')) THEN
    RAISE EXCEPTION 'Import payload contains unsupported fields or nested values; no payment, deposit or identity-document data is accepted';
   END IF;
  END IF;
 END LOOP;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 FOR item IN SELECT value,ordinality::integer AS row_number FROM jsonb_array_elements(p_rows) WITH ORDINALITY LOOP
  raw:=item.value;errors:='[]'::jsonb;normalized:=NULL;source_id:=NULL;guest_name:=NULL;type_id:=NULL;arrival:=NULL;departure:=NULL;guest_count:=NULL;max_guests:=NULL;accommodation:=NULL;taxes:=NULL;
  IF jsonb_typeof(raw) IS DISTINCT FROM 'object' THEN errors:=errors||jsonb_build_array('invalid_row_object');
  ELSE
   IF jsonb_typeof(raw->'source_id') IS DISTINCT FROM 'string' OR length(trim(raw->>'source_id')) NOT BETWEEN 1 AND 128 THEN errors:=errors||jsonb_build_array('invalid_source_id');
   ELSE
    source_id:=trim(raw->>'source_id');
    IF (SELECT count(*) FROM jsonb_array_elements(p_rows) r WHERE jsonb_typeof(r)='object' AND jsonb_typeof(r->'source_id')='string' AND trim(r->>'source_id')=source_id)>1 THEN errors:=errors||jsonb_build_array('duplicate_source_id_in_batch'); END IF;
    IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND source='migration' AND migration_provider=p_provider AND migration_source_id=source_id) THEN errors:=errors||jsonb_build_array('source_id_already_imported'); END IF;
   END IF;
   IF jsonb_typeof(raw->'guest_name') IS DISTINCT FROM 'string' OR length(trim(raw->>'guest_name')) NOT BETWEEN 1 AND 200 THEN errors:=errors||jsonb_build_array('invalid_guest_name'); ELSE guest_name:=trim(raw->>'guest_name'); END IF;
   BEGIN
    IF jsonb_typeof(raw->'room_type_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid type'; END IF;
    type_id:=(raw->>'room_type_id')::uuid;
    SELECT t.max_guests INTO max_guests FROM irp_pms.room_types t WHERE tenant_id=p_tenant AND property_id=p_property AND id=type_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped type'; END IF;
   EXCEPTION WHEN OTHERS THEN type_id:=NULL;errors:=errors||jsonb_build_array('invalid_scoped_room_type'); END;
   BEGIN
    IF jsonb_typeof(raw->'arrival') IS DISTINCT FROM 'string' OR jsonb_typeof(raw->'departure') IS DISTINCT FROM 'string' OR (raw->>'arrival') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (raw->>'departure') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid dates'; END IF;
    arrival:=(raw->>'arrival')::date;departure:=(raw->>'departure')::date;
    IF arrival<business_date OR departure<=arrival OR departure-arrival>30 THEN RAISE EXCEPTION 'Invalid stay'; END IF;
   EXCEPTION WHEN OTHERS THEN arrival:=NULL;departure:=NULL;errors:=errors||jsonb_build_array('invalid_future_stay_1_to_30_nights'); END;
   BEGIN
    IF jsonb_typeof(raw->'guests') IS DISTINCT FROM 'number' OR (raw->>'guests')::numeric NOT BETWEEN 1 AND 20 OR trunc((raw->>'guests')::numeric)<>(raw->>'guests')::numeric THEN RAISE EXCEPTION 'Invalid guests'; END IF;
    guest_count:=(raw->>'guests')::integer;
    IF max_guests IS NOT NULL AND guest_count>max_guests THEN RAISE EXCEPTION 'Guest limit exceeded'; END IF;
   EXCEPTION WHEN OTHERS THEN guest_count:=NULL;errors:=errors||jsonb_build_array('invalid_guest_count'); END;
   IF raw->>'currency' IS DISTINCT FROM 'USD' OR jsonb_typeof(raw->'currency') IS DISTINCT FROM 'string' THEN errors:=errors||jsonb_build_array('currency_must_be_USD'); END IF;
   BEGIN
    IF jsonb_typeof(raw->'accommodation_minor') IS DISTINCT FROM 'number' OR jsonb_typeof(raw->'taxes_minor') IS DISTINCT FROM 'number' OR (raw->>'accommodation_minor')::numeric NOT BETWEEN 0 AND 999999999999 OR (raw->>'taxes_minor')::numeric NOT BETWEEN 0 AND 999999999999 OR trunc((raw->>'accommodation_minor')::numeric)<>(raw->>'accommodation_minor')::numeric OR trunc((raw->>'taxes_minor')::numeric)<>(raw->>'taxes_minor')::numeric THEN RAISE EXCEPTION 'Invalid minor units'; END IF;
    accommodation:=(raw->>'accommodation_minor')::bigint;taxes:=(raw->>'taxes_minor')::bigint;
    IF accommodation+taxes>999999999999 THEN RAISE EXCEPTION 'Total amount exceeds supported range'; END IF;
   EXCEPTION WHEN OTHERS THEN accommodation:=NULL;taxes:=NULL;errors:=errors||jsonb_build_array('invalid_integer_minor_unit_amounts'); END;
   IF errors='[]'::jsonb THEN normalized:=jsonb_build_object('source_id',source_id,'guest_name',guest_name,'room_type_id',type_id,'arrival',arrival,'departure',departure,'guests',guest_count,'currency','USD','accommodation_minor',accommodation,'taxes_minor',taxes,'ota_fees_minor',0,'guest_total_minor',accommodation+taxes,'status','Confirmed'); END IF;
  END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('row_number',item.row_number,'source_id',source_id,'valid',errors='[]'::jsonb,'errors',errors,'normalized',normalized));
 END LOOP;
 -- Evaluate aggregate batch demand, not each row in isolation, against the same
 -- existing inventory snapshot protected by the caller's property lock.
 WITH ready AS (
  SELECT (r->>'row_number')::integer row_number,r->'normalized' n FROM jsonb_array_elements(rows) r WHERE r->>'valid'='true'
 ), demand AS (
  SELECT (n->>'room_type_id')::uuid type_id,d::date stay_date,count(*)::integer units
  FROM ready CROSS JOIN LATERAL generate_series((n->>'arrival')::date,(n->>'departure')::date-1,interval '1 day') d GROUP BY 1,2
 ), availability AS (
  SELECT d.*,c.units capacity,(SELECT count(*) FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=d.type_id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,d.stay_date,business_date)) used
  FROM demand d LEFT JOIN irp_pms.nightly_capacity c ON c.tenant_id=p_tenant AND c.property_id=p_property AND c.room_type_id=d.type_id AND c.stay_date=d.stay_date
 ), invalid_nights AS (
  SELECT ready.row_number,jsonb_agg((CASE WHEN a.capacity IS NULL THEN 'capacity_missing:' ELSE 'insufficient_capacity:' END)||a.stay_date::text ORDER BY a.stay_date) errors
  FROM ready JOIN availability a ON a.type_id=(n->>'room_type_id')::uuid AND a.stay_date>=(n->>'arrival')::date AND a.stay_date<(n->>'departure')::date
  WHERE a.capacity IS NULL OR a.used+a.units>a.capacity GROUP BY ready.row_number
 )
 SELECT coalesce(jsonb_agg(CASE WHEN i.row_number IS NULL THEN r ELSE r||jsonb_build_object('valid',false,'errors',(r->'errors')||i.errors) END ORDER BY (r->>'row_number')::integer),'[]'::jsonb)
 INTO rows FROM jsonb_array_elements(rows) r LEFT JOIN invalid_nights i ON i.row_number=(r->>'row_number')::integer;
 SELECT count(*) INTO valid_count FROM jsonb_array_elements(rows) r WHERE r->>'valid'='true';
 RETURN jsonb_build_object('row_count',jsonb_array_length(p_rows),'valid_count',valid_count,'error_count',jsonb_array_length(p_rows)-valid_count,'rows',rows,'currency','USD','payment_state','not_recorded');
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_amend_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest_name text,p_room_type uuid,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.reservation_amendments; opening irp_pms.folio_openings;
 command jsonb; result jsonb; day date; available integer; used integer; guest_limit integer; has_opening boolean; needs_reconciliation boolean; total bigint; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before amending' USING ERRCODE='40001'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest name or future stay dates'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Invalid scoped room type or guest count'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor;
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
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation);
 INSERT INTO irp_pms.reservation_amendments(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result)
 VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_amended',p_reservation,
 jsonb_build_object('previous_version',previous.source_version,'source_version',changed.source_version,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_workspace(p_tenant uuid,p_property uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 RETURN jsonb_build_object('property',to_jsonb(prop),'role',member_role,'business_date',business_date,'overdue_policy','block_future_until_resolved',
 'room_types',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM irp_pms.room_types r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'rooms',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.label) FROM irp_pms.rooms r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.status='In house' AND r.departure<business_date) ORDER BY r.arrival,r.id) FROM irp_pms.reservations r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'capacity',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('reserved_units',u.used,'available_units',greatest(0,c.units-u.used),'overdue_units',u.overdue) ORDER BY c.stay_date,c.room_type_id) FROM irp_pms.nightly_capacity c CROSS JOIN LATERAL (SELECT count(*)::integer used,count(*) FILTER(WHERE r.status='In house' AND r.departure<business_date)::integer overdue FROM irp_pms.reservations r WHERE r.tenant_id=c.tenant_id AND r.property_id=c.property_id AND r.room_type_id=c.room_type_id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,c.stay_date,business_date)) u WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.stay_date>=business_date),'[]'::jsonb),
 'activity',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id DESC) FROM (SELECT * FROM irp_pms.activity WHERE tenant_id=p_tenant AND property_id=p_property ORDER BY id DESC LIMIT 50) a),'[]'::jsonb));
END $$;

CREATE TABLE irp_pms.stay_extensions(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,before_reservation jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.stay_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.stay_extensions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.stay_extensions TO service_role;

CREATE FUNCTION public.irp_pms_pilot_extend_stay(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_departure date,p_accommodation_minor bigint,p_taxes_minor bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.stay_extensions; opening irp_pms.folio_openings;
 command jsonb; result jsonb; business_date date; day date; available integer; used integer; has_opening boolean; needs_reconciliation boolean; total bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before extending' USING ERRCODE='40001'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_departure IS NULL OR p_departure<=previous.departure OR p_departure<=business_date OR p_departure-previous.arrival>30 THEN RAISE EXCEPTION 'Extension must depart after today and the existing departure, within 30 total nights'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Provide an extension reason of 4 to 500 characters'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor;
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
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'previous_departure',previous.departure,'business_date',business_date,'overdue_resolved',previous.departure<business_date,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation);
 INSERT INTO irp_pms.stay_extensions(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result) VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'stay_extended',p_reservation,
 jsonb_build_object('previous_departure',previous.departure,'departure',changed.departure,'previous_version',previous.source_version,'source_version',changed.source_version,'reason',trim(p_reason),'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_extend_stay(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_extend_stay(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,text) TO authenticated;
-- CREATE OR REPLACE preserves every existing function ACL. In particular, the
-- raw OTA apply routine remains inaccessible to service_role after 145.
COMMIT;
