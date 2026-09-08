-- Read-only171 preflight. Exact effective170 definitions, execution attributes
-- and observed retained role permissions. No configuration or data mutation.
DO $preflight$
DECLARE expected record;actual record;matched integer;
BEGIN
 IF to_regclass('irp_pms.turnover_tasks') IS NOT NULL OR to_regclass('irp_pms.turnover_origins') IS NOT NULL OR to_regclass('irp_pms.turnover_events') IS NOT NULL OR to_regclass('irp_pms.turnover_requests') IS NOT NULL THEN RAISE EXCEPTION 'Turnover171 storage already exists; inspect the release before proceeding';END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'Migration receipt table is required';END IF;
 SELECT count(*) INTO matched FROM supabase_migrations.schema_migrations WHERE version IN ('202609070142','202609070143','202609070144','202609070145','202609070146','202609070147','202609070149','202609070150','202609070151','202609070152','202609070153','202609070154','202609070155','202609070156','202609070158','202609070159','202609070160','202609070161','202609070162','202609070163','202609070164','202609070165','202609070166','202609070167','202609070168','202609070169','202609070170');
 IF matched<>27 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609070171') THEN RAISE EXCEPTION 'Require all 27 installed destination add-ons through170 and no171 receipt';END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('irp_pms.apply_operating_model(uuid, uuid, text, integer)','1c8a2cf85b994d73ea4fb0a055bf7591',false,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.apply_reservation(uuid, uuid, jsonb)','8f9b2eefa99b11fb9ff59d0adaf8a483',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.effective_capacity(uuid, uuid, uuid, date)','5bad369ad5cd5e1c08dbf7ab45e63ccd',false,'s','search_path=pg_catalog','integer',false,false,false),
 ('irp_pms.maintenance_capacity(uuid, uuid, uuid, date)','5d4c821ca818276a201c0e8d650e2f76',false,'s','search_path=pg_catalog','record',false,false,false),
 ('irp_pms.normalize_cleaning_fee(jsonb)','f93d2eb53ca20597d6ea1f0311288857',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.pilot_require(uuid, uuid, boolean)','cabb54e80f1484442d3a69e8c2c4daed',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.pilot_require_owner(uuid, uuid, boolean)','dcab1314bc63ce9c0b5e77b26c576c28',true,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.property_fee_guard()','7820e99301d9dfbe3ae70fc95384cbde',false,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.receive_reservation(uuid, uuid, text, text, bigint, text, jsonb, text)','13e11e82e3de65e17e88d6cac5c989d3',true,'v','search_path=pg_catalog','jsonb',false,false,true),
 ('irp_pms.reprocess_reservation(uuid, uuid, text, uuid, text)','faaed3f16c286f9a5fa1d152d31f8647',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('irp_pms.room_is_closed(uuid, uuid, uuid, date, date)','d39f002d92df7202515ad04de1d12924',false,'s','search_path=pg_catalog','boolean',false,false,false),
 ('irp_pms.room_occupancy_revision()','dd021b9da8824a3855f8bf13d5cb6314',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.room_state_revision()','eed1f5ad4a3598a9535ac203462233b1',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.validate_import(uuid, uuid, text, jsonb)','ba40249b57cf399dc2cf2a55d7c7945d',true,'v','search_path=pg_catalog','jsonb',false,false,false),
 ('public.irp_pms_pilot_amend_reservation(uuid, uuid, uuid, uuid, bigint, text, uuid, date, date, integer, bigint, bigint)','8cfd104c333c05d1ca6a75c98f2b54be',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_book_quote(uuid, uuid, uuid, uuid, text)','af6db4a4b2b7917a02e05e55ce1b60ed',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_cancel_reservation(uuid, uuid, uuid, uuid, bigint, date, text)','9fca6b895ea73e815ce531310bb528ee',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_commit_import(uuid, uuid, uuid, uuid)','42bbc493107f7c44c1d0a3e3a91cf540',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_configure_operating_model(uuid, uuid, uuid, bigint, text, integer)','3b34e677aac99bf830be9e808612031e',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_configure_property(uuid, uuid, text, text)','9be29108224bf0ecd0c63e1ba5fb555c',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_create_reservation(uuid, uuid, uuid, uuid, text, date, date, integer, bigint, bigint)','91034c36275ffaad4b212c35213c499f',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_create_room_closure(uuid, uuid, uuid, uuid, bigint, date, date, date, text)','c70af55189fd394ae2d31efc9f1a1660',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_extend_stay(uuid, uuid, uuid, uuid, bigint, date, bigint, bigint, text)','d90b22a3519cf447e93965d131ad0379',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_housekeeping(uuid, uuid, uuid, text)','50c04bb7ba40b44d6e6e7c8e6bccfdf8',true,'v','search_path=pg_catalog','jsonb',false,false,false),
 ('public.irp_pms_pilot_maintenance(uuid, uuid, date, date)','53bf3b78ee8a491a3fa2ac2f6327d6c7',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_maintenance_request_status(uuid, uuid, uuid)','526a5c5d43517c77566a49634568abd3',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_move_room(uuid, uuid, uuid, uuid, bigint, uuid, bigint, uuid, bigint, text)','553a880a7283d0ae150f3fa5476524a5',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_operational_report(uuid, uuid, date, date)','6167970d76fd1ce8e8d36c7d00ed863f',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_release_room_closure(uuid, uuid, uuid, uuid, bigint, date, text)','88f60e31713647de48bda7b56dd17499',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_set_capacity(uuid, uuid, uuid, date, date, integer)','c2ac121401bd71ac651c0531e09b882e',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_set_housekeeping(uuid, uuid, uuid, uuid, bigint, text)','9e5fcc28a49bfc92f217e7ccc0751841',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_stage_import(uuid, uuid, uuid, text, jsonb)','a57664584c457877491b96fb34403bac',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_stay_action(uuid, uuid, uuid, text, uuid)','42c1a4bebd42466a6db4c89ff8fc976c',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_workspace(uuid, uuid)','78b21220dcb6784b7c92abcff1b4dd07',true,'s','search_path=pg_catalog','jsonb',false,true,true)
 ) e(signature,body_md5,definer,volatility,config,returns,anon,authenticated,service_role) LOOP
  SELECT p.*,array_to_string(p.proconfig,',') config_string,p.prorettype::regtype::text return_name INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
  IF NOT FOUND OR md5(regexp_replace(actual.prosrc,E'\r\n?',E'\n','g'))<>expected.body_md5 OR actual.prosecdef<>expected.definer OR actual.provolatile::text<>expected.volatility OR actual.config_string IS DISTINCT FROM expected.config OR actual.return_name<>expected.returns THEN RAISE EXCEPTION 'Effective170 definition differs: %',expected.signature;END IF;
  IF has_function_privilege('anon',actual.oid,'EXECUTE')<>expected.anon OR has_function_privilege('authenticated',actual.oid,'EXECUTE')<>expected.authenticated OR has_function_privilege('service_role',actual.oid,'EXECUTE')<>expected.service_role THEN RAISE EXCEPTION 'Effective170 execution grants differ: %',expected.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmed test organization owner required for transaction proof';END IF;
END $preflight$;
SELECT 'turnover_preflight_passed' AS verification;
