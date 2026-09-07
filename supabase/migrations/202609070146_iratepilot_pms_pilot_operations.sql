BEGIN;
-- Authenticated pilot operating surface. Public wrappers avoid exposing the private schema.
ALTER TABLE irp_pms.properties ADD COLUMN time_zone text NOT NULL DEFAULT 'America/Chicago';
ALTER TABLE irp_pms.room_types ADD COLUMN max_guests integer NOT NULL DEFAULT 4 CHECK(max_guests BETWEEN 1 AND 20);
CREATE TABLE irp_pms.rooms(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),room_type_id uuid NOT NULL,
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 40),housekeeping text NOT NULL DEFAULT 'Dirty' CHECK(housekeeping IN('Clean','Dirty','Inspect')),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,label),
 FOREIGN KEY(tenant_id,property_id,room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.reservations DROP CONSTRAINT reservations_source_check;
ALTER TABLE irp_pms.reservations ADD CONSTRAINT reservations_source_check CHECK(source IN('iratepilot-ota','direct'));
ALTER TABLE irp_pms.reservations ADD COLUMN guest_name text CHECK(guest_name IS NULL OR length(trim(guest_name)) BETWEEN 1 AND 200),ADD COLUMN physical_room_id uuid,ADD COLUMN checked_in_at timestamptz,ADD COLUMN checked_out_at timestamptz;
ALTER TABLE irp_pms.reservations ADD FOREIGN KEY(tenant_id,property_id,physical_room_id) REFERENCES irp_pms.rooms(tenant_id,property_id,id);
CREATE UNIQUE INDEX irp_pms_one_inhouse_room ON irp_pms.reservations(tenant_id,property_id,physical_room_id) WHERE status='In house';
CREATE TABLE irp_pms.direct_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,payload jsonb NOT NULL,reservation_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.activity(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL,property_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,target_id uuid,details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.direct_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.rooms,irp_pms.direct_requests,irp_pms.activity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON irp_pms.rooms,irp_pms.activity TO authenticated;
GRANT SELECT ON irp_pms.rooms,irp_pms.direct_requests,irp_pms.activity TO service_role;
CREATE POLICY member_rooms ON irp_pms.rooms FOR SELECT TO authenticated USING(irp_pms.is_member(tenant_id));
CREATE POLICY member_activity ON irp_pms.activity FOR SELECT TO authenticated USING(irp_pms.is_member(tenant_id));

CREATE FUNCTION irp_pms.pilot_require(p_tenant uuid,p_property uuid,p_manager boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;
BEGIN
 SELECT m.role INTO member_role FROM irp_pms.memberships m JOIN irp_pms.properties p ON p.tenant_id=m.tenant_id
 WHERE m.tenant_id=p_tenant AND m.user_id=auth.uid() AND p.id=p_property;
 IF member_role IS NULL OR (p_manager AND member_role NOT IN('owner','manager')) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 RETURN member_role;
END $$;
REVOKE ALL ON FUNCTION irp_pms.pilot_require(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_bootstrap(p_request uuid,p_tenant_name text,p_property_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid:=auth.uid(); receipt irp_pms.onboarding_requests;
BEGIN
 IF caller IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=caller AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'A confirmed account is required' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request identity is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pilot-owner:'||caller::text,0));
 SELECT * INTO receipt FROM irp_pms.onboarding_requests WHERE owner_id=caller ORDER BY created_at,request_id LIMIT 1;
 IF FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=receipt.tenant_id AND user_id=caller) THEN RAISE EXCEPTION 'Existing organization access was removed' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('tenant_id',receipt.tenant_id,'property_id',receipt.property_id,'reused',true);
 END IF;
 receipt:=irp_pms.onboard_hotel(p_request,caller,p_tenant_name,p_property_name);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(receipt.tenant_id,receipt.property_id,caller,'hotel_created',receipt.property_id);
 RETURN jsonb_build_object('tenant_id',receipt.tenant_id,'property_id',receipt.property_id,'reused',false);
END $$;

CREATE FUNCTION public.irp_pms_pilot_workspaces() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('tenant_id',t.id,'tenant_name',t.name,'property_id',p.id,'property_name',p.name,'role',m.role,'time_zone',p.time_zone) ORDER BY t.name,p.name)
 FROM irp_pms.memberships m JOIN irp_pms.tenants t ON t.id=m.tenant_id JOIN irp_pms.properties p ON p.tenant_id=t.id WHERE m.user_id=auth.uid()),'[]'::jsonb);
END $$;

CREATE FUNCTION public.irp_pms_pilot_workspace(p_tenant uuid,p_property uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 RETURN jsonb_build_object('property',to_jsonb(prop),'role',member_role,'business_date',(current_timestamp AT TIME ZONE prop.time_zone)::date,
 'room_types',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM irp_pms.room_types r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'rooms',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.label) FROM irp_pms.rooms r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.arrival,r.id) FROM irp_pms.reservations r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'capacity',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.stay_date,c.room_type_id) FROM irp_pms.nightly_capacity c WHERE tenant_id=p_tenant AND property_id=p_property AND stay_date>=(current_timestamp AT TIME ZONE prop.time_zone)::date),'[]'::jsonb),
 'activity',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id DESC) FROM (SELECT * FROM irp_pms.activity WHERE tenant_id=p_tenant AND property_id=p_property ORDER BY id DESC LIMIT 50) a),'[]'::jsonb));
