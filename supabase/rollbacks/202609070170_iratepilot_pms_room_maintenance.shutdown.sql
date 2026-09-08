BEGIN;
-- Targeted stop for new create/release maintenance commands only. Existing
-- closure records, dated enforcement and automatic scheduled expiry remain.
-- Keep maintenance reads and actor-specific receipt recovery available.
REVOKE EXECUTE ON FUNCTION
 public.irp_pms_pilot_create_room_closure(uuid,uuid,uuid,uuid,bigint,date,date,date,text),
 public.irp_pms_pilot_release_room_closure(uuid,uuid,uuid,uuid,bigint,date,text)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- This is not a complete PMS write stop. Booking, lifecycle, imports, signed
-- OTA SQL handling and other operations retain their normal authority and
-- maintenance capacity checks. Do not drop closures/helpers or restore old
-- admissions definitions: doing so would silently resell closed inventory.
