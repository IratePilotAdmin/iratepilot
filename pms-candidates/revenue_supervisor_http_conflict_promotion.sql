-- Promote the independently authenticated isolated repair; no hotel data DML.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $repair$
DECLARE f oid := 'public.irp_pms_pilot_revenue_supervisor_review(uuid,uuid,uuid,bigint,text,uuid)'::regprocedure;
 source text; old_owner oid; old_acl aclitem[]; old_config text[]; old_security boolean;
BEGIN
 SELECT pg_get_functiondef(oid),proowner,proacl,proconfig,prosecdef INTO source,old_owner,old_acl,old_config,old_security FROM pg_proc WHERE oid=f;
 IF md5(source)<>'c4249df6f9d6a485d5805fb3ae347d91' THEN RAISE EXCEPTION 'Unexpected supervisor source; no change applied'; END IF;
 IF NOT old_security OR old_config<>ARRAY['search_path=pg_catalog'] OR has_function_privilege('anon',f,'EXECUTE') OR NOT has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected supervisor permissions; no change applied'; END IF;
 source:=replace(source, 'USING ERRCODE=''40001''', 'USING ERRCODE=''PT409''');
 EXECUTE source||';';
 IF md5(pg_get_functiondef(f))<>'ae12f9df71b5335f86614494ff07dff8' THEN RAISE EXCEPTION 'Unexpected repair fingerprint'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=f AND (proowner IS DISTINCT FROM old_owner OR proacl IS DISTINCT FROM old_acl OR proconfig IS DISTINCT FROM old_config OR prosecdef IS DISTINCT FROM old_security)) THEN RAISE EXCEPTION 'Supervisor security metadata changed'; END IF;
END $repair$;
