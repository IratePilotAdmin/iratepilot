-- TARGET: PMS eiqmdldjnedqgbtoozqa. Read-only manager API; no guest or financial data.
CREATE FUNCTION public.irp_pms_pilot_forecast_evidence(p_tenant uuid,p_property uuid,p_from date,p_to date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE forecasts jsonb;closes jsonb;v_asof timestamptz:=statement_timestamp();
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_tenant IS DISTINCT FROM 'faa76112-c793-43db-92bd-f9faecd8d93a'::uuid
 OR p_property IS DISTINCT FROM '7d9add80-216e-435c-86e9-58e17cdcbb6d'::uuid THEN RAISE EXCEPTION 'Private pilot only' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>30 THEN RAISE EXCEPTION 'A date range of at most 31 calendar nights is required'; END IF;
 WITH latest AS (
  SELECT DISTINCT ON (room_type_id,stay_date,model_version) * FROM irp_pms.revenue_forecast_records
  WHERE tenant_id=p_tenant AND property_id=p_property AND stay_date BETWEEN p_from AND p_to AND issued_at<=v_asof
  ORDER BY room_type_id,stay_date,model_version,issued_at DESC,source_captured_at DESC
 ) SELECT coalesce(jsonb_agg(jsonb_build_object(
  'tenantId',tenant_id,'propertyId',property_id,'roomTypeId',room_type_id,'stayDate',stay_date,
  'stayStartAt',to_char(stay_start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'stayEndAt',to_char(stay_end_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'issuedAt',to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'sourceMaxObservedAt',to_char(source_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'modelVersion',model_version,'capacity',capacity,'onBooksRooms',on_books_rooms,'predictedRooms',predicted_rooms,'evidenceState',evidence_state
 ) ORDER BY stay_date,room_type_id,model_version),'[]'::jsonb) INTO forecasts FROM latest;
 IF jsonb_array_length(forecasts)>1000 THEN RAISE EXCEPTION 'Forecast range exceeds 1000 records; no records were truncated'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('tenantId',c.tenant_id,'propertyId',c.property_id,'serviceDate',c.service_date,
  'closedAt',to_char(c.closed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'snapshot',jsonb_build_object('can_close',c.snapshot->'can_close','rows_truncated',c.snapshot->'rows_truncated','next_service_date',c.snapshot->'next_service_date','time_zone',c.snapshot->'time_zone',
   'totals',jsonb_build_object('complete',c.snapshot->'totals'->'complete','occupied_nights',c.snapshot->'totals'->'occupied_nights'),
   'inventory_snapshot',c.snapshot->'inventory_snapshot',
   'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('room_type_id',r->'room_type_id','physical_room_id',r->'physical_room_id','occupied_night',r->'occupied_night','blocker',r->'blocker')),'[]'::jsonb) FROM jsonb_array_elements(c.snapshot->'rows') r)
  )) ORDER BY c.service_date),'[]'::jsonb) INTO closes
 FROM irp_pms.service_day_closes c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.service_date BETWEEN p_from AND p_to AND c.closed_at<=v_asof;
 RETURN jsonb_build_object('tenantId',p_tenant,'propertyId',p_property,'asOf',to_char(v_asof AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'selection','latest_issued_forecast_per_room_night_model','from',p_from,'to',p_to,'forecasts',forecasts,'closes',closes,'truncated',false,'accuracyCertified',false,'writebackEnabled',false);
END $fn$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_forecast_evidence(uuid,uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_forecast_evidence(uuid,uuid,date,date) TO authenticated;
