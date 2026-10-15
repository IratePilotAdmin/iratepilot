BEGIN;

-- Server-only setup receipt for the reservation side of a native connection.
-- Creation never enables capture or delivery; baseline and delivery remain
-- separate reviewed operations.
CREATE TABLE public.irp_pms_outbox_setup_events (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  connection_id text NOT NULL CHECK (connection_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  tenant_id uuid NOT NULL,
  pms_property_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('created', 'existing')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.irp_pms_outbox_setup_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_pms_outbox_setup_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.irp_pms_outbox_setup_events TO service_role;

CREATE FUNCTION public.irp_pms_configure_reservation_connection(
  p_request uuid,
  p_actor uuid,
  p_property uuid,
  p_connection text,
  p_tenant uuid,
  p_pms_property uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  receipt public.irp_pms_outbox_setup_events%rowtype;
  existing public.irp_pms_outbox_connections%rowtype;
  saved_outcome text;
BEGIN
  IF p_request IS NULL OR p_actor IS NULL OR p_property IS NULL
    OR p_tenant IS NULL OR p_pms_property IS NULL
    OR p_connection IS NULL OR p_connection !~ '^[A-Za-z0-9_-]{1,80}$'
  THEN RAISE EXCEPTION 'Invalid native reservation connection scope'; END IF;

  SELECT * INTO receipt FROM public.irp_pms_outbox_setup_events WHERE request_id = p_request;
  IF FOUND THEN
    IF receipt.actor_id = p_actor AND receipt.property_id = p_property
      AND receipt.connection_id = p_connection AND receipt.tenant_id = p_tenant
      AND receipt.pms_property_id = p_pms_property
    THEN RETURN jsonb_build_object('outcome', 'duplicate', 'connectionId', p_connection); END IF;
    RAISE EXCEPTION 'Native reservation setup request identity already used';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.properties AS p
    JOIN public.partners AS partner ON partner.id = p.partner_id
    WHERE p.id = p_property AND p.active AND partner.status = 'approved'
  ) THEN RAISE EXCEPTION 'Property is not active and approved'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.irp_pms_outbox_connections AS c
    WHERE c.property_id = p_property OR c.connection_id = p_connection
  ) THEN
    SELECT * INTO existing FROM public.irp_pms_outbox_connections AS c
    WHERE c.property_id = p_property OR c.connection_id = p_connection
    ORDER BY c.property_id LIMIT 1 FOR UPDATE;
    IF existing.property_id <> p_property OR existing.connection_id <> p_connection
      OR existing.tenant_id <> p_tenant::text OR existing.pms_property_id <> p_pms_property::text
    THEN RAISE EXCEPTION 'Connection identity is already assigned to another scope'; END IF;
    IF existing.environment <> 'sandbox' OR existing.enabled OR existing.delivery_enabled
    THEN RAISE EXCEPTION 'An active connection requires the reviewed recovery and delivery controls'; END IF;
    saved_outcome := 'existing';
  ELSE
    INSERT INTO public.irp_pms_outbox_connections(
      property_id, connection_id, tenant_id, pms_property_id, enabled, environment, delivery_enabled
    ) VALUES (p_property, p_connection, p_tenant::text, p_pms_property::text, false, 'sandbox', false);
    saved_outcome := 'created';
  END IF;

  INSERT INTO public.irp_pms_outbox_setup_events(
    request_id, actor_id, property_id, connection_id, tenant_id, pms_property_id, outcome
  ) VALUES (p_request, p_actor, p_property, p_connection, p_tenant, p_pms_property, saved_outcome);

  RETURN jsonb_build_object('outcome', saved_outcome, 'connectionId', p_connection,
    'captureEnabled', false, 'deliveryEnabled', false, 'environment', 'sandbox');
END
$$;

REVOKE ALL ON FUNCTION public.irp_pms_configure_reservation_connection(uuid, uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_configure_reservation_connection(uuid, uuid, uuid, text, uuid, uuid)
  TO service_role;

-- Return aggregate-only readiness for an administrator to review before the
-- separate, write-locked baseline capture operation. Never return booking or
-- guest identities from this preview.
CREATE FUNCTION public.irp_pms_preview_reservation_baseline(p_property uuid, p_from date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  c public.irp_pms_outbox_connections%rowtype;
  reservation_count integer := 0;
  outbox_count integer := 0;
  version_count integer := 0;
  baseline_count integer := 0;
  property_ready boolean := false;
  reason_codes text[] := ARRAY[]::text[];
BEGIN
  IF p_property IS NULL OR p_from IS NULL THEN RAISE EXCEPTION 'Property and cutover date are required'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.properties AS p
    JOIN public.partners AS partner ON partner.id = p.partner_id
    WHERE p.id = p_property AND p.active AND partner.status = 'approved'
  ) INTO property_ready;
  SELECT * INTO c FROM public.irp_pms_outbox_connections WHERE property_id = p_property;
  IF NOT FOUND THEN
    reason_codes := array_append(reason_codes, 'connection_missing');
  ELSE
    IF c.environment <> 'sandbox' THEN reason_codes := array_append(reason_codes, 'environment_not_sandbox'); END IF;
    IF c.enabled THEN reason_codes := array_append(reason_codes, 'capture_already_enabled'); END IF;
    IF c.delivery_enabled THEN reason_codes := array_append(reason_codes, 'delivery_already_enabled'); END IF;
  END IF;
  IF NOT property_ready THEN reason_codes := array_append(reason_codes, 'property_not_active_approved'); END IF;

  SELECT count(*)::integer INTO reservation_count
  FROM public.bookings AS b WHERE b.property_id = p_property AND b.check_out >= p_from;
  SELECT count(*)::integer INTO outbox_count
  FROM public.irp_pms_outbox AS o WHERE o.property_id = p_property;
  SELECT count(*)::integer INTO version_count
  FROM public.irp_pms_booking_versions AS v
  JOIN public.bookings AS b ON b.id = v.booking_id
  WHERE b.property_id = p_property;
  SELECT count(*)::integer INTO baseline_count
  FROM public.irp_pms_baseline_runs AS r WHERE r.property_id = p_property;

  IF reservation_count > 1000 THEN reason_codes := array_append(reason_codes, 'reservation_limit_exceeded'); END IF;
  IF outbox_count > 0 THEN reason_codes := array_append(reason_codes, 'outbox_history_exists'); END IF;
  IF version_count > 0 THEN reason_codes := array_append(reason_codes, 'version_history_exists'); END IF;
  IF baseline_count > 0 THEN reason_codes := array_append(reason_codes, 'baseline_already_exists'); END IF;

  RETURN jsonb_build_object(
    'fromDate', p_from,
    'reservationCount', reservation_count,
    'outboxEventCount', outbox_count,
    'versionedReservationCount', version_count,
    'baselineExists', baseline_count > 0,
    'propertyReady', property_ready,
    'captureEnabled', coalesce(c.enabled, false),
    'deliveryEnabled', coalesce(c.delivery_enabled, false),
    'eligibleForCapture', cardinality(reason_codes) = 0,
    'reasonCodes', to_jsonb(reason_codes)
  );
END
$$;

REVOKE ALL ON FUNCTION public.irp_pms_preview_reservation_baseline(uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_preview_reservation_baseline(uuid, date)
  TO service_role;

COMMIT;
