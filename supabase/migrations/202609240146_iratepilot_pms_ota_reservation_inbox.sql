BEGIN;

-- External channel connection metadata. This migration deliberately supports
-- test connections only; credentials and live activation are separate work.
CREATE TABLE public.irp_ota_channel_connections (
  connection_id text PRIMARY KEY CHECK (connection_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('booking_com','expedia','agoda','airbnb','iratepilot')),
  provider_property_id text NOT NULL CHECK (provider_property_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  environment text NOT NULL DEFAULT 'test' CHECK (environment = 'test'),
  enabled boolean NOT NULL DEFAULT false,
  partner_approved boolean NOT NULL DEFAULT false,
  pii_compliance_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_property_id),
  UNIQUE (property_id, connection_id)
);

CREATE TABLE public.irp_ota_channel_room_mappings (
  connection_id text NOT NULL REFERENCES public.irp_ota_channel_connections(connection_id) ON DELETE CASCADE,
  provider_room_type_id text NOT NULL CHECK (provider_room_type_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  provider_rate_plan_id text NOT NULL CHECK (provider_rate_plan_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  local_room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, provider_room_type_id, provider_rate_plan_id)
);

-- The provider reservation identity, guest fields, room list, and money details
-- are kept only inside the authenticated ciphertext. Hashes support replay
-- detection without retaining plaintext provider reservation IDs.
CREATE TABLE public.irp_ota_reservation_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id text NOT NULL REFERENCES public.irp_ota_channel_connections(connection_id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  provider_reservation_id_sha256 text NOT NULL CHECK (provider_reservation_id_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  event_kind text NOT NULL CHECK (event_kind IN ('new','modified','cancelled')),
  pii_ciphertext text NOT NULL CHECK (length(pii_ciphertext) BETWEEN 1 AND 200000),
  pii_initialization_vector text NOT NULL CHECK (pii_initialization_vector ~ '^[A-Za-z0-9+/]{16}$'),
  pii_authentication_tag text NOT NULL CHECK (pii_authentication_tag ~ '^[A-Za-z0-9+/]{22}==$'),
  pii_key_version integer NOT NULL CHECK (pii_key_version > 0),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','review')),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, provider_reservation_id_sha256, payload_sha256, event_kind)
);
CREATE INDEX irp_ota_reservation_inbox_received_idx
  ON public.irp_ota_reservation_inbox(status, received_at)
  WHERE status = 'received';

ALTER TABLE public.irp_ota_channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irp_ota_channel_room_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irp_ota_reservation_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_ota_channel_connections, public.irp_ota_channel_room_mappings,
  public.irp_ota_reservation_inbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.irp_ota_channel_connections,
  public.irp_ota_channel_room_mappings TO service_role;
GRANT SELECT ON public.irp_ota_reservation_inbox TO service_role;

CREATE FUNCTION public.irp_ota_stage_reservation(
  p_connection text,
  p_property uuid,
  p_provider_property_id text,
  p_reservation_id_sha256 text,
  p_payload_sha256 text,
  p_event_kind text,
  p_ciphertext text,
  p_iv text,
  p_tag text,
  p_key_version integer,
  p_room_mappings jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c public.irp_ota_channel_connections%rowtype;
  saved public.irp_ota_reservation_inbox%rowtype;
  inserted_id uuid;
  mapping_item jsonb;
BEGIN
  IF p_connection IS NULL OR p_connection !~ '^[A-Za-z0-9_-]{1,80}$'
     OR p_property IS NULL
     OR p_provider_property_id IS NULL OR p_provider_property_id !~ '^[A-Za-z0-9_-]{1,80}$'
     OR p_reservation_id_sha256 IS NULL OR p_reservation_id_sha256 !~ '^[a-f0-9]{64}$'
     OR p_payload_sha256 IS NULL OR p_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR p_event_kind IS NULL OR p_event_kind NOT IN ('new','modified','cancelled')
     OR p_ciphertext IS NULL OR length(p_ciphertext) NOT BETWEEN 1 AND 200000
     OR p_ciphertext !~ '^[A-Za-z0-9+/]+={0,2}$'
     OR p_iv IS NULL OR p_iv !~ '^[A-Za-z0-9+/]{16}$'
     OR p_tag IS NULL OR p_tag !~ '^[A-Za-z0-9+/]{22}==$'
     OR p_key_version IS NULL OR p_key_version < 1
     OR p_room_mappings IS NULL OR jsonb_typeof(p_room_mappings) <> 'array'
     OR jsonb_array_length(p_room_mappings) NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'Invalid encrypted OTA reservation envelope' USING ERRCODE = '22023'; END IF;

  SELECT * INTO c FROM public.irp_ota_channel_connections
   WHERE connection_id = p_connection AND property_id = p_property FOR SHARE;
  IF NOT FOUND OR c.provider_property_id <> p_provider_property_id
     OR c.environment <> 'test' OR NOT c.enabled OR NOT c.partner_approved
     OR NOT c.pii_compliance_approved
     OR NOT EXISTS (
       SELECT 1 FROM public.properties p JOIN public.partners partner ON partner.id = p.partner_id
        WHERE p.id = c.property_id AND p.active AND partner.status = 'approved'
     )
  THEN RAISE EXCEPTION 'OTA reservation connection is not authorized' USING ERRCODE = '42501'; END IF;

  FOR mapping_item IN SELECT value FROM jsonb_array_elements(p_room_mappings) LOOP
    IF jsonb_typeof(mapping_item) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(mapping_item)) <> 2
       OR coalesce(mapping_item->>'roomTypeId','') !~ '^[A-Za-z0-9_-]{1,80}$'
       OR coalesce(mapping_item->>'ratePlanId','') !~ '^[A-Za-z0-9_-]{1,80}$'
       OR NOT EXISTS (
         SELECT 1 FROM public.irp_ota_channel_room_mappings m
         JOIN public.rooms r ON r.id = m.local_room_id AND r.property_id = c.property_id AND r.active
         WHERE m.connection_id = c.connection_id
           AND m.provider_room_type_id = mapping_item->>'roomTypeId'
           AND m.provider_rate_plan_id = mapping_item->>'ratePlanId'
       )
    THEN RAISE EXCEPTION 'OTA reservation room mapping is missing or invalid' USING ERRCODE = '23503'; END IF;
  END LOOP;

  INSERT INTO public.irp_ota_reservation_inbox(
    connection_id, property_id, provider_reservation_id_sha256, payload_sha256,
    event_kind, pii_ciphertext, pii_initialization_vector, pii_authentication_tag, pii_key_version
  ) VALUES (
    c.connection_id, c.property_id, p_reservation_id_sha256, p_payload_sha256,
    p_event_kind, p_ciphertext, p_iv, p_tag, p_key_version
  ) ON CONFLICT (connection_id, provider_reservation_id_sha256, payload_sha256, event_kind) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','received','inboxId',inserted_id);
  END IF;
  SELECT * INTO saved FROM public.irp_ota_reservation_inbox
   WHERE connection_id = c.connection_id AND provider_reservation_id_sha256 = p_reservation_id_sha256
     AND payload_sha256 = p_payload_sha256 AND event_kind = p_event_kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'OTA inbox idempotency conflict' USING ERRCODE = '23505'; END IF;
  RETURN jsonb_build_object('outcome','duplicate','inboxId',saved.id,'status',saved.status);
END
$$;
REVOKE ALL ON FUNCTION public.irp_ota_stage_reservation(text,uuid,text,text,text,text,text,text,text,integer,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_ota_stage_reservation(text,uuid,text,text,text,text,text,text,text,integer,jsonb)
  TO service_role;

COMMIT;
