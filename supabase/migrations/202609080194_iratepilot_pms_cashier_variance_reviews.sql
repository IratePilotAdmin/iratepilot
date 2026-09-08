BEGIN;
CREATE TABLE irp_pms.cashier_variance_reviews(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 999999999999),
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 outcome text NOT NULL CHECK(outcome IN('investigating','explained','adjustment_required')),
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,session_id,revision),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_closes(tenant_id,property_id,session_id)
);
ALTER TABLE irp_pms.cashier_variance_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_variance_reviews FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_variance_reviews FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_review_cashier_variance(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_expected_revision bigint,p_outcome text,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_variance_reviews;closing irp_pms.cashier_closes;current_revision bigint;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_session IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 999999999998 OR p_confirmed IS DISTINCT FROM true OR p_outcome IS NULL OR p_outcome NOT IN('investigating','explained','adjustment_required') OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm valid variance review details';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO closing FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'Closed cashier session required';END IF;
 IF (closing.review->>'variance_minor')::numeric=0 THEN RAISE EXCEPTION 'Balanced drawer has no cash variance';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.session_id IS DISTINCT FROM p_session OR saved.revision<>p_expected_revision+1 OR saved.outcome IS DISTINCT FROM p_outcome OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Variance review request has different details';END IF;
 ELSE
  SELECT coalesce(max(revision),0) INTO current_revision FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
  IF current_revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Variance review changed; refresh before saving';END IF;
  INSERT INTO irp_pms.cashier_variance_reviews(tenant_id,property_id,session_id,revision,request_id,actor_id,outcome,reason) VALUES(p_tenant,p_property,p_session,p_expected_revision+1,p_request,auth.uid(),p_outcome,p_reason) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_variance_reviewed',p_session,jsonb_build_object('request_id',p_request,'revision',saved.revision,'outcome',saved.outcome));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.session_id,'request_id',saved.request_id,'actor_id',saved.actor_id,'revision',saved.revision::text,'outcome',saved.outcome,'reason',saved.reason,'created_at',saved.created_at,'variance_minor',closing.review->>'variance_minor','journal_posted',false,'cash_recovered',false,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_cashier_variance(uuid,uuid,uuid,uuid,bigint,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_cashier_variance(uuid,uuid,uuid,uuid,bigint,text,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_variance_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_variance_reviews;receipt jsonb:=NULL;variance text;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Review request is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  SELECT review->>'variance_minor' INTO variance FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=saved.session_id;
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.session_id,'request_id',saved.request_id,'actor_id',saved.actor_id,'revision',saved.revision::text,'outcome',saved.outcome,'reason',saved.reason,'created_at',saved.created_at,'variance_minor',variance,'journal_posted',false,'cash_recovered',false,'replayed',true);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_variance_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_variance_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_variance_history(p_tenant uuid,p_property uuid,p_session uuid,p_before_revision bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE closing irp_pms.cashier_closes;history jsonb;current_revision bigint;total bigint;remaining bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO closing FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'Closed cashier session required';END IF;
 SELECT coalesce(max(revision),0),count(*) INTO current_revision,total FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
 IF p_before_revision IS NOT NULL AND p_before_revision NOT BETWEEN 1 AND 999999999999 THEN RAISE EXCEPTION 'Invalid history cursor';END IF;
 SELECT count(*) INTO remaining FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session AND (p_before_revision IS NULL OR revision<p_before_revision);
 SELECT coalesce(jsonb_agg(jsonb_build_object('revision',r.revision::text,'request_id',r.request_id,'actor_id',r.actor_id,'outcome',r.outcome,'reason',r.reason,'created_at',r.created_at) ORDER BY r.revision DESC),'[]'::jsonb) INTO history FROM (SELECT * FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session AND (p_before_revision IS NULL OR revision<p_before_revision) ORDER BY revision DESC LIMIT 100) r;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'actor_id',auth.uid(),'currency','USD','closing_review',closing.review,'closing_reason',closing.reason,'closed_at',closing.closed_at,'current_revision',current_revision::text,'history',history,'history_count',total::text,'history_complete',p_before_revision IS NULL AND total<=100,'next_before_revision',CASE WHEN remaining>100 THEN history->99->>'revision' ELSE NULL END,'can_review',(closing.review->>'variance_minor')::numeric<>0);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_variance_history(uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_variance_history(uuid,uuid,uuid,bigint) TO authenticated;

CREATE TABLE irp_pms.cashier_variance_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_variance_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_variance_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_variance_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.cashier_variance_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_variance_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id) THEN RAISE EXCEPTION 'Variance review request was cancelled; review the cash variance with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_variance_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_variance_reviews FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_variance_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_cashier_variance_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_variance_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded variance review request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_variance_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Variance review already recorded; recover the saved variance review';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_variance_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Variance review cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_variance_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_variance_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_cashier_variance_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_cashier_variance_request(uuid,uuid,uuid,boolean) TO authenticated;


COMMIT;