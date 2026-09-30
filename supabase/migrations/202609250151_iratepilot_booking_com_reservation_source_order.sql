BEGIN;

-- A reservation's event version stays fixed across worker retries. Provider
-- PII and identifiers remain in the separately encrypted inbox payload.
CREATE TABLE public.irp_ota_reservation_versions (
  connection_id text NOT NULL REFERENCES public.irp_ota_channel_connections(connection_id) ON DELETE CASCADE,
  provider_reservation_id_sha256 text NOT NULL CHECK(provider_reservation_id_sha256 ~ '^[a-f0-9]{64}$'),
  latest_version bigint NOT NULL CHECK(latest_version BETWEEN 1 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(connection_id,provider_reservation_id_sha256)
);
ALTER TABLE public.irp_ota_reservation_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_ota_reservation_versions FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.irp_ota_reservation_inbox
  ADD COLUMN source_version bigint NOT NULL DEFAULT 1 CHECK(source_version BETWEEN 1 AND 9007199254740991);
WITH ordered AS (
  SELECT id,row_number() OVER(PARTITION BY connection_id,provider_reservation_id_sha256 ORDER BY received_at,id) AS version
  FROM public.irp_ota_reservation_inbox
)
UPDATE public.irp_ota_reservation_inbox inbox SET source_version=ordered.version FROM ordered WHERE inbox.id=ordered.id;
CREATE UNIQUE INDEX irp_ota_reservation_inbox_source_version_idx
  ON public.irp_ota_reservation_inbox(connection_id,provider_reservation_id_sha256,source_version);
INSERT INTO public.irp_ota_reservation_versions(connection_id,provider_reservation_id_sha256,latest_version)
SELECT connection_id,provider_reservation_id_sha256,max(source_version)
FROM public.irp_ota_reservation_inbox GROUP BY connection_id,provider_reservation_id_sha256;

CREATE OR REPLACE FUNCTION public.irp_ota_stage_reservation(
  p_connection text,p_property uuid,p_provider_property_id text,p_reservation_id_sha256 text,p_payload_sha256 text,
  p_event_kind text,p_ciphertext text,p_iv text,p_tag text,p_key_version integer,p_room_mappings jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.irp_ota_channel_connections%rowtype;saved public.irp_ota_reservation_inbox%rowtype;
 mapping_item jsonb;allocated_version bigint;inserted_id uuid;
BEGIN
 IF p_connection IS NULL OR p_connection !~ '^[A-Za-z0-9_-]{1,80}$' OR p_property IS NULL
 OR p_provider_property_id IS NULL OR p_provider_property_id !~ '^[A-Za-z0-9_-]{1,80}$'
 OR p_reservation_id_sha256 IS NULL OR p_reservation_id_sha256 !~ '^[a-f0-9]{64}$'
 OR p_payload_sha256 IS NULL OR p_payload_sha256 !~ '^[a-f0-9]{64}$'
 OR p_event_kind IS NULL OR p_event_kind NOT IN('new','modified','cancelled')
 OR p_ciphertext IS NULL OR length(p_ciphertext) NOT BETWEEN 1 AND 200000 OR p_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$'
 OR p_iv IS NULL OR p_iv !~ '^[A-Za-z0-9+/]{16}$' OR p_tag IS NULL OR p_tag !~ '^[A-Za-z0-9+/]{22}==$'
 OR p_key_version IS NULL OR p_key_version<1 OR p_room_mappings IS NULL OR jsonb_typeof(p_room_mappings)<>'array'
 OR jsonb_array_length(p_room_mappings) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid encrypted OTA reservation envelope' USING ERRCODE='22023'; END IF;

 SELECT * INTO c FROM public.irp_ota_channel_connections WHERE connection_id=p_connection AND property_id=p_property FOR SHARE;
 IF NOT FOUND OR c.provider_property_id<>p_provider_property_id OR c.environment<>'test' OR NOT c.enabled
 OR NOT c.partner_approved OR NOT c.pii_compliance_approved
 OR NOT EXISTS(SELECT 1 FROM public.properties p JOIN public.partners partner ON partner.id=p.partner_id WHERE p.id=c.property_id AND p.active AND partner.status='approved')
 THEN RAISE EXCEPTION 'OTA reservation connection is not authorized' USING ERRCODE='42501'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('ota-reservation:'||p_connection||':'||p_reservation_id_sha256,0));
 SELECT * INTO saved FROM public.irp_ota_reservation_inbox WHERE connection_id=p_connection
 AND provider_reservation_id_sha256=p_reservation_id_sha256 AND payload_sha256=p_payload_sha256 AND event_kind=p_event_kind;
 IF FOUND THEN RETURN jsonb_build_object('outcome','duplicate','inboxId',saved.id,'status',saved.status,'sourceVersion',saved.source_version); END IF;

 FOR mapping_item IN SELECT value FROM jsonb_array_elements(p_room_mappings) LOOP
  IF jsonb_typeof(mapping_item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(mapping_item))<>2
  OR coalesce(mapping_item->>'roomTypeId','') !~ '^[A-Za-z0-9_-]{1,80}$'
  OR coalesce(mapping_item->>'ratePlanId','') !~ '^[A-Za-z0-9_-]{1,80}$'
  OR NOT EXISTS(SELECT 1 FROM public.irp_ota_channel_room_mappings m JOIN public.rooms r ON r.id=m.local_room_id AND r.property_id=c.property_id AND r.active
    WHERE m.connection_id=c.connection_id AND m.provider_room_type_id=mapping_item->>'roomTypeId' AND m.provider_rate_plan_id=mapping_item->>'ratePlanId')
  THEN RAISE EXCEPTION 'OTA reservation room mapping is missing or invalid' USING ERRCODE='23503'; END IF;
 END LOOP;

 INSERT INTO public.irp_ota_reservation_versions(connection_id,provider_reservation_id_sha256,latest_version)
 VALUES(p_connection,p_reservation_id_sha256,1)
 ON CONFLICT(connection_id,provider_reservation_id_sha256) DO UPDATE
 SET latest_version=irp_ota_reservation_versions.latest_version+1,updated_at=now()
 WHERE irp_ota_reservation_versions.latest_version<9007199254740991
 RETURNING latest_version INTO allocated_version;
 IF allocated_version IS NULL THEN RAISE EXCEPTION 'OTA reservation version limit reached' USING ERRCODE='22003'; END IF;

 INSERT INTO public.irp_ota_reservation_inbox(connection_id,property_id,provider_reservation_id_sha256,payload_sha256,event_kind,
   pii_ciphertext,pii_initialization_vector,pii_authentication_tag,pii_key_version,source_version)
 VALUES(c.connection_id,c.property_id,p_reservation_id_sha256,p_payload_sha256,p_event_kind,p_ciphertext,p_iv,p_tag,p_key_version,allocated_version)
 RETURNING id INTO inserted_id;
 RETURN jsonb_build_object('outcome','received','inboxId',inserted_id,'sourceVersion',allocated_version);
END $$;

CREATE OR REPLACE FUNCTION public.irp_ota_claim_booking_com_reservation(p_limit integer DEFAULT 10)
RETURNS SETOF public.irp_ota_reservation_inbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE bounded_limit integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Invalid reservation claim limit' USING ERRCODE='22023'; END IF;
 bounded_limit:=p_limit;
 RETURN QUERY WITH candidates AS (
  SELECT inbox.id FROM public.irp_ota_reservation_inbox inbox
  JOIN public.irp_ota_channel_connections connection ON connection.connection_id=inbox.connection_id AND connection.property_id=inbox.property_id
  JOIN public.properties property ON property.id=inbox.property_id AND property.active
  JOIN public.partners partner ON partner.id=property.partner_id AND partner.status='approved'
  WHERE connection.provider='booking_com' AND connection.environment='test' AND connection.enabled
  AND connection.partner_approved AND connection.pii_compliance_approved AND inbox.attempt_count<8
  AND ((inbox.status='received' AND inbox.available_at<=clock_timestamp()) OR (inbox.status='leased' AND inbox.lease_until<=clock_timestamp()))
  AND NOT EXISTS(SELECT 1 FROM public.irp_ota_reservation_inbox earlier WHERE earlier.connection_id=inbox.connection_id
    AND earlier.provider_reservation_id_sha256=inbox.provider_reservation_id_sha256 AND earlier.source_version<inbox.source_version
    AND earlier.status<>'imported')
  ORDER BY inbox.available_at,inbox.received_at,inbox.id FOR UPDATE OF inbox SKIP LOCKED LIMIT bounded_limit
 )
 UPDATE public.irp_ota_reservation_inbox inbox SET status='leased',attempt_count=inbox.attempt_count+1,
   lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
 FROM candidates WHERE inbox.id=candidates.id RETURNING inbox.*;
END $$;

REVOKE ALL ON FUNCTION public.irp_ota_stage_reservation(text,uuid,text,text,text,text,text,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_ota_stage_reservation(text,uuid,text,text,text,text,text,text,text,integer,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.irp_ota_claim_booking_com_reservation(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_ota_claim_booking_com_reservation(integer) TO service_role;

COMMIT;
