BEGIN;
-- Optional property-scoped contact records. No identity documents, tax IDs,
-- card data, messaging, payment processing or cross-property sharing.
CREATE TABLE irp_pms.guest_profiles(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id),updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE INDEX guest_profiles_recent ON irp_pms.guest_profiles(tenant_id,property_id,updated_at DESC,id);
CREATE TABLE irp_pms.reservation_parties(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),guest_id uuid,guest_profile_version bigint,
 contact jsonb NOT NULL CHECK(jsonb_typeof(contact)='object'),billing_party jsonb NOT NULL CHECK(jsonb_typeof(billing_party)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id),updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,reservation_id),FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,guest_id) REFERENCES irp_pms.guest_profiles(tenant_id,property_id,id),
 CHECK((guest_id IS NULL AND guest_profile_version IS NULL) OR (guest_id IS NOT NULL AND guest_profile_version BETWEEN 1 AND 9007199254740991 AND guest_profile_version IS NOT NULL))
);
CREATE TABLE irp_pms.guest_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK(action IN('save_guest_profile','save_reservation_guest')),command_hash text NOT NULL CHECK(command_hash~'^[a-f0-9]{64}$'),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.guest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.reservation_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.guest_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.guest_profiles,irp_pms.reservation_parties,irp_pms.guest_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.guest_profiles,irp_pms.reservation_parties,irp_pms.guest_requests TO service_role;

