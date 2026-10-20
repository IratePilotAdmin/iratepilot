BEGIN;

ALTER TABLE public.irp_ota_machine_accounts
  ADD COLUMN credential_rotation_lease uuid,
  ADD COLUMN credential_rotation_lease_expires_at timestamptz,
  ADD CONSTRAINT irp_ota_machine_account_rotation_lease_pair_check
    CHECK ((credential_rotation_lease IS NULL) = (credential_rotation_lease_expires_at IS NULL));

CREATE FUNCTION public.irp_ota_claim_booking_com_credential_rotation(
  p_target_key_version integer,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  credentials_ciphertext text,
  credentials_initialization_vector text,
  credentials_authentication_tag text,
  credentials_key_version integer,
  lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE claimed_at timestamptz := clock_timestamp();
BEGIN
  IF p_target_key_version IS NULL OR p_target_key_version NOT IN (1, 2)
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 25 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT a.id
    FROM public.irp_ota_machine_accounts a
    WHERE a.provider = 'booking_com' AND a.environment = 'test'
      AND a.credentials_key_version <> p_target_key_version
      AND (a.credential_rotation_lease IS NULL OR a.credential_rotation_lease_expires_at <= claimed_at)
      AND (a.token_refresh_lease IS NULL OR a.token_refresh_lease_expires_at <= claimed_at)
    ORDER BY a.updated_at, a.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.irp_ota_machine_accounts a
    SET credential_rotation_lease = gen_random_uuid(),
        credential_rotation_lease_expires_at = claimed_at + interval '2 minutes',
        updated_at = claimed_at
    FROM candidates c
    WHERE a.id = c.id
    RETURNING a.id, a.credentials_ciphertext, a.credentials_initialization_vector,
      a.credentials_authentication_tag, a.credentials_key_version, a.credential_rotation_lease
  )
  SELECT claimed.id, claimed.credentials_ciphertext, claimed.credentials_initialization_vector,
    claimed.credentials_authentication_tag, claimed.credentials_key_version, claimed.credential_rotation_lease
  FROM claimed;
END
$$;

CREATE FUNCTION public.irp_ota_commit_booking_com_credential_rotation(
  p_machine_account_id uuid,
  p_lease_token uuid,
  p_expected_ciphertext text,
  p_expected_initialization_vector text,
  p_expected_authentication_tag text,
  p_expected_key_version integer,
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
  IF p_machine_account_id IS NULL OR p_lease_token IS NULL
     OR p_expected_ciphertext IS NULL OR p_expected_initialization_vector IS NULL
     OR p_expected_authentication_tag IS NULL OR p_expected_key_version IS NULL
     OR p_expected_key_version NOT IN (1, 2)
     OR p_ciphertext IS NULL OR length(p_ciphertext) NOT BETWEEN 1 AND 22000
     OR p_initialization_vector IS NULL OR p_initialization_vector !~ '^[A-Za-z0-9+/]{16}$'
     OR p_authentication_tag IS NULL OR p_authentication_tag !~ '^[A-Za-z0-9+/]{22}==$'
     OR p_key_version IS NULL OR p_key_version NOT IN (1, 2)
     OR p_key_version = p_expected_key_version THEN
    RETURN false;
  END IF;

  UPDATE public.irp_ota_machine_accounts
  SET credentials_ciphertext = p_ciphertext,
      credentials_initialization_vector = p_initialization_vector,
      credentials_authentication_tag = p_authentication_tag,
      credentials_key_version = p_key_version,
      credential_rotation_lease = NULL,
      credential_rotation_lease_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_machine_account_id AND provider = 'booking_com' AND environment = 'test'
    AND credential_rotation_lease = p_lease_token
    AND credential_rotation_lease_expires_at > clock_timestamp()
    AND credentials_ciphertext = p_expected_ciphertext
    AND credentials_initialization_vector = p_expected_initialization_vector
    AND credentials_authentication_tag = p_expected_authentication_tag
    AND credentials_key_version = p_expected_key_version;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END
$$;

CREATE FUNCTION public.irp_ota_release_booking_com_credential_rotation(
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
  SET credential_rotation_lease = NULL,
      credential_rotation_lease_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_machine_account_id AND credential_rotation_lease = p_lease_token;
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count > 0;
END
$$;

REVOKE ALL ON FUNCTION public.irp_ota_claim_booking_com_credential_rotation(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_commit_booking_com_credential_rotation(uuid, uuid, text, text, text, integer, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.irp_ota_release_booking_com_credential_rotation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_ota_claim_booking_com_credential_rotation(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_commit_booking_com_credential_rotation(uuid, uuid, text, text, text, integer, text, text, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.irp_ota_release_booking_com_credential_rotation(uuid, uuid)
  TO service_role;

COMMIT;
