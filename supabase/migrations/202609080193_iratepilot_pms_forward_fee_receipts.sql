BEGIN;
DO $upgrade$
DECLARE definition text;needle text;
BEGIN
 definition:=pg_get_functiondef('public.irp_pms_pilot_approve_service_forward(uuid,uuid,uuid,uuid,bigint,bigint,text,text,jsonb,jsonb,text)'::regprocedure);
 needle:='''adjustment_id'',approval.id,''reservation_id'',p_reservation';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Unexpected forward receipt definition';END IF;
 EXECUTE replace(definition,needle,'''adjustment_id'',approval.id,''fee_buckets'',approval.fee_buckets,''reservation_id'',p_reservation');
 definition:=pg_get_functiondef('irp_pms.service_forward_data(uuid,uuid,uuid)'::regprocedure);
 needle:='''adjustment_id'',a.id,''service_date'',a.service_date';
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Unexpected forward history definition';END IF;
 EXECUTE replace(definition,needle,'''adjustment_id'',a.id,''fee_buckets'',a.fee_buckets,''service_date'',a.service_date');
END $upgrade$;
COMMIT;
