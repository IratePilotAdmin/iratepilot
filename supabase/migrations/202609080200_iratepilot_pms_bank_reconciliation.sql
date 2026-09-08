BEGIN;
CREATE TABLE irp_pms.cashier_bank_statement_entries(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,account_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN -999999999999 AND 999999999999 AND amount_minor<>0),
 value_date date NOT NULL CHECK(value_date>='1900-01-01'::date AND isfinite(value_date)),
 reference text NOT NULL CHECK(reference=trim(reference) AND length(reference) BETWEEN 2 AND 120 AND reference !~ '[[:cntrl:]]'),
 description text NOT NULL CHECK(description=trim(description) AND length(description) BETWEEN 2 AND 500 AND description !~ '[[:cntrl:]]'),
 actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.cashier_bank_accounts(tenant_id,property_id,id)
);
CREATE UNIQUE INDEX cashier_bank_statement_reference ON irp_pms.cashier_bank_statement_entries(tenant_id,property_id,account_id,lower(reference));
ALTER TABLE irp_pms.cashier_bank_statement_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_statement_entries FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_statement_entries FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_record_cashier_bank_statement(p_tenant uuid,p_property uuid,p_account uuid,p_request uuid,p_amount_minor bigint,p_value_date date,p_reference text,p_description text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_statement_entries;replayed boolean;today date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_account IS NULL OR p_request IS NULL OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN -999999999999 AND 999999999999 OR p_amount_minor=0 OR p_value_date IS NULL OR p_value_date<'1900-01-01'::date OR NOT isfinite(p_value_date) OR p_reference IS NULL OR p_reference<>trim(p_reference) OR length(p_reference) NOT BETWEEN 2 AND 120 OR p_reference~'[[:cntrl:]]' OR p_description IS NULL OR p_description<>trim(p_description) OR length(p_description) NOT BETWEEN 2 AND 500 OR p_description~'[[:cntrl:]]' OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm valid statement entry details';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.account_id IS DISTINCT FROM p_account OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.amount_minor IS DISTINCT FROM p_amount_minor OR saved.value_date IS DISTINCT FROM p_value_date OR saved.reference IS DISTINCT FROM p_reference OR saved.description IS DISTINCT FROM p_description THEN RAISE EXCEPTION 'Statement request has different details';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account) THEN RAISE EXCEPTION 'Bank account not found';END IF;
  SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO today FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
  IF p_value_date>today THEN RAISE EXCEPTION 'Statement date cannot be in the future';END IF;
  INSERT INTO irp_pms.cashier_bank_statement_entries VALUES(p_tenant,p_property,p_request,p_account,p_amount_minor,p_value_date,p_reference,p_description,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_statement_recorded',p_request,jsonb_build_object('account_id',p_account,'amount_minor',p_amount_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'entry_id',saved.id,'account_id',saved.account_id,'amount_minor',saved.amount_minor::text,'value_date',saved.value_date,'reference',saved.reference,'description',saved.description,'created_at',saved.created_at,'replayed',replayed,'source','manual','bank_verified',false,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_record_cashier_bank_statement(uuid,uuid,uuid,uuid,bigint,date,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_record_cashier_bank_statement(uuid,uuid,uuid,uuid,bigint,date,text,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_statement_entries(p_tenant uuid,p_property uuid,p_account uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_account IS NULL THEN RAISE EXCEPTION 'Choose a bank account';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 WITH candidates AS(SELECT * FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND account_id=p_account AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 51),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('amount_minor',p.amount_minor::text,'source','manual','bank_verified',false,'journal_posted',false) ORDER BY id DESC) FROM page p),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'account_id',p_account,'currency','USD','live_view',true,'entries',entries,'next_before',CASE WHEN more THEN entries->49->>'id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_statement_entries(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_statement_entries(uuid,uuid,uuid,uuid) TO authenticated;
CREATE TABLE irp_pms.cashier_bank_statement_voids(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,statement_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,statement_id),UNIQUE(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,statement_id) REFERENCES irp_pms.cashier_bank_statement_entries(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_statement_voids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_statement_voids FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_statement_voids FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TABLE irp_pms.cashier_bank_matches(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,deposit_id uuid NOT NULL,statement_id uuid NOT NULL,account_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),actor_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,deposit_id) REFERENCES irp_pms.cashier_bank_deposits(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,statement_id) REFERENCES irp_pms.cashier_bank_statement_entries(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.cashier_bank_accounts(tenant_id,property_id,id)
);
CREATE INDEX cashier_bank_matches_deposit ON irp_pms.cashier_bank_matches(tenant_id,property_id,deposit_id);
CREATE INDEX cashier_bank_matches_statement ON irp_pms.cashier_bank_matches(tenant_id,property_id,statement_id);
CREATE TABLE irp_pms.cashier_bank_match_reversals(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,match_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,match_id),UNIQUE(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,match_id) REFERENCES irp_pms.cashier_bank_matches(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.cashier_bank_match_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_matches,irp_pms.cashier_bank_match_reversals FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_matches FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_match_reversals FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_match_cashier_bank_deposit(p_tenant uuid,p_property uuid,p_deposit uuid,p_statement uuid,p_request uuid,p_amount_minor bigint,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_matches;deposit irp_pms.cashier_bank_deposits;statement irp_pms.cashier_bank_statement_entries;bank uuid;used numeric;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_deposit IS NULL OR p_statement IS NULL OR p_request IS NULL OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm the match amount and explanation';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_matches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.deposit_id IS DISTINCT FROM p_deposit OR saved.statement_id IS DISTINCT FROM p_statement OR saved.amount_minor IS DISTINCT FROM p_amount_minor OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Match request has different details';END IF;
 ELSE
  SELECT * INTO deposit FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_deposit;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit not found';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_deposit) THEN RAISE EXCEPTION 'Cannot match a voided deposit';END IF;
  SELECT account_id INTO bank FROM irp_pms.cashier_bank_deposit_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_deposit;
  IF bank IS NULL THEN RAISE EXCEPTION 'Assign the deposit bank account first';END IF;
  SELECT * INTO statement FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_statement;
  IF NOT FOUND OR statement.account_id<>bank THEN RAISE EXCEPTION 'Statement must belong to the deposit bank account';END IF;
  IF statement.amount_minor<=0 THEN RAISE EXCEPTION 'Match deposits only to statement credits';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND statement_id=p_statement) THEN RAISE EXCEPTION 'Cannot match a voided statement item';END IF;
  IF statement.value_date<deposit.deposit_date THEN RAISE EXCEPTION 'Statement credit predates the declared deposit';END IF;
  SELECT coalesce(sum(m.amount_minor),0) INTO used FROM irp_pms.cashier_bank_matches m WHERE m.tenant_id=p_tenant AND m.property_id=p_property AND m.deposit_id=p_deposit AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals r WHERE r.tenant_id=m.tenant_id AND r.property_id=m.property_id AND r.match_id=m.id);
  IF used+p_amount_minor>deposit.amount_minor THEN RAISE EXCEPTION 'Match exceeds the remaining deposit amount';END IF;
  SELECT coalesce(sum(m.amount_minor),0) INTO used FROM irp_pms.cashier_bank_matches m WHERE m.tenant_id=p_tenant AND m.property_id=p_property AND m.statement_id=p_statement AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals r WHERE r.tenant_id=m.tenant_id AND r.property_id=m.property_id AND r.match_id=m.id);
  IF used+p_amount_minor>statement.amount_minor THEN RAISE EXCEPTION 'Match exceeds the remaining statement credit';END IF;
  INSERT INTO irp_pms.cashier_bank_matches VALUES(p_tenant,p_property,p_request,p_deposit,p_statement,bank,p_amount_minor,auth.uid(),p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_deposit_matched',p_request,jsonb_build_object('deposit_id',p_deposit,'statement_id',p_statement,'amount_minor',p_amount_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'match_id',saved.id,'deposit_id',saved.deposit_id,'statement_id',saved.statement_id,'account_id',saved.account_id,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed,'source','manual','bank_verified',false,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_match_cashier_bank_deposit(uuid,uuid,uuid,uuid,uuid,bigint,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_match_cashier_bank_deposit(uuid,uuid,uuid,uuid,uuid,bigint,text,boolean) TO authenticated;
CREATE FUNCTION irp_pms.cashier_bank_matched_deposit_void_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_matches m WHERE m.tenant_id=NEW.tenant_id AND m.property_id=NEW.property_id AND m.deposit_id=NEW.deposit_id AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals r WHERE r.tenant_id=m.tenant_id AND r.property_id=m.property_id AND r.match_id=m.id)) THEN RAISE EXCEPTION 'Reverse active statement matches before voiding this deposit';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_bank_matched_deposit_void_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER matched_deposit BEFORE INSERT ON irp_pms.cashier_bank_deposit_voids FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_bank_matched_deposit_void_guard();
CREATE FUNCTION public.irp_pms_pilot_reverse_cashier_bank_match(p_tenant uuid,p_property uuid,p_match uuid,p_request uuid,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_match_reversals;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_match IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm the match reversal and explanation';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_match_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.match_id IS DISTINCT FROM p_match OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Match reversal request has different details';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_matches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_match) THEN RAISE EXCEPTION 'Bank match not found';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND match_id=p_match) THEN RAISE EXCEPTION 'Bank match already reversed';END IF;
  INSERT INTO irp_pms.cashier_bank_match_reversals VALUES(p_tenant,p_property,p_match,p_request,auth.uid(),p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_match_reversed',p_match,jsonb_build_object('request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'request_id',saved.request_id,'match_id',saved.match_id,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed,'reversed',true,'bank_transaction_reversed',false,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_reverse_cashier_bank_match(uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_reverse_cashier_bank_match(uuid,uuid,uuid,uuid,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_reconciliation_status(p_tenant uuid,p_property uuid,p_request uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE void_saved irp_pms.cashier_bank_statement_voids;statement_saved irp_pms.cashier_bank_statement_entries;match_saved irp_pms.cashier_bank_matches;reversal_saved irp_pms.cashier_bank_match_reversals;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN('statement','match','reversal','statement_void') THEN RAISE EXCEPTION 'Choose a valid reconciliation request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_kind='statement' THEN
  SELECT * INTO statement_saved FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
  IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',statement_saved.actor_id,'entry_id',statement_saved.id,'account_id',statement_saved.account_id,'amount_minor',statement_saved.amount_minor::text,'value_date',statement_saved.value_date,'reference',statement_saved.reference,'description',statement_saved.description,'created_at',statement_saved.created_at,'replayed',true,'source','manual','bank_verified',false,'journal_posted',false);END IF;
 ELSIF p_kind='match' THEN
  SELECT * INTO match_saved FROM irp_pms.cashier_bank_matches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
  IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',match_saved.actor_id,'match_id',match_saved.id,'deposit_id',match_saved.deposit_id,'statement_id',match_saved.statement_id,'account_id',match_saved.account_id,'amount_minor',match_saved.amount_minor::text,'reason',match_saved.reason,'created_at',match_saved.created_at,'replayed',true,'source','manual','bank_verified',false,'journal_posted',false);END IF;
 ELSIF p_kind='statement_void' THEN
  SELECT * INTO void_saved FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
  IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',void_saved.actor_id,'request_id',void_saved.request_id,'statement_id',void_saved.statement_id,'reason',void_saved.reason,'created_at',void_saved.created_at,'replayed',true,'voided',true,'bank_transaction_reversed',false,'journal_posted',false);END IF;
 ELSE
  SELECT * INTO reversal_saved FROM irp_pms.cashier_bank_match_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
  IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',reversal_saved.actor_id,'request_id',reversal_saved.request_id,'match_id',reversal_saved.match_id,'reason',reversal_saved.reason,'created_at',reversal_saved.created_at,'replayed',true,'reversed',true,'bank_transaction_reversed',false,'journal_posted',false);END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind',p_kind,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_reconciliation_status(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_reconciliation_status(uuid,uuid,uuid,text) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_match_history(p_tenant uuid,p_property uuid,p_account uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_account IS NULL OR NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 WITH candidates AS(SELECT m.*,r.request_id AS reversal_request_id,r.actor_id AS reversal_actor_id,r.reason AS reversal_reason,r.created_at AS reversed_at FROM irp_pms.cashier_bank_matches m LEFT JOIN irp_pms.cashier_bank_match_reversals r ON r.tenant_id=m.tenant_id AND r.property_id=m.property_id AND r.match_id=m.id WHERE m.tenant_id=p_tenant AND m.property_id=p_property AND m.account_id=p_account AND (p_before IS NULL OR m.id<p_before) ORDER BY m.id DESC LIMIT 51),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('amount_minor',p.amount_minor::text,'status',CASE WHEN p.reversal_request_id IS NULL THEN 'active' ELSE 'reversed' END) ORDER BY p.id DESC) FROM page p),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'account_id',p_account,'entries',entries,'next_before',CASE WHEN more THEN entries->49->>'id' ELSE NULL END,'source','manual','bank_verified',false,'journal_posted',false,'live_view',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_match_history(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_match_history(uuid,uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_reconciliation_summary(p_tenant uuid,p_property uuid,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE deposits numeric;credits numeric;debits numeric;matched numeric;reversed numeric;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_account IS NULL OR NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 SELECT coalesce(sum(d.amount_minor),0) INTO deposits FROM irp_pms.cashier_bank_deposits d JOIN irp_pms.cashier_bank_deposit_accounts a ON a.tenant_id=d.tenant_id AND a.property_id=d.property_id AND a.deposit_id=d.id WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND a.account_id=p_account AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE v.tenant_id=d.tenant_id AND v.property_id=d.property_id AND v.deposit_id=d.id);
 SELECT coalesce(sum(amount_minor) FILTER(WHERE amount_minor>0),0),coalesce(sum(-amount_minor) FILTER(WHERE amount_minor<0),0) INTO credits,debits FROM irp_pms.cashier_bank_statement_entries s WHERE tenant_id=p_tenant AND property_id=p_property AND account_id=p_account AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids v WHERE v.tenant_id=s.tenant_id AND v.property_id=s.property_id AND v.statement_id=s.id);
 SELECT coalesce(sum(m.amount_minor) FILTER(WHERE r.match_id IS NULL),0),coalesce(sum(m.amount_minor) FILTER(WHERE r.match_id IS NOT NULL),0) INTO matched,reversed FROM irp_pms.cashier_bank_matches m LEFT JOIN irp_pms.cashier_bank_match_reversals r ON r.tenant_id=m.tenant_id AND r.property_id=m.property_id AND r.match_id=m.id WHERE m.tenant_id=p_tenant AND m.property_id=p_property AND m.account_id=p_account;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'account_id',p_account,'deposit_minor',deposits::text,'statement_credit_minor',credits::text,'unreviewed_statement_debit_minor',debits::text,'active_matched_minor',matched::text,'reversed_match_minor',reversed::text,'unmatched_deposit_minor',(deposits-matched)::text,'unmatched_statement_credit_minor',(credits-matched)::text,'source','manual','bank_verified',false,'journal_posted',false,'live_view',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_reconciliation_summary(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_reconciliation_summary(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_match_sources(p_tenant uuid,p_property uuid,p_account uuid,p_kind text,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_kind IS NULL OR p_kind NOT IN('deposit','credit') THEN RAISE EXCEPTION 'Choose deposits or statement credits';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_account IS NULL OR NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 WITH sources AS (
 SELECT d.id,d.deposit_date AS date,d.deposit_reference AS reference,d.amount_minor FROM irp_pms.cashier_bank_deposits d JOIN irp_pms.cashier_bank_deposit_accounts a ON a.tenant_id=d.tenant_id AND a.property_id=d.property_id AND a.deposit_id=d.id WHERE p_kind='deposit' AND d.tenant_id=p_tenant AND d.property_id=p_property AND a.account_id=p_account AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE v.tenant_id=d.tenant_id AND v.property_id=d.property_id AND v.deposit_id=d.id)
 UNION ALL SELECT s.id,s.value_date,s.reference,s.amount_minor FROM irp_pms.cashier_bank_statement_entries s WHERE p_kind='credit' AND s.tenant_id=p_tenant AND s.property_id=p_property AND s.account_id=p_account AND s.amount_minor>0 AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids v WHERE v.tenant_id=s.tenant_id AND v.property_id=s.property_id AND v.statement_id=s.id)
 ),available AS(SELECT s.*,s.amount_minor-coalesce((SELECT sum(m.amount_minor) FROM irp_pms.cashier_bank_matches m WHERE m.tenant_id=p_tenant AND m.property_id=p_property AND m.account_id=p_account AND ((p_kind='deposit' AND m.deposit_id=s.id) OR (p_kind='credit' AND m.statement_id=s.id)) AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals r WHERE r.tenant_id=m.tenant_id AND r.property_id=m.property_id AND r.match_id=m.id)),0) AS remaining FROM sources s),candidates AS(SELECT * FROM available WHERE remaining>0 AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 51),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'date',date,'reference',reference,'amount_minor',amount_minor::text,'remaining_minor',remaining::text) ORDER BY id DESC) FROM page),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'account_id',p_account,'kind',p_kind,'entries',entries,'next_before',CASE WHEN more THEN entries->49->>'id' ELSE NULL END,'live_view',true,'bank_verified',false,'journal_posted',false,'source','manual');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_match_sources(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_match_sources(uuid,uuid,uuid,text,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_void_cashier_bank_statement(p_tenant uuid,p_property uuid,p_statement uuid,p_request uuid,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_statement_voids;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_statement IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm the statement correction and explanation';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.statement_id IS DISTINCT FROM p_statement OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Statement correction request has different details';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_statement) THEN RAISE EXCEPTION 'Statement item not found';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND statement_id=p_statement) THEN RAISE EXCEPTION 'Statement item already voided';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_matches m WHERE m.tenant_id=p_tenant AND m.property_id=p_property AND m.statement_id=p_statement AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals r WHERE r.tenant_id=m.tenant_id AND r.property_id=m.property_id AND r.match_id=m.id)) THEN RAISE EXCEPTION 'Reverse active matches before voiding this statement item';END IF;
  INSERT INTO irp_pms.cashier_bank_statement_voids VALUES(p_tenant,p_property,p_statement,p_request,auth.uid(),p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_statement_voided',p_statement,jsonb_build_object('request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'request_id',saved.request_id,'statement_id',saved.statement_id,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed,'voided',true,'bank_transaction_reversed',false,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_void_cashier_bank_statement(uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_void_cashier_bank_statement(uuid,uuid,uuid,uuid,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_cashier_bank_statement_entries(p_tenant uuid,p_property uuid,p_account uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_account IS NULL THEN RAISE EXCEPTION 'Choose a bank account';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 WITH candidates AS(SELECT s.*,v.request_id AS void_request_id,v.actor_id AS void_actor_id,v.reason AS void_reason,v.created_at AS voided_at FROM irp_pms.cashier_bank_statement_entries s LEFT JOIN irp_pms.cashier_bank_statement_voids v ON v.tenant_id=s.tenant_id AND v.property_id=s.property_id AND v.statement_id=s.id WHERE s.tenant_id=p_tenant AND s.property_id=p_property AND s.account_id=p_account AND (p_before IS NULL OR s.id<p_before) ORDER BY s.id DESC LIMIT 51),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('status',CASE WHEN p.void_request_id IS NULL THEN 'recorded' ELSE 'voided' END,'amount_minor',p.amount_minor::text,'source','manual','bank_verified',false,'journal_posted',false) ORDER BY id DESC) FROM page p),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'account_id',p_account,'currency','USD','live_view',true,'entries',entries,'next_before',CASE WHEN more THEN entries->49->>'id' ELSE NULL END);
END $$;
COMMIT;
