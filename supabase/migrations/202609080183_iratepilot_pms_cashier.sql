-- Cashier candidate; requires migrations through 182. Not a launch certification.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
-- Source: cashier-session-draft.sql
-- Cashier-session development draft. Close and guest-payment assignment remain pending.

CREATE TABLE irp_pms.cashier_controls(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,paused boolean NOT NULL,
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 actor_id uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(tenant_id,property_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_controls FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE irp_pms.cashier_sessions(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,
 cashier_id uuid NOT NULL REFERENCES auth.users(id),opened_by uuid NOT NULL REFERENCES auth.users(id),
 drawer_key text NOT NULL CHECK(drawer_key=trim(drawer_key) AND length(drawer_key) BETWEEN 1 AND 80 AND drawer_key !~ '[[:cntrl:]]'),
 currency text NOT NULL CHECK(currency='USD'),opening_minor bigint NOT NULL CHECK(opening_minor BETWEEN 0 AND 999999999999),
 business_date date NOT NULL,time_zone text NOT NULL,opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,id,drawer_key,cashier_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.cashier_active_sessions(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,drawer_key text NOT NULL,cashier_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,property_id,drawer_key),UNIQUE(tenant_id,property_id,cashier_id),UNIQUE(tenant_id,property_id,session_id),
 FOREIGN KEY(tenant_id,property_id,session_id,drawer_key,cashier_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id,drawer_key,cashier_id)
);
CREATE TABLE irp_pms.cashier_custody_events(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 kind text NOT NULL CHECK(kind IN('cash_in','cash_out')),amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.cashier_active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.cashier_custody_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE irp_pms.cashier_sessions,irp_pms.cashier_active_sessions,irp_pms.cashier_custody_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_session_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_sessions FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TRIGGER cashier_custody_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_custody_events FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();

CREATE FUNCTION public.irp_pms_pilot_open_cashier_session(p_tenant uuid,p_property uuid,p_request uuid,p_drawer text,p_opening_minor bigint,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_sessions;zone text;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_drawer IS NULL OR p_drawer<>trim(p_drawer) OR length(p_drawer) NOT BETWEEN 1 AND 80 OR p_drawer~'[[:cntrl:]]' OR p_opening_minor IS NULL OR p_opening_minor NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Confirm a drawer and valid opening cash amount';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_open_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Cashier opening request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF saved.cashier_id IS DISTINCT FROM auth.uid() OR saved.opened_by IS DISTINCT FROM auth.uid() OR saved.drawer_key IS DISTINCT FROM p_drawer OR saved.opening_minor IS DISTINCT FROM p_opening_minor THEN RAISE EXCEPTION 'Cashier request already used with different details';END IF;
  replayed:=true;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property AND paused) THEN RAISE EXCEPTION 'Cashier activity is paused by the owner';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_active_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND (drawer_key=p_drawer OR cashier_id=auth.uid())) THEN RAISE EXCEPTION 'Drawer or cashier already has an active session';END IF;
  SELECT time_zone INTO zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
  INSERT INTO irp_pms.cashier_sessions(tenant_id,property_id,id,cashier_id,opened_by,drawer_key,currency,opening_minor,business_date,time_zone)
  VALUES(p_tenant,p_property,p_request,auth.uid(),auth.uid(),p_drawer,'USD',p_opening_minor,(clock_timestamp() AT TIME ZONE zone)::date,zone) RETURNING * INTO saved;
  INSERT INTO irp_pms.cashier_active_sessions VALUES(p_tenant,p_property,p_request,p_drawer,auth.uid());
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_session_opened',p_request,jsonb_build_object('drawer',p_drawer,'opening_minor',p_opening_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.id,'request_id',p_request,'actor_id',saved.opened_by,'cashier_id',saved.cashier_id,'drawer',saved.drawer_key,'opening_minor',saved.opening_minor::text,'currency',saved.currency,'business_date',saved.business_date,'time_zone',saved.time_zone,'opened_at',saved.opened_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_open_cashier_session(uuid,uuid,uuid,text,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_open_cashier_session(uuid,uuid,uuid,text,bigint,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cashier_session_open_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_sessions;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Cashier request identity required';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND opened_by=auth.uid();
 IF FOUND THEN
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.id,'request_id',p_request,'actor_id',saved.opened_by,'cashier_id',saved.cashier_id,'drawer',saved.drawer_key,'opening_minor',saved.opening_minor::text,'currency',saved.currency,'business_date',saved.business_date,'time_zone',saved.time_zone,'opened_at',saved.opened_at,'replayed',true);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_session_open_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_session_open_status(uuid,uuid,uuid) TO authenticated;

CREATE TABLE irp_pms.cashier_open_retirements(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 drawer_key text NOT NULL CHECK(drawer_key=trim(drawer_key) AND length(drawer_key) BETWEEN 1 AND 80 AND drawer_key !~ '[[:cntrl:]]'),
 opening_minor bigint NOT NULL CHECK(opening_minor BETWEEN 0 AND 999999999999),retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_open_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE irp_pms.cashier_open_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_open_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_open_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_retire_cashier_open(p_tenant uuid,p_property uuid,p_request uuid,p_drawer text,p_opening_minor bigint,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_open_retirements;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_drawer IS NULL OR p_drawer<>trim(p_drawer) OR length(p_drawer) NOT BETWEEN 1 AND 80 OR p_drawer~'[[:cntrl:]]' OR p_opening_minor IS NULL OR p_opening_minor NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Confirm the original drawer and opening amount';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Opened cashier session cannot be cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_open_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.drawer_key IS DISTINCT FROM p_drawer OR saved.opening_minor IS DISTINCT FROM p_opening_minor THEN RAISE EXCEPTION 'Cancelled cashier request has different details';END IF;
  replayed:=true;
 ELSE
  INSERT INTO irp_pms.cashier_open_retirements(tenant_id,property_id,request_id,actor_id,drawer_key,opening_minor) VALUES(p_tenant,p_property,p_request,auth.uid(),p_drawer,p_opening_minor) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'cashier_open_cancelled',p_request);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'actor_id',auth.uid(),'drawer',saved.drawer_key,'opening_minor',saved.opening_minor::text,'retired',true,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_cashier_open(uuid,uuid,uuid,text,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_cashier_open(uuid,uuid,uuid,text,bigint,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cashier_open_retirement_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_open_retirements;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Cashier request identity required';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_open_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN receipt:=jsonb_build_object('drawer',saved.drawer_key,'opening_minor',saved.opening_minor::text,'retired_at',saved.retired_at);END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'actor_id',auth.uid(),'retired',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_open_retirement_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_open_retirement_status(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_post_cashier_custody(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_kind text,p_amount_minor bigint,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_custody_events;session irp_pms.cashier_sessions;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_session IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_kind IS NULL OR p_kind NOT IN('cash_in','cash_out') OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm a cash movement, positive amount and reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO session FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session AND cashier_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Cashier session is not assigned to you';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_custody_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Cash movement request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF saved.session_id IS DISTINCT FROM p_session OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.kind IS DISTINCT FROM p_kind OR saved.amount_minor IS DISTINCT FROM p_amount_minor OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Cash movement request has different details';END IF;
  replayed:=true;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property AND paused) THEN RAISE EXCEPTION 'Cashier activity is paused by the owner';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_active_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Cashier session is no longer active';END IF;
  IF (SELECT count(*) FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session)>=10000 THEN RAISE EXCEPTION 'Cashier movement limit reached';END IF;
  IF (SELECT coalesce(sum(amount_minor),0) FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session AND kind=p_kind)+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Cashier movement total exceeds supported range';END IF;
  INSERT INTO irp_pms.cashier_custody_events VALUES(p_tenant,p_property,p_session,p_request,auth.uid(),p_kind,p_amount_minor,p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_custody_recorded',p_request,jsonb_build_object('session_id',p_session,'kind',p_kind,'amount_minor',p_amount_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.session_id,'request_id',saved.id,'actor_id',saved.actor_id,'kind',saved.kind,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_cashier_custody(uuid,uuid,uuid,uuid,text,bigint,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_cashier_custody(uuid,uuid,uuid,uuid,text,bigint,text,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cashier_custody_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_custody_events;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Cash movement identity required';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
 IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.session_id,'request_id',saved.id,'actor_id',saved.actor_id,'kind',saved.kind,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',true);END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'actor_id',auth.uid(),'found',receipt IS NOT NULL,'result',receipt);
END $$;
CREATE FUNCTION public.irp_pms_pilot_cashier_session(p_tenant uuid,p_property uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role text;session irp_pms.cashier_sessions;movements jsonb;active boolean;
BEGIN
 role:=irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO session FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session;
 IF NOT FOUND OR (role NOT IN('owner','manager') AND session.cashier_id<>auth.uid()) THEN RAISE EXCEPTION 'Cashier session access denied';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount_minor',amount_minor::text,'reason',reason,'actor_id',actor_id,'created_at',created_at) ORDER BY created_at,id),'[]'::jsonb) INTO movements FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
 IF jsonb_array_length(movements)>10000 THEN RAISE EXCEPTION 'Cashier movement list exceeds supported limit';END IF;
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_active_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session) INTO active;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'session_id',session.id,'cashier_id',session.cashier_id,'drawer',session.drawer_key,'currency',session.currency,'opening_minor',session.opening_minor::text,'business_date',session.business_date,'time_zone',session.time_zone,'opened_at',session.opened_at,'active',active,'movements',movements,'complete',true,'includes_guest_payments',false,'can_close',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_custody_status(uuid,uuid,uuid),public.irp_pms_pilot_cashier_session(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_custody_status(uuid,uuid,uuid),public.irp_pms_pilot_cashier_session(uuid,uuid,uuid) TO authenticated;

-- Source: cashier-controls-draft.sql
-- Load after cashier-session-draft.sql. Development only.

CREATE FUNCTION public.irp_pms_pilot_set_cashier_pause(p_tenant uuid,p_property uuid,p_paused boolean,p_reason text,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_controls;current_revision bigint;
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can pause cashier activity';END IF;
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 THEN RAISE EXCEPTION 'Refresh cashier controls before changing them';END IF;
 IF p_paused IS NULL OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide a cashier control state and reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can pause cashier activity';END IF;
 SELECT coalesce((SELECT revision FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property),0) INTO current_revision;
 IF current_revision<>p_expected_revision THEN RAISE EXCEPTION 'Cashier controls changed; refresh before trying again';END IF;
 INSERT INTO irp_pms.cashier_controls VALUES(p_tenant,p_property,p_paused,p_reason,auth.uid(),clock_timestamp(),current_revision+1)
 ON CONFLICT(tenant_id,property_id) DO UPDATE SET paused=excluded.paused,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at,revision=excluded.revision RETURNING * INTO saved;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_pause_changed',jsonb_build_object('paused',p_paused,'reason',p_reason,'revision',saved.revision::text));
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'revision',saved.revision::text,'paused',saved.paused,'reason',saved.reason,'actor_id',saved.actor_id,'updated_at',saved.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_set_cashier_pause(uuid,uuid,boolean,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_set_cashier_pause(uuid,uuid,boolean,text,bigint) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cashier_control(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_controls;member_role text;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'revision',coalesce(saved.revision,0)::text,'paused',coalesce(saved.paused,false),'reason',saved.reason,'changed_by',saved.actor_id,'updated_at',saved.updated_at,'can_change',member_role='owner');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_control(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_control(uuid,uuid) TO authenticated;

-- Source: cashier-active-draft.sql

CREATE FUNCTION public.irp_pms_pilot_active_cashiers(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;rows jsonb;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',s.id,'cashier_id',s.cashier_id,'drawer',s.drawer_key,'currency',s.currency,'opening_minor',s.opening_minor::text,'opened_at',s.opened_at,'business_date',s.business_date,'time_zone',s.time_zone,'is_mine',s.cashier_id=auth.uid()) ORDER BY s.opened_at,s.id),'[]'::jsonb) INTO rows
 FROM irp_pms.cashier_active_sessions a JOIN irp_pms.cashier_sessions s ON s.tenant_id=a.tenant_id AND s.property_id=a.property_id AND s.id=a.session_id
 WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND (member_role IN('owner','manager') OR a.cashier_id=auth.uid());
 IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION 'Active cashier count exceeds supported limit';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'scope',CASE WHEN member_role IN('owner','manager') THEN 'property' ELSE 'own_sessions' END,'sessions',rows,'complete',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_active_cashiers(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_active_cashiers(uuid,uuid) TO authenticated;

-- Source: cashier-guest-payments-draft.sql
-- Development draft: record a declared physical cash receipt/refund atomically with its folio entry.

CREATE TABLE irp_pms.cashier_guest_payments(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,reservation_id uuid NOT NULL,
 entry_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,reservation_id,entry_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id)
);
ALTER TABLE irp_pms.cashier_guest_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_guest_payments FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_guest_payment_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_guest_payments FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TABLE irp_pms.cashier_payment_retirements(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,reservation_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_payment_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_payment_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_payment_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_payment_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_record_cashier_payment(p_tenant uuid,p_property uuid,p_session uuid,p_reservation uuid,p_request uuid,p_kind text,p_amount_minor bigint,p_reference text,p_reason text,p_target uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_guest_payments;receipt jsonb;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_confirmed IS DISTINCT FROM true OR p_kind IS NULL OR p_kind NOT IN('external_payment','external_refund') OR p_session IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'Confirm the physical cash receipt or refund';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Cashier session is not assigned to you';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_payment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Cash payment request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_guest_payments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF saved.session_id IS DISTINCT FROM p_session OR saved.reservation_id IS DISTINCT FROM p_reservation OR saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cash payment request has different details';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property AND paused) THEN RAISE EXCEPTION 'Cashier activity is paused by the owner';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_active_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Cashier session is no longer active';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Existing folio entries cannot be classified as drawer cash';END IF;
  IF p_kind='external_refund' AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_guest_payments c JOIN irp_pms.folio_entries e ON e.tenant_id=c.tenant_id AND e.property_id=c.property_id AND e.reservation_id=c.reservation_id AND e.id=c.entry_id WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.reservation_id=p_reservation AND c.entry_id=p_target AND e.kind='external_payment') THEN RAISE EXCEPTION 'Cash refund requires an original recorded cashier cash payment';END IF;
  IF (SELECT count(*) FROM irp_pms.cashier_guest_payments WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session)>=10000 THEN RAISE EXCEPTION 'Cashier payment limit reached';END IF;
 END IF;
 receipt:=public.irp_pms_pilot_post_folio(p_tenant,p_property,p_reservation,p_request,p_kind,p_amount_minor,p_reference,p_reason,p_target);
 IF NOT replayed THEN
  INSERT INTO irp_pms.cashier_guest_payments VALUES(p_tenant,p_property,p_session,p_reservation,(receipt->>'entry_id')::uuid,p_request,auth.uid());
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_guest_payment_recorded',(receipt->>'entry_id')::uuid,jsonb_build_object('session_id',p_session,'reservation_id',p_reservation,'method','cash'));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'reservation_id',p_reservation,'request_id',p_request,'actor_id',auth.uid(),'method','cash','folio_receipt',receipt,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_record_cashier_payment(uuid,uuid,uuid,uuid,uuid,text,bigint,text,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_record_cashier_payment(uuid,uuid,uuid,uuid,uuid,text,bigint,text,text,uuid,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_guest_cash_receipts(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipts jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation) THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('entry_id',e.id,'session_id',c.session_id,'reference',e.reference,'amount_minor',e.amount_minor::text,'remaining_minor',(e.amount_minor-coalesce((SELECT sum(a.amount_minor) FROM irp_pms.folio_entries a WHERE a.tenant_id=e.tenant_id AND a.property_id=e.property_id AND a.reservation_id=e.reservation_id AND a.target_entry_id=e.id AND a.kind IN('external_refund','payment_correction')),0))::text,'created_at',e.created_at) ORDER BY e.created_at,e.id),'[]'::jsonb) INTO receipts
 FROM irp_pms.cashier_guest_payments c JOIN irp_pms.folio_entries e ON e.tenant_id=c.tenant_id AND e.property_id=c.property_id AND e.reservation_id=c.reservation_id AND e.id=c.entry_id
 WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.reservation_id=p_reservation AND e.kind='external_payment';
 IF jsonb_array_length(receipts)>1000 THEN RAISE EXCEPTION 'Cash receipt list exceeds supported limit';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,'actor_id',auth.uid(),'currency','USD','receipts',receipts,'complete',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_guest_cash_receipts(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_guest_cash_receipts(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cashier_payment_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_guest_payments;e irp_pms.folio_entries;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Cash payment request identity required';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_guest_payments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  SELECT * INTO STRICT e FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=saved.reservation_id AND id=saved.entry_id;
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.session_id,'reservation_id',saved.reservation_id,'request_id',p_request,'actor_id',saved.actor_id,'method','cash','replayed',true,'folio_receipt',jsonb_build_object('entry_id',e.id,'request_id',e.request_id,'kind',e.kind,'amount_minor',e.amount_minor,'reference',e.reference,'reason',e.reason,'target_entry_id',e.target_entry_id,'created_at',e.created_at,'payment_recording','external_only','replayed',true));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_payment_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_payment_status(uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_retire_cashier_payment(p_tenant uuid,p_property uuid,p_session uuid,p_reservation uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_payment_retirements;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_session IS NULL OR p_reservation IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the saved cash payment';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Cashier session is not assigned to you';END IF;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation) THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Recorded payment cannot be cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_payment_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF saved.session_id IS DISTINCT FROM p_session OR saved.reservation_id IS DISTINCT FROM p_reservation OR saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cancelled cash payment identity differs';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_payment_retirements(tenant_id,property_id,session_id,reservation_id,request_id,actor_id) VALUES(p_tenant,p_property,p_session,p_reservation,p_request,auth.uid()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_payment_cancelled',p_reservation,jsonb_build_object('request_id',p_request,'session_id',p_session));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'reservation_id',p_reservation,'request_id',p_request,'actor_id',auth.uid(),'retired',true,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_cashier_payment(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_cashier_payment(uuid,uuid,uuid,uuid,uuid,boolean) TO authenticated;

-- Source: cashier-review-draft.sql
-- Load after cashier guest payments. Read-only review, not a drawer close.

CREATE FUNCTION public.irp_pms_pilot_review_cashier(p_tenant uuid,p_property uuid,p_session uuid,p_counted_minor bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;s irp_pms.cashier_sessions;receipts numeric;refunds numeric;cash_in numeric;cash_out numeric;expected numeric;variance numeric;payment_count bigint;custody_count bigint;active boolean;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_counted_minor IS NULL OR p_counted_minor NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Enter a valid counted cash amount';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO s FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session;
 IF NOT FOUND OR (member_role NOT IN('owner','manager') AND s.cashier_id<>auth.uid()) THEN RAISE EXCEPTION 'Cashier session access denied';END IF;
 SELECT coalesce(sum(e.amount_minor) FILTER(WHERE e.kind='external_payment'),0),coalesce(sum(e.amount_minor) FILTER(WHERE e.kind='external_refund'),0),count(*) INTO receipts,refunds,payment_count
 FROM irp_pms.cashier_guest_payments c JOIN irp_pms.folio_entries e ON e.tenant_id=c.tenant_id AND e.property_id=c.property_id AND e.reservation_id=c.reservation_id AND e.id=c.entry_id
 WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.session_id=p_session;
 SELECT coalesce(sum(amount_minor) FILTER(WHERE kind='cash_in'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='cash_out'),0),count(*) INTO cash_in,cash_out,custody_count FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
 expected:=s.opening_minor+receipts-refunds+cash_in-cash_out;variance:=p_counted_minor-expected;
 IF greatest(receipts,refunds,cash_in,cash_out,abs(expected),abs(variance))>999999999999 THEN RAISE EXCEPTION 'Cash reconciliation exceeds supported range';END IF;
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_active_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session) INTO active;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'actor_id',auth.uid(),'cashier_id',s.cashier_id,'drawer',s.drawer_key,'currency',s.currency,'opening_minor',s.opening_minor::text,'receipts_minor',receipts::text,'refunds_minor',refunds::text,'cash_in_minor',cash_in::text,'cash_out_minor',cash_out::text,'expected_minor',expected::text,'counted_minor',p_counted_minor::text,'variance_minor',variance::text,'variance',CASE WHEN variance=0 THEN 'balanced' WHEN variance>0 THEN 'over' ELSE 'short' END,'movement_count',payment_count+custody_count,'active',active,'includes_guest_payments',true,'can_close',active AND s.cashier_id=auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_review_cashier(uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_review_cashier(uuid,uuid,uuid,bigint) TO authenticated;
-- Reject a new movement atomically if it would make the drawer impossible to review.
CREATE FUNCTION irp_pms.cashier_reviewable_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM public.irp_pms_pilot_review_cashier(NEW.tenant_id,NEW.property_id,NEW.session_id,0);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_reviewable_movement() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_payment_reviewable AFTER INSERT ON irp_pms.cashier_guest_payments FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_reviewable_movement();
CREATE TRIGGER cashier_custody_reviewable AFTER INSERT ON irp_pms.cashier_custody_events FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_reviewable_movement();

-- Source: cashier-close-draft.sql
-- Development drawer close: cash declaration only, not a GL posting or bank deposit.

CREATE TABLE irp_pms.cashier_close_retirements(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_close_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_close_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_close_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_close_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TABLE irp_pms.cashier_closes(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),review jsonb NOT NULL,
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,session_id),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_closes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_closes FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_close_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_closes FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_close_cashier(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_counted_minor bigint,p_review jsonb,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_closes;current_review jsonb;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_session IS NULL OR p_review IS NULL OR p_confirmed IS DISTINCT FROM true OR p_counted_minor IS NULL OR p_counted_minor NOT BETWEEN 0 AND 999999999999 OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm the reviewed cash count and closing explanation';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Only the assigned cashier can close this session';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_close_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Cashier close request was cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF saved.session_id IS DISTINCT FROM p_session OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.review IS DISTINCT FROM p_review OR saved.review->>'counted_minor' IS DISTINCT FROM p_counted_minor::text OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Cashier close request has different details';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session) THEN RAISE EXCEPTION 'Cashier session is already closed';END IF;
  current_review:=public.irp_pms_pilot_review_cashier(p_tenant,p_property,p_session,p_counted_minor);
  IF current_review IS DISTINCT FROM p_review THEN RAISE EXCEPTION 'Cashier activity changed; review the cash count again';END IF;
  IF (current_review->>'active')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cashier session is no longer active';END IF;
  INSERT INTO irp_pms.cashier_closes(tenant_id,property_id,session_id,request_id,actor_id,review,reason) VALUES(p_tenant,p_property,p_session,p_request,auth.uid(),current_review,p_reason) RETURNING * INTO saved;
  DELETE FROM irp_pms.cashier_active_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND session_id=p_session;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_session_closed',p_session,jsonb_build_object('request_id',p_request,'counted_minor',p_counted_minor::text,'variance_minor',current_review->>'variance_minor','reason',p_reason));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.session_id,'request_id',saved.request_id,'actor_id',saved.actor_id,'review',saved.review,'reason',saved.reason,'closed_at',saved.closed_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_close_cashier(uuid,uuid,uuid,uuid,bigint,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_close_cashier(uuid,uuid,uuid,uuid,bigint,jsonb,text,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_retire_cashier_close(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_close_retirements;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_session IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the saved close request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Only the assigned cashier can cancel this close';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Completed close cannot be cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_close_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF saved.session_id IS DISTINCT FROM p_session OR saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cancelled close identity differs';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_close_retirements(tenant_id,property_id,session_id,request_id,actor_id) VALUES(p_tenant,p_property,p_session,p_request,auth.uid()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_close_cancelled',p_session,jsonb_build_object('request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'request_id',p_request,'actor_id',auth.uid(),'retired',true,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_cashier_close(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_cashier_close(uuid,uuid,uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cashier_close_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_closes;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Cashier close request identity required';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_closes WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',saved.session_id,'request_id',saved.request_id,'actor_id',saved.actor_id,'review',saved.review,'reason',saved.reason,'closed_at',saved.closed_at,'replayed',true);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_close_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_close_status(uuid,uuid,uuid) TO authenticated;

-- Source: cashier-report-draft.sql
-- Closed cash declarations, using each session's recorded property time zone.

CREATE FUNCTION public.irp_pms_pilot_cashier_closing_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;rows jsonb;counted numeric;expected numeric;variance numeric;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Choose a closing date range of at most 366 days';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',s.id,'cashier_id',s.cashier_id,'drawer',s.drawer_key,'opened_at',s.opened_at,'closed_at',c.closed_at,'closing_date',(c.closed_at AT TIME ZONE s.time_zone)::date,'time_zone',s.time_zone,'reason',c.reason,'review',c.review) ORDER BY c.closed_at,s.id),'[]'::jsonb),
 coalesce(sum((c.review->>'counted_minor')::numeric),0),coalesce(sum((c.review->>'expected_minor')::numeric),0),coalesce(sum((c.review->>'variance_minor')::numeric),0)
 INTO rows,counted,expected,variance
 FROM irp_pms.cashier_closes c JOIN irp_pms.cashier_sessions s ON s.tenant_id=c.tenant_id AND s.property_id=c.property_id AND s.id=c.session_id
 WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND (member_role IN('owner','manager') OR s.cashier_id=auth.uid())
 AND (c.closed_at AT TIME ZONE s.time_zone)::date>=p_start AND (c.closed_at AT TIME ZONE s.time_zone)::date<p_end;
 IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION 'Narrow the closing date range to at most 1000 sessions';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'starts_on',p_start,'ends_before',p_end,'scope',CASE WHEN member_role IN('owner','manager') THEN 'property' ELSE 'own_sessions' END,'currency','USD','sessions',rows,'session_count',jsonb_array_length(rows),'counted_minor',counted::text,'expected_minor',expected::text,'variance_minor',variance::text,'complete',true,'basis','cashier_close_declarations');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_closing_report(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_closing_report(uuid,uuid,date,date) TO authenticated;

-- Source: cashier-custody-retirement-draft.sql
-- Retire an unrecorded cash custody request; never reverse a recorded movement.

CREATE TABLE irp_pms.cashier_custody_retirements(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,session_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,session_id) REFERENCES irp_pms.cashier_sessions(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_custody_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_custody_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cashier_custody_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_custody_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_retire_cashier_custody(p_tenant uuid,p_property uuid,p_session uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_custody_retirements;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_session IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the saved cash movement';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_sessions WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_session AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Only the assigned cashier can cancel this cash movement';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_custody_events WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Recorded cash movement cannot be cancelled';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_custody_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF saved.session_id IS DISTINCT FROM p_session OR saved.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cancelled cash movement identity differs';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_custody_retirements(tenant_id,property_id,session_id,request_id,actor_id) VALUES(p_tenant,p_property,p_session,p_request,auth.uid()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_custody_cancelled',p_session,jsonb_build_object('request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'session_id',p_session,'request_id',p_request,'actor_id',auth.uid(),'retired',true,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_cashier_custody(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_cashier_custody(uuid,uuid,uuid,uuid,boolean) TO authenticated;

COMMIT;
