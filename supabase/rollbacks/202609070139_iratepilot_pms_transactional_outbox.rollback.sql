BEGIN;
-- Disable capture and worker entrypoints while retaining delivery evidence.
UPDATE public.irp_pms_outbox_connections SET enabled=false;
DROP TRIGGER IF EXISTS irp_pms_booking_outbox ON public.bookings;
DROP FUNCTION IF EXISTS public.irp_pms_finish_event(uuid,uuid,text,text);
DROP FUNCTION IF EXISTS public.irp_pms_claim_event();
DROP FUNCTION IF EXISTS public.irp_pms_enqueue_booking();
DROP FUNCTION IF EXISTS public.irp_pms_booking_payload(public.bookings);
-- Retain outbox, version heads, and configuration for reconciliation.
COMMIT;
