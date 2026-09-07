BEGIN;
CREATE TABLE irp_pms.reservation_amendments(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,before_reservation jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.reservation_amendments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.reservation_amendments FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.reservation_amendments TO service_role;

CREATE FUNCTION public.irp_pms_pilot_amend_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest_name text,p_room_type uuid,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.reservation_amendments; opening irp_pms.folio_openings;
 command jsonb; result jsonb; day date; available integer; used integer; guest_limit integer; has_opening boolean; needs_reconciliation boolean; total bigint;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<(clock_timestamp() AT TIME ZONE prop.time_zone)::date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest name or future stay dates'; END IF;
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
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND physical_room_id=previous.physical_room_id AND status IN('Confirmed','In house') AND arrival<p_departure AND departure>p_arrival) THEN RAISE EXCEPTION 'Assigned physical room overlaps another active stay'; END IF;
 END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND stay_date=day FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND room_type_id=p_room_type AND status IN('Confirmed','In house') AND arrival<=day AND departure>day;
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
REVOKE ALL ON FUNCTION public.irp_pms_pilot_amend_reservation(uuid,uuid,uuid,uuid,bigint,text,uuid,date,date,integer,bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_amend_reservation(uuid,uuid,uuid,uuid,bigint,text,uuid,date,date,integer,bigint,bigint) TO authenticated;
COMMIT;
