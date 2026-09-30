BEGIN;

ALTER TABLE public.irp_ota_reservation_inbox
  ALTER COLUMN pii_ciphertext DROP NOT NULL,
  ALTER COLUMN pii_initialization_vector DROP NOT NULL,
  ALTER COLUMN pii_authentication_tag DROP NOT NULL,
  ADD COLUMN pii_purged_at timestamptz;

ALTER TABLE public.irp_ota_reservation_inbox
  DROP CONSTRAINT irp_ota_reservation_inbox_pii_ciphertext_check,
  DROP CONSTRAINT irp_ota_reservation_inbox_pii_initialization_vector_check,
  DROP CONSTRAINT irp_ota_reservation_inbox_pii_authentication_tag_check,
  ADD CONSTRAINT irp_ota_reservation_inbox_pii_retention_state_check CHECK (
    (
      pii_purged_at IS NULL
      AND pii_ciphertext IS NOT NULL AND length(pii_ciphertext) BETWEEN 1 AND 200000
      AND pii_initialization_vector IS NOT NULL AND pii_initialization_vector ~ '^[A-Za-z0-9+/]{16}$'
      AND pii_authentication_tag IS NOT NULL AND pii_authentication_tag ~ '^[A-Za-z0-9+/]{22}==$'
    )
    OR (
      pii_purged_at IS NOT NULL AND status = 'imported'
      AND pii_ciphertext IS NULL AND pii_initialization_vector IS NULL AND pii_authentication_tag IS NULL
    )
  );

CREATE FUNCTION public.irp_ota_purge_booking_com_reservation_pii(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE purged_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid PII retention batch limit' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT id
    FROM public.irp_ota_reservation_inbox
    WHERE status = 'imported' AND pii_purged_at IS NULL
      AND received_at <= clock_timestamp() - interval '30 days'
    ORDER BY received_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), purged AS (
    UPDATE public.irp_ota_reservation_inbox inbox
    SET pii_ciphertext = NULL,
        pii_initialization_vector = NULL,
        pii_authentication_tag = NULL,
        pii_purged_at = clock_timestamp()
    FROM candidates
    WHERE inbox.id = candidates.id
    RETURNING inbox.id
  )
  SELECT count(*)::integer INTO purged_count FROM purged;
  RETURN purged_count;
END
$$;

REVOKE ALL ON FUNCTION public.irp_ota_purge_booking_com_reservation_pii(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_ota_purge_booking_com_reservation_pii(integer)
  TO service_role;

COMMIT;
