BEGIN;
CREATE FUNCTION public.irp_pms_pilot_cashier_bank_ledger_mappings(p_tenant uuid,p_property uuid,p_bank uuid,p_before uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entries jsonb;more boolean;cursor_id uuid;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_bank IS NULL OR NOT EXISTS(SELECT 1 FROM irp_pms.cashier_bank_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_bank) THEN RAISE EXCEPTION 'Bank account not found';END IF;
 WITH candidates AS(
 SELECT m.*,jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'active',c.active) AS custody,jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'active',t.active) AS transit,jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'active',b.active) AS bank_ledger,(c.active AND t.active AND b.active) AS usable
 FROM irp_pms.cashier_bank_ledger_mappings m JOIN irp_pms.gl_accounts c ON c.tenant_id=m.tenant_id AND c.property_id=m.property_id AND c.id=m.custody_account JOIN irp_pms.gl_accounts t ON t.tenant_id=m.tenant_id AND t.property_id=m.property_id AND t.id=m.transit_account JOIN irp_pms.gl_accounts b ON b.tenant_id=m.tenant_id AND b.property_id=m.property_id AND b.id=m.bank_account WHERE m.tenant_id=p_tenant AND m.property_id=p_property AND m.bank_id=p_bank AND (p_before IS NULL OR m.id<p_before) ORDER BY m.id DESC LIMIT 51
 ),page AS(SELECT * FROM candidates ORDER BY id DESC LIMIT 50)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id DESC) FROM page p),'[]'::jsonb),(SELECT count(*)>50 FROM candidates),(SELECT id FROM page ORDER BY id LIMIT 1) INTO entries,more,cursor_id;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'bank_id',p_bank,'entries',entries,'has_more',more,'next_cursor',CASE WHEN more THEN cursor_id END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cashier_bank_ledger_mappings(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cashier_bank_ledger_mappings(uuid,uuid,uuid,uuid) TO authenticated;
COMMIT;
