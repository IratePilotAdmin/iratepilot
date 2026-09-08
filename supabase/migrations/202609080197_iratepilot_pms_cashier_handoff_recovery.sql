BEGIN;
CREATE FUNCTION public.irp_pms_pilot_cashier_handoff_options(p_tenant uuid,p_property uuid,p_session uuid,p_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE counted numeric;reserved numeric;receivers jsonb;more boolean;paused boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_search IS NULL OR length(p_search)>200 OR p_search~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Enter a receiver search of at most 200 characters';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT (c.review->>'counted_minor')::numeric INTO counted FROM irp_pms.cashier_closes c JOIN irp_pms.cashier_sessions s ON s.tenant_id=c.tenant_id AND s.property_id=c.property_id AND s.id=c.session_id WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.session_id=p_session AND s.cashier_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Only the assigned cashier can prepare this handoff';END IF;
 SELECT coalesce(sum(h.amount_minor),0) INTO reserved FROM irp_pms.cashier_handoffs h LEFT JOIN irp_pms.cashier_handoff_resolutions r ON r.tenant_id=h.tenant_id AND r.property_id=h.property_id AND r.handoff_id=h.id WHERE h.tenant_id=p_tenant AND h.property_id=p_property AND h.session_id=p_session AND (r.outcome IS NULL OR r.outcome='accepted');
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_controls c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.paused) INTO paused;
 WITH candidates AS (SELECT m.user_id,u.email FROM irp_pms.memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.tenant_id=p_tenant AND m.user_id<>auth.uid() AND strpos(lower(coalesce(u.email,'')),lower(trim(p_search)))>0 ORDER BY u.email,m.user_id LIMIT 51),page AS (SELECT * FROM candidates ORDER BY email,user_id LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'label',coalesce(email,user_id::text)) ORDER BY email,user_id) FROM page),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO receivers,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'actor_id',auth.uid(),'currency','USD','counted_minor',counted::text,'reserved_minor',reserved::text,'available_minor',(counted-reserved)::text,'paused',paused,'receivers',receivers,'refine_search',more,'search',p_search);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_handoff_options(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_handoff_options(uuid,uuid,uuid,text) TO authenticated;
CREATE TABLE irp_pms.cashier_handoff_creation_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_handoff_creation_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_handoff_creation_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_handoff_creation_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.cashier_handoff_creation_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_handoff_creation_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.id) THEN RAISE EXCEPTION 'Handoff request was cancelled; review cash handoffs with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_handoff_creation_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_handoffs FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_handoff_creation_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_cashier_handoff_creation_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_handoff_creation_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded handoff request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_handoffs WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Handoff already recorded; recover the saved handoff';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_handoff_creation_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Handoff cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_handoff_creation_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_handoff_creation_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_cashier_handoff_creation_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_cashier_handoff_creation_request(uuid,uuid,uuid,boolean) TO authenticated;
COMMIT;
