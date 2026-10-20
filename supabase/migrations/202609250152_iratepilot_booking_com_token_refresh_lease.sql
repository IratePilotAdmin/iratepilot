BEGIN;

-- Serialize provider token exchanges across cron and web instances. The
-- existing attempt ledger continues to enforce Booking.com's account limit;
-- this short lease prevents parallel workers from each spending one attempt.
ALTER TABLE public.irp_ota_machine_accounts
  ADD COLUMN token_refresh_lease uuid,
  ADD COLUMN token_refresh_lease_expires_at timestamptz,
  ADD CONSTRAINT irp_ota_machine_account_refresh_lease_pair_check
    CHECK ((token_refresh_lease IS NULL) = (token_refresh_lease_expires_at IS NULL));

CREATE FUNCTION public.irp_ota_acquire_booking_com_token_refresh_lease(
  p_machine_account_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  a public.irp_ota_machine_accounts%rowtype;
  request_time timestamptz := clock_timestamp();
  recent_attempts integer;
BEGIN
  IF p_machine_account_id IS NULL OR p_lease_token IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'account_unavailable');
  END IF;

  SELECT * INTO a
    FROM public.irp_ota_machine_accounts
    WHERE id = p_machine_account_id
    FOR UPDATE;
  IF NOT FOUND OR a.provider <> 'booking_com' OR a.environment <> 'test'
     OR NOT a.enabled OR NOT a.partner_approved OR a.approved_at IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.irp_ota_channel_connections c
       JOIN public.properties p ON p.id = c.property_id AND p.active
       JOIN public.partners partner ON partner.id = p.partner_id AND partner.status = 'approved'
       WHERE c.machine_account_id = a.id AND c.property_id = a.property_id
         AND c.provider = 'booking_com' AND c.environment = 'test'
         AND c.enabled AND c.partner_approved
     ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'account_unavailable');
  END IF;

  IF a.token_refresh_lease IS NOT NULL AND a.token_refresh_lease_expires_at > request_time THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'refresh_in_progress');
  END IF;

  SELECT count(*)::integer INTO recent_attempts
    FROM public.irp_ota_machine_account_token_attempts
    WHERE machine_account_id = a.id AND requested_at > request_time - interval '1 hour';
  IF recent_attempts >= 30 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.irp_ota_machine_account_token_attempts(machine_account_id, requested_at)
    VALUES (a.id, request_time);
  UPDATE public.irp_ota_machine_accounts
    SET token_refresh_lease = p_lease_token,
        token_refresh_lease_expires_at = request_time + interval '30 seconds',
        updated_at = request_time
    WHERE id = a.id;
  RETURN jsonb_build_object('allowed', true, 'reason', 'acquired', 'attemptsRemaining', 29 - recent_attempts);
END
$$;

CREATE FUNCTION public.irp_ota_release_booking_com_token_refresh_lease(
  p_machine_account_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE released_count integer;
BEGIN
  IF p_machine_account_id IS NULL OR p_lease_token IS NULL THEN RETURN false; END IF;
  UPDATE public.irp_ota_machine_accounts
    SET token_refresh_lease = NULL,
        token_refresh_lease_expires_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = p_machine_account_id AND token_refresh_lease = p_lease_token;
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count > 0;
END
$$;

CREATE FUNCTION public.irp_ota_commit_booking_com_token_refresh(
  p_machine_account_id uuid,
  p_expected_ciphertext text,
  p_lease_token uuid,
  p_ciphertext text,
  p_initialization_vector text,
  p_authentication_tag text,
  p_key_version integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE updated_count integer;
BEGIN
  IF p_machine_account_id IS NULL OR p_lease_token IS NULL OR p_expected_ciphertext IS NULL
     OR p_ciphertext IS NULL OR p_initialization_vector IS NULL OR p_authentication_tag IS NULL
     OR p_key_version IS NULL OR p_key_version <= 0 THEN
    RETURN false;
  END IF;
  UPDATE public.irp_ota_machine_accounts
    SET credentials_ciphertext = p_ciphertext,
        credentials_initialization_vector = p_initialization_vector,
        credentials_authentication_tag = p_authentication_tag,
        credentials_key_version = p_key_version,
        token_refresh_lease = NULL,
        token_refresh_lease_expires_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = p_machine_account_id
      AND credentials_ciphertext = p_expected_ciphertext
      AND token_refresh_lease = p_lease_token
      AND token_refresh_lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END
$$;

REVOKE ALL ON FUNCTION public.irp_ota_acquire_booking_com_token_refresh_lease(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_release_booking_com_token_refresh_lease(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_commit_booking_com_token_refresh(uuid, text, uuid, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_ota_acquire_booking_com_token_refresh_lease(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_release_booking_com_token_refresh_lease(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_commit_booking_com_token_refresh(uuid, text, uuid, text, text, text, integer)
  TO service_role;

COMMIT;
