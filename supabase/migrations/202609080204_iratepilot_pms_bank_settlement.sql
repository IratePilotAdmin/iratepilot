BEGIN;
CREATE FUNCTION public.irp_pms_pilot_review_bank_settlement(p_tenant uuid,p_property uuid,p_match uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m irp_pms.cashier_bank_matches;p irp_pms.cashier_deposit_ledger_postings;a irp_pms.cashier_bank_ledger_mappings;blockers jsonb:='[]';lines jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO m FROM irp_pms.cashier_bank_matches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_match;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank match not found';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND match_id=p_match) THEN blockers:=blockers||jsonb_build_array('Bank match was reversed');END IF;
 SELECT * INTO p FROM irp_pms.cashier_deposit_ledger_postings WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=m.deposit_id;
 IF NOT FOUND THEN blockers:=blockers||jsonb_build_array('Post the deposit transfer before settlement');
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=p.journal_id) THEN blockers:=blockers||jsonb_build_array('Deposit transfer journal was reversed');END IF;
  SELECT * INTO a FROM irp_pms.cashier_bank_ledger_mappings WHERE tenant_id=p_tenant AND property_id=p_property AND id=(p.review->>'mapping_id')::uuid;
  IF NOT FOUND OR a.bank_id<>m.account_id THEN RAISE EXCEPTION 'Deposit bank mapping does not match settlement';END IF;
  lines:=irp_pms.gl_cash_transfer_lines(p_tenant,p_property,a.transit_account,a.bank_account,m.amount_minor);
 END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=m.deposit_id) OR EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND statement_id=m.statement_id) THEN blockers:=blockers||jsonb_build_array('Deposit or statement was voided');END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'match_id',m.id,'deposit_id',m.deposit_id,'statement_id',m.statement_id,'amount_minor',m.amount_minor::text,'deposit_journal_id',p.journal_id,'mapping_id',a.id,'blockers',blockers,'sources_reconciled',jsonb_array_length(blockers)=0,'proposed_lines',lines,'journal_posted',false,'bank_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_bank_settlement(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_bank_settlement(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_preview_bank_settlement(p_tenant uuid,p_property uuid,p_match uuid,p_period uuid,p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE review jsonb;period irp_pms.gl_periods;credit_date date;deposit_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 review:=public.irp_pms_pilot_review_bank_settlement(p_tenant,p_property,p_match);
 IF (review->>'sources_reconciled')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Resolve settlement sources before posting';END IF;
 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF NOT FOUND OR period.closed OR p_date IS NULL OR NOT isfinite(p_date) OR p_date<period.starts_on OR p_date>=period.ends_before THEN RAISE EXCEPTION 'Choose a settlement date in an open property period';END IF;
 SELECT value_date INTO credit_date FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=(review->>'statement_id')::uuid;
 SELECT posting_date INTO deposit_date FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND id=(review->>'deposit_journal_id')::uuid;
 IF credit_date IS NULL OR deposit_date IS NULL OR p_date<greatest(credit_date,deposit_date) THEN RAISE EXCEPTION 'Settlement date cannot precede its bank credit or deposit journal';END IF;
 RETURN review||jsonb_build_object('period_id',p_period,'posting_date',p_date,'statement_value_date',credit_date,'deposit_posting_date',deposit_date,'command',jsonb_build_object('currency','USD','description','Matched deposit settlement to bank','period_id',p_period,'posting_date',p_date,'source_kind','cashier_bank_settlement','source_id',p_match,'source_version',1,'lines',review->'proposed_lines'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_bank_settlement(uuid,uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_bank_settlement(uuid,uuid,uuid,uuid,date) TO authenticated;
CREATE TABLE irp_pms.cashier_bank_settlement_postings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),match_id uuid NOT NULL,journal_id uuid NOT NULL,review jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,match_id),UNIQUE(tenant_id,property_id,journal_id),
 FOREIGN KEY(tenant_id,property_id,match_id) REFERENCES irp_pms.cashier_bank_matches(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_settlement_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_settlement_postings FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_settlement_postings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_post_bank_settlement(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_settlement_postings;fresh jsonb;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR octet_length(p_review::text)>1048576 THEN RAISE EXCEPTION 'Settlement review, request and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_settlement_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Settlement request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_settlement_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Settlement posting request already used with different details';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Settlement review belongs to another scope';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_settlement_postings WHERE tenant_id=p_tenant AND property_id=p_property AND match_id=(p_review->>'match_id')::uuid) THEN RAISE EXCEPTION 'Settlement already posted; correct through reversal and a replacement match';END IF;
 fresh:=public.irp_pms_pilot_preview_bank_settlement(p_tenant,p_property,(p_review->>'match_id')::uuid,(p_review->>'period_id')::uuid,(p_review->>'posting_date')::date);
 IF fresh IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Settlement review changed; review again before posting';END IF;
 result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),fresh->'command')||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'match_id',fresh->'match_id','amount_minor',fresh->'amount_minor','journal_posted',true,'verifies_settlement',false);
 INSERT INTO irp_pms.cashier_bank_settlement_postings VALUES(p_tenant,p_property,p_request,auth.uid(),(fresh->>'match_id')::uuid,(result->>'journal_id')::uuid,fresh,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'bank_settlement_posted',p_request,jsonb_build_object('match_id',fresh->'match_id','journal_id',result->'journal_id'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_bank_settlement(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_bank_settlement(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION irp_pms.cashier_bank_settlement_correction_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF TG_TABLE_NAME='cashier_bank_match_reversals' THEN
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_settlement_postings p WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND p.match_id=NEW.match_id AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.property_id AND r.reversal_of=p.journal_id)) THEN RAISE EXCEPTION 'Reverse settlement journal before reversing the bank match';END IF;
 ELSIF NEW.source_kind='journal_reversal' THEN
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_settlement_postings p WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND p.review->>'deposit_journal_id'=NEW.source_id::text AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.property_id AND r.reversal_of=p.journal_id)) THEN RAISE EXCEPTION 'Reverse dependent settlements before reversing the deposit journal';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_bank_settlement_correction_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_settlement_match_guard BEFORE INSERT ON irp_pms.cashier_bank_match_reversals FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_bank_settlement_correction_guard();
CREATE TRIGGER cashier_settlement_deposit_guard BEFORE INSERT ON irp_pms.gl_journals FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_bank_settlement_correction_guard();
CREATE TABLE irp_pms.cashier_bank_settlement_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_bank_settlement_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_settlement_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_settlement_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_cancel_bank_settlement(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_settlement_cancellations;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unposted settlement';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_settlement_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Settlement already posted; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_settlement_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_bank_settlement_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'bank_settlement_cancelled',p_request,'{}');
 END IF;
 RETURN to_jsonb(saved)||jsonb_build_object('schema_version',1,'cancelled',true,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_bank_settlement(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_bank_settlement(uuid,uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_bank_settlement_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_settlement_postings;c irp_pms.cashier_bank_settlement_cancellations;reversed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_settlement_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT * INTO c FROM irp_pms.cashier_bank_settlement_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 SELECT EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=saved.journal_id) INTO reversed;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',saved.request_id IS NOT NULL,'cancelled',c.request_id IS NOT NULL,'journal_reversed',reversed,'review',saved.review,'result',CASE WHEN saved.request_id IS NOT NULL THEN saved.result||jsonb_build_object('replayed',true) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_bank_settlement_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_bank_settlement_status(uuid,uuid,uuid) TO authenticated;
COMMIT;
