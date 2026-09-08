BEGIN;
-- Targeted direct-entrypoint shutdown. Do not restore the earlier revocation
-- races. Protected definer parents keep their existing authority; the invoker
-- public review wrapper fails when its private delegate is revoked.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_configure_property(uuid,uuid,text,text),
 public.irp_pms_pilot_save_room_type(uuid,uuid,uuid,text,integer),
 public.irp_pms_pilot_save_room(uuid,uuid,uuid,uuid,text),
 public.irp_pms_pilot_set_capacity(uuid,uuid,uuid,date,date,integer),
 public.irp_pms_pilot_create_reservation(uuid,uuid,uuid,uuid,text,date,date,integer,bigint,bigint),
 public.irp_pms_pilot_stage_import(uuid,uuid,uuid,text,jsonb),
 public.irp_pms_pilot_commit_import(uuid,uuid,uuid,uuid),
 public.irp_pms_pilot_discard_import(uuid,uuid,uuid,uuid),
 public.irp_pms_pilot_save_rate_plan(uuid,uuid,uuid,uuid,bigint,uuid,text,integer,boolean),
 public.irp_pms_pilot_save_rate_plan_v2(uuid,uuid,uuid,uuid,bigint,uuid,text,jsonb,boolean),
 public.irp_pms_pilot_set_nightly_rate(uuid,uuid,uuid,uuid,bigint,date,date,bigint),
 public.irp_pms_pilot_post_folio(uuid,uuid,uuid,uuid,text,bigint,text,text,uuid),
 public.irp_pms_pilot_amend_reservation(uuid,uuid,uuid,uuid,bigint,text,uuid,date,date,integer,bigint,bigint),
 public.irp_pms_pilot_extend_stay(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,text),
 irp_pms.reprocess_reservation(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
