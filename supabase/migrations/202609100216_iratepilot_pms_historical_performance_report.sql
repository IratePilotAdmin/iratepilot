-- Read preserved service allocations and inventory; never infer missing historical capacity.
BEGIN;
CREATE FUNCTION public.irp_pms_pilot_historical_performance_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb;days jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 -- Existing report supplies scoped locks, bounded dates/rows and reconciliation metadata.
 original:=public.irp_pms_pilot_service_day_report_v2(p_tenant,p_property,p_start,p_end);
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT jsonb_agg(jsonb_build_object(
  'service_date',d.day,'closed',c.id IS NOT NULL,'close_id',c.id,'closed_at',c.closed_at,
  'inventory_snapshot',c.snapshot->'inventory_snapshot',
  'inventory_status',CASE WHEN c.id IS NULL THEN 'unclosed' WHEN c.snapshot->'inventory_snapshot' IS NULL THEN 'not_recorded' WHEN NOT coalesce((c.snapshot->'inventory_snapshot'->>'complete')::boolean,false) THEN 'incomplete' WHEN (c.snapshot->'inventory_snapshot'->>'effective_units')::bigint=0 THEN 'zero_capacity' ELSE 'recorded' END,
  'occupied_nights',CASE WHEN c.id IS NULL THEN NULL ELSE e.occupied END,
  'overnight_accommodation_minor',CASE WHEN c.id IS NULL THEN NULL ELSE e.overnight::text END,
  'same_day_accommodation_minor',CASE WHEN c.id IS NULL THEN NULL ELSE e.same_day::text END,
  'other_accommodation_minor',CASE WHEN c.id IS NULL THEN NULL ELSE e.other_room::text END,
  'original_accommodation_minor',CASE WHEN c.id IS NULL THEN NULL ELSE e.room::text END,
  'accommodation_corrections_minor',CASE WHEN c.id IS NULL THEN NULL ELSE f.room::text END,
  'original_taxes_minor',CASE WHEN c.id IS NULL THEN NULL ELSE e.tax::text END,
  'original_property_fees_minor',CASE WHEN c.id IS NULL THEN NULL ELSE e.fees::text END
 ) ORDER BY d.day) INTO days
 FROM (SELECT p_start+n AS day FROM generate_series(0,p_end-p_start-1) n) d
 LEFT JOIN irp_pms.service_day_closes c ON c.tenant_id=p_tenant AND c.property_id=p_property AND c.service_date=d.day
 CROSS JOIN LATERAL (
  SELECT count(*) FILTER(WHERE occupied_night) AS occupied,
   coalesce(sum(accommodation_minor) FILTER(WHERE occupied_night),0) AS overnight,
   coalesce(sum(accommodation_minor) FILTER(WHERE NOT occupied_night AND details->>'service_usage'='same_day_use'),0) AS same_day,
   coalesce(sum(accommodation_minor) FILTER(WHERE NOT occupied_night AND (details->>'service_usage') IS DISTINCT FROM 'same_day_use'),0) AS other_room,
   coalesce(sum(accommodation_minor),0) AS room,coalesce(sum(taxes_minor),0) AS tax,coalesce(sum(hotel_fees_minor),0) AS fees
  FROM irp_pms.service_day_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date=d.day
 ) e
 CROSS JOIN LATERAL (
  SELECT coalesce(sum(accommodation_minor),0) AS room FROM irp_pms.service_forward_entries f WHERE f.tenant_id=p_tenant AND f.property_id=p_property AND f.service_date=d.day
 ) f;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'start',p_start,'end',p_end,'currency','USD',
  'basis','preserved_service_allocations_and_close_inventory','time_zone',original->'time_zone','generated_at',original->'generated_at',
  'first_service_date',original->'first_service_date','next_service_date',original->'next_service_date','days',days,
  'reconciliation_pending_count',jsonb_array_length(original->'reconciliation_pending'),
  'pending_adjustment_count',jsonb_array_length(original->'pending_adjustments'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_historical_performance_report(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_historical_performance_report(uuid,uuid,date,date) TO authenticated;
COMMIT;
