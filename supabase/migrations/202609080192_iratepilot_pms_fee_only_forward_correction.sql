BEGIN;
DO $upgrade$
DECLARE definition text;needle text:='THEN RAISE EXCEPTION ''No financial correction or unresolved review remains''';replacement text;
BEGIN
 definition:=pg_get_functiondef('public.irp_pms_pilot_approve_service_forward(uuid,uuid,uuid,uuid,bigint,bigint,text,text,jsonb,jsonb,text)'::regprocedure);
 IF strpos(definition,needle)=0 OR strpos(definition,'suggested_fee_delta')>0 THEN RAISE EXCEPTION 'Unexpected forward approval definition';END IF;
 replacement:='AND NOT EXISTS(SELECT 1 FROM jsonb_each(coalesce(nullif(data->''suggested_fee_delta'',''null''::jsonb),''{}''::jsonb)) WHERE (value#>>''{}'')::bigint<>0) THEN RAISE EXCEPTION ''No financial correction or unresolved review remains''';
 EXECUTE replace(definition,needle,replacement);
END $upgrade$;
COMMIT;
