BEGIN;
-- Preserve approvals, original closes and signed correction history for review.
-- Disable both client versions of close so pending approvals cannot be bypassed.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_approve_service_forward(uuid,uuid,uuid,uuid,bigint,bigint,text,text,jsonb,jsonb,text),public.irp_pms_pilot_close_service_day_v2(uuid,uuid,uuid,bigint,text,text),public.irp_pms_pilot_close_service_day(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
