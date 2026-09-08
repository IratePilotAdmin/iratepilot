BEGIN;
-- Custody declarations only. A declaration does not verify a bank receipt or post GL.
CREATE TABLE irp_pms.cashier_bank_deposits(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,
 handoff_id uuid,allocations jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 bank_label text NOT NULL CHECK(bank_label=trim(bank_label) AND length(bank_label) BETWEEN 2 AND 80 AND bank_label !~ '[[:cntrl:]]'),
 deposit_reference text NOT NULL CHECK(deposit_reference=trim(deposit_reference) AND length(deposit_reference) BETWEEN 2 AND 120 AND deposit_reference !~ '[[:cntrl:]]'),
 deposit_date date NOT NULL,reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,handoff_id) REFERENCES irp_pms.cashier_handoffs(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.cashier_bank_deposit_allocations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,deposit_id uuid NOT NULL,handoff_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 PRIMARY KEY(tenant_id,property_id,deposit_id,handoff_id),
 FOREIGN KEY(tenant_id,property_id,deposit_id) REFERENCES irp_pms.cashier_bank_deposits(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,handoff_id) REFERENCES irp_pms.cashier_handoffs(tenant_id,property_id,id)
);
CREATE INDEX cashier_bank_deposit_source ON irp_pms.cashier_bank_deposit_allocations(tenant_id,property_id,handoff_id);
ALTER TABLE irp_pms.cashier_bank_deposit_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_deposit_allocations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_deposit_allocations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TABLE irp_pms.cashier_bank_deposit_voids(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,deposit_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,deposit_id),UNIQUE(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,deposit_id) REFERENCES irp_pms.cashier_bank_deposits(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_deposit_voids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_deposit_voids FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_deposit_voids FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE INDEX cashier_bank_deposit_reference ON irp_pms.cashier_bank_deposits(tenant_id,property_id,lower(bank_label),lower(deposit_reference));
ALTER TABLE irp_pms.cashier_bank_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_deposits FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_deposits FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit_batch(p_tenant uuid,p_property uuid,p_request uuid,p_allocations jsonb,p_bank_label text,p_deposit_reference text,p_deposit_date date,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h irp_pms.cashier_handoffs;saved irp_pms.cashier_bank_deposits;reserved numeric;replayed boolean;today date;p_handoff uuid;p_amount_minor bigint;line jsonb;normalized jsonb;line_amount bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' THEN RAISE EXCEPTION 'Deposit allocations must be an array';END IF;
 IF jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Provide 1 to 100 deposit allocations';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  IF jsonb_typeof(line)<>'object' THEN RAISE EXCEPTION 'Invalid deposit allocation';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(line))<>2 OR jsonb_typeof(line->'handoff_id') IS DISTINCT FROM 'string' OR coalesce(line->>'handoff_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' OR jsonb_typeof(line->'amount_minor') IS DISTINCT FROM 'string' OR coalesce(line->>'amount_minor','') !~ '^[1-9][0-9]{0,11}$' THEN RAISE EXCEPTION 'Invalid deposit allocation';END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'handoff_id') FROM jsonb_array_elements(p_allocations))<>jsonb_array_length(p_allocations) THEN RAISE EXCEPTION 'Duplicate cash source in deposit';END IF;
 SELECT jsonb_agg(value ORDER BY value->>'handoff_id'),sum((value->>'amount_minor')::bigint) INTO normalized,p_amount_minor FROM jsonb_array_elements(p_allocations);
 p_handoff:=CASE WHEN jsonb_array_length(normalized)=1 THEN (normalized->0->>'handoff_id')::uuid ELSE NULL END;
 IF p_request IS NULL OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR p_confirmed IS DISTINCT FROM true OR p_bank_label IS NULL OR p_bank_label<>trim(p_bank_label) OR length(p_bank_label) NOT BETWEEN 2 AND 80 OR p_bank_label~'[[:cntrl:]]' OR p_deposit_reference IS NULL OR p_deposit_reference<>trim(p_deposit_reference) OR length(p_deposit_reference) NOT BETWEEN 2 AND 120 OR p_deposit_reference~'[[:cntrl:]]' OR p_deposit_date IS NULL OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm valid bank deposit details';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.allocations IS DISTINCT FROM normalized OR saved.amount_minor IS DISTINCT FROM p_amount_minor OR saved.bank_label IS DISTINCT FROM p_bank_label OR saved.deposit_reference IS DISTINCT FROM p_deposit_reference OR saved.deposit_date IS DISTINCT FROM p_deposit_date OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Deposit request has different details';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposits d WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND lower(d.bank_label)=lower(p_bank_label) AND lower(d.deposit_reference)=lower(p_deposit_reference) AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE v.tenant_id=d.tenant_id AND v.property_id=d.property_id AND v.deposit_id=d.id)) THEN RAISE EXCEPTION 'Deposit reference already recorded';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property AND paused) THEN RAISE EXCEPTION 'Cashier activity is paused';END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
  line_amount:=(line->>'amount_minor')::bigint;
  SELECT * INTO h FROM irp_pms.cashier_handoffs WHERE tenant_id=p_tenant AND property_id=p_property AND id=(line->>'handoff_id')::uuid;
  IF NOT FOUND OR h.receiver_id<>auth.uid() THEN RAISE EXCEPTION 'Only the cash receiver can declare this deposit';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_handoff_resolutions WHERE tenant_id=p_tenant AND property_id=p_property AND handoff_id=(line->>'handoff_id')::uuid AND outcome='accepted') THEN RAISE EXCEPTION 'Accept custody of the cash before declaring a deposit';END IF;
  SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO today FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
  IF p_deposit_date>today OR p_deposit_date<(h.created_at AT TIME ZONE (SELECT time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property))::date THEN RAISE EXCEPTION 'Deposit date must be between the handoff date and today';END IF;
  SELECT coalesce(sum(amount_minor),0) INTO reserved FROM irp_pms.cashier_bank_deposit_allocations a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.handoff_id=(line->>'handoff_id')::uuid AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE v.tenant_id=a.tenant_id AND v.property_id=a.property_id AND v.deposit_id=a.deposit_id);
  IF reserved+line_amount>h.amount_minor THEN RAISE EXCEPTION 'Deposit exceeds the unassigned received cash';END IF;
  END LOOP;
  INSERT INTO irp_pms.cashier_bank_deposits(tenant_id,property_id,id,handoff_id,allocations,actor_id,amount_minor,bank_label,deposit_reference,deposit_date,reason) VALUES(p_tenant,p_property,p_request,p_handoff,normalized,auth.uid(),p_amount_minor,p_bank_label,p_deposit_reference,p_deposit_date,p_reason) RETURNING * INTO saved;
  INSERT INTO irp_pms.cashier_bank_deposit_allocations SELECT p_tenant,p_property,p_request,(value->>'handoff_id')::uuid,(value->>'amount_minor')::bigint FROM jsonb_array_elements(normalized);
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_deposit_declared',p_request,jsonb_build_object('handoff_id',p_handoff,'amount_minor',p_amount_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'request_id',saved.id,'handoff_id',saved.handoff_id,'allocations',saved.allocations,'amount_minor',saved.amount_minor::text,'bank_label',saved.bank_label,'deposit_reference',saved.deposit_reference,'deposit_date',saved.deposit_date,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed,'bank_verified',false,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit_batch(uuid,uuid,uuid,jsonb,text,text,date,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit_batch(uuid,uuid,uuid,jsonb,text,text,date,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit(p_tenant uuid,p_property uuid,p_handoff uuid,p_request uuid,p_amount_minor bigint,p_bank_label text,p_deposit_reference text,p_deposit_date date,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT public.irp_pms_pilot_declare_cashier_bank_deposit_batch(p_tenant,p_property,p_request,jsonb_build_array(jsonb_build_object('handoff_id',p_handoff::text,'amount_minor',p_amount_minor::text)),p_bank_label,p_deposit_reference,p_deposit_date,p_reason,p_confirmed)
$$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit(uuid,uuid,uuid,uuid,bigint,text,text,date,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit(uuid,uuid,uuid,uuid,bigint,text,text,date,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_deposit_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_deposits;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Deposit request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
 IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'request_id',saved.id,'handoff_id',saved.handoff_id,'allocations',saved.allocations,'amount_minor',saved.amount_minor::text,'bank_label',saved.bank_label,'deposit_reference',saved.deposit_reference,'deposit_date',saved.deposit_date,'reason',saved.reason,'created_at',saved.created_at,'replayed',true,'bank_verified',false,'journal_posted',false);END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_deposit_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_deposit_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_deposits(p_tenant uuid,p_property uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;entries jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 WITH candidates AS (
  SELECT d.*,v.reason AS void_reason,v.actor_id AS void_actor,v.created_at AS voided_at FROM irp_pms.cashier_bank_deposits d LEFT JOIN irp_pms.cashier_bank_deposit_voids v ON v.tenant_id=d.tenant_id AND v.property_id=d.property_id AND v.deposit_id=d.id WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND (member_role IN('owner','manager') OR d.actor_id=auth.uid()) AND (p_before IS NULL OR d.id<p_before) ORDER BY d.id DESC LIMIT 51
 ),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg((to_jsonb(p)||jsonb_build_object('amount_minor',p.amount_minor::text,'status',CASE WHEN p.void_actor IS NULL THEN 'declared' ELSE 'voided' END,'bank_verified',false,'journal_posted',false)) ORDER BY p.id DESC) FROM page p),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'currency','USD','scope',CASE WHEN member_role IN('owner','manager') THEN 'property' ELSE 'own' END,'live_view',true,'entries',entries,'next_before',CASE WHEN more THEN entries->49->>'id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_deposits(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_deposits(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_deposit_sources(p_tenant uuid,p_property uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;more boolean;zone text;today date;is_paused boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT time_zone INTO zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;today:=(clock_timestamp() AT TIME ZONE zone)::date;
 SELECT EXISTS(SELECT 1 FROM irp_pms.cashier_controls WHERE tenant_id=p_tenant AND property_id=p_property AND paused) INTO is_paused;
 WITH candidates AS (
  SELECT h.id,h.amount_minor,h.created_at,h.amount_minor-coalesce(a.assigned,0) AS available
  FROM irp_pms.cashier_handoffs h JOIN irp_pms.cashier_handoff_resolutions r ON r.tenant_id=h.tenant_id AND r.property_id=h.property_id AND r.handoff_id=h.id AND r.outcome='accepted'
  LEFT JOIN LATERAL (SELECT sum(amount_minor) AS assigned FROM irp_pms.cashier_bank_deposit_allocations x WHERE x.tenant_id=h.tenant_id AND x.property_id=h.property_id AND x.handoff_id=h.id AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE v.tenant_id=x.tenant_id AND v.property_id=x.property_id AND v.deposit_id=x.deposit_id)) a ON true
  WHERE h.tenant_id=p_tenant AND h.property_id=p_property AND h.receiver_id=auth.uid() AND (p_before IS NULL OR h.id<p_before) AND h.amount_minor>coalesce(a.assigned,0)
  ORDER BY h.id DESC LIMIT 51
 ),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('handoff_id',id,'received_minor',amount_minor::text,'available_minor',available::text,'earliest_deposit_date',(created_at AT TIME ZONE zone)::date) ORDER BY id DESC) FROM page),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'currency','USD','today',today,'paused',is_paused,'entries',entries,'next_before',CASE WHEN more THEN entries->49->>'handoff_id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_deposit_sources(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_deposit_sources(uuid,uuid,uuid) TO authenticated;
