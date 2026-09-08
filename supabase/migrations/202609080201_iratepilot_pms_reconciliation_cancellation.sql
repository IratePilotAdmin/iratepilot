BEGIN;
CREATE TABLE irp_pms.cashier_reconciliation_action_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('statement','match','reversal','statement_void')),request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,kind,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.cashier_reconciliation_action_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cashier_reconciliation_action_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.cashier_reconciliation_action_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.cashier_reconciliation_action_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.cashier_reconciliation_action_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND kind=TG_ARGV[0] AND request_id=(to_jsonb(NEW)->>TG_ARGV[1])::uuid) THEN RAISE EXCEPTION 'Bank action request was cancelled';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.cashier_reconciliation_action_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_bank_statement_entries FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_reconciliation_action_cancel_guard('statement','id');
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_bank_matches FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_reconciliation_action_cancel_guard('match','id');
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_bank_match_reversals FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_reconciliation_action_cancel_guard('reversal','request_id');
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.cashier_bank_statement_voids FOR EACH ROW EXECUTE FUNCTION irp_pms.cashier_reconciliation_action_cancel_guard('statement_void','request_id');
CREATE FUNCTION public.irp_pms_pilot_cancel_cashier_reconciliation_action(p_tenant uuid,p_property uuid,p_request uuid,p_kind text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.cashier_reconciliation_action_cancellations;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN('statement','match','reversal','statement_void') OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded bank action';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF (p_kind='statement' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_entries WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request)) OR (p_kind='match' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_matches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request)) OR (p_kind='reversal' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_match_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request)) OR (p_kind='statement_void' AND EXISTS(SELECT 1 FROM irp_pms.cashier_bank_statement_voids WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request)) THEN RAISE EXCEPTION 'Reconciliation action already recorded; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.cashier_reconciliation_action_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND kind=p_kind AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.cashier_reconciliation_action_cancellations VALUES(p_tenant,p_property,p_kind,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cashier_reconciliation_action_cancelled',p_request,jsonb_build_object('kind',p_kind));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind',p_kind,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_cashier_reconciliation_action(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_cashier_reconciliation_action(uuid,uuid,uuid,text,boolean) TO authenticated;
COMMIT;
