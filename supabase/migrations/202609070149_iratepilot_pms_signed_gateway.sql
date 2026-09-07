BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE irp_pms.gateway_connections(
 connection_id text PRIMARY KEY CHECK(connection_id ~ '^[A-Za-z0-9_-]{1,80}$'),tenant_id uuid NOT NULL,property_id uuid NOT NULL,
 ota_property_id text NOT NULL CHECK(length(trim(ota_property_id)) BETWEEN 1 AND 128),inventory_authority text NOT NULL CHECK(inventory_authority IN('existing-pms','iratepilot-pms')),
 room_types jsonb NOT NULL CHECK(jsonb_typeof(room_types)='object'),signing_secret text NOT NULL CHECK(octet_length(signing_secret) BETWEEN 32 AND 512),
 enabled boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.gateway_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gateway_connections FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.gateway_validate_mapping(p_tenant uuid,p_property uuid,p_mapping jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; mapped uuid;
BEGIN
 IF p_mapping IS NULL OR jsonb_typeof(p_mapping)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_mapping))>200 THEN RAISE EXCEPTION 'Room mapping must be an object with at most 200 entries'; END IF;
 FOR item IN SELECT * FROM jsonb_each(p_mapping) LOOP
  IF length(trim(item.key)) NOT BETWEEN 1 AND 128 OR jsonb_typeof(item.value)<>'string' THEN RAISE EXCEPTION 'Invalid room mapping'; END IF;
  BEGIN mapped:=(item.value#>>'{}')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid mapped room type'; END;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=mapped) THEN RAISE EXCEPTION 'Mapped room type is outside this property'; END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.irp_pms_pilot_connections(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('connection_id',connection_id,'ota_property_id',ota_property_id,'inventory_authority',inventory_authority,'room_types',room_types,'enabled',enabled,'has_secret',true,'updated_at',updated_at) ORDER BY connection_id)
 FROM irp_pms.gateway_connections WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_connection(p_tenant uuid,p_property uuid,p_connection text,p_ota_property text,p_authority text,p_room_types jsonb,p_secret text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing irp_pms.gateway_connections;
BEGIN
 PERFORM irp_pms.pilot_require_owner(p_tenant,p_property);
 IF p_connection IS NULL OR p_connection !~ '^[A-Za-z0-9_-]{1,80}$' OR p_ota_property IS NULL OR length(trim(p_ota_property)) NOT BETWEEN 1 AND 128 OR p_authority IS NULL OR p_authority NOT IN('existing-pms','iratepilot-pms') THEN RAISE EXCEPTION 'Invalid connection identity or authority'; END IF;
 IF p_secret IS NOT NULL AND octet_length(p_secret) NOT BETWEEN 32 AND 512 THEN RAISE EXCEPTION 'Signing secret must contain 32 to 512 UTF-8 bytes'; END IF;
 PERFORM irp_pms.gateway_validate_mapping(p_tenant,p_property,p_room_types);
 PERFORM pg_advisory_xact_lock(hashtextextended('gateway:'||p_connection,0));
 SELECT * INTO existing FROM irp_pms.gateway_connections WHERE connection_id=p_connection FOR UPDATE;
 IF FOUND THEN
  IF existing.tenant_id<>p_tenant OR existing.property_id<>p_property OR existing.ota_property_id<>p_ota_property THEN RAISE EXCEPTION 'Connection identity cannot be reassigned'; END IF;
 ELSE
  IF p_secret IS NULL THEN RAISE EXCEPTION 'A signing secret is required for a new connection'; END IF;
 END IF;
 INSERT INTO irp_pms.gateway_connections(connection_id,tenant_id,property_id,ota_property_id,inventory_authority,room_types,signing_secret)
 VALUES(p_connection,p_tenant,p_property,p_ota_property,p_authority,p_room_types,coalesce(p_secret,existing.signing_secret))
 ON CONFLICT(connection_id) DO UPDATE SET inventory_authority=excluded.inventory_authority,room_types=excluded.room_types,signing_secret=excluded.signing_secret,enabled=false,updated_at=now();
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,details) VALUES(p_tenant,p_property,auth.uid(),'gateway_saved',jsonb_build_object('connection_id',p_connection));
 RETURN jsonb_build_object('connection_id',p_connection,'enabled',false,'has_secret',true);
END $$;

CREATE FUNCTION public.irp_pms_pilot_enable_connection(p_tenant uuid,p_property uuid,p_connection text,p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing irp_pms.gateway_connections;
BEGIN
 PERFORM irp_pms.pilot_require_owner(p_tenant,p_property);
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'Enabled state is required'; END IF;
 SELECT * INTO existing FROM irp_pms.gateway_connections WHERE tenant_id=p_tenant AND property_id=p_property AND connection_id=p_connection FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped connection'; END IF;
 PERFORM irp_pms.gateway_validate_mapping(p_tenant,p_property,existing.room_types);
 IF p_enabled AND existing.inventory_authority='iratepilot-pms' AND existing.room_types='{}'::jsonb THEN RAISE EXCEPTION 'Room mapping is required before enabling native PMS delivery'; END IF;
 UPDATE irp_pms.gateway_connections SET enabled=p_enabled,updated_at=now() WHERE connection_id=p_connection;
 IF existing.enabled IS DISTINCT FROM p_enabled THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,details) VALUES(p_tenant,p_property,auth.uid(),'gateway_enabled',jsonb_build_object('connection_id',p_connection,'enabled',p_enabled));
 END IF;
 RETURN jsonb_build_object('connection_id',p_connection,'enabled',p_enabled);
END $$;

-- Known OTA booking fields are scalars with bounded numeric ranges. Ordering and
-- compact scalar encoding match JSON.stringify plus sorted ASCII keys in the
-- Node receiver. Unsupported fields are rejected before this helper is called.
CREATE FUNCTION irp_pms.gateway_booking_canonical(p_booking jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||CASE WHEN jsonb_typeof(value)='number' THEN trim_scale((value#>>'{}')::numeric)::text ELSE value::text END,',' ORDER BY key COLLATE "C"),'')||'}' FROM jsonb_each(p_booking)
$$;
CREATE FUNCTION irp_pms.gateway_identifier(p_value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'string' OR length(trim(p_value#>>'{}')) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Invalid identifier'; END IF;
 RETURN p_value#>>'{}';
END $$;
CREATE FUNCTION irp_pms.gateway_money(p_value jsonb) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE amount text;
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value) NOT IN('string','number') THEN RAISE EXCEPTION 'Invalid monetary amount'; END IF;
 amount:=CASE WHEN jsonb_typeof(p_value)='number' THEN trim_scale((p_value#>>'{}')::numeric)::text ELSE p_value#>>'{}' END;
 IF amount !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Invalid monetary amount'; END IF;
 RETURN (amount::numeric*100)::bigint;
END $$;
CREATE FUNCTION irp_pms.gateway_hmac(p_data text,p_secret text) RETURNS bytea
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE extension_schema text; result bytea;
BEGIN
 -- Use the catalog location, since existing Supabase projects may have installed
 -- pgcrypto outside extensions. Only trusted migration roles can change it.
 SELECT n.nspname INTO STRICT extension_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
 EXECUTE format('SELECT %I.hmac(convert_to($1,''UTF8''),convert_to($2,''UTF8''),''sha256'')',extension_schema) INTO result USING p_data,p_secret;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_ota_gateway(p_raw_body text,p_connection text,p_timestamp text,p_signature text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE connection irp_pms.gateway_connections; expected bytea; supplied bytea; difference integer:=0; i integer;
 envelope jsonb; booking jsonb; item record; event_id text; booking_id text; version bigint; digest text; source_status text;
 arrival date; departure date; guests integer; subtotal bigint; taxes bigint; fees bigint; total bigint; mapped uuid; normalized jsonb; review_reason text; result jsonb;
BEGIN
 IF p_raw_body IS NULL OR octet_length(p_raw_body)>65536 THEN RETURN jsonb_build_object('status',413,'body',jsonb_build_object('error','payload_too_large')); END IF;
 IF p_connection IS NULL OR p_connection !~ '^[A-Za-z0-9_-]{1,80}$' OR p_timestamp IS NULL OR p_timestamp !~ '^[0-9]{10}$' OR p_signature IS NULL OR p_signature !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status',401,'body',jsonb_build_object('error','invalid_authentication')); END IF;
 IF abs(floor(extract(epoch FROM clock_timestamp()))-p_timestamp::bigint)>300 THEN RETURN jsonb_build_object('status',401,'body',jsonb_build_object('error','expired_delivery')); END IF;
 SELECT * INTO connection FROM irp_pms.gateway_connections WHERE connection_id=p_connection AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'body',jsonb_build_object('error','invalid_authentication')); END IF;
 expected:=irp_pms.gateway_hmac(p_timestamp||'.'||p_connection||'.'||p_raw_body,connection.signing_secret);
 supplied:=decode(p_signature,'hex');
 FOR i IN 0..31 LOOP difference:=difference | (get_byte(expected,i) # get_byte(supplied,i)); END LOOP;
 IF difference<>0 THEN RETURN jsonb_build_object('status',401,'body',jsonb_build_object('error','invalid_authentication')); END IF;
 BEGIN envelope:=p_raw_body::jsonb;EXCEPTION WHEN invalid_text_representation OR untranslatable_character OR program_limit_exceeded THEN RETURN jsonb_build_object('status',400,'body',jsonb_build_object('error','invalid_json')); END;
 BEGIN
  IF jsonb_typeof(envelope) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(envelope) k WHERE k NOT IN('eventId','sourceVersion','booking')) THEN RAISE EXCEPTION 'Invalid envelope'; END IF;
  event_id:=irp_pms.gateway_identifier(envelope->'eventId');
  IF jsonb_typeof(envelope->'sourceVersion') IS DISTINCT FROM 'number' OR (envelope->>'sourceVersion')::numeric NOT BETWEEN 1 AND 9007199254740991 OR trunc((envelope->>'sourceVersion')::numeric)<>(envelope->>'sourceVersion')::numeric THEN RAISE EXCEPTION 'Invalid source version'; END IF;
  version:=(envelope->>'sourceVersion')::bigint;booking:=envelope->'booking';
  IF jsonb_typeof(booking) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid booking'; END IF;
  FOR item IN SELECT * FROM jsonb_each(booking) LOOP
   IF item.key NOT IN('id','confirmation_code','customer_id','property_id','room_id','check_in','check_out','guests','subtotal','taxes','fees','total','status') OR jsonb_typeof(item.value) IN('array','object') THEN RAISE EXCEPTION 'Unsupported booking field'; END IF;
   -- Numeric primitives must stay in JSON.stringify's non-exponent range; valid
   -- booking fields are well inside these bounds. Exact money is checked below.
   IF jsonb_typeof(item.value)='number' AND (abs((item.value#>>'{}')::numeric)>=1e21 OR (abs((item.value#>>'{}')::numeric)<1e-6 AND (item.value#>>'{}')::numeric<>0) OR (item.value#>>'{}')::numeric<>((item.value#>>'{}')::double precision)::text::numeric) THEN RAISE EXCEPTION 'Unsupported numeric field'; END IF;
  END LOOP;
  booking_id:=irp_pms.gateway_identifier(booking->'id');
  IF irp_pms.gateway_identifier(booking->'property_id')<>connection.ota_property_id THEN RAISE EXCEPTION 'Wrong OTA property'; END IF;
  source_status:=irp_pms.gateway_identifier(booking->'status');
  IF source_status NOT IN('pending','confirmed','cancelled','refunded') THEN RAISE EXCEPTION 'Unsupported booking status'; END IF;
  digest:=encode(sha256(convert_to(irp_pms.gateway_booking_canonical(booking),'UTF8')),'hex');
  IF source_status='pending' THEN review_reason:='Awaiting OTA approval; no inventory mutation.';
  ELSIF source_status='refunded' THEN review_reason:='Reconcile the refund separately from reservation status.';
  ELSIF connection.inventory_authority<>'iratepilot-pms' THEN review_reason:='Existing PMS remains authoritative; native PMS booking writes are disabled.';
  ELSE
   normalized:=jsonb_build_object('source_booking_id',booking_id,'source_version',version,'payload_hash',digest,'status',CASE WHEN source_status='cancelled' THEN 'Cancelled' ELSE 'Confirmed' END);
   IF source_status='confirmed' THEN
    PERFORM irp_pms.gateway_identifier(booking->'confirmation_code');
    IF booking->'customer_id' IS NOT NULL AND booking->'customer_id'<>'null'::jsonb THEN PERFORM irp_pms.gateway_identifier(booking->'customer_id'); END IF;
    IF jsonb_typeof(booking->'check_in') IS DISTINCT FROM 'string' OR jsonb_typeof(booking->'check_out') IS DISTINCT FROM 'string' OR (booking->>'check_in') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (booking->>'check_out') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid dates'; END IF;
    arrival:=(booking->>'check_in')::date;departure:=(booking->>'check_out')::date;
    IF departure<=arrival OR departure-arrival>30 THEN RAISE EXCEPTION 'Invalid stay'; END IF;
    IF jsonb_typeof(booking->'guests') IS DISTINCT FROM 'number' OR (booking->>'guests')::numeric NOT BETWEEN 1 AND 2147483647 OR trunc((booking->>'guests')::numeric)<>(booking->>'guests')::numeric THEN RAISE EXCEPTION 'Invalid guest count'; END IF;
    guests:=(booking->>'guests')::integer;
    subtotal:=irp_pms.gateway_money(booking->'subtotal');taxes:=irp_pms.gateway_money(booking->'taxes');fees:=irp_pms.gateway_money(booking->'fees');total:=irp_pms.gateway_money(booking->'total');
    IF subtotal+taxes+fees<>total THEN RAISE EXCEPTION 'Amounts do not reconcile'; END IF;
    mapped:=(connection.room_types->>irp_pms.gateway_identifier(booking->'room_id'))::uuid;
    IF mapped IS NULL OR NOT EXISTS(SELECT 1 FROM irp_pms.room_types WHERE tenant_id=connection.tenant_id AND property_id=connection.property_id AND id=mapped) THEN RAISE EXCEPTION 'Unmapped room type'; END IF;
    normalized:=normalized||jsonb_build_object('room_type_id',mapped,'arrival',arrival,'departure',departure,'guests',guests,'accommodation_minor',subtotal,'taxes_minor',taxes,'ota_fees_minor',fees,'guest_total_minor',total);
   END IF;
  END IF;
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status',422,'body',jsonb_build_object('error','invalid_event'));
 END;
 BEGIN
  result:=irp_pms.receive_reservation(connection.tenant_id,connection.property_id,event_id,booking_id,version,digest,normalized,review_reason);
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status',503,'body',jsonb_build_object('error','storage_unavailable'));
 END;
 RETURN jsonb_build_object('status',CASE WHEN result->>'outcome' IN('event-conflict','version-conflict') THEN 409 ELSE 200 END,'body',result);
END $$;

REVOKE ALL ON FUNCTION irp_pms.gateway_validate_mapping(uuid,uuid,jsonb),irp_pms.gateway_booking_canonical(jsonb),irp_pms.gateway_identifier(jsonb),irp_pms.gateway_money(jsonb),irp_pms.gateway_hmac(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_connections(uuid,uuid),public.irp_pms_pilot_save_connection(uuid,uuid,text,text,text,jsonb,text),public.irp_pms_pilot_enable_connection(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_connections(uuid,uuid),public.irp_pms_pilot_save_connection(uuid,uuid,text,text,text,jsonb,text),public.irp_pms_pilot_enable_connection(uuid,uuid,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.irp_pms_ota_gateway(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.irp_pms_ota_gateway(text,text,text,text) TO anon,authenticated,service_role;
COMMIT;
