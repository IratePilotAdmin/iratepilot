-- Read-only preflight. This does not reserve facts or authorize a subsequent rate write.
CREATE FUNCTION public.irp_pms_pilot_revenue_facts_preflight(
 p_tenant uuid,p_property uuid,p_plan uuid,p_expected_version bigint,p_stay_date date,
 p_current_rate_minor bigint,p_effective_units integer,p_reserved_units integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role_name text; zone text; currency_code text; business_day date; checked timestamptz; facts jsonb; changes jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_plan IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_stay_date IS NULL
  OR p_current_rate_minor IS NULL OR p_current_rate_minor NOT BETWEEN 1 AND 100000000
  OR p_effective_units IS NULL OR p_effective_units NOT BETWEEN 1 AND 100000
  OR p_reserved_units IS NULL OR p_reserved_units NOT BETWEEN 0 AND p_effective_units
 THEN RAISE EXCEPTION 'Provide complete reviewed pricing facts' USING ERRCODE='22023';END IF;
 -- Prevent membership changes during this check; acquire authorization before returning any facts.
 SELECT m.role,p.time_zone,p.currency INTO role_name,zone,currency_code
 FROM irp_pms.memberships m JOIN irp_pms.properties p ON p.tenant_id=m.tenant_id
 WHERE m.tenant_id=p_tenant AND m.user_id=auth.uid() AND p.id=p_property
 FOR SHARE OF m,p;
 IF role_name IS NULL OR role_name NOT IN('owner','manager') THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501';END IF;
 checked:=clock_timestamp();business_day:=(checked AT TIME ZONE zone)::date;
 IF p_stay_date<business_day OR p_stay_date>business_day+365 THEN RAISE EXCEPTION 'Choose a current or future night within 366 days' USING ERRCODE='22023';END IF;
 -- All source facts are selected in one statement snapshot, including absent capacity and price rows.
 SELECT jsonb_build_object('plan_version',r.version,'active',r.active,'currency',currency_code,
  'current_rate_minor',n.amount_minor,'effective_units',c.effective_units,'reserved_units',b.booked)
 INTO facts FROM irp_pms.rate_plans r
 LEFT JOIN irp_pms.nightly_rates n ON n.tenant_id=r.tenant_id AND n.property_id=r.property_id AND n.plan_id=r.id AND n.stay_date=p_stay_date
 CROSS JOIN LATERAL irp_pms.maintenance_capacity(r.tenant_id,r.property_id,r.room_type_id,p_stay_date) c
 CROSS JOIN LATERAL (SELECT count(*)::integer booked FROM irp_pms.reservations x
  WHERE x.tenant_id=r.tenant_id AND x.property_id=r.property_id AND x.room_type_id=r.room_type_id
   AND irp_pms.inventory_occupies(x.status,x.arrival,x.departure,p_stay_date,business_day)) b
 WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id=p_plan;
 IF facts IS NULL THEN RAISE EXCEPTION 'Unknown scoped rate plan' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(v.name ORDER BY v.ordinal),'[]'::jsonb) INTO changes FROM (VALUES
  (1,'plan_version',(facts->>'plan_version')::bigint IS DISTINCT FROM p_expected_version),
  (2,'active',(facts->>'active')::boolean IS DISTINCT FROM true),
  (3,'currency',currency_code IS DISTINCT FROM 'USD'),
  (4,'current_rate_minor',(facts->>'current_rate_minor')::bigint IS DISTINCT FROM p_current_rate_minor),
  (5,'effective_units',(facts->>'effective_units')::integer IS DISTINCT FROM p_effective_units),
  (6,'reserved_units',(facts->>'reserved_units')::integer IS DISTINCT FROM p_reserved_units)
 ) v(ordinal,name,changed) WHERE v.changed;
 RETURN jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'plan_id',p_plan,'stay_date',p_stay_date,
  'checked_at',checked,'facts_match',jsonb_array_length(changes)=0,'changed_fields',changes,'current_facts',facts,
  'write_authorized',false,'mode','shadow_preflight');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_revenue_facts_preflight(uuid,uuid,uuid,bigint,date,bigint,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_revenue_facts_preflight(uuid,uuid,uuid,bigint,date,bigint,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
