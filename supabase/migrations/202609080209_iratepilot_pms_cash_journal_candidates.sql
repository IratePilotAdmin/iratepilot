BEGIN;
CREATE FUNCTION public.irp_pms_pilot_cashier_journal_candidates(p_tenant uuid,p_property uuid,p_kind text,p_source uuid,p_account uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_amount numeric;target_date date;linked boolean;items jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_kind='opening' THEN
 SELECT opening_minor,business_date INTO target_amount,target_date FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_source;
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_opening_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.session_id=p_source AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id)) INTO linked;
 ELSIF p_kind='custody' THEN
 SELECT CASE WHEN e.kind='cash_in' THEN e.amount_minor ELSE -e.amount_minor END,s.business_date INTO target_amount,target_date FROM irp_pms.cashier_custody_events e JOIN irp_pms.cashier_sessions s ON (s.tenant_id,s.property_id,s.id)=(e.tenant_id,e.property_id,e.session_id) WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.id=p_source;
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_custody_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.movement_id=p_source AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id)) INTO linked;
 ELSE RAISE EXCEPTION 'Choose opening or custody cash';END IF;
 IF target_amount IS NULL OR target_amount=0 OR target_date IS NULL THEN RAISE EXCEPTION 'Cash source not found or has no cash to link';END IF;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account AND active AND kind='asset') THEN RAISE EXCEPTION 'Choose an active cash asset account';END IF;
 WITH candidates AS(SELECT j.id,j.posting_date,j.description FROM irp_pms.gl_journals j WHERE NOT linked AND j.tenant_id=p_tenant AND j.property_id=p_property AND j.source_kind='manual_journal' AND j.posting_date<=target_date AND (p_before IS NULL OR j.id<p_before)
 AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.reversal_of=j.id)
 AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_opening_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.journal_id=j.id)
 AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_custody_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.journal_id=j.id)
 AND (SELECT coalesce(sum(CASE WHEN l.side='debit' THEN l.amount_minor ELSE -l.amount_minor END),0) FROM irp_pms.gl_lines l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.journal_id=j.id AND l.account_id=p_account)=target_amount ORDER BY j.id DESC LIMIT 51), numbered AS(SELECT *,row_number() OVER(ORDER BY id DESC) n FROM candidates)
 SELECT coalesce(jsonb_agg(jsonb_build_object('journal_id',id,'posting_date',posting_date,'description',description,'cash_minor',target_amount::text) ORDER BY id DESC) FILTER(WHERE n<=50),'[]'),count(*)>50 INTO items,more FROM numbered;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'kind',p_kind,'source_id',p_source,'account_id',p_account,'cash_minor',target_amount::text,'business_date',target_date,'already_linked',linked,'entries',items,'has_more',more,'next_cursor',CASE WHEN more THEN items->49->>'journal_id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_journal_candidates(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_journal_candidates(uuid,uuid,text,uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_custody_journal_sources(p_tenant uuid,p_property uuid,p_session uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session) THEN RAISE EXCEPTION 'Cashier session not found';END IF;
 WITH pending AS(SELECT e.*,EXISTS(SELECT 1 FROM irp_pms.cashier_custody_ledger_links l WHERE l.tenant_id=e.tenant_id AND l.property_id=e.property_id AND l.movement_id=e.id AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id)) AS already_linked FROM irp_pms.cashier_custody_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.session_id=p_session AND (p_before IS NULL OR e.id<p_before) ORDER BY e.id DESC LIMIT 51), numbered AS(SELECT *,row_number() OVER(ORDER BY id DESC) n FROM pending)
 SELECT coalesce(jsonb_agg(jsonb_build_object('movement_id',id,'kind',kind,'amount_minor',amount_minor::text,'reason',reason,'recorded_at',created_at,'already_linked',already_linked) ORDER BY id DESC) FILTER(WHERE n<=50),'[]'),count(*)>50 INTO items,more FROM numbered;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'session_id',p_session,'entries',items,'has_more',more,'next_cursor',CASE WHEN more THEN items->49->>'movement_id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_custody_journal_sources(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_custody_journal_sources(uuid,uuid,uuid,uuid) TO authenticated;
COMMIT;
