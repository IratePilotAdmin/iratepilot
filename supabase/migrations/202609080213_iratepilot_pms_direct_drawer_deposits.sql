BEGIN;
-- Source: cashier-direct-deposit-sources-draft.sql
CREATE TABLE irp_pms.cashier_direct_deposit_sources(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,deposit_id uuid NOT NULL,session_id uuid NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 PRIMARY KEY(tenant_id,property_id,deposit_id),FOREIGN KEY(tenant_id,property_id,deposit_id) REFERENCES irp_pms.cashier_bank_deposits(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_closes(tenant_id,property_id,session_id)
);
ALTER TABLE irp_pms.cashier_direct_deposit_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_direct_deposit_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_direct_deposit_sources FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_cashier_drawer_available(p_tenant uuid,p_property uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cashier uuid;counted numeric;reserved numeric;direct_reserved numeric;paused boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT s.cashier_id,(c.review->>'counted_minor')::numeric INTO cashier,counted FROM irp_pms.cashier_sessions s JOIN irp_pms.cashier_closes c ON (c.tenant_id,c.property_id,c.session_id)=(s.tenant_id,s.property_id,s.id) WHERE s.tenant_id=p_tenant AND s.property_id=p_property AND s.id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose a closed cash drawer';END IF;
 IF cashier IS DISTINCT FROM auth.uid() THEN PERFORM irp_pms.pilot_require(p_tenant,p_property,true);END IF;
 SELECT coalesce(sum(h.amount_minor),0) INTO reserved FROM irp_pms.cashier_handoffs h LEFT JOIN irp_pms.cashier_handoff_resolutions r ON (r.tenant_id,r.property_id,r.handoff_id)=(h.tenant_id,h.property_id,h.id) WHERE h.tenant_id=p_tenant AND h.property_id=p_property AND h.session_id=p_session AND (r.outcome IS NULL OR r.outcome='accepted');
 SELECT coalesce(sum(d.amount_minor),0) INTO direct_reserved FROM irp_pms.cashier_direct_deposit_sources d WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND d.session_id=p_session AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE (v.tenant_id,v.property_id,v.deposit_id)=(d.tenant_id,d.property_id,d.deposit_id));
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_controls controls WHERE controls.tenant_id=p_tenant AND controls.property_id=p_property AND controls.paused) INTO paused;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'session_id',p_session,'cashier_id',cashier,'counted_minor',counted::text,'handoff_reserved_minor',reserved::text,'direct_deposit_reserved_minor',direct_reserved::text,'available_minor',(counted-reserved-direct_reserved)::text,'cashier_paused',paused,'assigned_cashier',cashier=auth.uid(),'direct_deposit_supported',true,'bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_drawer_available(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_drawer_available(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION irp_pms.cashier_drawer_assignment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE available jsonb;
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF TG_TABLE_NAME='cashier_direct_deposit_sources' THEN
 IF (NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposits d WHERE d.tenant_id=NEW.tenant_id AND d.property_id=NEW.property_id AND d.id=NEW.deposit_id AND d.amount_minor=NEW.amount_minor AND d.handoff_id IS NULL) OR EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_allocations a WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.deposit_id=NEW.deposit_id)) THEN RAISE EXCEPTION 'Direct deposit must have one matching drawer source';END IF;
 END IF;
 available:=public.irp_pms_pilot_cashier_drawer_available(NEW.tenant_id,NEW.property_id,NEW.session_id);
 IF (available->>'available_minor')::numeric<NEW.amount_minor THEN RAISE EXCEPTION 'Assignment exceeds unassigned counted cash';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_drawer_assignment_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER drawer_assignment_guard BEFORE INSERT ON irp_pms.cashier_handoffs FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_drawer_assignment_guard();
CREATE TRIGGER drawer_assignment_guard BEFORE INSERT ON irp_pms.cashier_direct_deposit_sources FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_drawer_assignment_guard();

