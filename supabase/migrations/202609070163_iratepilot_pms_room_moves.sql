BEGIN;
-- Physical assignment belongs to hotel operations. A move never advances an
-- OTA source version or changes its payload, dates, type, price or folio.
CREATE TABLE irp_pms.room_move_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.room_move_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.room_move_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.room_move_requests TO service_role;
CREATE FUNCTION irp_pms.room_move_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Room move receipts are immutable';END $$;
REVOKE ALL ON FUNCTION irp_pms.room_move_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_room_move_immutable BEFORE UPDATE OR DELETE ON irp_pms.room_move_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.room_move_immutable();

CREATE FUNCTION public.irp_pms_pilot_move_room(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_from_room uuid,p_expected_from_room_version bigint,p_to_room uuid,p_expected_to_room_version bigint,p_reason text)
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
 IF res.source_version<>p_expected_source_version OR res.physical_room_id IS DISTINCT FROM p_from_room THEN RAISE EXCEPTION 'Stay assignment or source version changed; refresh before moving' USING ERRCODE='40001';END IF;
 IF res.status<>'In house' OR res.arrival>business_date THEN RAISE EXCEPTION 'Only a currently in-house stay can move rooms';END IF;
 -- Same stable room ordering as156 occupancy revision. The property lock also
 -- serializes legacy check-in/out, housekeeping, bookings and all room moves.
 PERFORM 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id IN(p_from_room,p_to_room) ORDER BY id FOR UPDATE;
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped origin room';END IF;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped destination room';END IF;
 IF old_room.state_version<>p_expected_from_room_version OR new_room.state_version<>p_expected_to_room_version THEN RAISE EXCEPTION 'Room state changed; refresh before moving' USING ERRCODE='40001';END IF;
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

CREATE FUNCTION public.irp_pms_pilot_room_move_request_status(p_tenant uuid,p_property uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.room_move_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A request is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.room_move_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action','move_room','result',jsonb_build_object('request_id',p_request,'reservation_id',prior.reservation_id,'from_room_id',prior.command->'from_room_id','to_room_id',prior.command->'to_room_id','source_version',prior.command->'source_version','moved_at',prior.result->'moved_at'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_move_room(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,text),public.irp_pms_pilot_room_move_request_status(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_move_room(uuid,uuid,uuid,uuid,bigint,uuid,bigint,uuid,bigint,text),public.irp_pms_pilot_room_move_request_status(uuid,uuid,uuid) TO authenticated;
COMMIT;