CREATE TABLE irp_pms.cashier_bank_deposit_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_bank_deposit_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_deposit_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_deposit_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.cashier_bank_deposit_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.id) THEN RAISE EXCEPTION 'Deposit request was cancelled; review cash deposits with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_bank_deposit_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_bank_deposits FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_bank_deposit_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_cashier_bank_deposit_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_deposit_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded deposit request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Deposit already recorded; recover the saved deposit';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_deposit_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Deposit cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_bank_deposit_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_deposit_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_cashier_bank_deposit_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_cashier_bank_deposit_request(uuid,uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_void_cashier_bank_deposit(p_tenant uuid,p_property uuid,p_deposit uuid,p_request uuid,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_deposit_voids;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_deposit IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm the deposit void and explanation';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.deposit_id IS DISTINCT FROM p_deposit OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Void request has different details';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_deposit) THEN RAISE EXCEPTION 'Deposit not found';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_deposit) THEN RAISE EXCEPTION 'Deposit already voided';END IF;
  INSERT INTO irp_pms.cashier_bank_deposit_voids VALUES(p_tenant,p_property,p_deposit,p_request,auth.uid(),p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_deposit_voided',p_deposit,jsonb_build_object('request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'deposit_id',saved.deposit_id,'request_id',saved.request_id,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed,'voided',true,'cash_recovered',false,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_void_cashier_bank_deposit(uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_void_cashier_bank_deposit(uuid,uuid,uuid,uuid,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_deposit_void_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_deposit_voids;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Void request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'deposit_id',saved.deposit_id,'request_id',saved.request_id,'reason',saved.reason,'created_at',saved.created_at,'replayed',true,'voided',true,'cash_recovered',false,'journal_posted',false);END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_deposit_void_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_deposit_void_status(uuid,uuid,uuid) TO authenticated;
COMMIT;
