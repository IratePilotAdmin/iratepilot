-- Recorded payment accounting: reviewed posting, linked adjustments and recovery.
BEGIN;
CREATE FUNCTION irp_pms.gl_payment_lines(p_entry irp_pms.folio_entries,p_clearing uuid,p_allocations jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE account irp_pms.gl_accounts;item jsonb;account_id uuid;amount bigint;total numeric:=0;seen uuid[]:='{}';lines jsonb:='[]';incoming boolean;
BEGIN
 IF p_entry.kind IS NULL OR p_entry.kind NOT IN('external_payment','external_refund','payment_correction') OR p_entry.currency IS DISTINCT FROM 'USD' OR p_entry.amount_minor IS NULL OR p_entry.amount_minor NOT BETWEEN 1 AND 999999999999 THEN RAISE EXCEPTION 'A supported recorded payment source is required';END IF;
 IF p_clearing IS NULL OR p_entry.tenant_id IS NULL OR p_entry.property_id IS NULL THEN RAISE EXCEPTION 'Payment account scope is required';END IF;
 SELECT * INTO account FROM irp_pms.gl_accounts WHERE tenant_id=p_entry.tenant_id AND property_id=p_entry.property_id AND id=p_clearing;
 IF NOT FOUND OR NOT account.active OR account.kind<>'asset' THEN RAISE EXCEPTION 'Choose an active property clearing asset account';END IF;
 IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' OR jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Choose 1 to 20 payment allocations';END IF;
 incoming:=p_entry.kind='external_payment';
 lines:=jsonb_build_array(jsonb_build_object('account_id',p_clearing,'side',CASE WHEN incoming THEN 'debit' ELSE 'credit' END,'amount_minor',p_entry.amount_minor::text));
 FOR item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['account_id','amount_minor'] OR jsonb_typeof(item->'account_id')<>'string' OR jsonb_typeof(item->'amount_minor')<>'string' OR coalesce(item->>'amount_minor','')!~'^[1-9][0-9]{0,11}$' THEN RAISE EXCEPTION 'Each allocation needs an account and positive integer minor units';END IF;
  BEGIN account_id:=(item->>'account_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid payment allocation account';END;
  amount:=(item->>'amount_minor')::bigint;
  IF account_id IS NULL OR account_id=p_clearing OR account_id=ANY(seen) THEN RAISE EXCEPTION 'Payment allocation accounts must be distinct from clearing and one another';END IF;
  SELECT * INTO account FROM irp_pms.gl_accounts WHERE tenant_id=p_entry.tenant_id AND property_id=p_entry.property_id AND id=account_id;
  IF NOT FOUND OR NOT account.active OR account.kind NOT IN('asset','liability') THEN RAISE EXCEPTION 'Choose an active property receivable or advance control account';END IF;
  seen:=array_append(seen,account_id);total:=total+amount;
  lines:=lines||jsonb_build_array(jsonb_build_object('account_id',account_id,'side',CASE WHEN incoming THEN 'credit' ELSE 'debit' END,'amount_minor',amount::text));
 END LOOP;
 IF total<>p_entry.amount_minor THEN RAISE EXCEPTION 'Payment allocations must equal the recorded source amount';END IF;
 RETURN lines;
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_payment_lines(irp_pms.folio_entries,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_preview_payment_journal(p_tenant uuid,p_property uuid,p_entry uuid,p_clearing uuid,p_allocations jsonb,p_period uuid,p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source irp_pms.folio_entries;period irp_pms.gl_periods;property irp_pms.properties;lines jsonb;accounts jsonb;role text;source_date date;original record;allocation jsonb;original_amount numeric;used_amount numeric;remaining jsonb:=NULL;
BEGIN
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO property FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_entry;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown property payment record';END IF;
 IF source.kind NOT IN('external_payment','external_refund','payment_correction') THEN RAISE EXCEPTION 'A supported recorded payment source is required';END IF;
 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF NOT FOUND OR period.closed OR p_date IS NULL OR NOT isfinite(p_date) OR p_date<period.starts_on OR p_date>=period.ends_before THEN RAISE EXCEPTION 'Choose a date inside an open property accounting period';END IF;
 source_date:=(source.created_at AT TIME ZONE property.time_zone)::date;
 IF p_date<source_date THEN RAISE EXCEPTION 'Payment posting cannot precede its recorded property date';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND source_kind='folio_payment' AND source_id=p_entry) THEN RAISE EXCEPTION 'Payment source already has a journal';END IF;
 lines:=irp_pms.gl_payment_lines(source,p_clearing,p_allocations);
 IF source.kind IN('external_refund','payment_correction') THEN
  SELECT p.review,p.journal_id,j.posting_date INTO original FROM irp_pms.gl_payment_postings p JOIN irp_pms.gl_journals j ON j.tenant_id=p.tenant_id AND j.property_id=p.property_id AND j.id=p.journal_id WHERE p.tenant_id=p_tenant AND p.property_id=p_property AND p.reservation_id=source.reservation_id AND p.entry_id=source.target_entry_id;
  IF NOT FOUND OR original.review->>'source_kind'<>'external_payment' THEN RAISE EXCEPTION 'Refunds and corrections require original posting allocation linkage';END IF;
  IF p_clearing::text IS DISTINCT FROM original.review->>'clearing_account_id' THEN RAISE EXCEPTION 'Use the original payment clearing account';END IF;
  IF p_date<original.posting_date THEN RAISE EXCEPTION 'Payment adjustment cannot precede original journal date';END IF;
  remaining:='[]'::jsonb;
  FOR allocation IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
   SELECT (value->>'amount_minor')::numeric INTO original_amount FROM jsonb_array_elements(original.review->'allocations') WHERE value->>'account_id'=allocation->>'account_id';
   IF NOT FOUND THEN RAISE EXCEPTION 'Adjustment account was not allocated by the original payment';END IF;
   SELECT coalesce(sum((a.value->>'amount_minor')::numeric),0) INTO used_amount FROM irp_pms.gl_payment_postings p JOIN irp_pms.folio_entries e ON e.tenant_id=p.tenant_id AND e.property_id=p.property_id AND e.reservation_id=p.reservation_id AND e.id=p.entry_id CROSS JOIN LATERAL jsonb_array_elements(p.review->'allocations') a(value) WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=source.reservation_id AND e.target_entry_id=source.target_entry_id AND e.kind IN('external_refund','payment_correction') AND a.value->>'account_id'=allocation->>'account_id';
   IF (allocation->>'amount_minor')::numeric>original_amount-used_amount THEN RAISE EXCEPTION 'Adjustment exceeds remaining original account allocation';END IF;
   remaining:=remaining||jsonb_build_array(jsonb_build_object('account_id',allocation->>'account_id','available_minor',(original_amount-used_amount)::text));
  END LOOP;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'kind',a.kind) ORDER BY l.ordinality) INTO accounts FROM jsonb_array_elements(lines) WITH ORDINALITY l(value,ordinality) JOIN irp_pms.gl_accounts a ON a.tenant_id=p_tenant AND a.property_id=p_property AND a.id=(l.value->>'account_id')::uuid;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'role',role,'reservation_id',source.reservation_id,'entry_id',source.id,'source_date',source_date,'source_kind',source.kind,'amount_minor',source.amount_minor::text,'clearing_account_id',p_clearing,'allocations',p_allocations,'accounts',accounts,'target_entry_id',source.target_entry_id,'remaining_allocations',remaining,'basis','recorded_external_payment','verifies_settlement',false,'period',jsonb_build_object('id',period.id,'starts_on',period.starts_on,'ends_before',period.ends_before),'command',jsonb_build_object('currency','USD','description',CASE source.kind WHEN 'external_payment' THEN 'Recorded external payment' WHEN 'external_refund' THEN 'Recorded external refund' ELSE 'Recorded payment correction' END,'lines',lines,'period_id',p_period,'posting_date',p_date,'source_id',source.id,'source_kind','folio_payment','source_version',1));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_payment_journal(uuid,uuid,uuid,uuid,jsonb,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_payment_journal(uuid,uuid,uuid,uuid,jsonb,uuid,date) TO authenticated;

CREATE TABLE irp_pms.gl_payment_postings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),reservation_id uuid NOT NULL,entry_id uuid NOT NULL,journal_id uuid NOT NULL,review jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,entry_id),UNIQUE(tenant_id,property_id,journal_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id),
 FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.gl_payment_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_payment_postings FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_payment_posting_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_payment_postings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_post_payment_journal(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_postings;fresh jsonb;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR octet_length(p_review::text)>65536 THEN RAISE EXCEPTION 'Payment review, request and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_payment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Payment posting request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.gl_payment_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Payment posting request already used with different details';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Payment review belongs to another scope';END IF;
 fresh:=public.irp_pms_pilot_preview_payment_journal(p_tenant,p_property,(p_review->>'entry_id')::uuid,(p_review->>'clearing_account_id')::uuid,p_review->'allocations',(p_review->'command'->>'period_id')::uuid,(p_review->'command'->>'posting_date')::date);
 IF fresh IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Payment review changed; review again before posting';END IF;
 result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),fresh->'command')||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'entry_id',fresh->'entry_id','reservation_id',fresh->'reservation_id','amount_minor',fresh->'amount_minor','verifies_settlement',false);
 INSERT INTO irp_pms.gl_payment_postings(tenant_id,property_id,request_id,actor_id,reservation_id,entry_id,journal_id,review,result) VALUES(p_tenant,p_property,p_request,auth.uid(),(fresh->>'reservation_id')::uuid,(fresh->>'entry_id')::uuid,(result->>'journal_id')::uuid,fresh,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'payment_journal_posted',p_request,jsonb_build_object('entry_id',fresh->'entry_id','journal_id',result->'journal_id'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_payment_journal(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_payment_journal(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_payment_journal_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_postings;exists_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Payment request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_payment_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();exists_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',exists_saved,'review',CASE WHEN exists_saved THEN saved.review END,'result',CASE WHEN exists_saved THEN saved.result END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_payment_journal_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_payment_journal_status(uuid,uuid,uuid) TO authenticated;



CREATE FUNCTION irp_pms.gl_guard_payment_reversal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.source_kind='journal_reversal' AND EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.source_id AND source_kind='folio_payment') THEN RAISE EXCEPTION 'Payment journals require linked payment corrections or refunds';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_guard_payment_reversal() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_payment_reversal_guard BEFORE INSERT ON irp_pms.gl_journals FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_guard_payment_reversal();


CREATE TABLE irp_pms.gl_payment_retirements(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),review jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id),CHECK(jsonb_typeof(review)='object' AND octet_length(review::text)<=65536)
);
ALTER TABLE irp_pms.gl_payment_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_payment_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_payment_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_payment_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_retire_payment_journal(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_retirements;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR octet_length(p_review::text)>65536 THEN RAISE EXCEPTION 'Payment review, request and confirmation required';END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Payment review belongs to another scope';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_payment_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Saved payment posting cannot be cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.gl_payment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Payment cancellation request has different details';END IF;
  replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_payment_retirements(tenant_id,property_id,request_id,actor_id,review) VALUES(p_tenant,p_property,p_request,auth.uid(),p_review);
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'payment_journal_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',true,'replayed',replayed,'review',p_review);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_payment_journal(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_payment_journal(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_payment_journal_retirement_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_retirements;exists_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Payment request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_payment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();exists_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',exists_saved,'review',CASE WHEN exists_saved THEN saved.review END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_payment_journal_retirement_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_payment_journal_retirement_status(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_payment_journal_sources(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE zone text;rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end-p_start NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Choose 1 to 31 recorded payment dates';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT time_zone INTO zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at,s.entry_id),'[]') INTO rows FROM(
 SELECT e.id entry_id,e.reservation_id,e.kind,e.amount_minor::text,e.created_at,(e.created_at AT TIME ZONE zone)::date source_date,e.target_entry_id,r.source_booking_id reservation_reference,p.journal_id,
 CASE WHEN original.request_id IS NOT NULL THEN jsonb_build_object('journal_id',original.journal_id,'clearing_account_id',original.review->'clearing_account_id','allocations',original.review->'allocations') END original_posting
 FROM irp_pms.folio_entries e JOIN irp_pms.reservations r ON r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.id=e.reservation_id
 LEFT JOIN irp_pms.gl_payment_postings p ON p.tenant_id=e.tenant_id AND p.property_id=e.property_id AND p.entry_id=e.id
 LEFT JOIN irp_pms.gl_payment_postings original ON original.tenant_id=e.tenant_id AND original.property_id=e.property_id AND original.entry_id=e.target_entry_id AND original.reservation_id=e.reservation_id
 WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.kind IN('external_payment','external_refund','payment_correction') AND e.created_at>=p_start::timestamp AT TIME ZONE zone AND e.created_at<p_end::timestamp AT TIME ZONE zone
 ORDER BY e.created_at,e.id LIMIT 501)s;
 IF jsonb_array_length(rows)>500 THEN RAISE EXCEPTION 'More than 500 payment records; choose a narrower date range';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'start_date',p_start,'end_date_exclusive',p_end,'complete',true,'rows',rows);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_payment_journal_sources(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_payment_journal_sources(uuid,uuid,date,date) TO authenticated;
COMMIT;
