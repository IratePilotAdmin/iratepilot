BEGIN;

-- cashier-variance-accounting-draft.sql
CREATE FUNCTION public.irp_pms_pilot_preview_cashier_variance(p_tenant uuid,p_property uuid,p_session uuid,p_mapping uuid,p_expense uuid,p_period uuid,p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE closing irp_pms.cashier_closes;decision irp_pms.cashier_variance_reviews;mapping irp_pms.cashier_bank_ledger_mappings;period irp_pms.gl_periods;variance bigint;business date;lines jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO closing FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose a closed cashier session';END IF;
 variance:=(closing.review->>'variance_minor')::bigint;
 IF variance IS NULL OR variance=0 THEN RAISE EXCEPTION 'Balanced drawer has no variance to post';END IF;
 SELECT * INTO decision FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND OR decision.outcome<>'adjustment_required' THEN RAISE EXCEPTION 'Review the variance and confirm an accounting adjustment is required';END IF;
 SELECT * INTO mapping FROM irp_pms.cashier_bank_ledger_mappings WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_mapping;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose the cash ledger mapping';END IF;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=mapping.custody_account AND kind='asset' AND active) OR NOT EXISTS(SELECT 1 FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_expense AND kind='expense' AND active) THEN RAISE EXCEPTION 'Choose active cash and cash-short-or-over expense accounts';END IF;
 SELECT business_date INTO business FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session;
 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF NOT FOUND OR period.closed OR p_date IS NULL OR NOT isfinite(p_date) OR p_date<business OR p_date<period.starts_on OR p_date>=period.ends_before THEN RAISE EXCEPTION 'Choose an open accounting date on or after the drawer business date';END IF;
 lines:=jsonb_build_array(jsonb_build_object('account_id',mapping.custody_account,'side',CASE WHEN variance>0 THEN 'debit' ELSE 'credit' END,'amount_minor',abs(variance)::text),jsonb_build_object('account_id',p_expense,'side',CASE WHEN variance>0 THEN 'credit' ELSE 'debit' END,'amount_minor',abs(variance)::text));
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'session_id',p_session,'mapping_id',p_mapping,'expense_account_id',p_expense,'variance_minor',variance::text,'review_revision',decision.revision::text,'review_request_id',decision.request_id,'period_id',p_period,'posting_date',p_date,'journal_posted',false,'command',jsonb_build_object('currency','USD','description','Cash drawer shortage or overage','period_id',p_period,'posting_date',p_date,'source_kind','cashier_variance','source_id',p_session,'source_version',decision.revision,'lines',lines));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_cashier_variance(uuid,uuid,uuid,uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_cashier_variance(uuid,uuid,uuid,uuid,uuid,uuid,date) TO authenticated;

-- cashier-variance-posting-draft.sql
CREATE TABLE irp_pms.cashier_variance_postings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,review_revision bigint NOT NULL,journal_id uuid NOT NULL,review jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,session_id,review_revision),UNIQUE(tenant_id,property_id,journal_id),
 FOREIGN KEY(tenant_id,property_id,session_id,review_revision) REFERENCES irp_pms.cashier_variance_reviews(tenant_id,property_id,session_id,revision),FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_variance_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_variance_postings FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_variance_postings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_post_cashier_variance(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_variance_postings;fresh jsonb;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR jsonb_typeof(p_review) IS DISTINCT FROM 'object' OR octet_length(p_review::text)>1048576 THEN RAISE EXCEPTION 'Confirm the variance accounting review';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_variance_posting_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Variance posting request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_variance_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Variance request has different details';END IF;RETURN saved.result||jsonb_build_object('replayed',true);END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Variance review belongs to another scope';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_variance_postings p WHERE p.tenant_id=p_tenant AND p.property_id=p_property AND p.session_id=(p_review->>'session_id')::uuid AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.property_id AND r.reversal_of=p.journal_id)) THEN RAISE EXCEPTION 'Variance already posted; reverse it before correction';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_variance_postings WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=(p_review->>'session_id')::uuid AND review_revision=(p_review->>'review_revision')::bigint) THEN RAISE EXCEPTION 'Record a new variance review before replacement accounting';END IF;
 fresh:=public.irp_pms_pilot_preview_cashier_variance(p_tenant,p_property,(p_review->>'session_id')::uuid,(p_review->>'mapping_id')::uuid,(p_review->>'expense_account_id')::uuid,(p_review->>'period_id')::uuid,(p_review->>'posting_date')::date);
 IF fresh IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Variance review changed; review again';END IF;
 receipt:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),fresh->'command')||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'session_id',fresh->'session_id','variance_minor',fresh->'variance_minor','journal_posted',true,'cash_recovered',false);
 INSERT INTO irp_pms.cashier_variance_postings VALUES(p_tenant,p_property,p_request,auth.uid(),(fresh->>'session_id')::uuid,(fresh->>'review_revision')::bigint,(receipt->>'journal_id')::uuid,fresh,receipt);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_variance_posted',(fresh->>'session_id')::uuid,jsonb_build_object('request_id',p_request,'journal_id',receipt->'journal_id'));
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_cashier_variance(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Grant follows installation of recovery and deposit integration functions.

-- cashier-variance-recovery-draft.sql
CREATE TABLE irp_pms.cashier_variance_posting_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_variance_posting_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_variance_posting_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_variance_posting_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_cancel_cashier_variance_posting(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_variance_posting_cancellations;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unposted variance adjustment';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_variance_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Cash variance already posted; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_variance_posting_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_variance_posting_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_variance_posting_cancelled',p_request,'{}');
 END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'cancelled',true,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_cashier_variance_posting(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_cashier_variance_posting(uuid,uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_variance_posting_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_variance_postings;c irp_pms.cashier_variance_posting_cancellations;reversed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_variance_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT * INTO c FROM irp_pms.cashier_variance_posting_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=saved.journal_id) INTO reversed;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',saved.request_id IS NOT NULL,'cancelled',c.request_id IS NOT NULL,'journal_reversed',reversed,'review',saved.review,'result',CASE WHEN saved.request_id IS NOT NULL THEN saved.result||jsonb_build_object('replayed',true) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_variance_posting_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_variance_posting_status(uuid,uuid,uuid) TO authenticated;

-- cashier-variance-deposit-integration-draft.sql
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_cashier_ledger_source_review(p_tenant uuid,p_property uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s irp_pms.cashier_sessions;payments bigint;unposted bigint;incoming numeric;outgoing numeric;custody bigint;custody_in numeric;custody_out numeric;unlinked_custody bigint;opening_linked boolean;source_journals jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO s FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cashier session not found';END IF;
 SELECT count(*),count(*) FILTER(WHERE p.journal_id IS NULL),coalesce(sum(e.amount_minor) FILTER(WHERE e.kind='external_payment'),0),coalesce(sum(e.amount_minor) FILTER(WHERE e.kind='external_refund'),0) INTO payments,unposted,incoming,outgoing
 FROM irp_pms.cashier_guest_payments c JOIN irp_pms.folio_entries e ON e.tenant_id=c.tenant_id AND e.property_id=c.property_id AND e.reservation_id=c.reservation_id AND e.id=c.entry_id LEFT JOIN irp_pms.gl_payment_postings p ON p.tenant_id=e.tenant_id AND p.property_id=e.property_id AND p.reservation_id=e.reservation_id AND p.entry_id=e.id WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.session_id=p_session;
 SELECT count(*),coalesce(sum(amount_minor) FILTER(WHERE kind='cash_in'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='cash_out'),0) INTO custody,custody_in,custody_out FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
 SELECT count(*) INTO unlinked_custody FROM irp_pms.cashier_custody_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.session_id=p_session AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_custody_ledger_links l WHERE l.tenant_id=e.tenant_id AND l.property_id=e.property_id AND l.movement_id=e.id AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id));
 SELECT s.opening_minor=0 OR EXISTS(SELECT 1 FROM irp_pms.cashier_opening_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.session_id=p_session AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals j WHERE j.tenant_id=l.tenant_id AND j.property_id=l.property_id AND j.reversal_of=l.journal_id)) INTO opening_linked;
 WITH sources AS(
 SELECT 'guest_payment'::text AS kind,c.entry_id AS source_id,p.journal_id FROM irp_pms.cashier_guest_payments c JOIN irp_pms.gl_payment_postings p ON p.tenant_id=c.tenant_id AND p.property_id=c.property_id AND p.entry_id=c.entry_id AND p.reservation_id=c.reservation_id WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.session_id=p_session
 UNION ALL SELECT 'opening',l.session_id,l.journal_id FROM irp_pms.cashier_opening_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.session_id=p_session
 UNION ALL SELECT 'custody',l.movement_id,l.journal_id FROM irp_pms.cashier_custody_ledger_links l JOIN irp_pms.cashier_custody_events e ON e.tenant_id=l.tenant_id AND e.property_id=l.property_id AND e.id=l.movement_id WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.session_id=p_session
 UNION ALL SELECT 'variance',p.session_id,p.journal_id FROM irp_pms.cashier_variance_postings p WHERE p.tenant_id=p_tenant AND p.property_id=p_property AND p.session_id=p_session)
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'source_id',x.source_id,'journal_id',x.journal_id) ORDER BY x.kind,x.source_id,x.journal_id),'[]'::jsonb) INTO source_journals FROM sources x WHERE NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.reversal_of=x.journal_id);
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'actor_id',auth.uid(),'variance_minor',(SELECT review->>'variance_minor' FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session),'source_journals',source_journals,'opening_minor',s.opening_minor::text,'guest_receipts_minor',incoming::text,'guest_refunds_minor',outgoing::text,'guest_payment_count',payments,'unposted_guest_payment_count',unposted,'custody_movement_count',custody,'custody_in_minor',custody_in::text,'custody_out_minor',custody_out::text,'expected_cash_minor',(s.opening_minor+incoming-outgoing+custody_in-custody_out)::text,'opening_source_linked',opening_linked,'custody_posting_supported',false,'unlinked_custody_movement_count',unlinked_custody,'transfer_posting_ready',false,'live_view',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_ledger_source_review(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_ledger_source_review(uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_review_deposit_ledger_sources(p_tenant uuid,p_property uuid,p_deposit uuid,p_mapping uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d irp_pms.cashier_bank_deposits;m irp_pms.cashier_bank_ledger_mappings;item record;r jsonb;reviews jsonb:='[]';blockers jsonb:='[]';bank uuid;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO d FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_deposit;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deposit not found';END IF;
 SELECT * INTO m FROM irp_pms.cashier_bank_ledger_mappings WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_mapping;
 SELECT account_id INTO bank FROM irp_pms.cashier_bank_deposit_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_deposit;
 IF m.id IS NULL OR bank IS NULL OR m.bank_id<>bank THEN RAISE EXCEPTION 'Choose the deposit bank ledger mapping';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_deposit) THEN blockers:=blockers||jsonb_build_array('Deposit is voided');END IF;
 FOR item IN SELECT DISTINCT h.session_id,c.review FROM irp_pms.cashier_bank_deposit_allocations a JOIN irp_pms.cashier_handoffs h ON h.tenant_id=a.tenant_id AND h.property_id=a.property_id AND h.id=a.handoff_id JOIN irp_pms.cashier_closes c ON c.tenant_id=h.tenant_id AND c.property_id=h.property_id AND c.session_id=h.session_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.deposit_id=p_deposit ORDER BY h.session_id LOOP
  r:=public.irp_pms_pilot_review_cashier_bank_ledger(p_tenant,p_property,item.session_id,p_mapping);reviews:=reviews||jsonb_build_array(r);
  IF NOT (r->>'opening_source_linked')::boolean OR NOT (r->>'opening_account_matches')::boolean THEN blockers:=blockers||jsonb_build_array('Opening cash needs a valid custody-account journal');END IF;
  IF (r->>'unposted_guest_payment_count')::bigint>0 OR (r->>'mismatched_payment_account_count')::bigint>0 THEN blockers:=blockers||jsonb_build_array('Guest cash payments need matching custody-account postings');END IF;
  IF (r->>'unlinked_custody_movement_count')::bigint>0 OR (r->>'mismatched_custody_account_count')::bigint>0 THEN blockers:=blockers||jsonb_build_array('Custody movements need matching journal links');END IF;
  IF (item.review->>'variance_minor')::numeric IS DISTINCT FROM 0 AND NOT EXISTS(
   SELECT 1 FROM irp_pms.cashier_variance_postings v JOIN irp_pms.cashier_bank_ledger_mappings vm ON vm.tenant_id=v.tenant_id AND vm.property_id=v.property_id AND vm.id=(v.review->>'mapping_id')::uuid
   WHERE v.tenant_id=p_tenant AND v.property_id=p_property AND v.session_id=item.session_id AND vm.custody_account=m.custody_account AND v.review->>'variance_minor'=item.review->>'variance_minor'
   AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals reversal WHERE reversal.tenant_id=v.tenant_id AND reversal.property_id=v.property_id AND reversal.reversal_of=v.journal_id)
  ) THEN blockers:=blockers||jsonb_build_array('Drawer variance requires accounting resolution');END IF;
 END LOOP;
 IF jsonb_array_length(reviews)=0 THEN blockers:=blockers||jsonb_build_array('Deposit has no reviewed drawer sources');END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'deposit_id',p_deposit,'mapping_id',p_mapping,'amount_minor',d.amount_minor::text,'source_reviews',reviews,'blockers',blockers,'sources_reconciled',jsonb_array_length(blockers)=0,'proposed_lines',irp_pms.gl_cash_transfer_lines(p_tenant,p_property,m.custody_account,m.transit_account,d.amount_minor),'journal_posted',false,'transfer_posting_ready',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_deposit_ledger_sources(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_deposit_ledger_sources(uuid,uuid,uuid,uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_cashier_variance(uuid,uuid,uuid,jsonb,boolean) TO authenticated;

COMMIT;
