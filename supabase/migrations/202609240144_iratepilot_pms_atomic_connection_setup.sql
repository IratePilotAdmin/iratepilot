BEGIN;

-- Configure the reservation and ARI sides in one transaction. A failure in
-- either helper rolls back both records, preventing a half-configured scope.
CREATE FUNCTION public.irp_pms_configure_native_connection(
  p_request uuid,
  p_actor uuid,
  p_property uuid,
  p_connection text,
  p_tenant uuid,
  p_pms_property uuid,
  p_secret_ciphertext text,
  p_secret_iv text,
  p_secret_tag text,
  p_secret_key_version integer,
  p_mappings jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  reservation_result jsonb;
  ari_result jsonb;
BEGIN
  reservation_result := public.irp_pms_configure_reservation_connection(
    p_request, p_actor, p_property, p_connection, p_tenant, p_pms_property
  );
  ari_result := public.irp_pms_save_native_ari_connection(
    p_connection, p_property, p_pms_property::text, p_secret_ciphertext,
    p_secret_iv, p_secret_tag, p_secret_key_version, p_mappings
  );
  RETURN jsonb_build_object(
    'reservationConnection', reservation_result,
    'ariConnection', ari_result,
    'captureEnabled', false,
    'deliveryEnabled', false,
    'environment', 'sandbox'
  );
END
$$;

REVOKE ALL ON FUNCTION public.irp_pms_configure_native_connection(
  uuid, uuid, uuid, text, uuid, uuid, text, text, text, integer, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_configure_native_connection(
  uuid, uuid, uuid, text, uuid, uuid, text, text, text, integer, jsonb
) TO service_role;

COMMIT;
