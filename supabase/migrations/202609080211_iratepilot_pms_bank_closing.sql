BEGIN;
-- Bank closing, correction history and recoverable manager requests.

-- cashier-bank-opening-review-draft.sql
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_review_bank_close(p_tenant uuid,p_property uuid,p_bank uuid,p_start date,p_end date,p_opening bigint,p_closing bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record;r jsonb;credits numeric:=0;debits numeric:=0;unposted numeric:=0;entries bigint:=0;exceptions jsonb:='[]';sources jsonb:='[]';expected numeric;ledger jsonb;ledger_closing numeric;ledger_opening numeric;
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
 SELECT coalesce(sum((a->>'closing_debit_minor')::numeric-(a->>'closing_credit_minor')::numeric),0),coalesce(sum((a->>'opening_debit_minor')::numeric-(a->>'opening_credit_minor')::numeric),0) INTO ledger_closing,ledger_opening FROM jsonb_array_elements(ledger->'accounts') a;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'bank_id',p_bank,'start_date',p_start,'end_date_exclusive',p_end,'opening_minor',p_opening::text,'closing_minor',p_closing::text,'expected_closing_minor',expected::text,'difference_minor',(p_closing-expected)::text,'credits_minor',credits::text,'debits_minor',debits::text,'entry_count',entries,'unposted_minor',unposted::text,'exceptions',exceptions,'source_entries',sources,'statement_balances',p_closing=expected,'all_entries_posted',unposted=0,'ledger_review',ledger,'ledger_opening_minor',ledger_opening::text,'opening_ledger_difference_minor',(p_opening-ledger_opening)::text,'ledger_opening_matches',jsonb_array_length(ledger->'accounts')>0 AND NOT (ledger->>'shared_with_other_banks')::boolean AND ledger_opening=p_opening,'ledger_closing_minor',ledger_closing::text,'statement_ledger_difference_minor',(p_closing-ledger_closing)::text,'ledger_configuration_present',jsonb_array_length(ledger->'accounts')>0,'ledger_balance_matches',jsonb_array_length(ledger->'accounts')>0 AND NOT (ledger->>'shared_with_other_banks')::boolean AND ledger_closing=p_closing,'close_supported',false,'bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_bank_close(uuid,uuid,uuid,date,date,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_bank_close(uuid,uuid,uuid,date,date,bigint,bigint) TO authenticated;

-- cashier-bank-close-record-draft.sql
CREATE TABLE irp_pms.cashier_bank_closes(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,bank_id uuid NOT NULL,start_date date NOT NULL,end_date date NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),review jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,bank_id) REFERENCES irp_pms.cashier_bank_accounts(tenant_id,property_id,id),CHECK(isfinite(start_date) AND isfinite(end_date) AND start_date<end_date)
);
CREATE TABLE irp_pms.cashier_bank_close_reopenings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,close_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,close_id),UNIQUE(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,close_id) REFERENCES irp_pms.cashier_bank_closes(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.cashier_bank_close_reopenings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_closes,irp_pms.cashier_bank_close_reopenings FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_closes FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_close_reopenings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_record_bank_close(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_closes;fresh jsonb;previous irp_pms.cashier_bank_closes;bank uuid;starts date;ends date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR jsonb_typeof(p_review) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Confirm the reviewed bank close';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind='close') THEN RAISE EXCEPTION 'Bank request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_closes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Bank close request has different details';END IF;RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'replayed',true,'bank_verified',false);END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Bank review belongs to a different scope';END IF;
 bank:=(p_review->>'bank_id')::uuid;starts:=(p_review->>'start_date')::date;ends:=(p_review->>'end_date_exclusive')::date;
 fresh:=public.irp_pms_pilot_review_bank_close(p_tenant,p_property,bank,starts,ends,(p_review->>'opening_minor')::bigint,(p_review->>'closing_minor')::bigint);
 IF fresh IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Bank review changed; review again';END IF;
 IF (fresh->>'statement_balances')::boolean IS DISTINCT FROM true OR (fresh->>'all_entries_posted')::boolean IS DISTINCT FROM true OR (fresh->>'ledger_balance_matches')::boolean IS DISTINCT FROM true OR (fresh->>'ledger_opening_matches')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Resolve statement, opening and ledger differences before closing';END IF;
 SELECT c.* INTO previous FROM irp_pms.cashier_bank_closes c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.bank_id=bank AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings r WHERE (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id)) ORDER BY c.end_date DESC LIMIT 1;
 IF FOUND AND (starts<>previous.end_date OR fresh->>'opening_minor' IS DISTINCT FROM previous.review->>'closing_minor') THEN RAISE EXCEPTION 'Continue from the previous bank close date and balance';END IF;
 INSERT INTO irp_pms.cashier_bank_closes VALUES(p_tenant,p_property,p_request,bank,starts,ends,auth.uid(),fresh,clock_timestamp()) RETURNING * INTO saved;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'replayed',false,'bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_record_bank_close(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Execution grants follow installation of protection and recovery functions.

-- cashier-bank-close-protection-draft.sql
CREATE FUNCTION irp_pms.guard_bank_closed_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE posted date;
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 SELECT posting_date INTO STRICT posted FROM irp_pms.gl_journals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.journal_id;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_closes c JOIN irp_pms.cashier_bank_ledger_mappings m ON m.tenant_id=c.tenant_id AND m.property_id=c.property_id AND m.bank_id=c.bank_id WHERE c.tenant_id=NEW.tenant_id AND c.property_id=NEW.property_id AND m.bank_account=NEW.account_id AND posted<c.end_date AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings r WHERE (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id))) THEN RAISE EXCEPTION 'Reopen the bank close before changing its ledger';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.guard_bank_closed_ledger() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bank_close_guard BEFORE INSERT ON irp_pms.gl_lines FOR EACH ROW EXECUTE FUNCTION irp_pms.guard_bank_closed_ledger();
CREATE FUNCTION irp_pms.guard_bank_closed_statement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE bank uuid;effective_date date;
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF TG_TABLE_NAME='cashier_bank_statement_entries' THEN bank:=NEW.account_id;effective_date:=NEW.value_date;
 ELSE SELECT account_id,value_date INTO STRICT bank,effective_date FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.statement_id;END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_closes c WHERE c.tenant_id=NEW.tenant_id AND c.property_id=NEW.property_id AND c.bank_id=bank AND effective_date>=c.start_date AND effective_date<c.end_date AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings r WHERE (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id))) THEN RAISE EXCEPTION 'Reopen the bank close before changing its statement';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.guard_bank_closed_statement() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bank_close_guard BEFORE INSERT ON irp_pms.cashier_bank_statement_entries FOR EACH ROW EXECUTE FUNCTION irp_pms.guard_bank_closed_statement();
