BEGIN;
-- Containment only: do not restore unsafe overdue admission predicates or erase
-- stay history, receipts, folios, property clocks, or occupancy projections.
REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_extend_stay(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
