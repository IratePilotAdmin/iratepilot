BEGIN;
CREATE FUNCTION public.irp_pms_pilot_bank_statement_accounting_status(p_tenant uuid,p_property uuid,p_statement uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s irp_pms.cashier_bank_statement_entries;posted numeric:=0;journals jsonb;voided boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO s FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_statement;
 IF NOT FOUND THEN RAISE EXCEPTION 'Statement entry not found';END IF;
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND statement_id=p_statement) INTO voided;
 WITH linked AS(
 SELECT p.journal_id,m.amount_minor FROM irp_pms.cashier_bank_settlement_postings p JOIN irp_pms.cashier_bank_matches m ON m.tenant_id=p.tenant_id AND m.property_id=p.property_id AND m.id=p.match_id WHERE p.tenant_id=p_tenant AND p.property_id=p_property AND m.statement_id=p_statement
 UNION ALL SELECT p.journal_id,-s.amount_minor FROM irp_pms.cashier_bank_debit_postings p WHERE p.tenant_id=p_tenant AND p.property_id=p_property AND p.statement_id=p_statement
 ),active AS(SELECT * FROM linked l WHERE NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.reversal_of=l.journal_id))
 SELECT coalesce(sum(amount_minor),0),coalesce(jsonb_agg(jsonb_build_object('journal_id',journal_id,'amount_minor',amount_minor::text) ORDER BY journal_id),'[]'::jsonb) INTO posted,journals FROM active;
 IF posted<0 OR posted>abs(s.amount_minor) THEN RAISE EXCEPTION 'Statement accounting totals are inconsistent';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'statement_id',p_statement,'bank_id',s.account_id,'direction',CASE WHEN s.amount_minor>0 THEN 'credit' ELSE 'debit' END,'amount_minor',abs(s.amount_minor)::text,'posted_minor',posted::text,'unposted_minor',(abs(s.amount_minor)-posted)::text,'voided',voided,'fully_posted',NOT voided AND posted=abs(s.amount_minor),'active_journals',journals,'bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_bank_statement_accounting_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bank_statement_accounting_status(uuid,uuid,uuid) TO authenticated;
COMMIT;
