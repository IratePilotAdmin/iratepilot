BEGIN;
-- Stop the worker and reconcile in-flight requests before running this script.
UPDATE public.irp_pms_outbox_connections SET delivery_enabled=false;
DROP FUNCTION IF EXISTS public.irp_pms_set_delivery(uuid,uuid,boolean,boolean,text);
-- Retain audit receipts. Capture remains on until rollback 140 if needed.
COMMIT;
