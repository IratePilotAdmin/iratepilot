BEGIN;
CREATE FUNCTION public.irp_pms_pilot_bank_statement_accounting_at(p_tenant uuid,p_property uuid,p_statement uuid,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s irp_pms.cashier_bank_statement_entries;posted numeric:=0;journals jsonb;voided boolean;
BEGIN
 IF p_end IS NULL OR NOT isfinite(p_end) THEN RAISE EXCEPTION 'Choose a valid accounting cutoff';END IF;
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
 ),active AS(SELECT l.* FROM linked l JOIN irp_pms.gl_journals j ON j.tenant_id=p_tenant AND j.property_id=p_property AND j.id=l.journal_id WHERE j.posting_date<p_end AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.reversal_of=l.journal_id AND r.posting_date<p_end))
 SELECT coalesce(sum(amount_minor),0),coalesce(jsonb_agg(jsonb_build_object('journal_id',journal_id,'amount_minor',amount_minor::text) ORDER BY journal_id),'[]'::jsonb) INTO posted,journals FROM active;
 IF posted<0 OR posted>abs(s.amount_minor) THEN RAISE EXCEPTION 'Statement accounting totals are inconsistent';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'statement_id',p_statement,'bank_id',s.account_id,'direction',CASE WHEN s.amount_minor>0 THEN 'credit' ELSE 'debit' END,'amount_minor',abs(s.amount_minor)::text,'posted_minor',posted::text,'unposted_minor',(abs(s.amount_minor)-posted)::text,'voided',voided,'fully_posted',NOT voided AND posted=abs(s.amount_minor),'active_journals',journals,'end_date_exclusive',p_end,'basis','current_statement_with_journals_before_cutoff','bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_bank_statement_accounting_at(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bank_statement_accounting_at(uuid,uuid,uuid,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_review_bank_close(p_tenant uuid,p_property uuid,p_bank uuid,p_start date,p_end date,p_opening bigint,p_closing bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record;r jsonb;credits numeric:=0;debits numeric:=0;unposted numeric:=0;entries bigint:=0;exceptions jsonb:='[]';sources jsonb:='[]';expected numeric;ledger jsonb;ledger_closing numeric;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 OR p_opening IS NULL OR p_closing IS NULL OR abs(p_opening::numeric)>999999999999999 OR abs(p_closing::numeric)>999999999999999 THEN RAISE EXCEPTION 'Choose a valid statement period and balances';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_bank) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 FOR item IN SELECT s.id,s.amount_minor FROM irp_pms.cashier_bank_statement_entries s WHERE s.tenant_id=p_tenant AND s.property_id=p_property AND s.account_id=p_bank AND s.value_date>=p_start AND s.value_date<p_end AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids v WHERE v.tenant_id=s.tenant_id AND v.property_id=s.property_id AND v.statement_id=s.id) ORDER BY s.id LOOP
  entries:=entries+1;IF entries>10000 THEN RAISE EXCEPTION 'Statement period is too large; choose a shorter range';END IF;
  IF item.amount_minor>0 THEN credits:=credits+item.amount_minor;ELSE debits:=debits-item.amount_minor;END IF;
  r:=public.irp_pms_pilot_bank_statement_accounting_at(p_tenant,p_property,item.id,p_end);unposted:=unposted+(r->>'unposted_minor')::numeric;sources:=sources||jsonb_build_array(r);
  IF NOT (r->>'fully_posted')::boolean THEN exceptions:=exceptions||jsonb_build_array(jsonb_build_object('statement_id',item.id,'unposted_minor',r->>'unposted_minor'));END IF;
 END LOOP;
 expected:=p_opening+credits-debits;
 ledger:=public.irp_pms_pilot_bank_ledger_balance(p_tenant,p_property,p_bank,p_start,p_end);
 SELECT coalesce(sum((a->>'closing_debit_minor')::numeric-(a->>'closing_credit_minor')::numeric),0) INTO ledger_closing FROM jsonb_array_elements(ledger->'accounts') a;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'bank_id',p_bank,'start_date',p_start,'end_date_exclusive',p_end,'opening_minor',p_opening::text,'closing_minor',p_closing::text,'expected_closing_minor',expected::text,'difference_minor',(p_closing-expected)::text,'credits_minor',credits::text,'debits_minor',debits::text,'entry_count',entries,'unposted_minor',unposted::text,'exceptions',exceptions,'source_entries',sources,'statement_balances',p_closing=expected,'all_entries_posted',unposted=0,'ledger_review',ledger,'ledger_closing_minor',ledger_closing::text,'statement_ledger_difference_minor',(p_closing-ledger_closing)::text,'ledger_configuration_present',jsonb_array_length(ledger->'accounts')>0,'ledger_balance_matches',jsonb_array_length(ledger->'accounts')>0 AND NOT (ledger->>'shared_with_other_banks')::boolean AND ledger_closing=p_closing,'close_supported',false,'bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_bank_close(uuid,uuid,uuid,date,date,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_bank_close(uuid,uuid,uuid,date,date,bigint,bigint) TO authenticated;
COMMIT;