CREATE TRIGGER bank_close_guard BEFORE INSERT ON irp_pms.cashier_bank_statement_voids FOR EACH ROW EXECUTE FUNCTION irp_pms.guard_bank_closed_statement();
CREATE FUNCTION irp_pms.guard_bank_closed_setup() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE protected boolean;
BEGIN
 IF TG_TABLE_NAME='cashier_bank_ledger_mappings' THEN
  PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
  SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_closes c WHERE c.tenant_id=NEW.tenant_id AND c.property_id=NEW.property_id AND (c.bank_id=NEW.bank_id OR EXISTS(SELECT 1 FROM irp_pms.cashier_bank_ledger_mappings m WHERE m.tenant_id=c.tenant_id AND m.property_id=c.property_id AND m.bank_id=c.bank_id AND m.bank_account=NEW.bank_account)) AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings r WHERE (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id))) INTO protected;
 ELSE
  PERFORM 1 FROM irp_pms.properties WHERE tenant_id=OLD.tenant_id AND id=OLD.property_id FOR UPDATE;
  SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_closes c JOIN irp_pms.cashier_bank_ledger_mappings m ON m.tenant_id=c.tenant_id AND m.property_id=c.property_id AND m.bank_id=c.bank_id WHERE c.tenant_id=OLD.tenant_id AND c.property_id=OLD.property_id AND m.bank_account=OLD.id AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings r WHERE (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id))) INTO protected;
 END IF;
 IF protected THEN RAISE EXCEPTION 'Reopen the bank close before changing its account configuration';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.guard_bank_closed_setup() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bank_close_guard BEFORE INSERT ON irp_pms.cashier_bank_ledger_mappings FOR EACH ROW EXECUTE FUNCTION irp_pms.guard_bank_closed_setup();
CREATE TRIGGER bank_close_guard BEFORE UPDATE OR DELETE ON irp_pms.gl_accounts FOR EACH ROW EXECUTE FUNCTION irp_pms.guard_bank_closed_setup();