END $$;

CREATE FUNCTION public.irp_pms_pilot_configure_property(p_tenant uuid,p_property uuid,p_name text,p_time_zone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_time_zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone) THEN RAISE EXCEPTION 'Unknown property time zone'; END IF;
 UPDATE irp_pms.properties SET name=trim(p_name),time_zone=p_time_zone WHERE tenant_id=p_tenant AND id=p_property RETURNING * INTO prop;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'property_updated',p_property);
 RETURN to_jsonb(prop);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_room_type(p_tenant uuid,p_property uuid,p_id uuid,p_name text,p_max_guests integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room_type irp_pms.room_types;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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

CREATE FUNCTION public.irp_pms_pilot_save_room(p_tenant uuid,p_property uuid,p_id uuid,p_room_type uuid,p_label text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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

CREATE FUNCTION public.irp_pms_pilot_set_capacity(p_tenant uuid,p_property uuid,p_room_type uuid,p_start date,p_end date,p_units integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE physical_count integer; day date; used integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 OR p_units IS NULL OR p_units<0 THEN RAISE EXCEPTION 'Invalid capacity dates or units'; END IF;
 PERFORM 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown room type'; END IF;
 SELECT count(*) INTO physical_count FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type;
 IF p_units>physical_count THEN RAISE EXCEPTION 'Capacity exceeds configured physical rooms'; END IF;
 FOR day IN SELECT generate_series(p_start,p_end-1,interval '1 day')::date LOOP
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND status IN('Confirmed','In house') AND arrival<=day AND departure>day;
  IF p_units<used THEN RAISE EXCEPTION 'Capacity is below existing reservations on %',day; END IF;
  INSERT INTO irp_pms.nightly_capacity(tenant_id,property_id,room_type_id,stay_date,units) VALUES(p_tenant,p_property,p_room_type,day,p_units)
  ON CONFLICT(tenant_id,property_id,room_type_id,stay_date) DO UPDATE SET units=excluded.units;
 END LOOP;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'capacity_updated',p_room_type,jsonb_build_object('start',p_start,'end',p_end,'units',p_units));
 RETURN jsonb_build_object('nights',p_end-p_start,'units',p_units);
END $$;

CREATE FUNCTION public.irp_pms_pilot_create_reservation(p_tenant uuid,p_property uuid,p_request uuid,p_room_type uuid,p_guest_name text,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; request_payload jsonb; prior irp_pms.direct_requests; res irp_pms.reservations; day date; available integer; used integer; guest_limit integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request identity is required'; END IF;
 request_payload:=jsonb_build_object('room_type',p_room_type,'guest_name',trim(p_guest_name),'arrival',p_arrival,'departure',p_departure,'guests',p_guests,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor);
 SELECT * INTO prior FROM irp_pms.direct_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'Reservation request identity already used'; END IF;
  SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=prior.reservation_id;
  RETURN to_jsonb(res);
 END IF;
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<(current_timestamp AT TIME ZONE prop.time_zone)::date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest or stay dates'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Invalid room type or guest count'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND stay_date=day FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND status IN('Confirmed','In house') AND arrival<=day AND departure>day;
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
 END LOOP;
 INSERT INTO irp_pms.reservations(tenant_id,property_id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name)
 VALUES(p_tenant,p_property,'direct',p_request::text,1,repeat('0',64),'Confirmed',p_room_type,p_arrival,p_departure,p_guests,p_accommodation_minor,p_taxes_minor,0,p_accommodation_minor+p_taxes_minor,trim(p_guest_name)) RETURNING * INTO res;
 INSERT INTO irp_pms.direct_requests(tenant_id,property_id,request_id,payload,reservation_id,created_by) VALUES(p_tenant,p_property,p_request,request_payload,res.id,auth.uid());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'reservation_created',res.id);
 RETURN to_jsonb(res);
END $$;

CREATE FUNCTION public.irp_pms_pilot_stay_action(p_tenant uuid,p_property uuid,p_reservation uuid,p_action text,p_room uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; res irp_pms.reservations; room irp_pms.rooms; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 business_date:=(current_timestamp AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reservation'; END IF;
 IF p_action='check_in' THEN
  IF res.status='In house' AND res.physical_room_id=p_room THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'Confirmed' OR business_date<res.arrival OR business_date>=res.departure THEN RAISE EXCEPTION 'Reservation cannot check in on this business date'; END IF;
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
  IF NOT FOUND OR room.room_type_id IS DISTINCT FROM res.room_type_id OR room.housekeeping<>'Clean' THEN RAISE EXCEPTION 'A clean room of the booked type is required'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND id<>res.id AND status='In house') THEN RAISE EXCEPTION 'Physical room is occupied'; END IF;
  UPDATE irp_pms.reservations SET status='In house',physical_room_id=p_room,checked_in_at=current_timestamp WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 ELSIF p_action='check_out' THEN
  IF res.status='Checked out' THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'In house' OR business_date<res.arrival THEN RAISE EXCEPTION 'Only an in-house reservation can check out'; END IF;
  UPDATE irp_pms.reservations SET status='Checked out',checked_out_at=current_timestamp WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
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

CREATE FUNCTION public.irp_pms_pilot_housekeeping(p_tenant uuid,p_property uuid,p_room uuid,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF p_status IS NULL OR p_status NOT IN('Clean','Dirty','Inspect') THEN RAISE EXCEPTION 'Unknown housekeeping status'; END IF;
 IF p_status IN('Clean','Inspect') AND EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status='In house') THEN RAISE EXCEPTION 'Occupied room cannot be marked ready'; END IF;
 UPDATE irp_pms.rooms SET housekeeping=p_status WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown physical room'; END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'housekeeping_updated',p_room,jsonb_build_object('status',p_status));
 RETURN to_jsonb(room);
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_bootstrap(uuid,text,text),public.irp_pms_pilot_workspaces(),public.irp_pms_pilot_workspace(uuid,uuid),public.irp_pms_pilot_configure_property(uuid,uuid,text,text),public.irp_pms_pilot_save_room_type(uuid,uuid,uuid,text,integer),public.irp_pms_pilot_save_room(uuid,uuid,uuid,uuid,text),public.irp_pms_pilot_set_capacity(uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_create_reservation(uuid,uuid,uuid,uuid,text,date,date,integer,bigint,bigint),public.irp_pms_pilot_stay_action(uuid,uuid,uuid,text,uuid),public.irp_pms_pilot_housekeeping(uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bootstrap(uuid,text,text),public.irp_pms_pilot_workspaces(),public.irp_pms_pilot_workspace(uuid,uuid),public.irp_pms_pilot_configure_property(uuid,uuid,text,text),public.irp_pms_pilot_save_room_type(uuid,uuid,uuid,text,integer),public.irp_pms_pilot_save_room(uuid,uuid,uuid,uuid,text),public.irp_pms_pilot_set_capacity(uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_create_reservation(uuid,uuid,uuid,uuid,text,date,date,integer,bigint,bigint),public.irp_pms_pilot_stay_action(uuid,uuid,uuid,text,uuid),public.irp_pms_pilot_housekeeping(uuid,uuid,uuid,text) TO authenticated;
COMMIT;
