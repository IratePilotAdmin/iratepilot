-- Targeted174 pause: block NEW method/evidence saves. Keep current reads,
-- actor-only receipt recovery and nonfinancial request retirement available.
-- History and all existing financial/173 functions remain in place.
BEGIN;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_payment_record_review(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
