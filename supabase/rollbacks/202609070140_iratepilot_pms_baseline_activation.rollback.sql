BEGIN;
-- Stop workers first: already leased HTTP requests cannot be recalled by SQL.
UPDATE public.irp_pms_outbox_connections SET delivery_enabled=false,enabled=false;
DROP FUNCTION IF EXISTS public.irp_pms_prepare_baseline(uuid,uuid,date,integer);
DROP FUNCTION IF EXISTS public.irp_pms_release_baseline(uuid,uuid,text);
-- Retain delivery gate, baseline ledger and restrictive grants (fail closed).
-- Run rollback 139 next only if removing capture entirely. No automatic resume.
COMMIT;
