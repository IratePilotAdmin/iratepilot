BEGIN;
CREATE TABLE irp_pms.nightly_capacity(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,room_type_id uuid NOT NULL,stay_date date NOT NULL,units integer NOT NULL CHECK(units>=0),
 PRIMARY KEY(tenant_id,property_id,room_type_id,stay_date),
 FOREIGN KEY(tenant_id,property_id,room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.nightly_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.nightly_capacity FROM PUBLIC,anon,authenticated;
GRANT SELECT ON irp_pms.nightly_capacity TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON irp_pms.nightly_capacity TO service_role;
CREATE POLICY member_capacity ON irp_pms.nightly_capacity FOR SELECT TO authenticated USING(irp_pms.is_member(tenant_id));
-- Normal backend reservation writes must use the version/capacity gate below.
REVOKE INSERT,UPDATE,DELETE ON irp_pms.reservations FROM service_role;
CREATE FUNCTION irp_pms.apply_reservation(p_tenant uuid,p_property uuid,p_data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE incoming irp_pms.reservations; previous irp_pms.reservations; day date; available integer; used integer; property_data jsonb; type_data jsonb;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) AS k WHERE k NOT IN('source_booking_id','source_version','payload_hash','status','room_type_id','arrival','departure','guests','accommodation_minor','taxes_minor','ota_fees_minor','guest_total_minor')) THEN RAISE EXCEPTION 'Unexpected reservation field'; END IF;
 incoming:=jsonb_populate_record(NULL::irp_pms.reservations,p_data);
 IF incoming.source_booking_id IS NULL OR length(incoming.source_booking_id) NOT BETWEEN 1 AND 128 OR incoming.source_version IS NULL OR incoming.source_version NOT BETWEEN 1 AND 9007199254740991 OR incoming.payload_hash IS NULL OR incoming.payload_hash !~ '^[a-f0-9]{64}$' OR incoming.status IS NULL OR incoming.status NOT IN('Confirmed','Cancelled') THEN RAISE EXCEPTION 'Invalid source identity or status'; END IF;
 -- Serialize all admissions for a property, including first booking creation.
 SELECT to_jsonb(p) INTO property_data FROM irp_pms.properties p WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
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
  IF property_data->>'time_zone' IS NOT NULL AND incoming.arrival<(clock_timestamp() AT TIME ZONE (property_data->>'time_zone'))::date THEN RETURN 'review:past_arrival'; END IF;
  FOR day IN SELECT generate_series(incoming.arrival,incoming.departure-1,interval '1 day')::date LOOP
   SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=incoming.room_type_id AND stay_date=day FOR SHARE;
   IF NOT FOUND THEN RETURN 'review:capacity_missing'; END IF;
   SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=incoming.room_type_id AND status IN('Confirmed','In house') AND arrival<=day AND departure>day AND (source<>'iratepilot-ota' OR source_booking_id<>incoming.source_booking_id);
   IF used>=available THEN RETURN 'review:sold_out'; END IF;
  END LOOP;
 END IF;
 INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor)
 VALUES(p_tenant,p_property,coalesce(previous.id,gen_random_uuid()),'iratepilot-ota',incoming.source_booking_id,incoming.source_version,incoming.payload_hash,incoming.status,incoming.room_type_id,incoming.arrival,incoming.departure,incoming.guests,incoming.accommodation_minor,incoming.taxes_minor,incoming.ota_fees_minor,incoming.guest_total_minor)
 ON CONFLICT(tenant_id,property_id,source,source_booking_id) DO UPDATE SET source_version=excluded.source_version,payload_hash=excluded.payload_hash,status=excluded.status,room_type_id=excluded.room_type_id,arrival=excluded.arrival,departure=excluded.departure,guests=excluded.guests,accommodation_minor=excluded.accommodation_minor,taxes_minor=excluded.taxes_minor,ota_fees_minor=excluded.ota_fees_minor,guest_total_minor=excluded.guest_total_minor;
 RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION irp_pms.apply_reservation(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION irp_pms.apply_reservation(uuid,uuid,jsonb) TO service_role;
COMMIT;