-- Source: cashier-direct-deposit-create-draft.sql
CREATE FUNCTION public.irp_pms_pilot_declare_direct_cashier_deposit(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_bank uuid,p_amount bigint,p_reference text,p_date date,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_deposits;bank irp_pms.cashier_bank_accounts;availability jsonb;replayed boolean;receipt jsonb;business date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_session IS NULL OR p_request IS NULL OR p_bank IS NULL OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 999999999999 OR p_date IS NULL OR NOT isfinite(p_date) OR p_confirmed IS DISTINCT FROM true OR p_reference IS NULL OR p_reference<>trim(p_reference) OR length(p_reference) NOT BETWEEN 2 AND 120 OR p_reference~'[[:cntrl:]]' OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm valid direct deposit details';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.amount_minor<>p_amount OR saved.deposit_reference<>p_reference OR saved.deposit_date<>p_date OR saved.reason<>p_reason OR NOT EXISTS(SELECT 1 FROM irp_pms.cashier_direct_deposit_sources WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_request AND session_id=p_session) OR NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_request AND account_id=p_bank) THEN RAISE EXCEPTION 'Deposit request has different details';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Deposit request was cancelled';END IF;
  availability:=public.irp_pms_pilot_cashier_drawer_available(p_tenant,p_property,p_session);
  IF NOT (availability->>'assigned_cashier')::boolean THEN RAISE EXCEPTION 'Only the assigned cashier can declare this drawer deposit';END IF;
  IF (availability->>'cashier_paused')::boolean THEN RAISE EXCEPTION 'Cashier activity is paused by the owner';END IF;
  IF p_amount>(availability->>'available_minor')::numeric THEN RAISE EXCEPTION 'Deposit exceeds unassigned counted cash';END IF;
  SELECT business_date INTO business FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session;
  IF p_date<business THEN RAISE EXCEPTION 'Deposit date precedes drawer business date';END IF;
  SELECT * INTO bank FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_bank;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a bank account for this property';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposits d JOIN irp_pms.cashier_bank_deposit_accounts a ON (a.tenant_id,a.property_id,a.deposit_id)=(d.tenant_id,d.property_id,d.id) WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND a.account_id=p_bank AND lower(d.deposit_reference)=lower(p_reference) AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE (v.tenant_id,v.property_id,v.deposit_id)=(d.tenant_id,d.property_id,d.id))) THEN RAISE EXCEPTION 'Deposit reference already assigned to this bank account';END IF;
  INSERT INTO irp_pms.cashier_bank_deposits(tenant_id,property_id,id,allocations,actor_id,amount_minor,bank_label,deposit_reference,deposit_date,reason) VALUES(p_tenant,p_property,p_request,jsonb_build_array(jsonb_build_object('session_id',p_session,'amount_minor',p_amount::text)),auth.uid(),p_amount,bank.label,p_reference,p_date,p_reason);
  INSERT INTO irp_pms.cashier_direct_deposit_sources VALUES(p_tenant,p_property,p_request,p_session,p_amount);
  INSERT INTO irp_pms.cashier_bank_deposit_accounts(tenant_id,property_id,deposit_id,account_id,actor_id) VALUES(p_tenant,p_property,p_request,p_bank,auth.uid());
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'direct_drawer_deposit_declared',p_request,jsonb_build_object('session_id',p_session,'amount_minor',p_amount));
 END IF;
 receipt:=public.irp_pms_pilot_cashier_account_deposit_status(p_tenant,p_property,p_request)->'result';
 RETURN receipt||jsonb_build_object('replayed',replayed,'source_kind','direct_drawer','session_id',p_session);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_declare_direct_cashier_deposit(uuid,uuid,uuid,uuid,uuid,bigint,text,date,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Application access granted after all definitions below.

-- Source: cashier-direct-deposit-accounting-draft.sql
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
 FOR item IN SELECT DISTINCT h.session_id,c.review FROM irp_pms.cashier_bank_deposit_allocations a JOIN irp_pms.cashier_handoffs h ON h.tenant_id=a.tenant_id AND h.property_id=a.property_id AND h.id=a.handoff_id JOIN irp_pms.cashier_closes c ON c.tenant_id=h.tenant_id AND c.property_id=h.property_id AND c.session_id=h.session_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.deposit_id=p_deposit UNION SELECT direct.session_id,c.review FROM irp_pms.cashier_direct_deposit_sources direct JOIN irp_pms.cashier_closes c ON (c.tenant_id,c.property_id,c.session_id)=(direct.tenant_id,direct.property_id,direct.session_id) WHERE direct.tenant_id=p_tenant AND direct.property_id=p_property AND direct.deposit_id=p_deposit ORDER BY session_id LOOP
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
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_preview_deposit_transfer(p_tenant uuid,p_property uuid,p_deposit uuid,p_mapping uuid,p_period uuid,p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE review jsonb;period irp_pms.gl_periods;deposit_date date;latest_source date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 review:=public.irp_pms_pilot_review_deposit_ledger_sources(p_tenant,p_property,p_deposit,p_mapping);
 IF (review->>'sources_reconciled')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Resolve deposit source accounting before posting';END IF;
 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF NOT FOUND OR period.closed OR p_date IS NULL OR NOT isfinite(p_date) OR p_date<period.starts_on OR p_date>=period.ends_before THEN RAISE EXCEPTION 'Choose a posting date in an open property period';END IF;
 SELECT d.deposit_date INTO deposit_date FROM irp_pms.cashier_bank_deposits d WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND d.id=p_deposit;
 SELECT max(j.posting_date) INTO latest_source FROM jsonb_array_elements(review->'source_reviews') source CROSS JOIN LATERAL jsonb_array_elements(source->'source_journals') journal JOIN irp_pms.gl_journals j ON j.tenant_id=p_tenant AND j.property_id=p_property AND j.id=(journal->>'journal_id')::uuid;
 IF p_date<deposit_date OR p_date<latest_source THEN RAISE EXCEPTION 'Transfer date cannot precede the deposit or its source journals';END IF;
 RETURN review||jsonb_build_object('period_id',p_period,'posting_date',p_date,'latest_source_posting_date',latest_source,'command',jsonb_build_object('currency','USD','description','Cash deposit to bank transit','period_id',p_period,'posting_date',p_date,'source_kind','cashier_bank_deposit','source_id',p_deposit,'source_version',1,'lines',review->'proposed_lines'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_deposit_transfer(uuid,uuid,uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_deposit_transfer(uuid,uuid,uuid,uuid,uuid,date) TO authenticated;

-- Source: cashier-direct-deposit-status-draft.sql
CREATE FUNCTION public.irp_pms_pilot_direct_cashier_deposit_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE status jsonb;drawer uuid;voided boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 status:=public.irp_pms_pilot_cashier_account_deposit_status(p_tenant,p_property,p_request);
 IF (status->>'found')::boolean THEN
  SELECT session_id INTO drawer FROM irp_pms.cashier_direct_deposit_sources WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_request;
  IF drawer IS NULL THEN RAISE EXCEPTION 'Request belongs to another deposit workflow';END IF;
  status:=jsonb_set(status,'{result}',status->'result'||jsonb_build_object('source_kind','direct_drawer','session_id',drawer));
  SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_request) INTO voided;
 END IF;
 RETURN status||jsonb_build_object('voided',coalesce(voided,false),'cancelled',EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_direct_cashier_deposit_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_direct_cashier_deposit_status(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_declare_direct_cashier_deposit(uuid,uuid,uuid,uuid,uuid,bigint,text,date,text,boolean) TO authenticated;
COMMIT;
