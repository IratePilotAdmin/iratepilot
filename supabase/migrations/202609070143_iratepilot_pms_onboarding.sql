BEGIN;
CREATE TABLE irp_pms.onboarding_requests(
 request_id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES auth.users(id),
 tenant_name text NOT NULL,property_name text NOT NULL,
 tenant_id uuid NOT NULL REFERENCES irp_pms.tenants(id),property_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.onboarding_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.onboarding_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON irp_pms.onboarding_requests TO service_role;
CREATE FUNCTION irp_pms.onboard_hotel(p_request uuid,p_owner uuid,p_tenant_name text,p_property_name text)
RETURNS irp_pms.onboarding_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt irp_pms.onboarding_requests; new_tenant uuid; new_property uuid;
BEGIN
 IF p_request IS NULL OR p_owner IS NULL OR p_tenant_name IS NULL OR p_property_name IS NULL OR length(trim(p_tenant_name)) NOT BETWEEN 1 AND 200 OR length(trim(p_property_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid hotel onboarding request'; END IF;
 -- Same request is serialized across sessions. A hash collision only adds waiting.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO receipt FROM irp_pms.onboarding_requests WHERE request_id=p_request;
 IF FOUND THEN
  IF receipt.owner_id=p_owner AND receipt.tenant_name=trim(p_tenant_name) AND receipt.property_name=trim(p_property_name) THEN RETURN receipt; END IF;
  RAISE EXCEPTION 'Onboarding request identity already used';
 END IF;
 PERFORM 1 FROM auth.users WHERE id=p_owner FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Existing authenticated user required'; END IF;
 INSERT INTO irp_pms.tenants(name) VALUES(trim(p_tenant_name)) RETURNING id INTO new_tenant;
 INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(new_tenant,p_owner,'owner');
 INSERT INTO irp_pms.properties(tenant_id,name,currency) VALUES(new_tenant,trim(p_property_name),'USD') RETURNING id INTO new_property;
 INSERT INTO irp_pms.onboarding_requests(request_id,owner_id,tenant_name,property_name,tenant_id,property_id)
 VALUES(p_request,p_owner,trim(p_tenant_name),trim(p_property_name),new_tenant,new_property) RETURNING * INTO receipt;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION irp_pms.onboard_hotel(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION irp_pms.onboard_hotel(uuid,uuid,text,text) TO service_role;
COMMIT;
