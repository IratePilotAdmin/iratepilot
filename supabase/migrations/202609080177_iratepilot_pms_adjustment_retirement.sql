-- Draft 177: unresolved manual adjustment cancellation. Not installed.
BEGIN;
CREATE TABLE irp_pms.gl_adjustment_retirements (
 tenant_id uuid NOT NULL, property_id uuid NOT NULL, request_id uuid NOT NULL,
 actor_id uuid NOT NULL, command jsonb NOT NULL, retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id),
 CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=262144)
);
ALTER TABLE irp_pms.gl_adjustment_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE irp_pms.gl_adjustment_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_adjustment_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_adjustment_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_post_manual_journal(p_tenant uuid,p_property uuid,p_request uuid,p_period uuid,p_date date,p_description text,p_lines jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Journal review confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_adjustment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Adjustment request was retired';END IF;
 result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),jsonb_build_object('period_id',p_period,'posting_date',p_date,'currency','USD','description',p_description,'source_kind','manual_journal','source_id',p_request,'source_version',1,'lines',p_lines));
 IF NOT(result->>'replayed')::boolean THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'manual_journal_posted',(result->>'journal_id')::uuid,jsonb_build_object('request_id',p_request,'posting_date',p_date));
 END IF;
 RETURN result||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'action','post_manual_journal');
END $$;
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_reverse_gl_journal(p_tenant uuid,p_property uuid,p_request uuid,p_original uuid,p_period uuid,p_date date,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reversal review confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_adjustment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Adjustment request was retired';END IF;
 result:=irp_pms.gl_reverse_journal(p_tenant,p_property,p_request,auth.uid(),p_original,p_period,p_date,p_reason);
 IF NOT(result->>'replayed')::boolean THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_journal_reversed',(result->>'journal_id')::uuid,jsonb_build_object('request_id',p_request,'original_journal_id',p_original,'posting_date',p_date,'reason',p_reason));
 END IF;
 RETURN result||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'action','reverse_gl_journal','original_journal_id',p_original);
END $$;
CREATE FUNCTION public.irp_pms_pilot_retire_gl_adjustment(p_tenant uuid,p_property uuid,p_request uuid,p_command jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_adjustment_retirements;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_confirmed IS DISTINCT FROM true OR p_request IS NULL THEN RAISE EXCEPTION 'Adjustment cancellation confirmation and identity required';END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR octet_length(p_command::text)>262144 THEN RAISE EXCEPTION 'Invalid cancellation details';END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_command) key) IS DISTINCT FROM ARRAY['currency','description','lines','period_id','posting_date','source_id','source_kind','source_version']::text[] THEN RAISE EXCEPTION 'Invalid cancellation fields';END IF;
 IF p_command->>'currency' IS DISTINCT FROM 'USD' OR p_command->>'source_kind' NOT IN ('manual_journal','journal_reversal') OR p_command->>'source_kind' IS NULL OR p_command->'source_version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_command->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid cancellation source';END IF;
 IF jsonb_array_length(p_command->'lines') NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Invalid cancellation lines';END IF;
 IF p_command->>'source_kind'='manual_journal' AND p_command->>'source_id' IS DISTINCT FROM p_request::text THEN RAISE EXCEPTION 'Cancellation source does not match request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Adjustment was already posted; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.gl_adjustment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id<>auth.uid() OR saved.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Cancellation request details differ';END IF;
  replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_adjustment_retirements(tenant_id,property_id,request_id,actor_id,command) VALUES(p_tenant,p_property,p_request,auth.uid(),p_command) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_adjustment_request_retired',p_request,jsonb_build_object('source_kind',p_command->>'source_kind','request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',true,'command',saved.command,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_gl_adjustment(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_gl_adjustment(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_gl_adjustment_retirement_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_adjustment_retirements;exists_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Adjustment request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_adjustment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 exists_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',exists_saved,'command',CASE WHEN exists_saved THEN saved.command END,'retired_at',CASE WHEN exists_saved THEN saved.retired_at END,'replayed',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_adjustment_retirement_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_adjustment_retirement_status(uuid,uuid,uuid) TO authenticated;
COMMIT;
