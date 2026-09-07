BEGIN;
-- Memberships apply across all properties in an organization. This surface only
-- links existing confirmed accounts; it does not create accounts or send email.
CREATE TABLE irp_pms.membership_requests(
 tenant_id uuid NOT NULL REFERENCES irp_pms.tenants(id),request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),payload jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,request_id)
);
ALTER TABLE irp_pms.membership_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.membership_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON irp_pms.membership_requests TO service_role;

CREATE FUNCTION irp_pms.pilot_require_owner(p_tenant uuid,p_property uuid,p_lock boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Organization owner access required' USING ERRCODE='42501'; END IF;
 IF p_lock THEN
  -- The organization lock serializes operations even from different properties.
  PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR UPDATE;
  IF irp_pms.pilot_require(p_tenant,p_property) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Organization owner access required' USING ERRCODE='42501'; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION irp_pms.pilot_require_owner(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_staff(p_tenant uuid,p_property uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require_owner(p_tenant,p_property,false);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role,'is_self',m.user_id=auth.uid()) ORDER BY m.role,u.email,m.user_id)
 FROM irp_pms.memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.tenant_id=p_tenant),'[]'::jsonb);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_member(p_tenant uuid,p_property uuid,p_request uuid,p_email text,p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE normalized_email text:=lower(trim(p_email)); command jsonb; prior irp_pms.membership_requests;
 target_user uuid; target_email text; previous_role text; matches integer; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require_owner(p_tenant,p_property);
 IF p_request IS NULL OR normalized_email IS NULL OR length(normalized_email) NOT BETWEEN 3 AND 320 OR position('@' IN normalized_email)<2 OR p_role IS NULL OR p_role NOT IN('staff','manager') THEN RAISE EXCEPTION 'A request identity, email and staff or manager role are required'; END IF;
 command:=jsonb_build_object('action','save','property_id',p_property,'email',normalized_email,'role',p_role);
 SELECT * INTO prior FROM irp_pms.membership_requests WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Membership request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT count(*) INTO matches FROM auth.users WHERE lower(email)=normalized_email AND email_confirmed_at IS NOT NULL;
 IF matches<>1 THEN RAISE EXCEPTION 'One existing confirmed account must match this email'; END IF;
 SELECT id,email INTO STRICT target_user,target_email FROM auth.users WHERE lower(email)=normalized_email AND email_confirmed_at IS NOT NULL FOR KEY SHARE;
 SELECT role INTO previous_role FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=target_user;
 IF previous_role='owner' THEN RAISE EXCEPTION 'An owner cannot be downgraded through staff management'; END IF;
 INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES(p_tenant,target_user,p_role)
 ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role;
 result:=jsonb_build_object('user_id',target_user,'email',target_email,'role',p_role,'replayed',false);
 INSERT INTO irp_pms.membership_requests(tenant_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_request,auth.uid(),command,result);
 IF previous_role IS DISTINCT FROM p_role THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details)
  VALUES(p_tenant,p_property,auth.uid(),'membership_saved',target_user,jsonb_build_object('role',p_role,'previous_role',previous_role));
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_remove_member(p_tenant uuid,p_property uuid,p_request uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb; prior irp_pms.membership_requests; previous_role text; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require_owner(p_tenant,p_property);
 IF p_request IS NULL OR p_user IS NULL THEN RAISE EXCEPTION 'Request and user identities are required'; END IF;
 command:=jsonb_build_object('action','remove','property_id',p_property,'user_id',p_user);
 SELECT * INTO prior FROM irp_pms.membership_requests WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Membership request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT role INTO previous_role FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=p_user;
 IF previous_role='owner' AND (SELECT count(*) FROM irp_pms.memberships WHERE tenant_id=p_tenant AND role='owner')<=1 THEN RAISE EXCEPTION 'The last organization owner cannot be removed'; END IF;
 DELETE FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=p_user;
 result:=jsonb_build_object('user_id',p_user,'removed',previous_role IS NOT NULL,'replayed',false);
 INSERT INTO irp_pms.membership_requests(tenant_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_request,auth.uid(),command,result);
 IF previous_role IS NOT NULL THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details)
  VALUES(p_tenant,p_property,auth.uid(),'membership_removed',p_user,jsonb_build_object('previous_role',previous_role));
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_staff(uuid,uuid),public.irp_pms_pilot_save_member(uuid,uuid,uuid,text,text),public.irp_pms_pilot_remove_member(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_staff(uuid,uuid),public.irp_pms_pilot_save_member(uuid,uuid,uuid,text,text),public.irp_pms_pilot_remove_member(uuid,uuid,uuid,uuid) TO authenticated;
COMMIT;
