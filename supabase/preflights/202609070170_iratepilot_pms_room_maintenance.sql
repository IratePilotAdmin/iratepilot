-- Read-only170 preflight: exact effective169 bodies/signatures/attributes and permissions.
-- Hashes normalize CRLF only, allowing identical source pasted on another OS.
DO $preflight$
DECLARE expected record;actual record;matched integer;
BEGIN
 IF to_regclass('irp_pms.room_closures') IS NOT NULL OR to_regclass('irp_pms.maintenance_requests') IS NOT NULL THEN RAISE EXCEPTION 'Maintenance170 storage already exists; inspect the installed release before proceeding';END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'Migration receipt table is required';END IF;
 SELECT count(*) INTO matched FROM supabase_migrations.schema_migrations WHERE version IN ('202609070142','202609070143','202609070144','202609070145','202609070146','202609070147','202609070149','202609070150','202609070151','202609070152','202609070153','202609070154','202609070155','202609070156','202609070158','202609070159','202609070160','202609070161','202609070162','202609070163','202609070164','202609070165','202609070166','202609070167','202609070168','202609070169');
 IF matched<>26 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609070170') THEN RAISE EXCEPTION 'Require all26 destination add-ons through169 and no170 receipt';END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('irp_pms.apply_operating_model(uuid, uuid, text, integer)','d6427fa5d4b4202e5d253de96e125f5e',false,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.apply_reservation(uuid, uuid, jsonb)','79f6e40cedefe077711a66e52ed17be1',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.receive_reservation(uuid, uuid, text, text, bigint, text, jsonb, text)','13e11e82e3de65e17e88d6cac5c989d3',true,'v','search_path=pg_catalog','jsonb',false,false,true),
 ('irp_pms.reprocess_reservation(uuid, uuid, text, uuid, text)','faaed3f16c286f9a5fa1d152d31f8647',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('irp_pms.room_state_revision()','8eb073fac1e157973bdd577d2bd3c648',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.validate_import(uuid, uuid, text, jsonb)','ce6ccff31b6d9a1bce4a7df3d2083d8d',true,'v','search_path=pg_catalog','jsonb',false,false,false),
 ('public.irp_pms_pilot_amend_reservation(uuid, uuid, uuid, uuid, bigint, text, uuid, date, date, integer, bigint, bigint)','db90edfc2ed0a36b91f1ffdfbd30b414',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_book_quote(uuid, uuid, uuid, uuid, text)','af6db4a4b2b7917a02e05e55ce1b60ed',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_cancel_reservation(uuid, uuid, uuid, uuid, bigint, date, text)','9fca6b895ea73e815ce531310bb528ee',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_commit_import(uuid, uuid, uuid, uuid)','42bbc493107f7c44c1d0a3e3a91cf540',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_configure_operating_model(uuid, uuid, uuid, bigint, text, integer)','3b34e677aac99bf830be9e808612031e',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_configure_property(uuid, uuid, text, text)','bee5b8de3dd97ac873382ccb6dc83c18',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_create_reservation(uuid, uuid, uuid, uuid, text, date, date, integer, bigint, bigint)','6458a5cec0cb095fc471169de2491092',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_extend_stay(uuid, uuid, uuid, uuid, bigint, date, bigint, bigint, text)','3c585612f3790f5b77743233f7548c51',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_move_room(uuid, uuid, uuid, uuid, bigint, uuid, bigint, uuid, bigint, text)','fcef44585c9bebcf3335344aa0db19e6',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_operational_report(uuid, uuid, date, date)','9abd71f1deaf511db79c58c86d36520a',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_set_capacity(uuid, uuid, uuid, date, date, integer)','12026fe0ee3938eb9403b16ff6d86f0b',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_set_housekeeping(uuid, uuid, uuid, uuid, bigint, text)','9e5fcc28a49bfc92f217e7ccc0751841',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_stage_import(uuid, uuid, uuid, text, jsonb)','a57664584c457877491b96fb34403bac',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_stay_action(uuid, uuid, uuid, text, uuid)','99c29bca0b77ba80cbda33fda5761c2a',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_workspace(uuid, uuid)','eb836ca43b4b479e129871e0038496f0',true,'s','search_path=pg_catalog','jsonb',false,true,true)
 ) e(signature,body_md5,definer,volatility,config,returns,anon,authenticated,service_role) LOOP
  SELECT p.*,array_to_string(p.proconfig,',') AS config_string,p.prorettype::regtype::text AS return_name INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
  IF NOT FOUND OR md5(regexp_replace(actual.prosrc,E'\r\n?',E'\n','g'))<>expected.body_md5 OR actual.prosecdef<>expected.definer OR actual.provolatile::text<>expected.volatility OR actual.config_string IS DISTINCT FROM expected.config OR actual.return_name<>expected.returns THEN RAISE EXCEPTION 'Effective169 definition differs: %',expected.signature;END IF;
  IF has_function_privilege('anon',actual.oid,'EXECUTE')<>expected.anon OR has_function_privilege('authenticated',actual.oid,'EXECUTE')<>expected.authenticated OR has_function_privilege('service_role',actual.oid,'EXECUTE')<>expected.service_role THEN RAISE EXCEPTION 'Effective169 execution grants differ: %',expected.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmed test organization owner required for transaction proof';END IF;
END $preflight$;
SELECT 'room_maintenance_preflight_passed' AS verification;
