BEGIN;
-- A handoff reserves part of a closed drawer's counted cash. A separate receiver
-- acknowledgment confirms custody; neither event changes revenue or bank balance.
CREATE TABLE irp_pms.cashier_handoffs(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,
 session_id uuid NOT NULL,sender_id uuid NOT NULL REFERENCES auth.users(id),
 receiver_id uuid NOT NULL REFERENCES auth.users(id),amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),CHECK(sender_id<>receiver_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_closes(tenant_id,property_id,session_id)
);
CREATE TABLE irp_pms.cashier_handoff_resolutions(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,handoff_id uuid NOT NULL,
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 outcome text NOT NULL CHECK(outcome IN('accepted','rejected','cancelled')),
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,handoff_id),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,handoff_id) REFERENCES irp_pms.cashier_handoffs(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.cashier_handoff_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_handoffs,irp_pms.cashier_handoff_resolutions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_handoffs FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_handoff_resolutions FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_create_cashier_handoff(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_receiver uuid,p_amount_minor bigint,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_handoffs;counted numeric;reserved numeric;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_session IS NULL OR p_receiver IS NULL OR p_receiver=auth.uid() OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm valid cash handoff details';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_handoffs WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.sender_id IS DISTINCT FROM auth.uid() OR saved.session_id IS DISTINCT FROM p_session OR saved.receiver_id IS DISTINCT FROM p_receiver OR saved.amount_minor IS DISTINCT FROM p_amount_minor OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Handoff request has different details';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property AND paused) THEN RAISE EXCEPTION 'Cashier activity is paused by the owner';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=p_receiver) THEN RAISE EXCEPTION 'Receiver must have property access';END IF;
  SELECT (c.review->>'counted_minor')::numeric INTO counted FROM irp_pms.cashier_closes c JOIN irp_pms.cashier_sessions s ON s.tenant_id=c.tenant_id AND s.property_id=c.property_id AND s.id=c.session_id WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.session_id=p_session AND s.cashier_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the assigned cashier can hand off a closed drawer';END IF;
  SELECT coalesce(sum(h.amount_minor),0) INTO reserved FROM irp_pms.cashier_handoffs h LEFT JOIN irp_pms.cashier_handoff_resolutions r ON r.tenant_id=h.tenant_id AND r.property_id=h.property_id AND r.handoff_id=h.id WHERE h.tenant_id=p_tenant AND h.property_id=p_property AND h.session_id=p_session AND (r.outcome IS NULL OR r.outcome='accepted');
  IF reserved+p_amount_minor>counted THEN RAISE EXCEPTION 'Handoff exceeds unassigned counted cash';END IF;
  INSERT INTO irp_pms.cashier_handoffs(tenant_id,property_id,id,session_id,sender_id,receiver_id,amount_minor,reason) VALUES(p_tenant,p_property,p_request,p_session,auth.uid(),p_receiver,p_amount_minor,p_reason) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_handoff_created',p_request,jsonb_build_object('session_id',p_session,'receiver_id',p_receiver,'amount_minor',p_amount_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'handoff_id',saved.id,'session_id',saved.session_id,'sender_id',saved.sender_id,'receiver_id',saved.receiver_id,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed,'bank_deposit_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_create_cashier_handoff(uuid,uuid,uuid,uuid,uuid,bigint,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_create_cashier_handoff(uuid,uuid,uuid,uuid,uuid,bigint,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_resolve_cashier_handoff(p_tenant uuid,p_property uuid,p_handoff uuid,p_request uuid,p_outcome text,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE handoff irp_pms.cashier_handoffs;saved irp_pms.cashier_handoff_resolutions;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_handoff IS NULL OR p_request IS NULL OR p_outcome IS NULL OR p_outcome NOT IN('accepted','rejected','cancelled') OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm the cash handoff decision';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO handoff FROM irp_pms.cashier_handoffs WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_handoff;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cash handoff not found';END IF;
 IF (p_outcome='cancelled' AND handoff.sender_id<>auth.uid()) OR (p_outcome IN('accepted','rejected') AND handoff.receiver_id<>auth.uid()) THEN RAISE EXCEPTION 'Only the assigned handoff participant can make this decision';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_handoff_resolutions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.handoff_id IS DISTINCT FROM p_handoff OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.outcome IS DISTINCT FROM p_outcome OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Handoff decision request has different details';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_handoff_resolutions WHERE tenant_id=p_tenant AND property_id=p_property AND handoff_id=p_handoff) THEN RAISE EXCEPTION 'Handoff is already resolved';END IF;
  INSERT INTO irp_pms.cashier_handoff_resolutions(tenant_id,property_id,handoff_id,request_id,actor_id,outcome,reason) VALUES(p_tenant,p_property,p_handoff,p_request,auth.uid(),p_outcome,p_reason) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_handoff_resolved',p_handoff,jsonb_build_object('request_id',p_request,'outcome',p_outcome));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'handoff_id',p_handoff,'request_id',saved.request_id,'actor_id',saved.actor_id,'outcome',saved.outcome,'reason',saved.reason,'created_at',saved.created_at,'amount_minor',handoff.amount_minor::text,'replayed',replayed,'bank_deposit_verified',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_resolve_cashier_handoff(uuid,uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_resolve_cashier_handoff(uuid,uuid,uuid,uuid,text,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_handoff_status(p_tenant uuid,p_property uuid,p_request uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE handoff irp_pms.cashier_handoffs;decision irp_pms.cashier_handoff_resolutions;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN('create','resolve') THEN RAISE EXCEPTION 'Valid handoff request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_kind='create' THEN
  SELECT * INTO handoff FROM irp_pms.cashier_handoffs WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND sender_id=auth.uid();
  IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'handoff_id',handoff.id,'session_id',handoff.session_id,'sender_id',handoff.sender_id,'receiver_id',handoff.receiver_id,'amount_minor',handoff.amount_minor::text,'reason',handoff.reason,'created_at',handoff.created_at,'replayed',true,'bank_deposit_verified',false);END IF;
 ELSE
  SELECT * INTO decision FROM irp_pms.cashier_handoff_resolutions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
  IF FOUND THEN
   SELECT * INTO handoff FROM irp_pms.cashier_handoffs WHERE tenant_id=p_tenant AND property_id=p_property AND id=decision.handoff_id;
   receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'handoff_id',decision.handoff_id,'request_id',decision.request_id,'actor_id',decision.actor_id,'outcome',decision.outcome,'reason',decision.reason,'created_at',decision.created_at,'amount_minor',handoff.amount_minor::text,'replayed',true,'bank_deposit_verified',false);
  END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind',p_kind,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_handoff_status(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_handoff_status(uuid,uuid,uuid,text) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_handoffs(p_tenant uuid,p_property uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;entries jsonb;more boolean;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 WITH candidates AS (
  SELECT h.*,r.outcome,r.actor_id AS resolved_by,r.reason AS resolution_reason,r.created_at AS resolved_at
  FROM irp_pms.cashier_handoffs h LEFT JOIN irp_pms.cashier_handoff_resolutions r ON r.tenant_id=h.tenant_id AND r.property_id=h.property_id AND r.handoff_id=h.id
  WHERE h.tenant_id=p_tenant AND h.property_id=p_property AND (member_role IN('owner','manager') OR h.sender_id=auth.uid() OR h.receiver_id=auth.uid()) AND (p_before IS NULL OR h.id<p_before)
  ORDER BY h.id DESC LIMIT 101
 ),page AS (SELECT * FROM candidates ORDER BY id DESC LIMIT 100)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('handoff_id',id,'session_id',session_id,'sender_id',sender_id,'receiver_id',receiver_id,'amount_minor',amount_minor::text,'reason',reason,'created_at',created_at,'outcome',coalesce(outcome,'pending'),'resolved_by',resolved_by,'resolution_reason',resolution_reason,'resolved_at',resolved_at) ORDER BY id DESC) FROM page),'[]'::jsonb),(SELECT count(*)>100 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'currency','USD','scope',CASE WHEN member_role IN('owner','manager') THEN 'property' ELSE 'participant' END,'entries',entries,'next_before',CASE WHEN more THEN entries->99->>'handoff_id' ELSE NULL END,'live_view',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_handoffs(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_handoffs(uuid,uuid,uuid) TO authenticated;
COMMIT;