BEGIN;

-- The shared encrypted inbox is currently implemented only for Booking.com.
-- Enforce that boundary in the database even if another provider connection is
-- accidentally passed to the service-role staging RPC.
CREATE FUNCTION public.irp_ota_require_booking_com_inbox_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.irp_ota_channel_connections c
     WHERE c.connection_id = NEW.connection_id
       AND c.property_id = NEW.property_id
       AND c.provider = 'booking_com'
       AND c.environment = 'test'
  ) THEN
    RAISE EXCEPTION 'OTA reservation inbox provider is not supported' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER irp_ota_reservation_inbox_booking_com_only
  BEFORE INSERT OR UPDATE OF connection_id, property_id
  ON public.irp_ota_reservation_inbox
  FOR EACH ROW
  EXECUTE FUNCTION public.irp_ota_require_booking_com_inbox_provider();

REVOKE ALL ON FUNCTION public.irp_ota_require_booking_com_inbox_provider() FROM PUBLIC, anon, authenticated;

COMMIT;
