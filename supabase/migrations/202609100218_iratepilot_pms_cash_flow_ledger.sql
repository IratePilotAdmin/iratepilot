BEGIN;
CREATE FUNCTION public.irp_pms_pilot_cash_flow_ledger(p_tenant uuid,p_property uuid,p_configuration uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config jsonb;accounts uuid[];opening numeric;movement numeric;entries jsonb;n bigint;line_count bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_configuration IS NULL OR p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Select a saved cash configuration and a range of 1 to 366 days';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 config:=public.irp_pms_pilot_cash_flow_configuration(p_tenant,p_property,p_configuration);
 SELECT array_agg(value::uuid) INTO accounts FROM jsonb_array_elements_text(config->'cash_account_ids');
 SELECT count(*) INTO n FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND posting_date>=p_start AND posting_date<p_end;
 SELECT count(*) INTO line_count FROM irp_pms.gl_lines l JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(l.tenant_id,l.property_id,l.journal_id) WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date>=p_start AND j.posting_date<p_end;
 IF n>10000 OR line_count>100000 THEN RAISE EXCEPTION 'Cash-flow range is too large; select a shorter range. No partial report was returned';END IF;
 SELECT coalesce(sum(CASE WHEN l.side='debit' THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END) FILTER(WHERE j.posting_date<p_start),0),
 coalesce(sum(CASE WHEN l.side='debit' THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END) FILTER(WHERE j.posting_date>=p_start),0)
 INTO opening,movement FROM irp_pms.gl_lines l JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(l.tenant_id,l.property_id,l.journal_id)
 WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date<p_end AND l.account_id=ANY(accounts);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'posting_date',j.posting_date,'description',j.description,'source_kind',j.source_kind,'source_id',j.source_id,'source_version',j.source_version::text,'currency',j.currency,'lines',(
 SELECT jsonb_agg(jsonb_build_object('line_no',l.line_no,'account_id',l.account_id,'side',l.side,'amount_minor',l.amount_minor::text) ORDER BY l.line_no) FROM irp_pms.gl_lines l WHERE l.tenant_id=j.tenant_id AND l.property_id=j.property_id AND l.journal_id=j.id
 )) ORDER BY j.posting_date,j.id),'[]'::jsonb) INTO entries FROM irp_pms.gl_journals j WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date>=p_start AND j.posting_date<p_end;
 RETURN jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'start',p_start,'end',p_end,'end_exclusive',true,'currency','USD','configuration',config,'opening_minor',opening::text,'net_change_minor',movement::text,'closing_minor',(opening+movement)::text,'journal_count',n,'line_count',line_count,'journals',entries,'rows_truncated',false,'classification_available',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cash_flow_ledger(uuid,uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cash_flow_ledger(uuid,uuid,uuid,date,date) TO authenticated;
COMMIT;