-- cashier-bank-reopen-draft.sql
CREATE FUNCTION public.irp_pms_pilot_reopen_bank_close(p_tenant uuid,p_property uuid,p_close uuid,p_request uuid,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_close_reopenings;closed irp_pms.cashier_bank_closes;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_close IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm a reason for reopening this bank close';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind='reopen') THEN RAISE EXCEPTION 'Bank request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_close_reopenings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF saved.close_id IS DISTINCT FROM p_close OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Reopening request has different details';END IF;RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'replayed',true);END IF;
 SELECT * INTO closed FROM irp_pms.cashier_bank_closes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_close;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank close not found';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings WHERE tenant_id=p_tenant AND property_id=p_property AND close_id=p_close) THEN RAISE EXCEPTION 'Bank close was already reopened';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_closes c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.bank_id=closed.bank_id AND c.end_date>closed.end_date AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings r WHERE (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id))) THEN RAISE EXCEPTION 'Reopen later bank closes first';END IF;
 INSERT INTO irp_pms.cashier_bank_close_reopenings VALUES(p_tenant,p_property,p_close,p_request,auth.uid(),p_reason,clock_timestamp()) RETURNING * INTO saved;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_reopen_bank_close(uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Execution grants follow installation of protection and recovery functions.

-- cashier-bank-close-cancel-draft.sql
CREATE TABLE irp_pms.cashier_bank_close_cancellations(tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('close','reopen')),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id,kind),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id));
ALTER TABLE irp_pms.cashier_bank_close_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_close_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_close_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_cancel_bank_close_request(p_tenant uuid,p_property uuid,p_request uuid,p_kind text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_close_cancellations;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN('close','reopen') OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of this bank request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_kind='close' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_closes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) OR p_kind='reopen' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Request already recorded; check its status';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_close_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind=p_kind;
 IF FOUND AND saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Request belongs to another actor';END IF;
 IF NOT FOUND THEN INSERT INTO irp_pms.cashier_bank_close_cancellations VALUES(p_tenant,p_property,p_request,p_kind,auth.uid(),clock_timestamp());END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind',p_kind,'cancelled',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_bank_close_request(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_bank_close_request(uuid,uuid,uuid,text,boolean) TO authenticated;

-- cashier-bank-close-status-draft.sql
CREATE FUNCTION public.irp_pms_pilot_bank_close_request_status(p_tenant uuid,p_property uuid,p_request uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt jsonb;reopened boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN('close','reopen') THEN RAISE EXCEPTION 'Choose a bank close or reopening request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_kind='close' THEN
  SELECT to_jsonb(c)||jsonb_build_object('schema_version',1,'replayed',true,'bank_verified',false),EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_reopenings r WHERE (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id)) INTO receipt,reopened FROM irp_pms.cashier_bank_closes c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.id=p_request AND c.actor_id=auth.uid();
 ELSE SELECT to_jsonb(r)||jsonb_build_object('schema_version',1,'replayed',true) INTO receipt FROM irp_pms.cashier_bank_close_reopenings r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.request_id=p_request AND r.actor_id=auth.uid();END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind',p_kind,'cancelled',EXISTS(SELECT 1 FROM irp_pms.cashier_bank_close_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind=p_kind AND actor_id=auth.uid()),'found',receipt IS NOT NULL,'result',receipt,'close_reopened',coalesce(reopened,false));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_bank_close_request_status(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bank_close_request_status(uuid,uuid,uuid,text) TO authenticated;

-- cashier-bank-close-history-draft.sql
CREATE FUNCTION public.irp_pms_pilot_bank_close_history(p_tenant uuid,p_property uuid,p_bank uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE items jsonb;more boolean;cursor_id uuid;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_bank) THEN RAISE EXCEPTION 'Choose a bank account for this property';END IF;
 WITH page AS (
  SELECT c.*,to_jsonb(r) AS reopening FROM irp_pms.cashier_bank_closes c
  LEFT JOIN irp_pms.cashier_bank_close_reopenings r ON (r.tenant_id,r.property_id,r.close_id)=(c.tenant_id,c.property_id,c.id)
  WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.bank_id=p_bank AND (p_before IS NULL OR c.id<p_before)
  ORDER BY c.id DESC LIMIT 51
 ), visible AS (SELECT * FROM page ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id DESC) FROM visible v),'[]'::jsonb),
 (SELECT count(*)>50 FROM page),(SELECT id FROM visible ORDER BY id LIMIT 1)
 INTO items,more,cursor_id;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'bank_id',p_bank,'entries',items,'has_more',more,'next_cursor',CASE WHEN more THEN cursor_id ELSE NULL END,'bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_bank_close_history(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bank_close_history(uuid,uuid,uuid,uuid) TO authenticated;

CREATE INDEX cashier_bank_close_history_lookup ON irp_pms.cashier_bank_closes(tenant_id,property_id,bank_id,id DESC);

GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_record_bank_close(uuid,uuid,uuid,jsonb,boolean),public.irp_pms_pilot_reopen_bank_close(uuid,uuid,uuid,uuid,text,boolean) TO authenticated;

COMMIT;
