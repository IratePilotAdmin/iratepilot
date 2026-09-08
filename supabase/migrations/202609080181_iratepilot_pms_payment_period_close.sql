-- Include recorded payment accounting in period-close review and admission.
BEGIN;
CREATE OR REPLACE FUNCTION irp_pms.gl_period_review(p_tenant uuid,p_property uuid,p_period uuid) RETURNS jsonb

LANGUAGE plpgsql SET search_path=pg_catalog AS $$

DECLARE period irp_pms.gl_periods;review jsonb;debits numeric;credits numeric;journals bigint;fingerprint text;pending_service bigint;pending_forward bigint;pending_payment bigint;zone text;

BEGIN

 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;

 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped accounting period';END IF;

 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(id::text,',' ORDER BY id),''),'UTF8')),'hex') INTO journals,fingerprint FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND period_id=p_period;

 SELECT coalesce(sum(l.amount_minor) FILTER(WHERE l.side='debit'),0),coalesce(sum(l.amount_minor) FILTER(WHERE l.side='credit'),0) INTO debits,credits FROM irp_pms.gl_lines l JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(l.tenant_id,l.property_id,l.journal_id) WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.period_id=p_period;

 SELECT count(*) INTO pending_service FROM irp_pms.service_day_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date>=period.starts_on AND e.service_date<period.ends_before AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_service_postings s WHERE (s.tenant_id,s.property_id,s.service_date,s.reservation_id)=(e.tenant_id,e.property_id,e.service_date,e.reservation_id));

 SELECT count(*) INTO pending_forward FROM irp_pms.service_forward_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date>=period.starts_on AND e.service_date<period.ends_before AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_forward_postings s WHERE (s.tenant_id,s.property_id,s.adjustment_id)=(e.tenant_id,e.property_id,e.adjustment_id));

 SELECT time_zone INTO zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 SELECT count(*) INTO pending_payment FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.kind IN('external_payment','external_refund','payment_correction') AND e.created_at>=period.starts_on::timestamp AT TIME ZONE zone AND e.created_at<period.ends_before::timestamp AT TIME ZONE zone AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_payment_postings p WHERE p.tenant_id=e.tenant_id AND p.property_id=e.property_id AND p.entry_id=e.id);
 review:=jsonb_build_object('schema_version',2,'tenant_id',p_tenant,'property_id',p_property,'period_id',p_period,'start_date',period.starts_on,'end_date_exclusive',period.ends_before,'closed',period.closed,'currency','USD','journal_count',journals,'journal_fingerprint',fingerprint,'debit_minor',debits::text,'credit_minor',credits::text,'pending_service_count',pending_service,'pending_correction_count',pending_forward,'pending_payment_count',pending_payment,'basis','recorded_journals_service_and_payment_sources');

 RETURN review||jsonb_build_object('review_token',encode(sha256(convert_to(review::text,'UTF8')),'hex'));

END $$;
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_close_gl_period(p_tenant uuid,p_property uuid,p_request uuid,p_period uuid,p_review_token text,p_confirmed boolean) RETURNS jsonb

LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$

DECLARE saved irp_pms.gl_period_closures;review jsonb;replayed boolean:=false;

BEGIN

 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);

 IF p_request IS NULL OR p_period IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review_token IS NULL OR p_review_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Period review and confirmation required';END IF;

 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;

 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;

 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);

 IF EXISTS(SELECT 1 FROM irp_pms.gl_period_close_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Period close request was retired; start a fresh review';END IF;

 SELECT * INTO saved FROM irp_pms.gl_period_closures WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;

 IF FOUND THEN

  IF (saved.period_id,saved.actor_id,saved.review_token) IS DISTINCT FROM (p_period,auth.uid(),p_review_token) THEN RAISE EXCEPTION 'Period close request identity already used';END IF;

  replayed:=true;

 ELSE

  review:=irp_pms.gl_period_review(p_tenant,p_property,p_period);

  IF (review->>'closed')::boolean THEN RAISE EXCEPTION 'Accounting period already closed';END IF;

  IF review->>'review_token'<>p_review_token THEN RAISE EXCEPTION 'Accounting period changed; review again' USING ERRCODE='PT409';END IF;

  IF (review->>'pending_service_count')::bigint<>0 OR (review->>'pending_correction_count')::bigint<>0 THEN RAISE EXCEPTION 'Post saved service sources before closing';END IF;

  IF (review->>'pending_payment_count')::bigint<>0 THEN RAISE EXCEPTION 'Post recorded payments, refunds and corrections before closing';END IF;
  IF review->>'debit_minor'<>review->>'credit_minor' THEN RAISE EXCEPTION 'Accounting period does not balance';END IF;

  UPDATE irp_pms.gl_periods SET closed=true WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;

  INSERT INTO irp_pms.gl_period_closures(tenant_id,property_id,request_id,period_id,actor_id,review_token,review) VALUES(p_tenant,p_property,p_request,p_period,auth.uid(),p_review_token,review) RETURNING * INTO saved;

  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_period_closed',p_period,jsonb_build_object('request_id',p_request,'review_token',p_review_token));

 END IF;

 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'period_id',p_period,'review_token',p_review_token,'closed_at',saved.closed_at,'closed',true,'replayed',replayed);

END $$;
COMMIT;
