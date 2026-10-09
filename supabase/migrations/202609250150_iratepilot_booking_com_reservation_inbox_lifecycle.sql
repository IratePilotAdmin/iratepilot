BEGIN;

-- Durable, leased processing for encrypted Booking.com reservation messages.
-- A message is not marked imported until a downstream PMS transaction confirms it.
ALTER TABLE public.irp_ota_reservation_inbox
  DROP CONSTRAINT irp_ota_reservation_inbox_status_check,
  ADD CONSTRAINT irp_ota_reservation_inbox_status_check
    CHECK (status IN ('received','leased','imported','review')),
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 8),
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN result_code text CHECK (result_code IS NULL OR (length(result_code) BETWEEN 1 AND 80 AND result_code ~ '^[a-z0-9_-]+$')),
  ADD CONSTRAINT irp_ota_reservation_inbox_lease_state_check CHECK (
    (status = 'leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'leased' AND lease_token IS NULL AND lease_until IS NULL)
  );

DROP INDEX public.irp_ota_reservation_inbox_received_idx;
CREATE INDEX irp_ota_reservation_inbox_received_idx
  ON public.irp_ota_reservation_inbox(available_at, received_at)
  WHERE status = 'received' AND attempt_count < 8;

CREATE FUNCTION public.irp_ota_claim_booking_com_reservation(p_limit integer DEFAULT 10)
RETURNS SETOF public.irp_ota_reservation_inbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  bounded_limit integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid reservation claim limit' USING ERRCODE = '22023';
  END IF;
  bounded_limit := p_limit;

  RETURN QUERY
    WITH candidates AS (
      SELECT inbox.id
      FROM public.irp_ota_reservation_inbox inbox
      JOIN public.irp_ota_channel_connections connection
        ON connection.connection_id = inbox.connection_id AND connection.property_id = inbox.property_id
      JOIN public.properties property ON property.id = inbox.property_id AND property.active
      JOIN public.partners partner ON partner.id = property.partner_id AND partner.status = 'approved'
      WHERE connection.provider = 'booking_com'
        AND connection.environment = 'test'
        AND connection.enabled
        AND connection.partner_approved
        AND connection.pii_compliance_approved
        AND inbox.attempt_count < 8
        AND ((inbox.status = 'received' AND inbox.available_at <= clock_timestamp())
          OR (inbox.status = 'leased' AND inbox.lease_until <= clock_timestamp()))
      ORDER BY inbox.available_at, inbox.received_at, inbox.id
      FOR UPDATE OF inbox SKIP LOCKED
      LIMIT bounded_limit
    )
    UPDATE public.irp_ota_reservation_inbox inbox
       SET status = 'leased',
           attempt_count = inbox.attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_until = clock_timestamp() + interval '60 seconds'
      FROM candidates
     WHERE inbox.id = candidates.id
    RETURNING inbox.*;
END
$$;

CREATE FUNCTION public.irp_ota_finish_booking_com_reservation(
  p_inbox_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_result_code text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  saved public.irp_ota_reservation_inbox%rowtype;
  next_status text;
  retry_delay integer;
BEGIN
  IF p_inbox_id IS NULL OR p_lease_token IS NULL
     OR p_outcome IS NULL OR p_outcome NOT IN ('imported','retry','review')
     OR (p_result_code IS NOT NULL AND (length(p_result_code) NOT BETWEEN 1 AND 80 OR p_result_code !~ '^[a-z0-9_-]+$')) THEN
    RAISE EXCEPTION 'Invalid reservation processing result' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO saved FROM public.irp_ota_reservation_inbox
   WHERE id = p_inbox_id AND status = 'leased' AND lease_token = p_lease_token
     AND lease_until > clock_timestamp()
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  next_status := CASE
    WHEN p_outcome = 'retry' AND saved.attempt_count >= 8 THEN 'review'
    WHEN p_outcome = 'retry' THEN 'received'
    ELSE p_outcome
  END;
  retry_delay := LEAST(3600, power(2, LEAST(saved.attempt_count - 1, 12))::integer);

  UPDATE public.irp_ota_reservation_inbox
     SET status = next_status,
         available_at = CASE WHEN next_status = 'received'
           THEN clock_timestamp() + make_interval(secs => retry_delay) ELSE available_at END,
         result_code = p_result_code,
         lease_token = NULL,
         lease_until = NULL
   WHERE id = p_inbox_id;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.irp_ota_claim_booking_com_reservation(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_finish_booking_com_reservation(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_ota_claim_booking_com_reservation(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_finish_booking_com_reservation(uuid,uuid,text,text) TO service_role;

COMMIT;
