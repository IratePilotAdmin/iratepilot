BEGIN;
CREATE FUNCTION public.irp_pms_pilot_preview_bank_debit(p_tenant uuid,p_property uuid,p_statement uuid,p_mapping uuid,p_expense uuid,p_period uuid,p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s irp_pms.cashier_bank_statement_entries;m irp_pms.cashier_bank_ledger_mappings;p irp_pms.gl_periods;lines jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO s FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_statement;
 IF NOT FOUND OR s.amount_minor>=0 THEN RAISE EXCEPTION 'Choose a bank debit statement entry';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND statement_id=p_statement) THEN RAISE EXCEPTION 'Statement entry was voided';END IF;
 SELECT * INTO m FROM irp_pms.cashier_bank_ledger_mappings WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_mapping;
 IF NOT FOUND OR m.bank_id<>s.account_id THEN RAISE EXCEPTION 'Choose the statement bank ledger mapping';END IF;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=m.bank_account AND active AND kind='asset') OR NOT EXISTS(SELECT 1 FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_expense AND active AND kind='expense') THEN RAISE EXCEPTION 'Choose active bank and expense accounts';END IF;
 SELECT * INTO p FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF NOT FOUND OR p.closed OR p_date IS NULL OR NOT isfinite(p_date) OR p_date<p.starts_on OR p_date>=p.ends_before OR p_date<s.value_date THEN RAISE EXCEPTION 'Choose an open-period date on or after the bank debit';END IF;
 lines:=jsonb_build_array(jsonb_build_object('account_id',p_expense,'side','debit','amount_minor',(-s.amount_minor)::text),jsonb_build_object('account_id',m.bank_account,'side','credit','amount_minor',(-s.amount_minor)::text));
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'statement_id',s.id,'mapping_id',m.id,'expense_account_id',p_expense,'amount_minor',(-s.amount_minor)::text,'statement_value_date',s.value_date,'period_id',p_period,'posting_date',p_date,'bank_verified',false,'journal_posted',false,'command',jsonb_build_object('currency','USD','description','Bank debit expense','period_id',p_period,'posting_date',p_date,'source_kind','cashier_bank_debit','source_id',s.id,'source_version',1,'lines',lines));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_bank_debit(uuid,uuid,uuid,uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_bank_debit(uuid,uuid,uuid,uuid,uuid,uuid,date) TO authenticated;
CREATE TABLE irp_pms.cashier_bank_debit_postings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),statement_id uuid NOT NULL,journal_id uuid NOT NULL,review jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,statement_id),UNIQUE(tenant_id,property_id,journal_id),
 FOREIGN KEY(tenant_id,property_id,statement_id) REFERENCES irp_pms.cashier_bank_statement_entries(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_debit_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_debit_postings FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_debit_postings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_post_bank_debit(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_debit_postings;fresh jsonb;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR octet_length(p_review::text)>1048576 THEN RAISE EXCEPTION 'Bank debit review, request and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_debit_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Bank debit transfer request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_debit_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Bank debit posting request already used with different details';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Bank debit review belongs to another scope';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_debit_postings WHERE tenant_id=p_tenant AND property_id=p_property AND statement_id=(p_review->>'statement_id')::uuid) THEN RAISE EXCEPTION 'Bank debit already posted; correct through reversal and a replacement statement entry';END IF;
 fresh:=public.irp_pms_pilot_preview_bank_debit(p_tenant,p_property,(p_review->>'statement_id')::uuid,(p_review->>'mapping_id')::uuid,(p_review->>'expense_account_id')::uuid,(p_review->>'period_id')::uuid,(p_review->>'posting_date')::date);
 IF fresh IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Bank debit review changed; review again before posting';END IF;
 result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),fresh->'command')||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'statement_id',fresh->'statement_id','amount_minor',fresh->'amount_minor','journal_posted',true,'verifies_settlement',false);
 INSERT INTO irp_pms.cashier_bank_debit_postings VALUES(p_tenant,p_property,p_request,auth.uid(),(fresh->>'statement_id')::uuid,(result->>'journal_id')::uuid,fresh,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'bank_debit_posted',p_request,jsonb_build_object('statement_id',fresh->'statement_id','journal_id',result->'journal_id'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_bank_debit(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_bank_debit(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE TABLE irp_pms.cashier_bank_debit_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_bank_debit_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_debit_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_debit_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_cancel_bank_debit(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_debit_cancellations;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unposted transfer';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_debit_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Bank debit already posted; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_debit_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_bank_debit_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'bank_debit_cancelled',p_request,'{}');
 END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'cancelled',true,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_bank_debit(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_bank_debit(uuid,uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_bank_debit_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_debit_postings;c irp_pms.cashier_bank_debit_cancellations;reversed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_debit_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT * INTO c FROM irp_pms.cashier_bank_debit_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=saved.journal_id) INTO reversed;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',saved.request_id IS NOT NULL,'cancelled',c.request_id IS NOT NULL,'journal_reversed',reversed,'review',saved.review,'result',CASE WHEN saved.request_id IS NOT NULL THEN saved.result||jsonb_build_object('replayed',true) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_bank_debit_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bank_debit_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION irp_pms.cashier_bank_debit_void_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_debit_postings p WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND p.statement_id=NEW.statement_id AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.property_id AND r.reversal_of=p.journal_id)) THEN RAISE EXCEPTION 'Reverse the bank debit journal before voiding the statement';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_bank_debit_void_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_bank_debit_void_guard BEFORE INSERT ON irp_pms.cashier_bank_statement_voids FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_bank_debit_void_guard();
COMMIT;
