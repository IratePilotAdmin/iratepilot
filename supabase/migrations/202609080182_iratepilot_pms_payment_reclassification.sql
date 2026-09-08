BEGIN;
-- Reviewed payment allocation transfers with immutable recovery and effective refund allocations.

CREATE TABLE irp_pms.gl_payment_reclassifications(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,entry_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),journal_id uuid NOT NULL,from_account_id uuid NOT NULL,to_account_id uuid NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),review jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,journal_id),CHECK(from_account_id<>to_account_id),
 FOREIGN KEY(tenant_id,property_id,entry_id) REFERENCES irp_pms.gl_payment_postings(tenant_id,property_id,entry_id),
 FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,from_account_id) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,to_account_id) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.gl_payment_reclassifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_payment_reclassifications FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_payment_reclassification_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_payment_reclassifications FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.gl_payment_allocation_state(p_tenant uuid,p_property uuid,p_entry uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE original irp_pms.gl_payment_postings;allocations jsonb;total numeric;available_total numeric;
BEGIN
 SELECT * INTO original FROM irp_pms.gl_payment_postings WHERE tenant_id=p_tenant AND property_id=p_property AND entry_id=p_entry;
 IF NOT FOUND OR original.review->>'source_kind'<>'external_payment' THEN RAISE EXCEPTION 'Choose an original posted property payment';END IF;
 WITH moves AS (
 SELECT (a->>'account_id')::uuid account_id,(a->>'amount_minor')::numeric delta FROM jsonb_array_elements(original.review->'allocations')a
 UNION ALL SELECT from_account_id,-amount_minor::numeric FROM irp_pms.gl_payment_reclassifications WHERE tenant_id=p_tenant AND property_id=p_property AND entry_id=p_entry
 UNION ALL SELECT to_account_id,amount_minor::numeric FROM irp_pms.gl_payment_reclassifications WHERE tenant_id=p_tenant AND property_id=p_property AND entry_id=p_entry
 ),allocated AS(SELECT account_id,sum(delta) amount FROM moves GROUP BY account_id),adjusted AS(
 SELECT (a->>'account_id')::uuid account_id,sum((a->>'amount_minor')::numeric) amount FROM irp_pms.gl_payment_postings p JOIN irp_pms.folio_entries e ON e.tenant_id=p.tenant_id AND e.property_id=p.property_id AND e.reservation_id=p.reservation_id AND e.id=p.entry_id CROSS JOIN LATERAL jsonb_array_elements(p.review->'allocations')a WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.target_entry_id=p_entry AND e.reservation_id=original.reservation_id AND e.kind IN('external_refund','payment_correction') GROUP BY (a->>'account_id')::uuid
 ),state AS(SELECT coalesce(a.account_id,r.account_id) account_id,coalesce(a.amount,0) allocated,coalesce(r.amount,0) adjusted,coalesce(a.amount,0)-coalesce(r.amount,0) available FROM allocated a FULL JOIN adjusted r USING(account_id))
 SELECT jsonb_agg(jsonb_build_object('account_id',account_id,'allocated_minor',allocated::text,'adjusted_minor',adjusted::text,'available_minor',available::text) ORDER BY account_id),sum(allocated),sum(available) INTO allocations,total,available_total FROM state WHERE allocated<>0 OR adjusted<>0;
 IF total IS DISTINCT FROM (original.review->>'amount_minor')::numeric OR EXISTS(SELECT 1 FROM jsonb_array_elements(allocations)a WHERE (a->>'allocated_minor')::numeric<0 OR (a->>'adjusted_minor')::numeric<0 OR (a->>'available_minor')::numeric<0) THEN RAISE EXCEPTION 'Payment allocation history does not reconcile';END IF;
 RETURN jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'entry_id',p_entry,'reservation_id',original.reservation_id,'original_journal_id',original.journal_id,'clearing_account_id',original.review->'clearing_account_id','original_amount_minor',original.review->'amount_minor','available_minor',available_total::text,'allocations',allocations);
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_payment_allocation_state(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;


CREATE FUNCTION public.irp_pms_pilot_preview_payment_reclassification(p_tenant uuid,p_property uuid,p_entry uuid,p_from uuid,p_to uuid,p_amount bigint,p_period uuid,p_date date,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE state jsonb;available numeric;from_account irp_pms.gl_accounts;to_account irp_pms.gl_accounts;period irp_pms.gl_periods;latest_date date;version bigint;role text;
BEGIN
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_from IS NULL OR p_to IS NULL OR p_from=p_to OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 999999999999 OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason<>trim(p_reason) OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Choose distinct control accounts, a positive amount and a reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 state:=irp_pms.gl_payment_allocation_state(p_tenant,p_property,p_entry);
 IF p_from::text=state->>'clearing_account_id' OR p_to::text=state->>'clearing_account_id' THEN RAISE EXCEPTION 'Reclassification cannot change payment clearing';END IF;
 SELECT * INTO from_account FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from;
 IF NOT FOUND OR NOT from_account.active OR from_account.kind NOT IN('asset','liability') THEN RAISE EXCEPTION 'Choose an active property source control account';END IF;
 SELECT * INTO to_account FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to;
 IF NOT FOUND OR NOT to_account.active OR to_account.kind NOT IN('asset','liability') THEN RAISE EXCEPTION 'Choose an active property destination control account';END IF;
 SELECT (value->>'available_minor')::numeric INTO available FROM jsonb_array_elements(state->'allocations') WHERE value->>'account_id'=p_from::text;
 IF NOT FOUND OR p_amount>available THEN RAISE EXCEPTION 'Transfer exceeds the source account amount still available';END IF;
 IF (SELECT count(*) FROM(SELECT id FROM(SELECT (a->>'account_id')::uuid id,(a->>'allocated_minor')::numeric amount FROM jsonb_array_elements(state->'allocations') a UNION ALL SELECT p_from,-p_amount::numeric UNION ALL SELECT p_to,p_amount::numeric)m GROUP BY id HAVING sum(amount)>0)active)>20 THEN RAISE EXCEPTION 'A payment supports up to 20 allocated control accounts';END IF;
 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF NOT FOUND OR period.closed OR p_date IS NULL OR NOT isfinite(p_date) OR p_date<period.starts_on OR p_date>=period.ends_before THEN RAISE EXCEPTION 'Choose an open property accounting period';END IF;
 SELECT max(j.posting_date) INTO latest_date FROM irp_pms.gl_journals j WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND (EXISTS(SELECT 1 FROM irp_pms.gl_payment_postings p JOIN irp_pms.folio_entries e ON e.tenant_id=p.tenant_id AND e.property_id=p.property_id AND e.reservation_id=p.reservation_id AND e.id=p.entry_id WHERE p.tenant_id=p_tenant AND p.property_id=p_property AND p.journal_id=j.id AND(e.id=p_entry OR e.target_entry_id=p_entry)) OR EXISTS(SELECT 1 FROM irp_pms.gl_payment_reclassifications r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.entry_id=p_entry AND r.journal_id=j.id));
 IF p_date<latest_date THEN RAISE EXCEPTION 'Transfer date cannot precede existing payment accounting';END IF;
 SELECT count(*)+1 INTO version FROM irp_pms.gl_payment_reclassifications WHERE tenant_id=p_tenant AND property_id=p_property AND entry_id=p_entry;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'role',role,'entry_id',p_entry,'from_account_id',p_from,'to_account_id',p_to,'amount_minor',p_amount::text,'allocation_state',state,'latest_posting_date',latest_date,'period',jsonb_build_object('id',period.id,'start',period.starts_on,'end_exclusive',period.ends_before),'accounts',jsonb_build_array(jsonb_build_object('id',from_account.id,'code',from_account.code,'name',from_account.name,'kind',from_account.kind),jsonb_build_object('id',to_account.id,'code',to_account.code,'name',to_account.name,'kind',to_account.kind)),'command',jsonb_build_object('currency','USD','description',p_reason,'period_id',p_period,'posting_date',p_date,'source_kind','payment_reclassification','source_id',p_entry,'source_version',version,'lines',jsonb_build_array(jsonb_build_object('account_id',p_from,'side','debit','amount_minor',p_amount::text),jsonb_build_object('account_id',p_to,'side','credit','amount_minor',p_amount::text))));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_payment_reclassification(uuid,uuid,uuid,uuid,uuid,bigint,uuid,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_payment_reclassification(uuid,uuid,uuid,uuid,uuid,bigint,uuid,date,text) TO authenticated;


CREATE FUNCTION public.irp_pms_pilot_post_payment_reclassification(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_reclassifications;fresh jsonb;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR octet_length(p_review::text)>65536 THEN RAISE EXCEPTION 'Transfer review, request and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_payment_reclassification_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Transfer request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.gl_payment_reclassifications WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Transfer request already used with different details';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Transfer review belongs to another scope';END IF;
 fresh:=public.irp_pms_pilot_preview_payment_reclassification(p_tenant,p_property,(p_review->>'entry_id')::uuid,(p_review->>'from_account_id')::uuid,(p_review->>'to_account_id')::uuid,(p_review->>'amount_minor')::bigint,(p_review->'command'->>'period_id')::uuid,(p_review->'command'->>'posting_date')::date,p_review->'command'->>'description');
 IF fresh IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Transfer review changed; review again';END IF;
 result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),fresh->'command')||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'entry_id',fresh->'entry_id','from_account_id',fresh->'from_account_id','to_account_id',fresh->'to_account_id','amount_minor',fresh->'amount_minor');
 INSERT INTO irp_pms.gl_payment_reclassifications(tenant_id,property_id,request_id,entry_id,actor_id,journal_id,from_account_id,to_account_id,amount_minor,review,result) VALUES(p_tenant,p_property,p_request,(fresh->>'entry_id')::uuid,auth.uid(),(result->>'journal_id')::uuid,(fresh->>'from_account_id')::uuid,(fresh->>'to_account_id')::uuid,(fresh->>'amount_minor')::bigint,fresh,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'payment_reclassified',p_request,jsonb_build_object('entry_id',fresh->'entry_id','journal_id',result->'journal_id'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_payment_reclassification(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_payment_reclassification(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_payment_reclassification_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_reclassifications;found_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Transfer request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_payment_reclassifications WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();found_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',found_saved,'review',CASE WHEN found_saved THEN saved.review END,'result',CASE WHEN found_saved THEN saved.result END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_payment_reclassification_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_payment_reclassification_status(uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION irp_pms.gl_guard_payment_reversal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.source_kind='journal_reversal' AND EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.source_id AND source_kind IN('folio_payment','payment_reclassification')) THEN RAISE EXCEPTION 'Payment journals require linked payment corrections or refunds; allocation journals require another reviewed reclassification';END IF;
 RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION public.irp_pms_pilot_preview_payment_journal(p_tenant uuid,p_property uuid,p_entry uuid,p_clearing uuid,p_allocations jsonb,p_period uuid,p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source irp_pms.folio_entries;period irp_pms.gl_periods;property irp_pms.properties;lines jsonb;accounts jsonb;role text;source_date date;original record;allocation jsonb;original_amount numeric;used_amount numeric;remaining jsonb:=NULL;allocation_state jsonb;allocation_version bigint:=0;latest_transfer date;
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
  allocation_state:=irp_pms.gl_payment_allocation_state(p_tenant,p_property,source.target_entry_id);
  SELECT count(*),max(j.posting_date) INTO allocation_version,latest_transfer FROM irp_pms.gl_payment_reclassifications t JOIN irp_pms.gl_journals j ON j.tenant_id=t.tenant_id AND j.property_id=t.property_id AND j.id=t.journal_id WHERE t.tenant_id=p_tenant AND t.property_id=p_property AND t.entry_id=source.target_entry_id;
  IF latest_transfer IS NOT NULL AND p_date<latest_transfer THEN RAISE EXCEPTION 'Payment adjustment cannot precede allocation transfer date';END IF;
  remaining:='[]'::jsonb;
  FOR allocation IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
   SELECT (value->>'available_minor')::numeric INTO original_amount FROM jsonb_array_elements(allocation_state->'allocations') WHERE value->>'account_id'=allocation->>'account_id';
   IF NOT FOUND OR (allocation->>'amount_minor')::numeric>original_amount THEN RAISE EXCEPTION 'Adjustment exceeds remaining original account allocation';END IF;
   used_amount:=0;
   remaining:=remaining||jsonb_build_array(jsonb_build_object('account_id',allocation->>'account_id','available_minor',(original_amount-used_amount)::text));
  END LOOP;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'name',a.name,'kind',a.kind) ORDER BY l.ordinality) INTO accounts FROM jsonb_array_elements(lines) WITH ORDINALITY l(value,ordinality) JOIN irp_pms.gl_accounts a ON a.tenant_id=p_tenant AND a.property_id=p_property AND a.id=(l.value->>'account_id')::uuid;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'role',role,'reservation_id',source.reservation_id,'entry_id',source.id,'source_date',source_date,'source_kind',source.kind,'amount_minor',source.amount_minor::text,'clearing_account_id',p_clearing,'allocations',p_allocations,'accounts',accounts,'target_entry_id',source.target_entry_id,'remaining_allocations',remaining,'allocation_version',allocation_version,'basis','recorded_external_payment','verifies_settlement',false,'period',jsonb_build_object('id',period.id,'starts_on',period.starts_on,'ends_before',period.ends_before),'command',jsonb_build_object('currency','USD','description',CASE source.kind WHEN 'external_payment' THEN 'Recorded external payment' WHEN 'external_refund' THEN 'Recorded external refund' ELSE 'Recorded payment correction' END,'lines',lines,'period_id',p_period,'posting_date',p_date,'source_id',source.id,'source_kind','folio_payment','source_version',1));
END $$;
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_payment_journal_sources(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
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
 CASE WHEN original.request_id IS NOT NULL THEN jsonb_build_object('journal_id',original.journal_id,'clearing_account_id',original.review->'clearing_account_id','allocations',(SELECT jsonb_agg(jsonb_build_object('account_id',a->>'account_id','amount_minor',a->>'allocated_minor') ORDER BY a->>'account_id') FROM jsonb_array_elements(irp_pms.gl_payment_allocation_state(p_tenant,p_property,e.target_entry_id)->'allocations') a WHERE (a->>'allocated_minor')::numeric>0)) END original_posting
 FROM irp_pms.folio_entries e JOIN irp_pms.reservations r ON r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.id=e.reservation_id
 LEFT JOIN irp_pms.gl_payment_postings p ON p.tenant_id=e.tenant_id AND p.property_id=e.property_id AND p.entry_id=e.id
 LEFT JOIN irp_pms.gl_payment_postings original ON original.tenant_id=e.tenant_id AND original.property_id=e.property_id AND original.entry_id=e.target_entry_id AND original.reservation_id=e.reservation_id
 WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.kind IN('external_payment','external_refund','payment_correction') AND e.created_at>=p_start::timestamp AT TIME ZONE zone AND e.created_at<p_end::timestamp AT TIME ZONE zone
 ORDER BY e.created_at,e.id LIMIT 501)s;
 IF jsonb_array_length(rows)>500 THEN RAISE EXCEPTION 'More than 500 payment records; choose a narrower date range';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'start_date',p_start,'end_date_exclusive',p_end,'complete',true,'rows',rows);
END $$;


CREATE TABLE irp_pms.gl_payment_reclassification_retirements(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),review jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id),CHECK(jsonb_typeof(review)='object' AND octet_length(review::text)<=65536)
);
ALTER TABLE irp_pms.gl_payment_reclassification_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_payment_reclassification_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_payment_reclassification_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_payment_reclassification_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_retire_payment_reclassification(p_tenant uuid,p_property uuid,p_request uuid,p_review jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_reclassification_retirements;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR octet_length(p_review::text)>65536 THEN RAISE EXCEPTION 'Transfer review, request and confirmation required';END IF;
 IF p_review->>'tenant_id' IS DISTINCT FROM p_tenant::text OR p_review->>'property_id' IS DISTINCT FROM p_property::text OR p_review->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Transfer review belongs to another scope';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_payment_reclassifications WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Saved allocation transfer cannot be cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.gl_payment_reclassification_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Transfer cancellation request has different details';END IF;
  replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_payment_reclassification_retirements(tenant_id,property_id,request_id,actor_id,review) VALUES(p_tenant,p_property,p_request,auth.uid(),p_review);
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'payment_reclassification_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',true,'replayed',replayed,'review',p_review);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_payment_reclassification(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_payment_reclassification(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_payment_reclassification_retirement_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_payment_reclassification_retirements;exists_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Transfer request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_payment_reclassification_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();exists_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',exists_saved,'review',CASE WHEN exists_saved THEN saved.review END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_payment_reclassification_retirement_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_payment_reclassification_retirement_status(uuid,uuid,uuid) TO authenticated;


CREATE FUNCTION public.irp_pms_pilot_payment_allocation_state(p_tenant uuid,p_property uuid,p_entry uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role text;state jsonb;
BEGIN
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 state:=irp_pms.gl_payment_allocation_state(p_tenant,p_property,p_entry);
 RETURN state||jsonb_build_object('schema_version',1,'actor_id',auth.uid(),'role',role);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_payment_allocation_state(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_payment_allocation_state(uuid,uuid,uuid) TO authenticated;
COMMIT;
