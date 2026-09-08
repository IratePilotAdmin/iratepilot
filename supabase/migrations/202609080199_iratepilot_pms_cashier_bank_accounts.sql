BEGIN;
CREATE TABLE irp_pms.cashier_bank_accounts(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,code text NOT NULL CHECK(code~'^[a-z0-9][a-z0-9_-]{1,39}$'),
 label text NOT NULL CHECK(label=trim(label) AND length(label) BETWEEN 2 AND 80 AND label !~ '[[:cntrl:]]'),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,code),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE UNIQUE INDEX cashier_bank_account_label ON irp_pms.cashier_bank_accounts(tenant_id,property_id,lower(label));
ALTER TABLE irp_pms.cashier_bank_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_accounts FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_accounts FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_register_cashier_bank_account(p_tenant uuid,p_property uuid,p_request uuid,p_code text,p_label text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_accounts;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_code IS NULL OR p_code !~ '^[a-z0-9][a-z0-9_-]{1,39}$' OR p_label IS NULL OR p_label<>trim(p_label) OR length(p_label) NOT BETWEEN 2 AND 80 OR p_label~'[[:cntrl:]]' OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm valid bank account code and nickname';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.created_by IS DISTINCT FROM auth.uid() OR saved.code IS DISTINCT FROM p_code OR saved.label IS DISTINCT FROM p_label THEN RAISE EXCEPTION 'Bank account request has different details';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_bank_accounts VALUES(p_tenant,p_property,p_request,p_code,p_label,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_account_registered',p_request,jsonb_build_object('code',p_code));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.created_by,'account_id',saved.id,'code',saved.code,'label',saved.label,'currency','USD','created_at',saved.created_at,'replayed',replayed,'bank_connected',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_register_cashier_bank_account(uuid,uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_register_cashier_bank_account(uuid,uuid,uuid,text,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_accounts(p_tenant uuid,p_property uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;more boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 WITH candidates AS(SELECT * FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 51),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('account_id',id,'code',code,'label',label) ORDER BY id DESC) FROM page),'[]'::jsonb),(SELECT count(*)>50 FROM candidates) INTO entries,more;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'currency','USD','bank_connected',false,'entries',entries,'next_before',CASE WHEN more THEN entries->49->>'account_id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_accounts(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_accounts(uuid,uuid,uuid) TO authenticated;
CREATE TABLE irp_pms.cashier_bank_deposit_accounts(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,deposit_id uuid NOT NULL,account_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,deposit_id),FOREIGN KEY(tenant_id,property_id,deposit_id) REFERENCES irp_pms.cashier_bank_deposits(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.cashier_bank_accounts(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_deposit_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_deposit_accounts FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_deposit_accounts FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_declare_cashier_account_deposit(p_tenant uuid,p_property uuid,p_request uuid,p_allocations jsonb,p_bank_account uuid,p_deposit_reference text,p_deposit_date date,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account irp_pms.cashier_bank_accounts;linked uuid;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_bank_account IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'Choose a configured bank account';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO account FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_bank_account;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bank account not found in this property';END IF;
 SELECT account_id INTO linked FROM irp_pms.cashier_bank_deposit_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_request;
 IF linked IS NOT NULL AND linked<>p_bank_account THEN RAISE EXCEPTION 'Deposit request has a different bank account';END IF;
 IF linked IS NULL AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Historical deposit needs an explicit account assignment';END IF;
 IF linked IS NULL AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_accounts a JOIN irp_pms.cashier_bank_deposits d ON d.tenant_id=a.tenant_id AND d.property_id=a.property_id AND d.id=a.deposit_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.account_id=p_bank_account AND a.deposit_id<>p_request AND lower(d.deposit_reference)=lower(p_deposit_reference) AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE v.tenant_id=d.tenant_id AND v.property_id=d.property_id AND v.deposit_id=d.id)) THEN RAISE EXCEPTION 'Deposit reference already assigned to this bank account';END IF;
 receipt:=public.irp_pms_pilot_declare_cashier_bank_deposit_batch(p_tenant,p_property,p_request,p_allocations,account.label,p_deposit_reference,p_deposit_date,p_reason,p_confirmed);
 IF linked IS NULL THEN INSERT INTO irp_pms.cashier_bank_deposit_accounts VALUES(p_tenant,p_property,p_request,p_bank_account,auth.uid(),clock_timestamp());END IF;
 RETURN receipt||jsonb_build_object('bank_account_id',p_bank_account);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_declare_cashier_account_deposit(uuid,uuid,uuid,jsonb,uuid,text,date,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_declare_cashier_account_deposit(uuid,uuid,uuid,jsonb,uuid,text,date,text,boolean) TO authenticated;
-- Only the account-bound entry point may create new deposits after this upgrade.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit_batch(uuid,uuid,uuid,jsonb,text,text,date,text,boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_declare_cashier_bank_deposit(uuid,uuid,uuid,uuid,bigint,text,text,date,text,boolean) FROM authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_account_deposit_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE status jsonb;linked uuid;
BEGIN
 status:=public.irp_pms_pilot_cashier_bank_deposit_status(p_tenant,p_property,p_request);
 IF (status->>'found')::boolean THEN
  SELECT account_id INTO linked FROM irp_pms.cashier_bank_deposit_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_request;
  status:=jsonb_set(status,'{result}',(status->'result')||jsonb_build_object('bank_account_id',linked));
 END IF;
 RETURN status;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_account_deposit_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_account_deposit_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_account_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_accounts;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Account request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND created_by=auth.uid();
 IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.created_by,'account_id',saved.id,'code',saved.code,'label',saved.label,'currency','USD','created_at',saved.created_at,'replayed',true,'bank_connected',false);END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_account_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_account_status(uuid,uuid,uuid) TO authenticated;
CREATE TABLE irp_pms.cashier_bank_account_assignments(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,deposit_id uuid NOT NULL,account_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL CHECK(reason=trim(reason) AND length(reason) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,deposit_id),FOREIGN KEY(tenant_id,property_id,deposit_id) REFERENCES irp_pms.cashier_bank_deposit_accounts(tenant_id,property_id,deposit_id),FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.cashier_bank_accounts(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cashier_bank_account_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_account_assignments FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_account_assignments FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_assign_cashier_deposit_account(p_tenant uuid,p_property uuid,p_deposit uuid,p_account uuid,p_request uuid,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_account_assignments;deposit irp_pms.cashier_bank_deposits;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_deposit IS NULL OR p_account IS NULL OR p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Confirm the bank assignment and explanation';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.cashier_bank_account_assignments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.deposit_id IS DISTINCT FROM p_deposit OR saved.account_id IS DISTINCT FROM p_account OR saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Account assignment request has different details';END IF;
 ELSE
  SELECT * INTO deposit FROM irp_pms.cashier_bank_deposits WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_deposit;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit not found';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_account) THEN RAISE EXCEPTION 'Bank account not found';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_deposit) THEN RAISE EXCEPTION 'Deposit already has a bank account';END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids WHERE tenant_id=p_tenant AND property_id=p_property AND deposit_id=p_deposit) AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_accounts a JOIN irp_pms.cashier_bank_deposits d ON d.tenant_id=a.tenant_id AND d.property_id=a.property_id AND d.id=a.deposit_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.account_id=p_account AND lower(d.deposit_reference)=lower(deposit.deposit_reference) AND NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_deposit_voids v WHERE v.tenant_id=d.tenant_id AND v.property_id=d.property_id AND v.deposit_id=d.id)) THEN RAISE EXCEPTION 'Deposit reference already assigned to this bank account';END IF;
  INSERT INTO irp_pms.cashier_bank_deposit_accounts VALUES(p_tenant,p_property,p_deposit,p_account,auth.uid(),clock_timestamp());
  INSERT INTO irp_pms.cashier_bank_account_assignments VALUES(p_tenant,p_property,p_request,p_deposit,p_account,auth.uid(),p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_deposit_account_assigned',p_deposit,jsonb_build_object('request_id',p_request,'account_id',p_account));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'request_id',saved.request_id,'deposit_id',saved.deposit_id,'account_id',saved.account_id,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed,'bank_verified',false,'journal_posted',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_assign_cashier_deposit_account(uuid,uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_assign_cashier_deposit_account(uuid,uuid,uuid,uuid,uuid,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_cashier_deposit_account_assignment_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_account_assignments;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Assignment request required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO saved FROM irp_pms.cashier_bank_account_assignments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',saved.actor_id,'request_id',saved.request_id,'deposit_id',saved.deposit_id,'account_id',saved.account_id,'reason',saved.reason,'created_at',saved.created_at,'replayed',true,'bank_verified',false,'journal_posted',false);END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_deposit_account_assignment_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_deposit_account_assignment_status(uuid,uuid,uuid) TO authenticated;
DO $patch$
DECLARE definition text;needle text:=$needle$'amount_minor',p.amount_minor::text,'status'$needle$;replacement text:=$replacement$'bank_account_id',(SELECT a.account_id FROM irp_pms.cashier_bank_deposit_accounts a WHERE a.tenant_id=p.tenant_id AND a.property_id=p.property_id AND a.deposit_id=p.id),'bank_account_label',(SELECT b.label FROM irp_pms.cashier_bank_deposit_accounts a JOIN irp_pms.cashier_bank_accounts b ON b.tenant_id=a.tenant_id AND b.property_id=a.property_id AND b.id=a.account_id WHERE a.tenant_id=p.tenant_id AND a.property_id=p.property_id AND a.deposit_id=p.id),'amount_minor',p.amount_minor::text,'status'$replacement$;
BEGIN
 SELECT pg_get_functiondef('public.irp_pms_pilot_cashier_bank_deposits(uuid,uuid,uuid)'::regprocedure) INTO definition;
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Unexpected deposit register definition';END IF;
 EXECUTE replace(definition,needle,replacement);
END $patch$;
CREATE TABLE irp_pms.cashier_bank_action_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('setup','assignment')),request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,kind,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_bank_action_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_bank_action_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_bank_action_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.cashier_bank_action_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_bank_action_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND kind=TG_ARGV[0] AND request_id=(to_jsonb(NEW)->>TG_ARGV[1])::uuid) THEN RAISE EXCEPTION 'Bank action request was cancelled';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_bank_action_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_bank_accounts FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_bank_action_cancel_guard('setup','id');
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_bank_account_assignments FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_bank_action_cancel_guard('assignment','request_id');
CREATE FUNCTION public.irp_pms_pilot_cancel_cashier_bank_action(p_tenant uuid,p_property uuid,p_request uuid,p_kind text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_bank_action_cancellations;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN('setup','assignment') OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded bank action';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF (p_kind='setup' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request)) OR (p_kind='assignment' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_account_assignments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request)) THEN RAISE EXCEPTION 'Bank action already recorded; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_bank_action_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND kind=p_kind AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_bank_action_cancellations VALUES(p_tenant,p_property,p_kind,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_bank_action_cancelled',p_request,jsonb_build_object('kind',p_kind));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind',p_kind,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_cashier_bank_action(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_cashier_bank_action(uuid,uuid,uuid,text,boolean) TO authenticated;
COMMIT;
