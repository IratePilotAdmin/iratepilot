BEGIN;

-- Let the server-side outbox worker discover every explicitly enabled sandbox
-- property scope without exposing encrypted signing material to hotel users.
CREATE OR REPLACE FUNCTION public.irp_pms_list_configured_delivery_connections()
RETURNS TABLE (
  connection_id text,
  property_id uuid,
  tenant_id text,
  pms_property_id text,
  secret_ciphertext text,
  secret_initialization_vector text,
  secret_authentication_tag text,
  secret_key_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.connection_id,
         c.property_id,
         c.tenant_id,
         c.pms_property_id,
         a.secret_ciphertext,
         a.secret_initialization_vector,
         a.secret_authentication_tag,
         a.secret_key_version
  FROM public.irp_pms_outbox_connections AS c
  LEFT JOIN public.irp_pms_native_ari_connections AS a
    ON a.property_id = c.property_id
   AND a.connection_id = c.connection_id
   AND a.pms_property_id = c.pms_property_id
  WHERE c.enabled
    AND c.delivery_enabled
    AND c.environment = 'sandbox'
  ORDER BY c.property_id
  LIMIT 101;
$$;

REVOKE ALL ON FUNCTION public.irp_pms_list_configured_delivery_connections()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_list_configured_delivery_connections()
  TO service_role;

COMMIT;