CREATE FUNCTION irp_pms.normalize_guest_data(p_data jsonb,p_kind text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE allowed text[]:=ARRAY['display_name','legal_name','email','phone','company_name','address_line1','address_line2','city','region','postal_code','country_code'];key text;value text;maximum integer;normalized jsonb:='{}';
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('profile','contact','billing') OR p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>8192 THEN RAISE EXCEPTION 'Provide a bounded guest contact or billing object'; END IF;
 IF p_kind='billing' THEN allowed:=array_remove(allowed,'display_name'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION 'Unknown contact or billing fields are not accepted'; END IF;
 FOREACH key IN ARRAY allowed LOOP
  IF p_data ? key AND jsonb_typeof(p_data->key) NOT IN('string','null') THEN RAISE EXCEPTION 'Contact and billing fields must be strings or null'; END IF;
  value:=nullif(trim(p_data->>key),'');
  maximum:=CASE key WHEN 'email' THEN 254 WHEN 'phone' THEN 40 WHEN 'city' THEN 100 WHEN 'region' THEN 100 WHEN 'postal_code' THEN 32 WHEN 'country_code' THEN 2 ELSE 200 END;
  IF value IS NOT NULL AND (length(value)>maximum OR value~'[[:cntrl:]]') THEN RAISE EXCEPTION 'Contact field % exceeds its length limit or contains control characters',key; END IF;
  IF key='email' AND value IS NOT NULL AND value!~'^[^[:space:]@]+@[^[:space:]@]+$' THEN RAISE EXCEPTION 'Provide a valid bounded email address'; END IF;
  IF key='country_code' AND value IS NOT NULL THEN
   value:=upper(value);IF value!~'^[A-Z]{2}$' THEN RAISE EXCEPTION 'Country code must be two letters'; END IF;
  END IF;
  normalized:=normalized||jsonb_build_object(key,value);
 END LOOP;
 IF p_kind='profile' AND normalized->>'display_name' IS NULL THEN RAISE EXCEPTION 'A reusable guest profile requires a display name'; END IF;
 RETURN normalized;
END $$;
REVOKE ALL ON FUNCTION irp_pms.normalize_guest_data(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_guest_profile(p_tenant uuid,p_property uuid,p_guest uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE guest irp_pms.guest_profiles;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO guest FROM irp_pms.guest_profiles WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_guest;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped guest profile'; END IF;
 RETURN jsonb_build_object('id',guest.id,'version',guest.version,'data',guest.data,'created_at',guest.created_at,'updated_at',guest.updated_at);
END $$;

CREATE FUNCTION public.irp_pms_pilot_search_guests(p_tenant uuid,p_property uuid,p_query text,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE search text:=lower(trim(p_query));matches jsonb;count_found integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF search IS NULL OR length(search)>100 OR search~'[[:cntrl:]]' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Search with 0 to 100 characters and a limit from 1 to 50'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'display_name',g.data->'display_name','legal_name',g.data->'legal_name','email',g.data->'email','phone',g.data->'phone','company_name',g.data->'company_name','updated_at',g.updated_at) ORDER BY g.updated_at DESC,g.id),'[]'::jsonb),count(*) INTO matches,count_found
 FROM (SELECT * FROM irp_pms.guest_profiles WHERE tenant_id=p_tenant AND property_id=p_property AND
  (search='' OR strpos(lower(coalesce(data->>'display_name','')),search)>0 OR strpos(lower(coalesce(data->>'legal_name','')),search)>0 OR strpos(lower(coalesce(data->>'email','')),search)>0 OR strpos(lower(coalesce(data->>'phone','')),search)>0 OR strpos(lower(coalesce(data->>'company_name','')),search)>0)
  ORDER BY updated_at DESC,id LIMIT p_limit+1) g;
 IF count_found>p_limit THEN matches:=matches-p_limit; END IF;
 RETURN jsonb_build_object('guests',matches,'query',trim(p_query),'limit',p_limit,'has_more',count_found>p_limit);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_guest_profile(p_tenant uuid,p_property uuid,p_request uuid,p_guest uuid,p_expected_version bigint,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE guest irp_pms.guest_profiles;prior irp_pms.guest_requests;normalized_data jsonb;hash text;result jsonb;changed boolean;created boolean:=p_guest IS NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR (p_guest IS NULL AND p_expected_version IS NOT NULL) OR (p_guest IS NOT NULL AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991)) THEN RAISE EXCEPTION 'Provide a request and the exact guest version, or null guest/version to create'; END IF;
 normalized_data:=irp_pms.normalize_guest_data(p_data,'profile');
 hash:=encode(sha256(convert_to(jsonb_build_object('action','save_profile','guest_id',p_guest,'expected_version',p_expected_version,'data',normalized_data)::text,'UTF8')),'hex');
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.guest_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'Guest request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_guest IS NULL THEN
  INSERT INTO irp_pms.guest_profiles(tenant_id,property_id,data,created_by,updated_by) VALUES(p_tenant,p_property,normalized_data,auth.uid(),auth.uid()) RETURNING * INTO guest;changed:=true;
 ELSE
  SELECT * INTO guest FROM irp_pms.guest_profiles WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_guest;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped guest profile'; END IF;
  IF guest.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Guest profile changed; refresh before saving' USING ERRCODE='40001'; END IF;
  changed:=guest.data IS DISTINCT FROM normalized_data;
  IF changed THEN UPDATE irp_pms.guest_profiles SET data=normalized_data,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_guest RETURNING * INTO guest; END IF;
 END IF;
 result:=jsonb_build_object('guest_id',guest.id,'version',guest.version,'created',created,'replayed',false);
 INSERT INTO irp_pms.guest_requests(tenant_id,property_id,request_id,actor_id,action,command_hash,result) VALUES(p_tenant,p_property,p_request,auth.uid(),'save_guest_profile',hash,result);
 IF changed THEN INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'guest_profile_saved',guest.id,jsonb_build_object('version',guest.version,'created',created)); END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_reservation_guest(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations;party irp_pms.reservation_parties;recorded boolean;current_guest_version bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO party FROM irp_pms.reservation_parties WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;recorded:=FOUND;
 IF NOT recorded THEN
  -- Earlier reservation APIs accepted control characters in booked names.
  -- Preserve that historical field, but produce a safe editable contact hint.
  party.version:=0;party.contact:=irp_pms.normalize_guest_data(jsonb_build_object('display_name',nullif(trim(regexp_replace(res.guest_name,'[[:cntrl:]]',' ','g')),'')),'contact');party.billing_party:=irp_pms.normalize_guest_data('{}','billing');
 END IF;
 IF party.guest_id IS NOT NULL THEN SELECT version INTO current_guest_version FROM irp_pms.guest_profiles WHERE tenant_id=p_tenant AND property_id=p_property AND id=party.guest_id; END IF;
 RETURN jsonb_build_object('reservation_id',p_reservation,'reservation_name',res.guest_name,'recorded',recorded,'version',party.version,'guest_id',party.guest_id,'guest_profile_version',party.guest_profile_version,'linked_profile_current_version',current_guest_version,'linked_profile_changed',party.guest_id IS NOT NULL AND party.guest_profile_version IS DISTINCT FROM current_guest_version,'contact',party.contact,'billing_party',party.billing_party,'updated_at',party.updated_at);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_reservation_guest(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest uuid,p_guest_expected_version bigint,p_contact jsonb,p_billing_party jsonb,p_keep_existing_contact boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE party irp_pms.reservation_parties;guest irp_pms.guest_profiles;prior irp_pms.guest_requests;contact_data jsonb;billing_data jsonb;hash text;result jsonb;recorded boolean;changed boolean;target_guest uuid:=p_guest;target_guest_version bigint:=p_guest_expected_version;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740991 OR p_keep_existing_contact IS NULL OR
  (p_keep_existing_contact AND (p_guest IS NOT NULL OR p_guest_expected_version IS NOT NULL OR p_contact IS NOT NULL)) OR
  (NOT p_keep_existing_contact AND ((p_guest IS NULL AND (p_guest_expected_version IS NOT NULL OR p_contact IS NULL)) OR
  (p_guest IS NOT NULL AND (p_guest_expected_version IS NULL OR p_guest_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_contact IS NOT NULL)))) THEN RAISE EXCEPTION 'Provide a versioned stay contact, either explicit local contact, a versioned guest profile to copy, or keep the existing saved contact'; END IF;
 IF NOT p_keep_existing_contact AND p_guest IS NULL THEN contact_data:=irp_pms.normalize_guest_data(p_contact,'contact'); END IF;
 billing_data:=irp_pms.normalize_guest_data(p_billing_party,'billing');
 hash:=encode(sha256(convert_to(jsonb_build_object('action','save_reservation_guest','reservation_id',p_reservation,'expected_version',p_expected_version,'guest_id',p_guest,'guest_expected_version',p_guest_expected_version,'contact',contact_data,'billing_party',billing_data,'keep_existing_contact',p_keep_existing_contact)::text,'UTF8')),'hex');
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.guest_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'Guest request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO party FROM irp_pms.reservation_parties WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;recorded:=FOUND;
 IF (CASE WHEN recorded THEN party.version ELSE 0 END) IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Reservation contact or billing changed; refresh before saving' USING ERRCODE='40001'; END IF;
 IF p_keep_existing_contact THEN
  IF NOT recorded THEN RAISE EXCEPTION 'A saved reservation contact is required before keeping it'; END IF;
  contact_data:=party.contact;target_guest:=party.guest_id;target_guest_version:=party.guest_profile_version;
 ELSIF p_guest IS NOT NULL THEN
  SELECT * INTO guest FROM irp_pms.guest_profiles WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_guest;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped guest profile'; END IF;
  IF guest.version IS DISTINCT FROM p_guest_expected_version THEN RAISE EXCEPTION 'Guest profile changed; refresh before linking' USING ERRCODE='40001'; END IF;
  contact_data:=guest.data;
 END IF;
 changed:=NOT recorded OR party.contact IS DISTINCT FROM contact_data OR party.billing_party IS DISTINCT FROM billing_data OR party.guest_id IS DISTINCT FROM target_guest OR party.guest_profile_version IS DISTINCT FROM target_guest_version;
 IF NOT recorded THEN
  INSERT INTO irp_pms.reservation_parties(tenant_id,property_id,reservation_id,guest_id,guest_profile_version,contact,billing_party,created_by,updated_by) VALUES(p_tenant,p_property,p_reservation,target_guest,target_guest_version,contact_data,billing_data,auth.uid(),auth.uid()) RETURNING * INTO party;
 ELSIF changed THEN
  UPDATE irp_pms.reservation_parties SET guest_id=target_guest,guest_profile_version=target_guest_version,contact=contact_data,billing_party=billing_data,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation RETURNING * INTO party;
 END IF;
 result:=jsonb_build_object('reservation_id',p_reservation,'version',party.version,'guest_id',party.guest_id,'guest_profile_version',party.guest_profile_version,'replayed',false);
 INSERT INTO irp_pms.guest_requests(tenant_id,property_id,request_id,actor_id,action,command_hash,result) VALUES(p_tenant,p_property,p_request,auth.uid(),'save_reservation_guest',hash,result);
 IF changed THEN INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_guest_saved',p_reservation,jsonb_build_object('version',party.version,'guest_id',party.guest_id,'guest_profile_version',party.guest_profile_version)); END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_guest_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt irp_pms.guest_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A guest request identity is required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO receipt FROM irp_pms.guest_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 RETURN jsonb_build_object('found',true,'action',receipt.action,'result',receipt.result);
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_guest_profile(uuid,uuid,uuid),public.irp_pms_pilot_search_guests(uuid,uuid,text,integer),public.irp_pms_pilot_save_guest_profile(uuid,uuid,uuid,uuid,bigint,jsonb),public.irp_pms_pilot_reservation_guest(uuid,uuid,uuid),public.irp_pms_pilot_save_reservation_guest(uuid,uuid,uuid,uuid,bigint,uuid,bigint,jsonb,jsonb,boolean),public.irp_pms_pilot_guest_request_status(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_guest_profile(uuid,uuid,uuid),public.irp_pms_pilot_search_guests(uuid,uuid,text,integer),public.irp_pms_pilot_save_guest_profile(uuid,uuid,uuid,uuid,bigint,jsonb),public.irp_pms_pilot_reservation_guest(uuid,uuid,uuid),public.irp_pms_pilot_save_reservation_guest(uuid,uuid,uuid,uuid,bigint,uuid,bigint,jsonb,jsonb,boolean),public.irp_pms_pilot_guest_request_status(uuid,uuid,uuid) TO authenticated;
COMMIT;
