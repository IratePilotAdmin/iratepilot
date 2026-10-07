BEGIN;

-- Activation is a provider/admin action, never a partner-submitted setting.
ALTER TABLE public.irp_ota_channel_connections
  ADD COLUMN ari_endpoint_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN certification_complete boolean NOT NULL DEFAULT false;

CREATE TABLE public.irp_ota_ari_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id text NOT NULL REFERENCES public.irp_ota_channel_connections(connection_id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  sync_id uuid NOT NULL,
  request_index integer NOT NULL CHECK (request_index BETWEEN 0 AND 999),
  request_kind text NOT NULL CHECK (request_kind IN ('availability','rate')),
  provider_property_id text NOT NULL CHECK (provider_property_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  endpoint text NOT NULL CHECK (endpoint IN (
    'https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif',
    'https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif'
  )),
  request_xml text NOT NULL CHECK (length(request_xml) BETWEEN 1 AND 1000000),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','retry','processing','sent','review')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_http_status integer CHECK (last_http_status BETWEEN 100 AND 599),
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, sync_id, request_index),
  CHECK ((request_kind = 'availability' AND endpoint = 'https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif')
      OR (request_kind = 'rate' AND endpoint = 'https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif')),
  CHECK ((status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX irp_ota_ari_outbox_ready_idx
  ON public.irp_ota_ari_outbox(available_at, created_at)
  WHERE status IN ('queued','retry','processing');

CREATE FUNCTION public.irp_ota_enqueue_booking_com_ari(
  p_connection_id text,
  p_sync_id uuid,
  p_request_index integer,
  p_request_kind text,
  p_provider_property_id text,
  p_endpoint text,
  p_request_xml text,
  p_request_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c public.irp_ota_channel_connections%rowtype;
  saved public.irp_ota_ari_outbox%rowtype;
  inserted_id uuid;
BEGIN
  IF p_connection_id IS NULL OR p_connection_id !~ '^[A-Za-z0-9_-]{1,80}$'
     OR p_sync_id IS NULL OR p_request_index IS NULL OR p_request_index NOT BETWEEN 0 AND 999
     OR p_request_kind IS NULL OR p_request_kind NOT IN ('availability','rate')
     OR p_provider_property_id IS NULL OR p_provider_property_id !~ '^[A-Za-z0-9_-]{1,80}$'
     OR p_endpoint IS NULL OR p_endpoint NOT IN (
       'https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif',
       'https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif'
     )
     OR (p_request_kind = 'availability' AND p_endpoint <> 'https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif')
     OR (p_request_kind = 'rate' AND p_endpoint <> 'https://supply-xml.booking.com/hotels/ota/OTA_HotelRateAmountNotif')
     OR p_request_xml IS NULL OR length(p_request_xml) NOT BETWEEN 1 AND 1000000
     OR p_request_xml !~ '^<\?xml '
     OR p_request_xml ~* '<!\s*(DOCTYPE|ENTITY)'
     OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'Invalid OTA ARI request' USING ERRCODE = '22023'; END IF;

  SELECT * INTO c FROM public.irp_ota_channel_connections
   WHERE connection_id = p_connection_id FOR SHARE;
  IF NOT FOUND OR c.provider <> 'booking_com' OR c.environment <> 'test'
     OR c.provider_property_id <> p_provider_property_id
     OR NOT c.enabled OR NOT c.partner_approved OR NOT c.ari_endpoint_approved OR NOT c.certification_complete
     OR c.machine_account_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.irp_ota_machine_accounts a
        WHERE a.id = c.machine_account_id AND a.property_id = c.property_id
          AND a.provider = 'booking_com' AND a.environment = 'test'
          AND a.enabled AND a.partner_approved AND a.approved_at IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.properties p JOIN public.partners h ON h.id = p.partner_id
        WHERE p.id = c.property_id AND p.active AND h.status = 'approved'
     )
  THEN RAISE EXCEPTION 'Booking.com ARI connection is not approved' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.irp_ota_ari_outbox(
    connection_id, property_id, sync_id, request_index, request_kind,
    provider_property_id, endpoint, request_xml, request_sha256
  ) VALUES (
    c.connection_id, c.property_id, p_sync_id, p_request_index, p_request_kind,
    c.provider_property_id, p_endpoint, p_request_xml, p_request_sha256
  ) ON CONFLICT (connection_id, sync_id, request_index) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','queued','jobId',inserted_id);
  END IF;
  SELECT * INTO saved FROM public.irp_ota_ari_outbox
   WHERE connection_id = c.connection_id AND sync_id = p_sync_id AND request_index = p_request_index;
  IF NOT FOUND OR saved.request_sha256 <> p_request_sha256 THEN
    RAISE EXCEPTION 'ARI outbox idempotency conflict' USING ERRCODE = '23505';
  END IF;
  RETURN jsonb_build_object('outcome','duplicate','jobId',saved.id,'status',saved.status);
END
$$;

CREATE FUNCTION public.irp_ota_claim_booking_com_ari(p_limit integer DEFAULT 10)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid OTA ARI claim size' USING ERRCODE = '22023';
  END IF;

  UPDATE public.irp_ota_ari_outbox j SET status = 'review', lease_token = NULL,
      lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE j.attempt_count >= 8 AND (
     j.status IN ('queued','retry') AND j.available_at <= clock_timestamp()
     OR j.status = 'processing' AND j.lease_expires_at <= clock_timestamp()
   );

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
      FROM public.irp_ota_ari_outbox j
      JOIN public.irp_ota_channel_connections c ON c.connection_id = j.connection_id
      JOIN public.properties p ON p.id = c.property_id AND p.active
      JOIN public.partners h ON h.id = p.partner_id AND h.status = 'approved'
      JOIN public.irp_ota_machine_accounts a ON a.id = c.machine_account_id
     WHERE j.attempt_count < 8
       AND ((j.status IN ('queued','retry') AND j.available_at <= clock_timestamp())
         OR (j.status = 'processing' AND j.lease_expires_at <= clock_timestamp()))
       AND c.provider = 'booking_com' AND c.environment = 'test'
       AND c.enabled AND c.partner_approved AND c.ari_endpoint_approved AND c.certification_complete
       AND a.environment = 'test' AND a.enabled AND a.partner_approved AND a.approved_at IS NOT NULL
     ORDER BY j.available_at, j.created_at
     FOR UPDATE OF j SKIP LOCKED
     LIMIT p_limit
  ), claimed AS (
    UPDATE public.irp_ota_ari_outbox j
       SET status = 'processing', attempt_count = j.attempt_count + 1,
           lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '4 minutes',
           updated_at = clock_timestamp()
      FROM candidates c
     WHERE j.id = c.id
     RETURNING j.*
  )
  SELECT jsonb_build_object(
    'jobId', q.id, 'connectionId', q.connection_id, 'propertyId', q.property_id,
    'machineAccountId', c.machine_account_id, 'providerPropertyId', q.provider_property_id,
    'kind', q.request_kind, 'endpoint', q.endpoint, 'requestXml', q.request_xml,
    'requestSha256', q.request_sha256, 'attempt', q.attempt_count, 'leaseToken', q.lease_token
  )
    FROM claimed q JOIN public.irp_ota_channel_connections c ON c.connection_id = q.connection_id;
END
$$;

CREATE FUNCTION public.irp_ota_finish_booking_com_ari(
  p_job_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_http_status integer,
  p_safe_result jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  j public.irp_ota_ari_outbox%rowtype;
  final_status text;
  next_time timestamptz;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL
     OR p_outcome IS NULL OR p_outcome NOT IN ('sent','retry','review')
     OR (p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599)
     OR p_safe_result IS NULL OR jsonb_typeof(p_safe_result) <> 'object'
     OR length(p_safe_result::text) > 16000
  THEN RAISE EXCEPTION 'Invalid OTA ARI result' USING ERRCODE = '22023'; END IF;

  SELECT * INTO j FROM public.irp_ota_ari_outbox
   WHERE id = p_job_id AND status = 'processing' AND lease_token = p_lease_token
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','lease_lost'); END IF;

  final_status := p_outcome;
  IF p_outcome = 'retry' AND j.attempt_count >= 8 THEN final_status := 'review'; END IF;
  IF final_status = 'retry' THEN
    next_time := clock_timestamp() + (LEAST(360, (2 ^ LEAST(j.attempt_count, 8))) * interval '1 minute');
  ELSE
    next_time := clock_timestamp();
  END IF;

  UPDATE public.irp_ota_ari_outbox SET status = final_status,
      available_at = next_time, lease_token = NULL, lease_expires_at = NULL,
      last_http_status = p_http_status, last_result = p_safe_result,
      updated_at = clock_timestamp()
    WHERE id = j.id;
  RETURN jsonb_build_object('outcome',final_status,'jobId',j.id,'attempt',j.attempt_count);
END
$$;

ALTER TABLE public.irp_ota_ari_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_ota_ari_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_enqueue_booking_com_ari(text,uuid,integer,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_claim_booking_com_ari(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_finish_booking_com_ari(uuid,uuid,text,integer,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.irp_ota_ari_outbox TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_enqueue_booking_com_ari(text,uuid,integer,text,text,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_claim_booking_com_ari(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_finish_booking_com_ari(uuid,uuid,text,integer,jsonb)
  TO service_role;

COMMIT;
