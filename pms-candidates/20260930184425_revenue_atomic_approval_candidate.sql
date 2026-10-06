-- Candidate stage only. Apply through the coordinated database release after restore rehearsal.
-- Wraps the existing single-night rate RPC so the approved decision and price change commit together.
BEGIN;
CREATE TABLE irp_pms.revenue_rate_decisions (
 request_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 property_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 plan_id uuid NOT NULL,
 reviewed_plan_version bigint NOT NULL CHECK(reviewed_plan_version>0),
 stay_date date NOT NULL,
 current_rate_minor bigint NOT NULL CHECK(current_rate_minor BETWEEN 1 AND 100000000),
 recommended_rate_minor bigint NOT NULL CHECK(recommended_rate_minor BETWEEN 1 AND 100000000),
 minimum_rate_minor bigint NOT NULL CHECK(minimum_rate_minor BETWEEN 1 AND 100000000),
 maximum_rate_minor bigint NOT NULL CHECK(maximum_rate_minor BETWEEN 1 AND 100000000),
 competitor_rate_minor bigint CHECK(competitor_rate_minor BETWEEN 1 AND 100000000),
 event_uplift_basis_points integer NOT NULL CHECK(event_uplift_basis_points BETWEEN 0 AND 5000),
 effective_units integer NOT NULL CHECK(effective_units BETWEEN 1 AND 100000),
 reserved_units integer NOT NULL CHECK(reserved_units BETWEEN 0 AND effective_units),
 occupancy_tenths_percent integer NOT NULL CHECK(occupancy_tenths_percent BETWEEN 0 AND 1000),
 adjustment_basis_points integer NOT NULL CHECK(adjustment_basis_points BETWEEN -3000 AND 5000),
 guardrail text NOT NULL CHECK(guardrail IN ('none','minimum','maximum')),
 explanations jsonb NOT NULL CHECK(jsonb_typeof(explanations)='array' AND jsonb_array_length(explanations) BETWEEN 1 AND 20 AND octet_length(explanations::text)<=20000),
 saved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX revenue_rate_decisions_property_saved ON irp_pms.revenue_rate_decisions(tenant_id,property_id,saved_at DESC,request_id DESC);
ALTER TABLE irp_pms.revenue_rate_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.revenue_rate_decisions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.validate_revenue_explanations(p_explanations jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE note jsonb;
BEGIN
 IF p_explanations IS NULL OR jsonb_typeof(p_explanations)<>'array' OR jsonb_array_length(p_explanations) NOT BETWEEN 1 AND 20 OR octet_length(p_explanations::text)>20000 THEN RAISE EXCEPTION 'Provide bounded rate-decision explanations' USING ERRCODE='22023'; END IF;
 FOR note IN SELECT value FROM jsonb_array_elements(p_explanations) LOOP
  IF jsonb_typeof(note)<>'string' OR length(note#>>'{}') NOT BETWEEN 1 AND 1000 OR note#>>'{}'~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Rate-decision explanation is invalid' USING ERRCODE='22023'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION irp_pms.validate_revenue_explanations(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.calculate_reviewed_revenue_rate(p_current bigint,p_minimum bigint,p_maximum bigint,p_competitor bigint,p_event integer,p_capacity integer,p_reserved integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE occupancy_bps integer; competitor_bps integer:=0; adjustment integer; unconstrained bigint; recommended bigint; guardrail text;
BEGIN
 IF p_current IS NULL OR p_minimum IS NULL OR p_maximum IS NULL OR p_event IS NULL OR p_capacity IS NULL OR p_reserved IS NULL
  OR p_current NOT BETWEEN 1 AND 100000000 OR p_minimum NOT BETWEEN 1 AND 100000000 OR p_maximum NOT BETWEEN p_minimum AND 100000000
  OR p_event NOT BETWEEN 0 AND 5000 OR p_capacity NOT BETWEEN 1 AND 100000 OR p_reserved NOT BETWEEN 0 AND p_capacity
  OR (p_competitor IS NOT NULL AND p_competitor NOT BETWEEN 1 AND 100000000)
 THEN RAISE EXCEPTION 'Invalid calculation inputs' USING ERRCODE='22023';END IF;
 occupancy_bps:=CASE WHEN p_reserved::bigint*100>=p_capacity::bigint*95 THEN 2500 WHEN p_reserved::bigint*100>=p_capacity::bigint*80 THEN 1500 WHEN p_reserved::bigint*100>=p_capacity::bigint*60 THEN 800 WHEN p_reserved::bigint*100<p_capacity::bigint*30 THEN -1000 ELSE 0 END;
 IF p_competitor IS NOT NULL THEN competitor_bps:=greatest(-1000,least(1000,floor((p_competitor-p_current)::numeric*5000/p_current+0.5)::integer));END IF;
 adjustment:=greatest(-3000,least(5000,occupancy_bps+competitor_bps+p_event));
 unconstrained:=floor(p_current::numeric*(10000+adjustment)/10000+0.5)::bigint;
 recommended:=greatest(p_minimum,least(p_maximum,unconstrained));
 guardrail:=CASE WHEN recommended=unconstrained THEN 'none' WHEN recommended=p_minimum THEN 'minimum' ELSE 'maximum' END;
 RETURN jsonb_build_object('recommended_rate_minor',recommended,'adjustment_basis_points',adjustment,'occupancy_tenths_percent',round(p_reserved::numeric*1000/p_capacity)::integer,'guardrail',guardrail);
END $$;
REVOKE ALL ON FUNCTION irp_pms.calculate_reviewed_revenue_rate(bigint,bigint,bigint,bigint,integer,integer,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_apply_revenue_decision(
 p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_stay_date date,
 p_current_rate_minor bigint,p_recommended_rate_minor bigint,p_minimum_rate_minor bigint,p_maximum_rate_minor bigint,
 p_competitor_rate_minor bigint,p_event_uplift_basis_points integer,p_effective_units integer,p_reserved_units integer,
 p_occupancy_tenths_percent integer,p_adjustment_basis_points integer,p_guardrail text,p_explanations jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.revenue_rate_decisions; saved irp_pms.revenue_rate_decisions; rate_result jsonb; calculated jsonb; checked jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 -- Same lock order as the existing nightly-rate writer; authorize again after waiting.
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=auth.uid() AND role IN('owner','manager') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501';END IF;
 IF p_property='7d9add80-216e-435c-86e9-58e17cdcbb6d'::uuid THEN RAISE EXCEPTION 'Red Roof shadow mode prohibits audited rate writes' USING ERRCODE='42501';END IF;
 IF p_current_rate_minor IS NULL OR p_recommended_rate_minor IS NULL OR p_minimum_rate_minor IS NULL OR p_maximum_rate_minor IS NULL OR p_event_uplift_basis_points IS NULL OR p_effective_units IS NULL OR p_reserved_units IS NULL OR p_occupancy_tenths_percent IS NULL OR p_adjustment_basis_points IS NULL OR p_guardrail IS NULL OR p_request IS NULL OR p_plan IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_stay_date IS NULL
  OR p_current_rate_minor NOT BETWEEN 1 AND 100000000 OR p_recommended_rate_minor NOT BETWEEN 1 AND 100000000
  OR p_minimum_rate_minor NOT BETWEEN 1 AND 100000000 OR p_maximum_rate_minor NOT BETWEEN 1 AND 100000000 OR p_minimum_rate_minor>p_maximum_rate_minor
  OR p_recommended_rate_minor NOT BETWEEN p_minimum_rate_minor AND p_maximum_rate_minor
  OR p_competitor_rate_minor IS NOT NULL AND p_competitor_rate_minor NOT BETWEEN 1 AND 100000000
  OR p_event_uplift_basis_points NOT BETWEEN 0 AND 5000 OR p_effective_units NOT BETWEEN 1 AND 100000
  OR p_reserved_units NOT BETWEEN 0 AND p_effective_units OR p_occupancy_tenths_percent NOT BETWEEN 0 AND 1000
  OR p_occupancy_tenths_percent<>round(p_reserved_units::numeric*1000/p_effective_units)
  OR p_adjustment_basis_points NOT BETWEEN -3000 AND 5000 OR p_guardrail NOT IN ('none','minimum','maximum')
 THEN RAISE EXCEPTION 'Reviewed rate decision is incomplete or inconsistent' USING ERRCODE='22023'; END IF;
 PERFORM irp_pms.validate_revenue_explanations(p_explanations);
 calculated:=irp_pms.calculate_reviewed_revenue_rate(p_current_rate_minor,p_minimum_rate_minor,p_maximum_rate_minor,p_competitor_rate_minor,p_event_uplift_basis_points,p_effective_units,p_reserved_units);
 IF (calculated->>'recommended_rate_minor')::bigint IS DISTINCT FROM p_recommended_rate_minor OR (calculated->>'adjustment_basis_points')::integer IS DISTINCT FROM p_adjustment_basis_points OR (calculated->>'occupancy_tenths_percent')::integer IS DISTINCT FROM p_occupancy_tenths_percent OR calculated->>'guardrail' IS DISTINCT FROM p_guardrail
 THEN RAISE EXCEPTION 'Reviewed result does not match the server calculation' USING ERRCODE='22023';END IF;
 SELECT * INTO prior FROM irp_pms.revenue_rate_decisions d WHERE d.request_id=p_request;
 IF FOUND THEN
  IF prior.tenant_id<>p_tenant OR prior.property_id<>p_property OR prior.actor_id<>auth.uid() OR prior.plan_id<>p_plan OR prior.reviewed_plan_version<>p_expected_version OR prior.stay_date<>p_stay_date OR prior.current_rate_minor<>p_current_rate_minor OR prior.recommended_rate_minor<>p_recommended_rate_minor OR prior.minimum_rate_minor<>p_minimum_rate_minor OR prior.maximum_rate_minor<>p_maximum_rate_minor OR prior.competitor_rate_minor IS DISTINCT FROM p_competitor_rate_minor OR prior.event_uplift_basis_points<>p_event_uplift_basis_points OR prior.effective_units<>p_effective_units OR prior.reserved_units<>p_reserved_units OR prior.occupancy_tenths_percent<>p_occupancy_tenths_percent OR prior.adjustment_basis_points<>p_adjustment_basis_points OR prior.guardrail<>p_guardrail OR prior.explanations<>p_explanations THEN RAISE EXCEPTION 'Rate decision request conflicts with its saved result' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('request_id',prior.request_id,'tenant_id',prior.tenant_id,'property_id',prior.property_id,'plan_id',prior.plan_id,'stay_date',prior.stay_date,'recommended_rate_minor',prior.recommended_rate_minor,'saved_at',prior.saved_at,'replayed',true);
 END IF;
 checked:=public.irp_pms_pilot_revenue_facts_preflight(p_tenant,p_property,p_plan,p_expected_version,p_stay_date,p_current_rate_minor,p_effective_units,p_reserved_units);
 -- Stale reviewed inputs are terminal HTTP 409 conflicts, not serialization failures.
 IF checked->>'facts_match' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Pricing facts changed; refresh before approval' USING ERRCODE='PT409';END IF;
 rate_result:=public.irp_pms_pilot_set_nightly_rate(p_tenant,p_property,p_request,p_plan,p_expected_version,p_stay_date,p_stay_date+1,p_recommended_rate_minor);
 IF rate_result IS NULL THEN RAISE EXCEPTION 'Nightly rate save returned no receipt'; END IF;
 INSERT INTO irp_pms.revenue_rate_decisions(request_id,tenant_id,property_id,actor_id,plan_id,reviewed_plan_version,stay_date,current_rate_minor,recommended_rate_minor,minimum_rate_minor,maximum_rate_minor,competitor_rate_minor,event_uplift_basis_points,effective_units,reserved_units,occupancy_tenths_percent,adjustment_basis_points,guardrail,explanations)
 VALUES(p_request,p_tenant,p_property,auth.uid(),p_plan,p_expected_version,p_stay_date,p_current_rate_minor,p_recommended_rate_minor,p_minimum_rate_minor,p_maximum_rate_minor,p_competitor_rate_minor,p_event_uplift_basis_points,p_effective_units,p_reserved_units,p_occupancy_tenths_percent,p_adjustment_basis_points,p_guardrail,p_explanations) RETURNING * INTO saved;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'revenue_rate_decision_applied',p_plan,jsonb_build_object('request_id',p_request,'stay_date',p_stay_date,'reviewed_plan_version',p_expected_version,'recommended_rate_minor',p_recommended_rate_minor,'guardrail',p_guardrail));
 RETURN jsonb_build_object('request_id',saved.request_id,'tenant_id',saved.tenant_id,'property_id',saved.property_id,'plan_id',saved.plan_id,'stay_date',saved.stay_date,'recommended_rate_minor',saved.recommended_rate_minor,'saved_at',saved.saved_at,'replayed',false);
END $$;

CREATE FUNCTION public.irp_pms_pilot_revenue_decision_status(p_tenant uuid,p_property uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.revenue_rate_decisions;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.revenue_rate_decisions d WHERE d.request_id=p_request AND d.tenant_id=p_tenant AND d.property_id=p_property AND d.actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false,'request_id',p_request,'tenant_id',p_tenant,'property_id',p_property); END IF;
 RETURN jsonb_build_object('found',true,'request_id',saved.request_id,'tenant_id',saved.tenant_id,'property_id',saved.property_id,'plan_id',saved.plan_id,'stay_date',saved.stay_date,'recommended_rate_minor',saved.recommended_rate_minor,'saved_at',saved.saved_at);
END $$;

CREATE FUNCTION public.irp_pms_pilot_revenue_decisions(p_tenant uuid,p_property uuid,p_before_time timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb; cursor_time timestamptz; cursor_id uuid;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF (p_before_time IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Decision cursor is incomplete' USING ERRCODE='22023'; END IF;
 WITH page AS (
  SELECT d.request_id,d.actor_id,d.plan_id,d.reviewed_plan_version,d.stay_date,d.current_rate_minor,d.recommended_rate_minor,d.minimum_rate_minor,d.maximum_rate_minor,d.competitor_rate_minor,d.event_uplift_basis_points,d.effective_units,d.reserved_units,d.occupancy_tenths_percent,d.adjustment_basis_points,d.guardrail,d.saved_at
  FROM irp_pms.revenue_rate_decisions d WHERE d.tenant_id=p_tenant AND d.property_id=p_property
   AND (p_before_time IS NULL OR (d.saved_at,d.request_id)<(p_before_time,p_before_id))
  ORDER BY d.saved_at DESC,d.request_id DESC LIMIT 25
 ) SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY saved_at DESC,request_id DESC),'[]'::jsonb) INTO items FROM page;
 -- Use the final ordered item: PostgreSQL has no built-in min(uuid) aggregate.
 cursor_time:=(items->-1->>'saved_at')::timestamptz;
 cursor_id:=(items->-1->>'request_id')::uuid;
 IF cursor_id IS NULL OR NOT EXISTS(SELECT 1 FROM irp_pms.revenue_rate_decisions d WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND (d.saved_at,d.request_id)<(cursor_time,cursor_id)) THEN cursor_time:=NULL;cursor_id:=NULL; END IF;
 RETURN jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'items',items,'next',CASE WHEN cursor_id IS NULL THEN NULL ELSE jsonb_build_object('saved_at',cursor_time,'request_id',cursor_id) END);
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb),public.irp_pms_pilot_revenue_decision_status(uuid,uuid,uuid),public.irp_pms_pilot_revenue_decisions(uuid,uuid,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb),public.irp_pms_pilot_revenue_decision_status(uuid,uuid,uuid),public.irp_pms_pilot_revenue_decisions(uuid,uuid,timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
