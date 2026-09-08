BEGIN;
-- Stop new manual creation and task transitions. Keep current queue reads,
-- actor-specific receipt lookup, lifecycle enqueue and readiness gates intact.
REVOKE EXECUTE ON FUNCTION
 public.irp_pms_pilot_create_turnover(uuid,uuid,uuid,uuid,bigint,date,date,uuid,text),
 public.irp_pms_pilot_update_turnover(uuid,uuid,uuid,uuid,bigint,bigint,date,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- This is a targeted task-command stop, not a complete operational write stop.
-- Checkout, room move and explicit vacant Dirty still record required work;
-- unfinished work continues to block check-in/move targets. Legacy exact
-- housekeeping recovery remains available. Do not restore Clean/Inspect
-- setters or drop task tables/helpers: that would bypass readiness history.
