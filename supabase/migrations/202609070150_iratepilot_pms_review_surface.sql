BEGIN;
-- A repeated create must not silently produce a second sellable room type.
-- Existing duplicate names make this migration fail atomically; never merge IDs.
CREATE UNIQUE INDEX irp_pms_room_type_name_unique
 ON irp_pms.room_types(tenant_id,property_id,lower(trim(name)));

-- Public invoker wrappers expose the existing authenticated review workflow
-- without exposing the private schema through PostgREST or elevating privileges.
CREATE FUNCTION public.irp_pms_pilot_review_events(p_tenant uuid,p_property uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; business_date date; events jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT irp_pms.can_manage(p_tenant) THEN
  RAISE EXCEPTION 'Manager membership required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 business_date:=(current_timestamp AT TIME ZONE prop.time_zone)::date;
 WITH heads AS (
  SELECT DISTINCT ON(booking_id) booking_id,source_version,payload_hash
  FROM irp_pms.inbound_events
  WHERE tenant_id=p_tenant AND property_id=p_property AND application_outcome<>'review:version_conflict'
  ORDER BY booking_id,source_version DESC,received_at,event_id
 ), classified AS (
  SELECT e.*,coalesce(e.resolution_outcome,e.application_outcome) AS effective_outcome,
   coalesce(e.application_outcome<>'review:version_conflict' AND e.source_version=h.source_version AND e.payload_hash=h.payload_hash,false) AS is_current
  FROM irp_pms.inbound_events e LEFT JOIN heads h USING(booking_id)
  WHERE e.tenant_id=p_tenant AND e.property_id=p_property
 ), bounded AS (
  SELECT *,is_current AND effective_outcome IN('review:capacity_missing','review:sold_out') AND normalized_record IS NOT NULL
   AND coalesce((normalized_record->>'arrival')::date>=business_date,false) AS can_reprocess
  FROM classified
  ORDER BY (is_current AND effective_outcome LIKE 'review:%') DESC,received_at DESC,event_id DESC LIMIT 100
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'event_id',event_id,'booking_id',booking_id,'source_version',source_version,
  'application_outcome',application_outcome,'resolution_outcome',resolution_outcome,'effective_outcome',effective_outcome,
  'review_reason',review_reason,'received_at',received_at,'resolved_at',resolved_at,'normalized_record',normalized_record,
  'is_current',is_current,'can_reprocess',can_reprocess
 ) ORDER BY (is_current AND effective_outcome LIKE 'review:%') DESC,received_at DESC,event_id DESC),'[]'::jsonb) INTO events FROM bounded;
 RETURN jsonb_build_object('business_date',business_date,'time_zone',prop.time_zone,'events',events);
END $$;

CREATE FUNCTION public.irp_pms_pilot_reprocess(p_tenant uuid,p_property uuid,p_event text,p_request uuid,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT irp_pms.can_manage(p_tenant) THEN
  RAISE EXCEPTION 'Manager membership required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 -- This delegate retains private145's locking, request receipts, source-head
 -- checks, capacity admission, and shutdown revocation. No force-apply path.
 result:=irp_pms.reprocess_reservation(p_tenant,p_property,p_event,p_request,p_reference);
 RETURN result||jsonb_build_object('business_date',(current_timestamp AT TIME ZONE prop.time_zone)::date);
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_events(uuid,uuid),public.irp_pms_pilot_reprocess(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_events(uuid,uuid),public.irp_pms_pilot_reprocess(uuid,uuid,text,uuid,text) TO authenticated;
COMMIT;
