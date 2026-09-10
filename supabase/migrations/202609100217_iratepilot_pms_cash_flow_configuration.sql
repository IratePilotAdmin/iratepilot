BEGIN;
CREATE TABLE irp_pms.cash_flow_configurations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
 cash_account_ids uuid[] NOT NULL CHECK(cardinality(cash_account_ids) BETWEEN 1 AND 100),
 account_snapshot jsonb NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 command jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,version),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cash_flow_configurations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cash_flow_configurations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION irp_pms.cash_flow_history_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Cash-flow review history is immutable';END $$;
REVOKE ALL ON FUNCTION irp_pms.cash_flow_history_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cash_flow_configuration_immutable BEFORE UPDATE OR DELETE ON irp_pms.cash_flow_configurations FOR EACH ROW EXECUTE FUNCTION irp_pms.cash_flow_history_immutable();

CREATE FUNCTION public.irp_pms_pilot_save_cash_flow_configuration(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_accounts uuid[],p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_version bigint;canonical uuid[];snapshot jsonb;cmd jsonb;prior irp_pms.cash_flow_configurations;
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can designate cash accounts' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cash-account review identity, version and confirmation required';END IF;
 IF p_accounts IS NULL OR cardinality(p_accounts) NOT BETWEEN 1 AND 100 OR array_ndims(p_accounts)<>1 OR array_position(p_accounts,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Choose 1 to 100 distinct cash accounts';END IF;
 SELECT array_agg(DISTINCT a ORDER BY a) INTO canonical FROM unnest(p_accounts) a;
 IF cardinality(canonical)<>cardinality(p_accounts) THEN RAISE EXCEPTION 'Choose distinct cash accounts';END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Explain the reviewed cash-account basis';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can designate cash accounts' USING ERRCODE='42501';END IF;
 cmd:=jsonb_build_object('expected_version',p_expected_version,'accounts',canonical,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.cash_flow_configurations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF prior.actor_id<>auth.uid() OR prior.command<>cmd THEN RAISE EXCEPTION 'Cash-account request identity already used';END IF;
  RETURN to_jsonb(prior)-'command'||jsonb_build_object('replayed',true);
 END IF;
 SELECT coalesce(max(version),0) INTO current_version FROM irp_pms.cash_flow_configurations WHERE tenant_id=p_tenant AND property_id=p_property;
 IF current_version<>p_expected_version THEN RAISE EXCEPTION 'Cash-account configuration changed; refresh and review' USING ERRCODE='PT409';END IF;
 -- Inactive historical assets may be deliberately included; owner attests the cash basis.
 IF (SELECT count(*) FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=ANY(canonical) AND kind='asset')<>cardinality(canonical) THEN RAISE EXCEPTION 'Cash accounts must be asset accounts in this property';END IF;
 SELECT jsonb_agg(jsonb_build_object('account_id',id,'code',code,'name',name,'kind',kind,'active',active) ORDER BY id) INTO snapshot FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=ANY(canonical);
 INSERT INTO irp_pms.cash_flow_configurations(tenant_id,property_id,id,version,cash_account_ids,account_snapshot,reason,actor_id,command)
 VALUES(p_tenant,p_property,p_request,current_version+1,canonical,snapshot,trim(p_reason),auth.uid(),cmd) RETURNING * INTO prior;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cash_flow_configuration_saved',p_request,jsonb_build_object('version',prior.version,'accounts',canonical,'reason',trim(p_reason)));
 RETURN to_jsonb(prior)-'command'||jsonb_build_object('replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_cash_flow_configuration(uuid,uuid,uuid,bigint,uuid[],text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_save_cash_flow_configuration(uuid,uuid,uuid,bigint,uuid[],text,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cash_flow_configuration(p_tenant uuid,p_property uuid,p_configuration uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected irp_pms.cash_flow_configurations;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO selected FROM irp_pms.cash_flow_configurations WHERE tenant_id=p_tenant AND property_id=p_property AND (p_configuration IS NULL OR id=p_configuration) ORDER BY version DESC LIMIT 1;
 IF NOT FOUND THEN
  IF p_configuration IS NOT NULL THEN RAISE EXCEPTION 'Cash-account configuration not found in this property';END IF;
  RETURN jsonb_build_object('configured',false,'tenant_id',p_tenant,'property_id',p_property,'version',0);
 END IF;
 RETURN to_jsonb(selected)-'command'||jsonb_build_object('configured',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cash_flow_configuration(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cash_flow_configuration(uuid,uuid,uuid) TO authenticated;
COMMIT;
