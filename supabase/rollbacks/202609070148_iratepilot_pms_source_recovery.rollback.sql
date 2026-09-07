BEGIN;
REVOKE EXECUTE ON FUNCTION public.irp_pms_requeue_review(text,uuid,uuid,integer,integer,text) FROM service_role;
-- Keep event state, recovery generations, and audit records. Use delivery
-- control to pause transport separately; shutdown never erases booking history.
COMMIT;
