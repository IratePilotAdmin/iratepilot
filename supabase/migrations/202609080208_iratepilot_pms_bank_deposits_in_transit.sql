BEGIN;
CREATE FUNCTION public.irp_pms_pilot_bank_deposits_in_transit(p_tenant uuid,p_property uuid,p_bank uuid,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;total numeric;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_end IS NULL OR NOT isfinite(p_end) THEN RAISE EXCEPTION 'Choose a valid reporting end date';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_bank) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 WITH deposits AS (
 SELECT p.deposit_id,p.journal_id,j.posting_date,CASE WHEN EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.reversal_of=j.id AND r.posting_date<p_end) THEN 0 ELSE (p.review->>'amount_minor')::numeric END amount,m.transit_account
 FROM irp_pms.cashier_deposit_ledger_postings p JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(p.tenant_id,p.property_id,p.journal_id)
 JOIN irp_pms.cashier_bank_ledger_mappings m ON m.tenant_id=p.tenant_id AND m.property_id=p.property_id AND m.id=(p.review->>'mapping_id')::uuid
 WHERE p.tenant_id=p_tenant AND p.property_id=p_property AND m.bank_id=p_bank AND j.posting_date<p_end

 ), outstanding AS (
 SELECT d.*,d.amount-coalesce((SELECT sum(m.amount_minor) FROM irp_pms.cashier_bank_settlement_postings s JOIN irp_pms.cashier_bank_matches m ON (m.tenant_id,m.property_id,m.id)=(s.tenant_id,s.property_id,s.match_id) JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(s.tenant_id,s.property_id,s.journal_id)
 WHERE s.tenant_id=p_tenant AND s.property_id=p_property AND m.deposit_id=d.deposit_id AND j.posting_date<p_end AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.reversal_of=j.id AND r.posting_date<p_end)),0) remaining FROM deposits d
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('deposit_id',deposit_id,'deposit_journal_id',journal_id,'posting_date',posting_date,'transit_account_id',transit_account,'deposited_minor',amount::text,'outstanding_minor',remaining::text,'requires_review',remaining<0) ORDER BY posting_date,deposit_id) FILTER(WHERE remaining<>0),'[]'),coalesce(sum(remaining),0) INTO entries,total FROM outstanding;
 IF jsonb_array_length(entries)>10000 THEN RAISE EXCEPTION 'Too many outstanding deposits for this report';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'bank_id',p_bank,'end_date_exclusive',p_end,'entries',entries,'outstanding_minor',total::text,'currency','USD','basis','posted_deposits_less_posted_settlements','bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_bank_deposits_in_transit(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bank_deposits_in_transit(uuid,uuid,uuid,date) TO authenticated;
COMMIT;
