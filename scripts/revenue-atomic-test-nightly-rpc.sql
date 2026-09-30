CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_nightly_rate(p_tenant uuid, p_property uuid, p_request uuid, p_plan uuid, p_expected_version bigint, p_start date, p_end date, p_amount_minor bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb; business_date date; property_time_zone text; changed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_plan IS NULL OR p_expected_version IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Provide a versioned plan, request, 1 to 366 nights and nonnegative USD minor units'; END IF;
 command:=jsonb_build_object('action','set_nightly','plan',p_plan,'expected_version',p_expected_version,'start',p_start,'end',p_end,'amount_minor',p_amount_minor);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT time_zone INTO property_time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 business_date:=(clock_timestamp() AT TIME ZONE property_time_zone)::date;
 SELECT * INTO prior FROM irp_pms.rate_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Rate request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_start<business_date THEN RAISE EXCEPTION 'Nightly pricing changes must start on or after the property business date'; END IF;
 SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped rate plan'; END IF;
 IF plan.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Rate plan version changed; refresh before saving'; END IF;
 SELECT EXISTS(SELECT 1 FROM generate_series(p_start,p_end-1,interval '1 day') d LEFT JOIN irp_pms.nightly_rates n ON n.tenant_id=p_tenant AND n.property_id=p_property AND n.plan_id=p_plan AND n.stay_date=d::date WHERE n.amount_minor IS DISTINCT FROM p_amount_minor) INTO changed;
 INSERT INTO irp_pms.nightly_rates(tenant_id,property_id,plan_id,stay_date,amount_minor) SELECT p_tenant,p_property,p_plan,d::date,p_amount_minor FROM generate_series(p_start,p_end-1,interval '1 day') d
 ON CONFLICT(tenant_id,property_id,plan_id,stay_date) DO UPDATE SET amount_minor=excluded.amount_minor;
 IF changed THEN UPDATE irp_pms.rate_plans SET version=version+1,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan RETURNING * INTO plan; END IF;
 result:=jsonb_build_object('plan_id',p_plan,'version',plan.version,'start',p_start,'end',p_end,'nights',p_end-p_start,'amount_minor',p_amount_minor,'changed',changed,'replayed',false);
 INSERT INTO irp_pms.rate_actions(tenant_id,property_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'nightly_rates_saved',p_plan,jsonb_build_object('version',plan.version,'start',p_start,'end',p_end));
 RETURN result;
END $function$;
