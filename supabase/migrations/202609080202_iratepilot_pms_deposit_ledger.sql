BEGIN;
CREATE FUNCTION public.irp_pms_pilot_cashier_ledger_source_review(p_tenant uuid,p_property uuid,p_session uuid) RETURNS jsonb
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
 UNION ALL SELECT 'custody',l.movement_id,l.journal_id FROM irp_pms.cashier_custody_ledger_links l JOIN irp_pms.cashier_custody_events e ON e.tenant_id=l.tenant_id AND e.property_id=l.property_id AND e.id=l.movement_id WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.session_id=p_session)
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'source_id',x.source_id,'journal_id',x.journal_id) ORDER BY x.kind,x.source_id,x.journal_id),'[]'::jsonb) INTO source_journals FROM sources x WHERE NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.reversal_of=x.journal_id);
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'actor_id',auth.uid(),'source_journals',source_journals,'opening_minor',s.opening_minor::text,'guest_receipts_minor',incoming::text,'guest_refunds_minor',outgoing::text,'guest_payment_count',payments,'unposted_guest_payment_count',unposted,'custody_movement_count',custody,'custody_in_minor',custody_in::text,'custody_out_minor',custody_out::text,'expected_cash_minor',(s.opening_minor+incoming-outgoing+custody_in-custody_out)::text,'opening_source_linked',opening_linked,'custody_posting_supported',false,'unlinked_custody_movement_count',unlinked_custody,'transfer_posting_ready',false,'live_view',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_ledger_source_review(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_ledger_source_review(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION irp_pms.gl_cash_transfer_lines(p_tenant uuid,p_property uuid,p_from uuid,p_to uuid,p_amount bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_tenant IS NULL OR p_property IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from=p_to OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 999999999999 THEN RAISE EXCEPTION 'Choose distinct cash accounts and a positive transfer amount';END IF;
 IF (SELECT count(*) FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id IN(p_from,p_to) AND active AND kind='asset')<>2 THEN RAISE EXCEPTION 'Cash transfer accounts must be active assets in this property';END IF;
 RETURN jsonb_build_array(jsonb_build_object('account_id',p_to,'side','debit','amount_minor',p_amount::text),jsonb_build_object('account_id',p_from,'side','credit','amount_minor',p_amount::text));
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_cash_transfer_lines(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE irp_pms.cashier_bank_ledger_mappings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,bank_id uuid NOT NULL,custody_account uuid NOT NULL,transit_account uuid NOT NULL,bank_account uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,id),
 CHECK(custody_account<>transit_account AND custody_account<>bank_account AND transit_account<>bank_account),
 FOREIGN KEY(tenant_id,property_id,bank_id) REFERENCES irp_pms.cashier_bank_accounts(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,custody_account) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,transit_account) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,bank_account) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_ledger_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_ledger_mappings FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_ledger_mappings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_configure_cashier_bank_ledger(p_tenant uuid,p_property uuid,p_request uuid,p_bank uuid,p_custody uuid,p_transit uuid,p_bank_account uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_ledger_mappings;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_bank IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm the bank ledger mapping';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_ledger_mappings WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.bank_id IS DISTINCT FROM p_bank OR saved.custody_account IS DISTINCT FROM p_custody OR saved.transit_account IS DISTINCT FROM p_transit OR saved.bank_account IS DISTINCT FROM p_bank_account OR saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Bank mapping request has different details';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_bank) THEN RAISE EXCEPTION 'Bank account not found';END IF;
  PERFORM irp_pms.gl_cash_transfer_lines(p_tenant,p_property,p_custody,p_transit,1);
  PERFORM irp_pms.gl_cash_transfer_lines(p_tenant,p_property,p_transit,p_bank_account,1);
  IF p_custody=p_bank_account THEN RAISE EXCEPTION 'Choose three distinct asset accounts';END IF;
  INSERT INTO irp_pms.cashier_bank_ledger_mappings VALUES(p_tenant,p_property,p_request,p_bank,p_custody,p_transit,p_bank_account,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_ledger_configured',p_request,jsonb_build_object('bank_id',p_bank));
 END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'replayed',replayed,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_configure_cashier_bank_ledger(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_configure_cashier_bank_ledger(uuid,uuid,uuid,uuid,uuid,uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_review_cashier_bank_ledger(p_tenant uuid,p_property uuid,p_session uuid,p_mapping uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mapping irp_pms.cashier_bank_ledger_mappings;review jsonb;mismatched bigint;custody_mismatch bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO mapping FROM irp_pms.cashier_bank_ledger_mappings WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_mapping;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank ledger mapping not found';END IF;
 PERFORM irp_pms.gl_cash_transfer_lines(p_tenant,p_property,mapping.custody_account,mapping.transit_account,1);
 PERFORM irp_pms.gl_cash_transfer_lines(p_tenant,p_property,mapping.transit_account,mapping.bank_account,1);
 review:=public.irp_pms_pilot_cashier_ledger_source_review(p_tenant,p_property,p_session);
 SELECT count(*) INTO mismatched FROM irp_pms.cashier_guest_payments c JOIN irp_pms.gl_payment_postings p ON p.tenant_id=c.tenant_id AND p.property_id=c.property_id AND p.reservation_id=c.reservation_id AND p.entry_id=c.entry_id WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.session_id=p_session AND (p.review->>'clearing_account_id') IS DISTINCT FROM mapping.custody_account::text;
 SELECT count(*) INTO custody_mismatch FROM irp_pms.cashier_custody_events e JOIN irp_pms.cashier_custody_ledger_links l ON l.tenant_id=e.tenant_id AND l.property_id=e.property_id AND l.movement_id=e.id WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.session_id=p_session AND l.account_id<>mapping.custody_account AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id);
 RETURN review||jsonb_build_object('mapping_id',p_mapping,'bank_id',mapping.bank_id,'custody_account',mapping.custody_account,'transit_account',mapping.transit_account,'bank_account',mapping.bank_account,'mismatched_payment_account_count',mismatched,'mismatched_custody_account_count',custody_mismatch,'opening_account_matches',CASE WHEN (review->>'opening_minor')::bigint=0 THEN true ELSE EXISTS(SELECT 1 FROM irp_pms.cashier_opening_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.session_id=p_session AND l.account_id=mapping.custody_account AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id)) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_cashier_bank_ledger(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_cashier_bank_ledger(uuid,uuid,uuid,uuid) TO authenticated;
CREATE TABLE irp_pms.cashier_opening_ledger_links(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,request_id uuid NOT NULL,journal_id uuid NOT NULL,account_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,journal_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_opening_ledger_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_opening_ledger_links FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_opening_ledger_links FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_link_cashier_opening_journal(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_journal uuid,p_account uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_opening_ledger_links;s irp_pms.cashier_sessions;j irp_pms.gl_journals;net numeric;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_session IS NULL OR p_journal IS NULL OR p_account IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm the opening cash journal link';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_opening_ledger_links WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.session_id IS DISTINCT FROM p_session OR saved.journal_id IS DISTINCT FROM p_journal OR saved.account_id IS DISTINCT FROM p_account OR saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Opening link request has different details';END IF;
 ELSE
  SELECT * INTO s FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session;
  IF NOT FOUND OR s.opening_minor<=0 THEN RAISE EXCEPTION 'Choose a session with positive opening cash';END IF;
  SELECT * INTO j FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_journal;
  IF NOT FOUND OR j.source_kind<>'manual_journal' OR j.posting_date>s.business_date THEN RAISE EXCEPTION 'Choose a dedicated opening journal posted by the drawer business date';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=p_journal) THEN RAISE EXCEPTION 'Opening journal was reversed';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account AND active AND kind='asset') THEN RAISE EXCEPTION 'Choose an active cash asset account';END IF;
  SELECT coalesce(sum(CASE WHEN side='debit' THEN amount_minor ELSE -amount_minor END),0) INTO net FROM irp_pms.gl_lines WHERE tenant_id=p_tenant AND property_id=p_property AND journal_id=p_journal AND account_id=p_account;
  IF net<>s.opening_minor THEN RAISE EXCEPTION 'Journal cash amount must equal opening drawer cash';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_opening_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.session_id=p_session AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id)) THEN RAISE EXCEPTION 'Session already has an active opening journal link';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_custody_ledger_links WHERE tenant_id=p_tenant AND property_id=p_property AND journal_id=p_journal) THEN RAISE EXCEPTION 'Journal already assigned to a custody movement';END IF;
  INSERT INTO irp_pms.cashier_opening_ledger_links VALUES(p_tenant,p_property,p_session,p_request,p_journal,p_account,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
 END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'replayed',replayed,'new_journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_link_cashier_opening_journal(uuid,uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_link_cashier_opening_journal(uuid,uuid,uuid,uuid,uuid,uuid,boolean) TO authenticated;
CREATE TABLE irp_pms.cashier_custody_ledger_links(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,movement_id uuid NOT NULL,request_id uuid NOT NULL,journal_id uuid NOT NULL,account_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,journal_id),
 FOREIGN KEY(tenant_id,property_id,movement_id) REFERENCES irp_pms.cashier_custody_events(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_custody_ledger_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_custody_ledger_links FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_custody_ledger_links FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_link_cashier_custody_journal(p_tenant uuid,p_property uuid,p_movement uuid,p_request uuid,p_journal uuid,p_account uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_custody_ledger_links;s irp_pms.cashier_custody_events;j irp_pms.gl_journals;net numeric;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_movement IS NULL OR p_journal IS NULL OR p_account IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm the custody cash journal link';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_custody_ledger_links WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.movement_id IS DISTINCT FROM p_movement OR saved.journal_id IS DISTINCT FROM p_journal OR saved.account_id IS DISTINCT FROM p_account OR saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Custody link request has different details';END IF;
 ELSE
  SELECT * INTO s FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_movement;
  IF NOT FOUND OR s.amount_minor<=0 THEN RAISE EXCEPTION 'Choose a session with positive custody cash';END IF;
  SELECT * INTO j FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_journal;
  IF NOT FOUND OR j.source_kind<>'manual_journal' OR j.posting_date>(SELECT business_date FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=s.session_id) THEN RAISE EXCEPTION 'Choose a dedicated custody journal posted by the drawer business date';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=p_journal) THEN RAISE EXCEPTION 'Custody journal was reversed';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account AND active AND kind='asset') THEN RAISE EXCEPTION 'Choose an active cash asset account';END IF;
  SELECT coalesce(sum(CASE WHEN side='debit' THEN amount_minor ELSE -amount_minor END),0) INTO net FROM irp_pms.gl_lines WHERE tenant_id=p_tenant AND property_id=p_property AND journal_id=p_journal AND account_id=p_account;
  IF net<>(CASE WHEN s.kind='cash_in' THEN s.amount_minor ELSE -s.amount_minor END) THEN RAISE EXCEPTION 'Journal cash amount must equal custody drawer cash';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_custody_ledger_links l WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.movement_id=p_movement AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=l.tenant_id AND r.property_id=l.property_id AND r.reversal_of=l.journal_id)) THEN RAISE EXCEPTION 'Session already has an active custody journal link';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_opening_ledger_links WHERE tenant_id=p_tenant AND property_id=p_property AND journal_id=p_journal) THEN RAISE EXCEPTION 'Journal already assigned to opening cash';END IF;
  INSERT INTO irp_pms.cashier_custody_ledger_links VALUES(p_tenant,p_property,p_movement,p_request,p_journal,p_account,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
 END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'replayed',replayed,'new_journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_link_cashier_custody_journal(uuid,uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_link_cashier_custody_journal(uuid,uuid,uuid,uuid,uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_review_deposit_ledger_sources(p_tenant uuid,p_property uuid,p_deposit uuid,p_mapping uuid) RETURNS jsonb
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
  IF (item.review->>'variance_minor')::numeric IS DISTINCT FROM 0 THEN blockers:=blockers||jsonb_build_array('Drawer variance requires accounting resolution');END IF;
 END LOOP;
 IF jsonb_array_length(reviews)=0 THEN blockers:=blockers||jsonb_build_array('Deposit has no reviewed drawer sources');END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'deposit_id',p_deposit,'mapping_id',p_mapping,'amount_minor',d.amount_minor::text,'source_reviews',reviews,'blockers',blockers,'sources_reconciled',jsonb_array_length(blockers)=0,'proposed_lines',irp_pms.gl_cash_transfer_lines(p_tenant,p_property,m.custody_account,m.transit_account,d.amount_minor),'journal_posted',false,'transfer_posting_ready',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_deposit_ledger_sources(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_deposit_ledger_sources(uuid,uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_preview_deposit_transfer(p_tenant uuid,p_property uuid,p_deposit uuid,p_mapping uuid,p_period uuid,p_date date) RETURNS jsonb
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
 WITH sessions AS(SELECT DISTINCT h.session_id FROM irp_pms.cashier_bank_deposit_allocations a JOIN irp_pms.cashier_handoffs h ON h.tenant_id=a.tenant_id AND h.property_id=a.property_id AND h.id=a.handoff_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.deposit_id=p_deposit),journals AS(
 SELECT p.journal_id FROM irp_pms.cashier_guest_payments c JOIN sessions s ON s.session_id=c.session_id JOIN irp_pms.gl_payment_postings p ON p.tenant_id=c.tenant_id AND p.property_id=c.property_id AND p.entry_id=c.entry_id AND p.reservation_id=c.reservation_id WHERE c.tenant_id=p_tenant AND c.property_id=p_property
 UNION SELECT l.journal_id FROM irp_pms.cashier_opening_ledger_links l JOIN sessions s ON s.session_id=l.session_id WHERE l.tenant_id=p_tenant AND l.property_id=p_property
 UNION SELECT l.journal_id FROM irp_pms.cashier_custody_ledger_links l JOIN irp_pms.cashier_custody_events e ON e.tenant_id=l.tenant_id AND e.property_id=l.property_id AND e.id=l.movement_id JOIN sessions s ON s.session_id=e.session_id WHERE l.tenant_id=p_tenant AND l.property_id=p_property)
 SELECT max(j.posting_date) INTO latest_source FROM irp_pms.gl_journals j JOIN journals x ON x.journal_id=j.id WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=j.tenant_id AND r.property_id=j.property_id AND r.reversal_of=j.id);
 IF p_date<deposit_date OR p_date<latest_source THEN RAISE EXCEPTION 'Transfer date cannot precede the deposit or its source journals';END IF;
 RETURN review||jsonb_build_object('period_id',p_period,'posting_date',p_date,'latest_source_posting_date',latest_source,'command',jsonb_build_object('currency','USD','description','Cash deposit to bank transit','period_id',p_period,'posting_date',p_date,'source_kind','cashier_bank_deposit','source_id',p_deposit,'source_version',1,'lines',review->'proposed_lines'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_deposit_transfer(uuid,uuid,uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_deposit_transfer(uuid,uuid,uuid,uuid,uuid,date) TO authenticated;
CREATE TABLE irp_pms.cashier_deposit_ledger_postings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),deposit_id uuid NOT NULL,journal_id uuid NOT NULL,review jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,deposit_id),UNIQUE(tenant_id,property_id,journal_id),
 FOREIGN KEY(tenant_id,property_id,deposit_id) REFERENCES irp_pms.cashier_bank_deposits(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_deposit_ledger_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_deposit_ledger_postings FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_deposit_ledger_postings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_post_deposit_transfer(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_deposit_ledger_postings;fresh jsonb;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR octet_length(p_review::text)>1048576 THEN RAISE EXCEPTION 'Deposit review, request and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_deposit_transfer_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Deposit transfer request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_deposit_ledger_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Deposit posting request already used with different details';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Deposit review belongs to another scope';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_deposit_ledger_postings WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=(p_review->>'deposit_id')::uuid) THEN RAISE EXCEPTION 'Deposit already posted; correct through reversal and a replacement deposit';END IF;
 fresh:=public.irp_pms_pilot_preview_deposit_transfer(p_tenant,p_property,(p_review->>'deposit_id')::uuid,(p_review->>'mapping_id')::uuid,(p_review->>'period_id')::uuid,(p_review->>'posting_date')::date);
 IF fresh IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Deposit review changed; review again before posting';END IF;
 result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),fresh->'command')||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'deposit_id',fresh->'deposit_id','amount_minor',fresh->'amount_minor','journal_posted',true,'verifies_settlement',false);
 INSERT INTO irp_pms.cashier_deposit_ledger_postings VALUES(p_tenant,p_property,p_request,auth.uid(),(fresh->>'deposit_id')::uuid,(result->>'journal_id')::uuid,fresh,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'deposit_transfer_posted',p_request,jsonb_build_object('deposit_id',fresh->'deposit_id','journal_id',result->'journal_id'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_deposit_transfer(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_deposit_transfer(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION irp_pms.cashier_deposit_ledger_correction_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF TG_TABLE_NAME='cashier_bank_deposit_voids' THEN
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_deposit_ledger_postings p WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND p.deposit_id=NEW.deposit_id AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.property_id AND r.reversal_of=p.journal_id)) THEN RAISE EXCEPTION 'Reverse the deposit transfer journal before voiding its deposit';END IF;
 ELSIF NEW.source_kind='journal_reversal' THEN
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_deposit_ledger_postings p CROSS JOIN LATERAL jsonb_array_elements(p.review->'source_reviews') s CROSS JOIN LATERAL jsonb_array_elements(s->'source_journals') j WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND j->>'journal_id'=NEW.source_id::text AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.property_id AND r.reversal_of=p.journal_id)) THEN RAISE EXCEPTION 'Reverse dependent deposit transfers before reversing their source journal';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_deposit_ledger_correction_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_deposit_ledger_void_guard BEFORE INSERT ON irp_pms.cashier_bank_deposit_voids FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_deposit_ledger_correction_guard();
CREATE TRIGGER cashier_deposit_ledger_source_guard BEFORE INSERT ON irp_pms.gl_journals FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_deposit_ledger_correction_guard();
CREATE TABLE irp_pms.cashier_deposit_transfer_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_deposit_transfer_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_deposit_transfer_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_deposit_transfer_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_cancel_deposit_transfer(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_deposit_transfer_cancellations;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unposted transfer';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_deposit_ledger_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Transfer already posted; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_deposit_transfer_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_deposit_transfer_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'deposit_transfer_cancelled',p_request,'{}');
 END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'cancelled',true,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_deposit_transfer(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_deposit_transfer(uuid,uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_deposit_transfer_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_deposit_ledger_postings;c irp_pms.cashier_deposit_transfer_cancellations;reversed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_deposit_ledger_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT * INTO c FROM irp_pms.cashier_deposit_transfer_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=saved.journal_id) INTO reversed;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',saved.request_id IS NOT NULL,'cancelled',c.request_id IS NOT NULL,'journal_reversed',reversed,'review',saved.review,'result',CASE WHEN saved.request_id IS NOT NULL THEN saved.result||jsonb_build_object('replayed',true) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_deposit_transfer_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_deposit_transfer_status(uuid,uuid,uuid) TO authenticated;
COMMIT;
