BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Read-only173 preflight. Frozen172 effective definitions, observed retained
-- grants and53 table column shapes; no configuration or financial mutation.
DO $preflight$
DECLARE expected record;actual record;matched integer;column_hash text;
BEGIN
 IF to_regprocedure('public.irp_pms_pilot_guest_documents(uuid,uuid,uuid)') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' AND p.proname LIKE 'guest_document_%') THEN RAISE EXCEPTION 'Guest-documents173 functions already exist; inspect before proceeding';END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'Migration receipt table is required';END IF;
 SELECT count(*) INTO matched FROM supabase_migrations.schema_migrations WHERE version IN ('202609070142','202609070143','202609070144','202609070145','202609070146','202609070147','202609070149','202609070150','202609070151','202609070152','202609070153','202609070154','202609070155','202609070156','202609070158','202609070159','202609070160','202609070161','202609070162','202609070163','202609070164','202609070165','202609070166','202609070167','202609070168','202609070169','202609070170','202609070171','202609070172');
 IF matched<>29 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609070173') THEN RAISE EXCEPTION 'Require all29 installed destination add-ons through172 and no173 receipt';END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('irp_pms.apply_operating_model(uuid, uuid, text, integer)','8cfaf0f913962f4d96e82cdac6c617da',false,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.apply_reservation(uuid, uuid, jsonb)','8f9b2eefa99b11fb9ff59d0adaf8a483',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.effective_capacity(uuid, uuid, uuid, date)','5bad369ad5cd5e1c08dbf7ab45e63ccd',false,'s','search_path=pg_catalog','integer',false,false,false),
 ('irp_pms.enqueue_turnover(uuid, uuid, uuid, text, text, uuid, bigint, uuid, timestamp with time zone, text, date, uuid)','d44ef3fe132b4823db819aa166f924a7',false,'v','search_path=pg_catalog','uuid',false,false,false),
 ('irp_pms.maintenance_capacity(uuid, uuid, uuid, date)','5d4c821ca818276a201c0e8d650e2f76',false,'s','search_path=pg_catalog','record',false,false,false),
 ('irp_pms.normalize_cleaning_fee(jsonb)','f93d2eb53ca20597d6ea1f0311288857',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.normalize_guest_data(jsonb, text)','0388fc6f0233c187a050025c636a2dde',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.normalize_security_deposit_command(jsonb)','c824fe057a7f4dfda989891919de4e0d',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.pilot_require(uuid, uuid, boolean)','cabb54e80f1484442d3a69e8c2c4daed',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.pilot_require_owner(uuid, uuid, boolean)','dcab1314bc63ce9c0b5e77b26c576c28',true,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.property_fee_guard()','7820e99301d9dfbe3ae70fc95384cbde',false,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.receive_reservation(uuid, uuid, text, text, bigint, text, jsonb, text)','13e11e82e3de65e17e88d6cac5c989d3',true,'v','search_path=pg_catalog','jsonb',false,false,true),
 ('irp_pms.reprocess_reservation(uuid, uuid, text, uuid, text)','faaed3f16c286f9a5fa1d152d31f8647',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('irp_pms.room_is_closed(uuid, uuid, uuid, date, date)','d39f002d92df7202515ad04de1d12924',false,'s','search_path=pg_catalog','boolean',false,false,false),
 ('irp_pms.room_occupancy_revision()','dd021b9da8824a3855f8bf13d5cb6314',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.room_state_revision()','eed1f5ad4a3598a9535ac203462233b1',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.security_deposit_book_json(uuid, uuid, uuid, bigint)','75d9512992af1a433af841299dc15eb3',false,'s','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.security_deposit_consistency()','9d1df6e7a9b2788b9e227a1d80052cde',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.security_deposit_event_json(irp_pms.security_deposit_events)','072392c3d0e7c9f7e562426973eb41a8',false,'s','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.security_deposit_history_guard()','a473ca42693f44019841b6e3ca2e15d0',false,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.security_deposit_insert_guard()','d76bddad52766ec53fb6977c745505dc',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.security_deposit_reservation_json(uuid, uuid, uuid)','5cddf4d1e5e14aae21aa33b84297d457',false,'s','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.security_deposit_result_json(uuid, uuid, uuid)','b927763952e4e18e6844b7c07a589447',false,'s','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.security_deposit_retired_json(irp_pms.security_deposit_requests)','7a102daa810d2a0755633479293c3794',false,'s','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.turnover_checklist(text)','2c192abe2e15282819988683a2ef652d',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.turnover_history_guard()','b286087dcdd153b8a331e834e8f6e231',false,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.turnover_property_guard()','e21c72b52c9dafb04f79067865d11d9c',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.turnover_snapshot_guard()','d01f8da61806d2d707c479930c1a26f5',true,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.turnover_task_json(uuid, uuid, uuid, date)','65b5d424572658f8fcbd81094606a5df',false,'s','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.validate_import(uuid, uuid, text, jsonb)','ba40249b57cf399dc2cf2a55d7c7945d',true,'v','search_path=pg_catalog','jsonb',false,false,false),
 ('public.irp_pms_pilot_amend_reservation(uuid, uuid, uuid, uuid, bigint, text, uuid, date, date, integer, bigint, bigint)','8cfd104c333c05d1ca6a75c98f2b54be',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_book_quote(uuid, uuid, uuid, uuid, text)','af6db4a4b2b7917a02e05e55ce1b60ed',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_cancel_reservation(uuid, uuid, uuid, uuid, bigint, date, text)','9fca6b895ea73e815ce531310bb528ee',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_commit_import(uuid, uuid, uuid, uuid)','42bbc493107f7c44c1d0a3e3a91cf540',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_configure_operating_model(uuid, uuid, uuid, bigint, text, integer)','3b34e677aac99bf830be9e808612031e',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_configure_property(uuid, uuid, text, text)','b7665dfcf6648136a27b47d25951ddfd',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_create_reservation(uuid, uuid, uuid, uuid, text, date, date, integer, bigint, bigint)','91034c36275ffaad4b212c35213c499f',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_create_room_closure(uuid, uuid, uuid, uuid, bigint, date, date, date, text)','c70af55189fd394ae2d31efc9f1a1660',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_create_turnover(uuid, uuid, uuid, uuid, bigint, date, date, uuid, text)','147a845774cc3b203bb8f77184cce0f7',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_extend_stay(uuid, uuid, uuid, uuid, bigint, date, bigint, bigint, text)','d90b22a3519cf447e93965d131ad0379',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_folio(uuid, uuid, uuid)','6b6ae71bd85bb4ceb47081a8ffe1957c',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_guest_profile(uuid, uuid, uuid)','a36fa44f48b62ae8737ee7a0cf7d69fe',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_housekeeping(uuid, uuid, uuid, text)','50c04bb7ba40b44d6e6e7c8e6bccfdf8',true,'v','search_path=pg_catalog','jsonb',false,false,false),
 ('public.irp_pms_pilot_maintenance(uuid, uuid, date, date)','53bf3b78ee8a491a3fa2ac2f6327d6c7',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_maintenance_request_status(uuid, uuid, uuid)','526a5c5d43517c77566a49634568abd3',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_move_room(uuid, uuid, uuid, uuid, bigint, uuid, bigint, uuid, bigint, text)','ace648612ff1847ee313d36d81591a0f',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_operational_report(uuid, uuid, date, date)','6167970d76fd1ce8e8d36c7d00ed863f',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_record_security_deposit(uuid, uuid, uuid, uuid, bigint, text, date, text, bigint, text, text, text, uuid, boolean)','16351d553bde4bbfa34cf60a08c0a910',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_release_room_closure(uuid, uuid, uuid, uuid, bigint, date, text)','88f60e31713647de48bda7b56dd17499',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_reservation_guest(uuid, uuid, uuid)','62b6d8496cd2c3be18902c65835efb68',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_retire_security_deposit_request(uuid, uuid, uuid, uuid, jsonb, text)','939cea39374c2269a144d5c202217298',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_save_guest_profile(uuid, uuid, uuid, uuid, bigint, jsonb)','4e01e336159e1cb7933c825d61e9ec12',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_save_reservation_guest(uuid, uuid, uuid, uuid, bigint, uuid, bigint, jsonb, jsonb, boolean)','e8ba329684eaac95ab7175718f955a18',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_security_deposit(uuid, uuid, uuid)','59e1eeb489f431a32eae358ebd74a07b',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_security_deposit_activity(uuid, uuid, date, date)','9eb5774070a5281d1e5c693fd22f51a1',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_security_deposit_register(uuid, uuid)','2ea8e9d83cb206aed5a248e9cd375ab6',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_security_deposit_request_status(uuid, uuid, uuid)','9335cd073225088e25919442b90690b2',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_set_capacity(uuid, uuid, uuid, date, date, integer)','c2ac121401bd71ac651c0531e09b882e',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_set_housekeeping(uuid, uuid, uuid, uuid, bigint, text)','138680aa6fae5e9ca351a94aa853a596',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_stage_import(uuid, uuid, uuid, text, jsonb)','a57664584c457877491b96fb34403bac',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_stay_action(uuid, uuid, uuid, text, uuid)','3cff136f98e64866d70642b9f6041e07',true,'v','search_path=pg_catalog','jsonb',false,true,true),
 ('public.irp_pms_pilot_turnover_request_status(uuid, uuid, uuid)','e087a6927c79bebdc8020689b3348df2',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_turnovers(uuid, uuid, date, date)','f33debd6229d72410a7422e1c413ac15',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_update_turnover(uuid, uuid, uuid, uuid, bigint, bigint, date, text, jsonb)','801ec3be3a114eb88244de0e59efa460',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_workspace(uuid, uuid)','8611ae722b1c41e66145f9024da3222f',true,'s','search_path=pg_catalog','jsonb',false,true,true)
 ) e(signature,body_md5,definer,volatility,config,returns,anon,authenticated,service_role) LOOP
  SELECT p.*,array_to_string(p.proconfig,',') config_string,p.prorettype::regtype::text return_name INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
  IF NOT FOUND OR md5(regexp_replace(actual.prosrc,E'\r\n?',E'\n','g')) IS DISTINCT FROM expected.body_md5 OR actual.prosecdef IS DISTINCT FROM expected.definer OR actual.provolatile::text IS DISTINCT FROM expected.volatility OR actual.config_string IS DISTINCT FROM expected.config OR actual.return_name IS DISTINCT FROM expected.returns THEN RAISE EXCEPTION 'Effective172 definition differs: %',expected.signature;END IF;
  IF has_function_privilege('anon',actual.oid,'EXECUTE') IS DISTINCT FROM expected.anon OR has_function_privilege('authenticated',actual.oid,'EXECUTE') IS DISTINCT FROM expected.authenticated OR has_function_privilege('service_role',actual.oid,'EXECUTE') IS DISTINCT FROM expected.service_role THEN RAISE EXCEPTION 'Effective172 execution grants differ: %',expected.signature;END IF;
 END LOOP;
 FOR expected IN SELECT * FROM (VALUES
 ('activity','120b37cd1846657f906716f6d4dde75e'),
 ('cancellation_requests','4ddc5c42843e6c80538fcaef0d1b348d'),
 ('direct_requests','e0d70c7f48dc7707fd7694d3f493ca8e'),
 ('folio_entries','abcdbbc3cb2d946e9a7a7499a3a61ee8'),
 ('folio_openings','7034d9adbc243bb0c6dbc8cb14825dcf'),
 ('gateway_connections','4488d3f66b0a29247bb0898f16999429'),
 ('guest_profiles','7efd029b74c743b72f1a6072c46ef353'),
 ('guest_requests','b62633d6da9d8183c9c65888ec4c3c44'),
 ('housekeeping_requests','d8649da9df30cfc777e37e4a740d6243'),
 ('import_actions','897005a20b5234fd950d965058671175'),
 ('import_batches','22134a700fe7695d8b32ba2ea848f0c1'),
 ('import_commits','b37c6af89a69bee5fc3786750a613bfc'),
 ('inbound_events','748f441d51175e5a299cb6aaa4e992fb'),
 ('maintenance_requests','cfbbbbe4f39f9ee4fe89ae7790d7901c'),
 ('membership_requests','ead0df87293630e0803f7388050ea553'),
 ('memberships','3de629de50c701182d6376b6ab0d1270'),
 ('nightly_capacity','5185d9055696a4b5e89dfd137ce8efb4'),
 ('nightly_rates','ef24b09735cab7ec278a595849742816'),
 ('no_show_requests','4ddc5c42843e6c80538fcaef0d1b348d'),
 ('onboarding_requests','2ac7a2a3c4f3436379100e0c417c72b9'),
 ('operating_model_requests','c78c3084ca17e092a16876e8d34f3c12'),
 ('properties','e4940b01d57e10dc35582b02404047b5'),
 ('property_fee_requests','f969bc6d9ff8a9ccabf7db532a57e020'),
 ('quote_bookings','595ab515df0b94e5256c06d911c19b23'),
 ('rate_actions','8de0a86889972f0d839da1d60fd648b1'),
 ('rate_plans','0c62cd34ac600799d46e741a4f761052'),
 ('rate_quotes','6331c0cc2f63cf138037a3ef4ce338e1'),
 ('reservation_amendments','1112bbca6177648af0fceeea1ef58ff4'),
 ('reservation_charge_snapshots','8cae0011c967df1bdd299f9f12d56351'),
 ('reservation_parties','3b3c8b98f955674fceba06588621819e'),
 ('reservations','f52a8bdafb65f342d3e977fec5693e33'),
 ('review_actions','12654dd574107eb371757a2758ab4379'),
 ('room_closures','70f0dd88f5604b37cfaa9147e7d7aa69'),
 ('room_move_requests','ecc92dd83e0642d5f327137fad38427c'),
 ('room_types','f97f4c6d39192a6f65336fef8c4460ea'),
 ('rooms','bfa54b1971d26c50da7e93c258874fe7'),
 ('security_deposit_books','f17b4344c7c9b18a67b68a98a834ebf3'),
 ('security_deposit_events','893c4bbef1cfcafeb90a7dc27b064eb3'),
 ('security_deposit_requests','a691f216baf2d6a7a64a0d2750128e67'),
 ('service_allocation_approvals','79116138f830720d71350bebc8d2b88e'),
 ('service_books','855b6a6f93d9eca4872da5cb8aa20adc'),
 ('service_day_closes','ccfceb061b745b96140e2f4c9b723c02'),
 ('service_day_entries','a84ef1f3dc7286dd13fe67dc456df4d7'),
 ('service_forward_approvals','6e3751e0dd78a7d2eb7f73f3b9aeb10f'),
 ('service_forward_entries','2e860858f1de09ad077e3d6fdd34fadd'),
 ('service_reconciliation','d79b34256ee8feb31fc8ff8c1a9c6740'),
 ('service_requests','f969bc6d9ff8a9ccabf7db532a57e020'),
 ('stay_extensions','1112bbca6177648af0fceeea1ef58ff4'),
 ('tenants','f246f7dbac81317b999f24601f8817fc'),
 ('turnover_events','cefa9983468287e2cc2d0c38aed8ce22'),
 ('turnover_origins','dde046bcb774ee8d632c20529fd9cca4'),
 ('turnover_requests','bf62f98f442b7d97912efd1fee9e3ec6'),
 ('turnover_tasks','15f6c8dbf0d77faf91460b2adfdf8e3e')
 ) e(table_name,columns_md5) LOOP
  SELECT md5(jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated) ORDER BY a.attnum)::text) INTO column_hash FROM pg_attribute a WHERE a.attrelid=to_regclass('irp_pms.'||expected.table_name) AND a.attnum>0 AND NOT a.attisdropped;
  IF column_hash IS DISTINCT FROM expected.columns_md5 THEN RAISE EXCEPTION 'Effective172 column shape differs: %',expected.table_name;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmed test organization owner required for transaction-only proof';END IF;
END $preflight$;
SELECT 'guest_documents_preflight_passed' AS verification;

-- Pure scoped document projection. No storage, issuance, folio/deposit opening,
-- monetary movement, source mutation or new access to underlying tables.
CREATE FUNCTION irp_pms.guest_document_number(p_value jsonb,p_min bigint DEFAULT 0,p_max bigint DEFAULT 999999999999,p_nullable boolean DEFAULT false) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric;
BEGIN
 IF p_nullable AND (p_value IS NULL OR p_value='null'::jsonb) THEN RETURN NULL;END IF;
 IF p_value IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Guest document requires exact integer evidence';END IF;
 n:=(p_value#>>'{}')::numeric;
 IF n IS DISTINCT FROM trunc(n) OR n<p_min OR n>p_max THEN RAISE EXCEPTION 'Guest document integer evidence is outside its supported range';END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION irp_pms.guest_document_label(p_value text,p_max integer,p_nullable boolean DEFAULT false,p_normalize boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL AND p_nullable THEN RETURN NULL;END IF;
 IF p_value IS NULL OR length(p_value) NOT BETWEEN 1 AND p_max THEN RAISE EXCEPTION 'Guest document label is missing or outside its supported range';END IF;
 IF p_value~'[[:cntrl:]]' THEN
  IF p_normalize THEN RETURN regexp_replace(p_value,'[[:cntrl:]]',' ','g');END IF;
  RAISE EXCEPTION 'Guest document label contains prohibited controls';
 END IF;
 RETURN p_value;
END $$;
CREATE FUNCTION irp_pms.guest_document_itemization(p_value jsonb,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE mode text;arrival date;departure date;basis_arrival date;basis_departure date;item jsonb;tax jsonb;fee jsonb;code text;label text;seen text[];taxes jsonb:='[]';fees jsonb:='[]';amount bigint;unit bigint;quantity bigint;tax_sum numeric:=0;fee_sum numeric:=0;tax_base numeric;amounts jsonb:='{}';key text;retained boolean;output jsonb;
BEGIN
 IF p_value IS NULL OR p_value='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>32768 OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k NOT IN('version','mode','currency','arrival','departure','accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor','taxes','fees','fees_retained','requires_reconciliation','fee_basis_arrival','fee_basis_departure','property_fees_version','operating_model_version')) OR
  irp_pms.guest_document_number(p_value->'version',1,1) IS DISTINCT FROM 1 OR p_value->>'currency' IS DISTINCT FROM 'USD'
 THEN RAISE EXCEPTION 'Guest document pricing shape is not supported';END IF;
 -- Known166 quote-version metadata is validated but is not a guest line.
 IF p_value ? 'property_fees_version' THEN PERFORM irp_pms.guest_document_number(p_value->'property_fees_version',1,9007199254740991);END IF;
 IF p_value ? 'operating_model_version' THEN PERFORM irp_pms.guest_document_number(p_value->'operating_model_version',1,9007199254740991);END IF;
 mode:=p_value->>'mode';
 IF mode IS NULL OR mode NOT IN('legacy','configured','adjusted') OR jsonb_typeof(p_value->'arrival') IS DISTINCT FROM 'string' OR jsonb_typeof(p_value->'departure') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Guest document pricing context is incomplete';END IF;
 arrival:=(p_value->>'arrival')::date;departure:=(p_value->>'departure')::date;
 IF NOT isfinite(arrival) OR NOT isfinite(departure) OR departure-arrival NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Guest document pricing dates are invalid';END IF;
 FOREACH key IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'] LOOP
  amount:=irp_pms.guest_document_number(p_value->key);
  IF p_expected->key IS NOT NULL AND p_expected->key<>'null'::jsonb AND irp_pms.guest_document_number(p_expected->key) IS DISTINCT FROM amount THEN RAISE EXCEPTION 'Guest document pricing components disagree';END IF;
  amounts:=amounts||jsonb_build_object(key,amount);
 END LOOP;
 IF (amounts->>'accommodation_minor')::numeric+(amounts->>'taxes_minor')::numeric+(amounts->>'hotel_fees_minor')::numeric+(amounts->>'ota_fees_minor')::numeric IS DISTINCT FROM (amounts->>'total_minor')::numeric THEN RAISE EXCEPTION 'Guest document pricing total does not reconcile';END IF;
 IF mode='adjusted' THEN
  IF p_value->'fees_retained' IS DISTINCT FROM 'true'::jsonb OR p_value->'requires_reconciliation' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_value->'fee_basis_arrival') IS DISTINCT FROM 'string' OR jsonb_typeof(p_value->'fee_basis_departure') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Adjusted guest document pricing needs original fee context';END IF;
  basis_arrival:=(p_value->>'fee_basis_arrival')::date;basis_departure:=(p_value->>'fee_basis_departure')::date;
  IF NOT isfinite(basis_arrival) OR NOT isfinite(basis_departure) OR basis_departure-basis_arrival NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Original guest document fee dates are invalid';END IF;
 ELSE
  IF (p_value ? 'fees_retained' AND p_value->'fees_retained' IS DISTINCT FROM 'false'::jsonb) OR (p_value ? 'requires_reconciliation' AND p_value->'requires_reconciliation' IS DISTINCT FROM 'false'::jsonb) OR (p_value ? 'fee_basis_arrival' AND p_value->'fee_basis_arrival' IS DISTINCT FROM 'null'::jsonb) OR (p_value ? 'fee_basis_departure' AND p_value->'fee_basis_departure' IS DISTINCT FROM 'null'::jsonb) THEN RAISE EXCEPTION 'Unexpected retained pricing context';END IF;
 END IF;
 IF jsonb_typeof(p_value->'taxes') IS DISTINCT FROM 'array' OR jsonb_typeof(p_value->'fees') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Guest document pricing lines are incomplete';END IF;
 IF jsonb_array_length(p_value->'taxes')>4 OR jsonb_array_length(p_value->'fees')>3 OR (mode='adjusted' AND jsonb_array_length(p_value->'taxes')<>1) THEN RAISE EXCEPTION 'Guest document pricing line limit exceeded';END IF;
 seen:=ARRAY[]::text[];
 FOR fee IN SELECT x FROM jsonb_array_elements(p_value->'fees') x LOOP
  IF jsonb_typeof(fee) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(fee) k WHERE k NOT IN('code','label','basis','unit_amount_minor','quantity','amount_minor','taxes','retained')) THEN RAISE EXCEPTION 'Guest document fee shape is invalid';END IF;
  code:=fee->>'code';label:=CASE code WHEN 'resort' THEN 'Resort fee' WHEN 'technology' THEN 'Technology fee' WHEN 'cleaning' THEN 'Cleaning fee' END;
  IF label IS NULL OR fee->>'label' IS DISTINCT FROM label OR code=ANY(seen) OR fee->>'basis' IS NULL OR fee->>'basis' NOT IN('per_night','per_stay') OR (code='cleaning' AND fee->>'basis'<>'per_stay') THEN RAISE EXCEPTION 'Guest document fee identity is invalid';END IF;
  seen:=array_append(seen,code);unit:=irp_pms.guest_document_number(fee->'unit_amount_minor');quantity:=irp_pms.guest_document_number(fee->'quantity',1,30);amount:=irp_pms.guest_document_number(fee->'amount_minor');
  IF unit::numeric*quantity IS DISTINCT FROM amount::numeric OR quantity IS DISTINCT FROM (CASE WHEN fee->>'basis'='per_stay' THEN 1 WHEN mode='adjusted' THEN basis_departure-basis_arrival ELSE departure-arrival END)::bigint THEN RAISE EXCEPTION 'Guest document fee quantity does not reconcile';END IF;
  IF jsonb_typeof(fee->'taxes') IS DISTINCT FROM 'array' OR jsonb_array_length(fee->'taxes')>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(fee->'taxes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('legacy','city','state','lodging')) OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(fee->'taxes') x) IS DISTINCT FROM jsonb_array_length(fee->'taxes')::bigint OR (code='cleaning' AND fee->'taxes' ? 'legacy') THEN RAISE EXCEPTION 'Guest document fee tax references are invalid';END IF;
  retained:=mode='adjusted';
  IF (retained AND fee->'retained' IS DISTINCT FROM 'true'::jsonb) OR (NOT retained AND fee ? 'retained' AND fee->'retained' IS DISTINCT FROM 'false'::jsonb) THEN RAISE EXCEPTION 'Guest document retained fee state is invalid';END IF;
  fees:=fees||jsonb_build_array(jsonb_build_object('code',code,'label',label,'basis',fee->>'basis','unit_amount_minor',unit,'quantity',quantity,'amount_minor',amount,'taxes',fee->'taxes','retained',retained));fee_sum:=fee_sum+amount;
 END LOOP;
 seen:=ARRAY[]::text[];
 FOR tax IN SELECT x FROM jsonb_array_elements(p_value->'taxes') x LOOP
  IF jsonb_typeof(tax) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(tax))<>5 OR NOT(tax ?& ARRAY['code','label','basis_points','taxable_base_minor','amount_minor']) THEN RAISE EXCEPTION 'Guest document tax shape is invalid';END IF;
  code:=tax->>'code';label:=CASE code WHEN 'legacy' THEN 'Existing combined tax' WHEN 'city' THEN 'City tax' WHEN 'state' THEN 'State tax' WHEN 'lodging' THEN 'Lodging tax' WHEN 'adjusted_total' THEN 'Adjusted tax total' END;
  IF label IS NULL OR tax->>'label' IS DISTINCT FROM label OR code=ANY(seen) OR (mode='adjusted') IS DISTINCT FROM (code='adjusted_total') THEN RAISE EXCEPTION 'Guest document tax identity is invalid';END IF;
  seen:=array_append(seen,code);amount:=irp_pms.guest_document_number(tax->'amount_minor');
  IF mode='adjusted' THEN
   IF tax->'basis_points' IS DISTINCT FROM 'null'::jsonb OR tax->'taxable_base_minor' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Adjusted tax must not invent a rate or base';END IF;
  ELSE
   PERFORM irp_pms.guest_document_number(tax->'basis_points',0,10000);
   tax_base:=irp_pms.guest_document_number(tax->'taxable_base_minor');
   IF tax_base IS DISTINCT FROM (amounts->>'accommodation_minor')::numeric+coalesce((SELECT sum((f->>'amount_minor')::numeric) FROM jsonb_array_elements(fees) f WHERE f->'taxes' ? code),0) THEN RAISE EXCEPTION 'Guest document tax base disagrees with its recorded fee selections';END IF;
  END IF;
  taxes:=taxes||jsonb_build_array(jsonb_build_object('code',code,'label',label,'basis_points',tax->'basis_points','taxable_base_minor',tax->'taxable_base_minor','amount_minor',amount));tax_sum:=tax_sum+amount;
 END LOOP;
 IF tax_sum IS DISTINCT FROM (amounts->>'taxes_minor')::numeric OR fee_sum IS DISTINCT FROM (amounts->>'hotel_fees_minor')::numeric THEN RAISE EXCEPTION 'Guest document tax and fee lines do not reconcile';END IF;
 output:=jsonb_build_object('schema_version',1,'mode',mode,'currency','USD','arrival',arrival,'departure',departure,'taxes',taxes,'fees',fees,'fees_retained',mode='adjusted','requires_reconciliation',mode='adjusted','fee_basis_arrival',basis_arrival,'fee_basis_departure',basis_departure)||amounts;
 RETURN output;
END $$;

CREATE FUNCTION irp_pms.guest_document_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE prop jsonb:=p_capture->'property';res jsonb:=p_capture->'reservation';party jsonb:=p_capture->'party';source_opening jsonb:=p_capture->'opening';book jsonb:=p_capture->'deposit_book';raw_entries jsonb:=p_capture->'entries';deposit_events jsonb:=p_capture->'deposit_events';
 component text;components jsonb:='{}';opening_components jsonb:='{}';current_item jsonb;opening_item jsonb;opening jsonb;contact jsonb;billing jsonb;stay_guest jsonb;account jsonb;deposit jsonb;reservation jsonb;output jsonb;entries jsonb:='[]';entry jsonb;target jsonb;event jsonb;amount bigint;value bigint;kind text;label text;source_key text;safe_name text;safe_reference text;recorded boolean;known boolean:=true;frozen boolean;available boolean;changed boolean:=false;opening_warning boolean:=false;current_warning boolean:=false;
 additional numeric:=0;reversed numeric:=0;payments numeric:=0;refunds numeric:=0;corrections numeric:=0;charges numeric;paid numeric;balance numeric;charge_effect bigint;payment_effect bigint;target_sum numeric;totals jsonb;deposit_received numeric:=0;deposit_refunded numeric:=0;deposit_reduced numeric:=0;deposit_held numeric;entry_count integer;deposit_count integer;room_type jsonb;room jsonb;arrival date;departure date;source_version bigint;party_version bigint;profile_version bigint;copied_version bigint;book_version bigint;
BEGIN
 IF p_capture IS NULL OR prop IS NULL OR res IS NULL OR prop='null'::jsonb OR res='null'::jsonb OR p_actor IS NULL OR p_role NOT IN('owner','manager','staff') OR p_role IS NULL OR NOT isfinite(p_generated) THEN RAISE EXCEPTION 'Guest document snapshot context is incomplete';END IF;
 IF prop->>'currency' IS DISTINCT FROM 'USD' OR prop->>'operating_model' IS NULL OR prop->>'operating_model' NOT IN('hotel','whole_home') OR res->>'status' IS NULL OR res->>'status' NOT IN('Confirmed','Cancelled','In house','Checked out') THEN RAISE EXCEPTION 'Guest document source context is not supported';END IF;
 PERFORM irp_pms.guest_document_label(prop->>'name',200);PERFORM irp_pms.guest_document_label(prop->>'time_zone',200);
 source_version:=irp_pms.guest_document_number(res->'source_version',1,9007199254740991);
 safe_name:=irp_pms.guest_document_label(res->>'guest_name',200,true,true);safe_reference:=irp_pms.guest_document_label(res->>'source_booking_id',128,false,true);
 PERFORM irp_pms.guest_document_label(res->>'source',100);
 arrival:=(res->>'arrival')::date;departure:=(res->>'departure')::date;
 IF (arrival IS NOT NULL AND NOT isfinite(arrival)) OR (departure IS NOT NULL AND NOT isfinite(departure)) OR (arrival IS NOT NULL AND departure IS NOT NULL AND departure-arrival NOT BETWEEN 1 AND 30) THEN RAISE EXCEPTION 'Guest document stay dates are invalid';END IF;
 PERFORM irp_pms.guest_document_number(res->'guests',1,2147483647,true);
 IF (res->>'checked_in_at' IS NOT NULL AND NOT isfinite((res->>'checked_in_at')::timestamptz)) OR (res->>'checked_out_at' IS NOT NULL AND NOT isfinite((res->>'checked_out_at')::timestamptz)) THEN RAISE EXCEPTION 'Guest document actual stay times are invalid';END IF;
 FOREACH component IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'] LOOP
  source_key:=CASE WHEN component='total_minor' THEN 'guest_total_minor' ELSE component END;
  value:=irp_pms.guest_document_number(res->source_key,0,999999999999,true);known:=known AND value IS NOT NULL;components:=components||jsonb_build_object(component,value);
 END LOOP;
 IF known AND (components->>'accommodation_minor')::numeric+(components->>'taxes_minor')::numeric+(components->>'hotel_fees_minor')::numeric+(components->>'ota_fees_minor')::numeric IS DISTINCT FROM (components->>'total_minor')::numeric THEN RAISE EXCEPTION 'Current guest document charges do not reconcile';END IF;
 current_item:=irp_pms.guest_document_itemization(res->'charge_breakdown',components);
 IF current_item IS NOT NULL AND ((arrival IS NOT NULL AND current_item->>'arrival' IS DISTINCT FROM arrival::text) OR (departure IS NOT NULL AND current_item->>'departure' IS DISTINCT FROM departure::text)) THEN RAISE EXCEPTION 'Current guest document pricing dates disagree';END IF;
 current_warning:=coalesce((current_item->>'requires_reconciliation')::boolean,false);
 IF p_capture->'room_type' IS NOT NULL AND p_capture->'room_type'<>'null'::jsonb THEN
  room_type:=jsonb_build_object('id',p_capture->'room_type'->>'id','name',irp_pms.guest_document_label(p_capture->'room_type'->>'name',200));
 END IF;
 IF p_capture->'room' IS NOT NULL AND p_capture->'room'<>'null'::jsonb THEN
  room:=jsonb_build_object('id',p_capture->'room'->>'id','label',irp_pms.guest_document_label(p_capture->'room'->>'label',40),'current_occupancy',res->>'status'='In house');
 END IF;
 IF (res->>'room_type_id' IS NOT NULL AND room_type IS NULL) OR (res->>'physical_room_id' IS NOT NULL AND room IS NULL) THEN RAISE EXCEPTION 'Guest document room scope is incomplete';END IF;
 reservation:=jsonb_build_object('id',res->>'id','source',res->>'source','source_booking_id',safe_reference,'source_version',source_version,'status',res->>'status','cancellation_kind',CASE WHEN res->>'cancellation_disposition'='no_show' THEN 'no_show' END,'booked_name',safe_name,'arrival',arrival,'departure',departure,'nights',departure-arrival,'guests',res->'guests','room_type',room_type,'recorded_room',room,'checked_in_at',res->'checked_in_at','checked_out_at',res->'checked_out_at','current_charges',components||jsonb_build_object('known',known,'itemization',current_item),'text_normalized',safe_name IS DISTINCT FROM res->>'guest_name' OR safe_reference IS DISTINCT FROM res->>'source_booking_id');
 recorded:=party IS NOT NULL AND party<>'null'::jsonb;
 IF recorded THEN
  party_version:=irp_pms.guest_document_number(party->'version',1,9007199254740991);
  contact:=irp_pms.normalize_guest_data(party->'contact','contact');billing:=irp_pms.normalize_guest_data(party->'billing_party','billing');
  IF contact IS DISTINCT FROM party->'contact' OR billing IS DISTINCT FROM party->'billing_party' OR party->>'updated_at' IS NULL OR NOT isfinite((party->>'updated_at')::timestamptz) THEN RAISE EXCEPTION 'Saved guest document parties are not canonical';END IF;
  copied_version:=irp_pms.guest_document_number(party->'guest_profile_version',1,9007199254740991,true);profile_version:=irp_pms.guest_document_number(p_capture->'linked_profile_version',1,9007199254740991,true);
  IF (party->>'guest_id' IS NULL AND (copied_version IS NOT NULL OR profile_version IS NOT NULL)) OR (party->>'guest_id' IS NOT NULL AND (copied_version IS NULL OR profile_version IS NULL)) THEN RAISE EXCEPTION 'Guest document linked profile context is incomplete';END IF;
 ELSE party_version:=0;
 END IF;
 stay_guest:=jsonb_build_object('recorded',recorded,'version',party_version,'contact',contact,'billing_party',billing,'guest_id',CASE WHEN recorded THEN party->>'guest_id' END,'copied_profile_version',copied_version,'linked_profile_current_version',profile_version,'linked_profile_changed',recorded AND party->>'guest_id' IS NOT NULL AND copied_version IS DISTINCT FROM profile_version,'updated_at',CASE WHEN recorded THEN party->'updated_at' END);
 IF jsonb_typeof(raw_entries) IS DISTINCT FROM 'array' OR jsonb_typeof(deposit_events) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Guest document event capture is incomplete';END IF;
 entry_count:=jsonb_array_length(raw_entries);deposit_count:=jsonb_array_length(deposit_events);
 IF entry_count>1000 OR deposit_count>1000 THEN RAISE EXCEPTION 'Guest document exceeds its complete 1000-entry history limit';END IF;
 frozen:=source_opening IS NOT NULL AND source_opening<>'null'::jsonb;available:=frozen OR known;
 IF NOT frozen AND entry_count<>0 THEN RAISE EXCEPTION 'Guest document entries have no frozen opening';END IF;
 IF available THEN
  IF frozen THEN
   FOREACH component IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'] LOOP
    source_key:=CASE WHEN component='ota_fees_minor' THEN 'fees_minor' ELSE component END;
    value:=irp_pms.guest_document_number(source_opening->source_key);opening_components:=opening_components||jsonb_build_object(component,value);
    changed:=changed OR value IS DISTINCT FROM (components->>component)::bigint;
   END LOOP;
   IF source_opening->>'currency' IS DISTINCT FROM 'USD' OR source_opening->>'opened_at' IS NULL OR NOT isfinite((source_opening->>'opened_at')::timestamptz) THEN RAISE EXCEPTION 'Guest document opening context is incomplete';END IF;
   PERFORM irp_pms.guest_document_number(source_opening->'source_version',1,9007199254740991);PERFORM irp_pms.guest_document_label(source_opening->>'reservation_source',100);
   opening_item:=irp_pms.guest_document_itemization(source_opening->'charge_breakdown',opening_components);changed:=changed OR source_opening->'charge_breakdown' IS DISTINCT FROM res->'charge_breakdown';
  ELSE opening_components:=components;opening_item:=current_item;
  END IF;
  IF (opening_components->>'accommodation_minor')::numeric+(opening_components->>'taxes_minor')::numeric+(opening_components->>'hotel_fees_minor')::numeric+(opening_components->>'ota_fees_minor')::numeric IS DISTINCT FROM (opening_components->>'total_minor')::numeric THEN RAISE EXCEPTION 'Guest document opening does not reconcile';END IF;
  opening:=opening_components||jsonb_build_object('itemization',opening_item,'source',CASE WHEN frozen THEN source_opening->>'reservation_source' ELSE res->>'source' END,'source_version',CASE WHEN frozen THEN (source_opening->>'source_version')::bigint ELSE source_version END,'opened_at',CASE WHEN frozen THEN source_opening->'opened_at' END);
  opening_warning:=coalesce((opening_item->>'requires_reconciliation')::boolean,false);
 END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(raw_entries) x) IS DISTINCT FROM entry_count::bigint THEN RAISE EXCEPTION 'Guest document contains duplicate or missing entry identities';END IF;
 FOR entry IN SELECT x FROM jsonb_array_elements(raw_entries) x LOOP
  PERFORM (entry->>'id')::uuid;amount:=irp_pms.guest_document_number(entry->'amount_minor',1);kind:=entry->>'kind';
  IF entry->>'currency' IS DISTINCT FROM 'USD' OR entry->>'created_at' IS NULL OR NOT isfinite((entry->>'created_at')::timestamptz) THEN RAISE EXCEPTION 'Guest document entry context is invalid';END IF;
  label:=CASE kind WHEN 'charge' THEN 'Additional charge' WHEN 'charge_reversal' THEN 'Charge reversal' WHEN 'external_payment' THEN 'External payment recorded' WHEN 'external_refund' THEN 'External refund recorded' WHEN 'payment_correction' THEN 'Payment record correction' END;
  IF label IS NULL OR (kind IN('charge','external_payment') AND entry->>'target_entry_id' IS NOT NULL) OR (kind IN('external_refund','payment_correction') AND entry->>'target_entry_id' IS NULL) THEN RAISE EXCEPTION 'Guest document entry kind or target is invalid';END IF;
  IF entry->>'target_entry_id' IS NOT NULL THEN
   SELECT x INTO target FROM jsonb_array_elements(raw_entries) x WHERE x->>'id'=entry->>'target_entry_id';
   IF target IS NULL OR target->>'kind' IS DISTINCT FROM (CASE WHEN kind='charge_reversal' THEN 'charge' ELSE 'external_payment' END) THEN RAISE EXCEPTION 'Guest document target is not a same-account source entry';END IF;
  END IF;
  charge_effect:=CASE kind WHEN 'charge' THEN amount WHEN 'charge_reversal' THEN -amount ELSE 0 END;payment_effect:=CASE kind WHEN 'external_payment' THEN amount WHEN 'external_refund' THEN -amount WHEN 'payment_correction' THEN -amount ELSE 0 END;
  additional:=additional+CASE WHEN kind='charge' THEN amount ELSE 0 END;reversed:=reversed+CASE WHEN kind='charge_reversal' THEN amount ELSE 0 END;payments:=payments+CASE WHEN kind='external_payment' THEN amount ELSE 0 END;refunds:=refunds+CASE WHEN kind='external_refund' THEN amount ELSE 0 END;corrections:=corrections+CASE WHEN kind='payment_correction' THEN amount ELSE 0 END;
  entries:=entries||jsonb_build_array(jsonb_build_object('id',entry->>'id','kind',kind,'label',label,'amount_minor',amount,'currency','USD','target_entry_id',entry->>'target_entry_id','recorded_at',entry->'created_at','charge_effect_minor',charge_effect,'payment_effect_minor',payment_effect,'balance_effect_minor',charge_effect-payment_effect));
 END LOOP;
 IF available THEN
  SELECT coalesce(sum((x->>'amount_minor')::numeric),0) INTO target_sum FROM jsonb_array_elements(raw_entries) x WHERE x->>'kind'='charge_reversal' AND x->>'target_entry_id' IS NULL;
  IF target_sum>(opening->>'total_minor')::numeric THEN RAISE EXCEPTION 'Guest document opening reversals exceed original charges';END IF;
  FOR target IN SELECT x FROM jsonb_array_elements(raw_entries) x WHERE x->>'kind' IN('charge','external_payment') LOOP
   SELECT coalesce(sum((x->>'amount_minor')::numeric),0) INTO target_sum FROM jsonb_array_elements(raw_entries) x WHERE x->>'target_entry_id'=target->>'id';
   IF target_sum>(target->>'amount_minor')::numeric THEN RAISE EXCEPTION 'Guest document linked adjustments exceed their source';END IF;
  END LOOP;
  charges:=(opening->>'total_minor')::numeric+additional-reversed;paid:=payments-refunds-corrections;balance:=charges-paid;
  IF least(charges,paid)<0 OR greatest(additional,reversed,payments,refunds,corrections,charges)>999999999999 OR abs(balance)>9007199254740991 THEN RAISE EXCEPTION 'Guest document ledger totals are outside their supported range';END IF;
  totals:=jsonb_build_object('additional_minor',additional::bigint,'reversed_minor',reversed::bigint,'charges_minor',charges::bigint,'external_payments_minor',payments::bigint,'external_refunds_minor',refunds::bigint,'corrected_payments_minor',corrections::bigint,'paid_minor',paid::bigint,'balance_minor',balance::bigint);
 END IF;
 account:=jsonb_build_object('available',available,'unavailable_reason',CASE WHEN NOT available THEN 'reservation_charges_unavailable' END,'opening_mode',CASE WHEN frozen THEN 'frozen' WHEN known THEN 'reservation_preview' END,'opening',opening,'totals',totals,'entries',entries,'reservation_amounts_changed',changed,'opening_pricing_reconciliation_required',opening_warning,'current_pricing_reconciliation_required',current_warning,'pricing_reconciliation_required',changed OR opening_warning OR current_warning,'itemization_available',opening_item IS NOT NULL,'adjustments_itemized',false,'payment_recording','external_only');
 IF book IS NOT NULL AND book<>'null'::jsonb THEN
  book_version:=irp_pms.guest_document_number(book->'version',1,1000);
  IF book->>'currency' IS DISTINCT FROM 'USD' OR book_version IS DISTINCT FROM deposit_count::bigint OR book->>'creation_operating_model' IS NULL OR book->>'creation_operating_model' NOT IN('hotel','whole_home') OR book->>'updated_at' IS NULL OR NOT isfinite((book->>'updated_at')::timestamptz) THEN RAISE EXCEPTION 'Guest document deposit context is incomplete';END IF;
  PERFORM irp_pms.guest_document_label(book->>'recording_time_zone',200);
  FOR event IN SELECT x FROM jsonb_array_elements(deposit_events) x LOOP
   amount:=irp_pms.guest_document_number(event->'amount_minor',1);kind:=event->>'kind';
   IF kind IS NULL OR kind NOT IN('external_receipt','external_refund','receipt_reduction') OR event->>'currency' IS DISTINCT FROM 'USD' THEN RAISE EXCEPTION 'Guest document deposit event is invalid';END IF;
   deposit_received:=deposit_received+CASE WHEN kind='external_receipt' THEN amount ELSE 0 END;deposit_refunded:=deposit_refunded+CASE WHEN kind='external_refund' THEN amount ELSE 0 END;deposit_reduced:=deposit_reduced+CASE WHEN kind='receipt_reduction' THEN amount ELSE 0 END;
  END LOOP;
  deposit_held:=deposit_received-deposit_refunded-deposit_reduced;
  IF deposit_held<0 OR greatest(deposit_received,deposit_refunded,deposit_reduced)>999999999999 OR irp_pms.guest_document_number(book->'received_minor') IS DISTINCT FROM deposit_received OR irp_pms.guest_document_number(book->'refunded_minor') IS DISTINCT FROM deposit_refunded OR irp_pms.guest_document_number(book->'reduced_minor') IS DISTINCT FROM deposit_reduced OR irp_pms.guest_document_number(book->'held_minor') IS DISTINCT FROM deposit_held THEN RAISE EXCEPTION 'Guest document deposit totals do not reconcile';END IF;
  deposit:=jsonb_build_object('recorded',true,'book_id',book->>'id','version',book_version,'recording_time_zone',book->>'recording_time_zone','creation_operating_model',book->>'creation_operating_model','updated_at',book->'updated_at','event_count',deposit_count,'totals',jsonb_build_object('received_minor',deposit_received::bigint,'refunded_minor',deposit_refunded::bigint,'reduced_minor',deposit_reduced::bigint,'held_minor',deposit_held::bigint),'financial_review_required',deposit_held>0 AND res->>'status' IN('Checked out','Cancelled'));
 ELSE
  IF deposit_count<>0 THEN RAISE EXCEPTION 'Guest document deposit events lack a book';END IF;
  deposit:=jsonb_build_object('recorded',false,'book_id',NULL,'version',0,'recording_time_zone',NULL,'creation_operating_model',NULL,'updated_at',NULL,'event_count',0,'totals',NULL,'financial_review_required',false);
 END IF;
 deposit:=deposit||jsonb_build_object('currency','USD','recording_mode','external_only','purpose','refundable_security','applied_to_account',false);
 output:=jsonb_build_object('schema_version',1,'tenant_id',prop->>'tenant_id','property_id',prop->>'id','reservation_id',res->>'id','actor_id',p_actor,'role',p_role,'generated_at',p_generated,'property_business_date',(p_generated AT TIME ZONE (prop->>'time_zone'))::date,'property',jsonb_build_object('id',prop->>'id','name',prop->>'name','currency','USD','time_zone',prop->>'time_zone','operating_model',prop->>'operating_model'),'reservation',reservation,'stay_guest',stay_guest,'account',account,'security_deposit',deposit,'completeness',jsonb_build_object('complete',true,'rows_truncated',false,'folio_entry_count',entry_count,'deposit_event_count',deposit_count,'account_amounts_available',available),'semantics',jsonb_build_object('document_mode','current_read_only_summary','invoice_issued',false,'signature_recorded',false,'consent_recorded',false,'payment_moved',false,'settlement_verified',false,'folio_opened',false,'deposit_book_created',false,'financial_records_changed',false,'internal_notes_included',false));
 IF octet_length(output::text)>2097152 THEN RAISE EXCEPTION 'Guest document response exceeds its complete output size limit';END IF;
 RETURN output;
END $$;
CREATE FUNCTION public.irp_pms_pilot_guest_documents(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;captured jsonb;generated timestamptz;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL THEN RAISE EXCEPTION 'A scoped reservation is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 generated:=clock_timestamp();
 -- DOCUMENT173_CAPTURE_BEGIN: one persistent relational statement snapshot.
 WITH doc_folio_rows AS MATERIALIZED(
  SELECT e.* FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.created_at,e.id LIMIT 1001
 ),doc_deposit_rows AS MATERIALIZED(
  SELECT e.* FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.to_version LIMIT 1001
 )
 SELECT jsonb_build_object('property',to_jsonb(p),'reservation',to_jsonb(r),'party',to_jsonb(g),'linked_profile_version',gp.version,'room_type',to_jsonb(rt),'room',to_jsonb(room),'opening',to_jsonb(f),'deposit_book',to_jsonb(b),'entries',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM doc_folio_rows e),'[]'::jsonb),'deposit_events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.to_version) FROM doc_deposit_rows e),'[]'::jsonb))
 INTO captured
 FROM irp_pms.properties p
 JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id AND r.id=p_reservation
 LEFT JOIN irp_pms.reservation_parties g ON g.tenant_id=r.tenant_id AND g.property_id=r.property_id AND g.reservation_id=r.id
 LEFT JOIN irp_pms.guest_profiles gp ON gp.tenant_id=g.tenant_id AND gp.property_id=g.property_id AND gp.id=g.guest_id
 LEFT JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id
 LEFT JOIN irp_pms.rooms room ON room.tenant_id=r.tenant_id AND room.property_id=r.property_id AND room.id=r.physical_room_id
 LEFT JOIN irp_pms.folio_openings f ON f.tenant_id=r.tenant_id AND f.property_id=r.property_id AND f.reservation_id=r.id
 LEFT JOIN irp_pms.security_deposit_books b ON b.tenant_id=r.tenant_id AND b.property_id=r.property_id AND b.reservation_id=r.id
 WHERE p.tenant_id=p_tenant AND p.id=p_property;
 -- DOCUMENT173_CAPTURE_END: projection below reads captured values only.
 IF captured IS NULL THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 RETURN irp_pms.guest_document_projection(captured,auth.uid(),member_role,generated);
END $$;
REVOKE ALL ON FUNCTION irp_pms.guest_document_number(jsonb,bigint,bigint,boolean),irp_pms.guest_document_label(text,integer,boolean,boolean),irp_pms.guest_document_itemization(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.guest_document_projection(jsonb,uuid,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_guest_documents(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_guest_documents(uuid,uuid,uuid) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('202609070173','iratepilot_pms_guest_documents',ARRAY['-- Pure scoped document projection. No storage, issuance, folio/deposit opening,
-- monetary movement, source mutation or new access to underlying tables.
CREATE FUNCTION irp_pms.guest_document_number(p_value jsonb,p_min bigint DEFAULT 0,p_max bigint DEFAULT 999999999999,p_nullable boolean DEFAULT false) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric;
BEGIN
 IF p_nullable AND (p_value IS NULL OR p_value=''null''::jsonb) THEN RETURN NULL;END IF;
 IF p_value IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM ''number'' THEN RAISE EXCEPTION ''Guest document requires exact integer evidence'';END IF;
 n:=(p_value#>>''{}'')::numeric;
 IF n IS DISTINCT FROM trunc(n) OR n<p_min OR n>p_max THEN RAISE EXCEPTION ''Guest document integer evidence is outside its supported range'';END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION irp_pms.guest_document_label(p_value text,p_max integer,p_nullable boolean DEFAULT false,p_normalize boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL AND p_nullable THEN RETURN NULL;END IF;
 IF p_value IS NULL OR length(p_value) NOT BETWEEN 1 AND p_max THEN RAISE EXCEPTION ''Guest document label is missing or outside its supported range'';END IF;
 IF p_value~''[[:cntrl:]]'' THEN
  IF p_normalize THEN RETURN regexp_replace(p_value,''[[:cntrl:]]'','' '',''g'');END IF;
  RAISE EXCEPTION ''Guest document label contains prohibited controls'';
 END IF;
 RETURN p_value;
END $$;
CREATE FUNCTION irp_pms.guest_document_itemization(p_value jsonb,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE mode text;arrival date;departure date;basis_arrival date;basis_departure date;item jsonb;tax jsonb;fee jsonb;code text;label text;seen text[];taxes jsonb:=''[]'';fees jsonb:=''[]'';amount bigint;unit bigint;quantity bigint;tax_sum numeric:=0;fee_sum numeric:=0;tax_base numeric;amounts jsonb:=''{}'';key text;retained boolean;output jsonb;
BEGIN
 IF p_value IS NULL OR p_value=''null''::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_value) IS DISTINCT FROM ''object'' OR octet_length(p_value::text)>32768 OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k NOT IN(''version'',''mode'',''currency'',''arrival'',''departure'',''accommodation_minor'',''taxes_minor'',''hotel_fees_minor'',''ota_fees_minor'',''total_minor'',''taxes'',''fees'',''fees_retained'',''requires_reconciliation'',''fee_basis_arrival'',''fee_basis_departure'',''property_fees_version'',''operating_model_version'')) OR
  irp_pms.guest_document_number(p_value->''version'',1,1) IS DISTINCT FROM 1 OR p_value->>''currency'' IS DISTINCT FROM ''USD''
 THEN RAISE EXCEPTION ''Guest document pricing shape is not supported'';END IF;
 -- Known166 quote-version metadata is validated but is not a guest line.
 IF p_value ? ''property_fees_version'' THEN PERFORM irp_pms.guest_document_number(p_value->''property_fees_version'',1,9007199254740991);END IF;
 IF p_value ? ''operating_model_version'' THEN PERFORM irp_pms.guest_document_number(p_value->''operating_model_version'',1,9007199254740991);END IF;
 mode:=p_value->>''mode'';
 IF mode IS NULL OR mode NOT IN(''legacy'',''configured'',''adjusted'') OR jsonb_typeof(p_value->''arrival'') IS DISTINCT FROM ''string'' OR jsonb_typeof(p_value->''departure'') IS DISTINCT FROM ''string'' THEN RAISE EXCEPTION ''Guest document pricing context is incomplete'';END IF;
 arrival:=(p_value->>''arrival'')::date;departure:=(p_value->>''departure'')::date;
 IF NOT isfinite(arrival) OR NOT isfinite(departure) OR departure-arrival NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION ''Guest document pricing dates are invalid'';END IF;
 FOREACH key IN ARRAY ARRAY[''accommodation_minor'',''taxes_minor'',''hotel_fees_minor'',''ota_fees_minor'',''total_minor''] LOOP
  amount:=irp_pms.guest_document_number(p_value->key);
  IF p_expected->key IS NOT NULL AND p_expected->key<>''null''::jsonb AND irp_pms.guest_document_number(p_expected->key) IS DISTINCT FROM amount THEN RAISE EXCEPTION ''Guest document pricing components disagree'';END IF;
  amounts:=amounts||jsonb_build_object(key,amount);
 END LOOP;
 IF (amounts->>''accommodation_minor'')::numeric+(amounts->>''taxes_minor'')::numeric+(amounts->>''hotel_fees_minor'')::numeric+(amounts->>''ota_fees_minor'')::numeric IS DISTINCT FROM (amounts->>''total_minor'')::numeric THEN RAISE EXCEPTION ''Guest document pricing total does not reconcile'';END IF;
 IF mode=''adjusted'' THEN
  IF p_value->''fees_retained'' IS DISTINCT FROM ''true''::jsonb OR p_value->''requires_reconciliation'' IS DISTINCT FROM ''true''::jsonb OR jsonb_typeof(p_value->''fee_basis_arrival'') IS DISTINCT FROM ''string'' OR jsonb_typeof(p_value->''fee_basis_departure'') IS DISTINCT FROM ''string'' THEN RAISE EXCEPTION ''Adjusted guest document pricing needs original fee context'';END IF;
  basis_arrival:=(p_value->>''fee_basis_arrival'')::date;basis_departure:=(p_value->>''fee_basis_departure'')::date;
  IF NOT isfinite(basis_arrival) OR NOT isfinite(basis_departure) OR basis_departure-basis_arrival NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION ''Original guest document fee dates are invalid'';END IF;
 ELSE
  IF (p_value ? ''fees_retained'' AND p_value->''fees_retained'' IS DISTINCT FROM ''false''::jsonb) OR (p_value ? ''requires_reconciliation'' AND p_value->''requires_reconciliation'' IS DISTINCT FROM ''false''::jsonb) OR (p_value ? ''fee_basis_arrival'' AND p_value->''fee_basis_arrival'' IS DISTINCT FROM ''null''::jsonb) OR (p_value ? ''fee_basis_departure'' AND p_value->''fee_basis_departure'' IS DISTINCT FROM ''null''::jsonb) THEN RAISE EXCEPTION ''Unexpected retained pricing context'';END IF;
 END IF;
 IF jsonb_typeof(p_value->''taxes'') IS DISTINCT FROM ''array'' OR jsonb_typeof(p_value->''fees'') IS DISTINCT FROM ''array'' THEN RAISE EXCEPTION ''Guest document pricing lines are incomplete'';END IF;
 IF jsonb_array_length(p_value->''taxes'')>4 OR jsonb_array_length(p_value->''fees'')>3 OR (mode=''adjusted'' AND jsonb_array_length(p_value->''taxes'')<>1) THEN RAISE EXCEPTION ''Guest document pricing line limit exceeded'';END IF;
 seen:=ARRAY[]::text[];
 FOR fee IN SELECT x FROM jsonb_array_elements(p_value->''fees'') x LOOP
  IF jsonb_typeof(fee) IS DISTINCT FROM ''object'' OR EXISTS(SELECT 1 FROM jsonb_object_keys(fee) k WHERE k NOT IN(''code'',''label'',''basis'',''unit_amount_minor'',''quantity'',''amount_minor'',''taxes'',''retained'')) THEN RAISE EXCEPTION ''Guest document fee shape is invalid'';END IF;
  code:=fee->>''code'';label:=CASE code WHEN ''resort'' THEN ''Resort fee'' WHEN ''technology'' THEN ''Technology fee'' WHEN ''cleaning'' THEN ''Cleaning fee'' END;
  IF label IS NULL OR fee->>''label'' IS DISTINCT FROM label OR code=ANY(seen) OR fee->>''basis'' IS NULL OR fee->>''basis'' NOT IN(''per_night'',''per_stay'') OR (code=''cleaning'' AND fee->>''basis''<>''per_stay'') THEN RAISE EXCEPTION ''Guest document fee identity is invalid'';END IF;
  seen:=array_append(seen,code);unit:=irp_pms.guest_document_number(fee->''unit_amount_minor'');quantity:=irp_pms.guest_document_number(fee->''quantity'',1,30);amount:=irp_pms.guest_document_number(fee->''amount_minor'');
  IF unit::numeric*quantity IS DISTINCT FROM amount::numeric OR quantity IS DISTINCT FROM (CASE WHEN fee->>''basis''=''per_stay'' THEN 1 WHEN mode=''adjusted'' THEN basis_departure-basis_arrival ELSE departure-arrival END)::bigint THEN RAISE EXCEPTION ''Guest document fee quantity does not reconcile'';END IF;
  IF jsonb_typeof(fee->''taxes'') IS DISTINCT FROM ''array'' OR jsonb_array_length(fee->''taxes'')>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(fee->''taxes'') x WHERE jsonb_typeof(x) IS DISTINCT FROM ''string'' OR x#>>''{}'' NOT IN(''legacy'',''city'',''state'',''lodging'')) OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(fee->''taxes'') x) IS DISTINCT FROM jsonb_array_length(fee->''taxes'')::bigint OR (code=''cleaning'' AND fee->''taxes'' ? ''legacy'') THEN RAISE EXCEPTION ''Guest document fee tax references are invalid'';END IF;
  retained:=mode=''adjusted'';
  IF (retained AND fee->''retained'' IS DISTINCT FROM ''true''::jsonb) OR (NOT retained AND fee ? ''retained'' AND fee->''retained'' IS DISTINCT FROM ''false''::jsonb) THEN RAISE EXCEPTION ''Guest document retained fee state is invalid'';END IF;
  fees:=fees||jsonb_build_array(jsonb_build_object(''code'',code,''label'',label,''basis'',fee->>''basis'',''unit_amount_minor'',unit,''quantity'',quantity,''amount_minor'',amount,''taxes'',fee->''taxes'',''retained'',retained));fee_sum:=fee_sum+amount;
 END LOOP;
 seen:=ARRAY[]::text[];
 FOR tax IN SELECT x FROM jsonb_array_elements(p_value->''taxes'') x LOOP
  IF jsonb_typeof(tax) IS DISTINCT FROM ''object'' OR (SELECT count(*) FROM jsonb_object_keys(tax))<>5 OR NOT(tax ?& ARRAY[''code'',''label'',''basis_points'',''taxable_base_minor'',''amount_minor'']) THEN RAISE EXCEPTION ''Guest document tax shape is invalid'';END IF;
  code:=tax->>''code'';label:=CASE code WHEN ''legacy'' THEN ''Existing combined tax'' WHEN ''city'' THEN ''City tax'' WHEN ''state'' THEN ''State tax'' WHEN ''lodging'' THEN ''Lodging tax'' WHEN ''adjusted_total'' THEN ''Adjusted tax total'' END;
  IF label IS NULL OR tax->>''label'' IS DISTINCT FROM label OR code=ANY(seen) OR (mode=''adjusted'') IS DISTINCT FROM (code=''adjusted_total'') THEN RAISE EXCEPTION ''Guest document tax identity is invalid'';END IF;
  seen:=array_append(seen,code);amount:=irp_pms.guest_document_number(tax->''amount_minor'');
  IF mode=''adjusted'' THEN
   IF tax->''basis_points'' IS DISTINCT FROM ''null''::jsonb OR tax->''taxable_base_minor'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''Adjusted tax must not invent a rate or base'';END IF;
  ELSE
   PERFORM irp_pms.guest_document_number(tax->''basis_points'',0,10000);
   tax_base:=irp_pms.guest_document_number(tax->''taxable_base_minor'');
   IF tax_base IS DISTINCT FROM (amounts->>''accommodation_minor'')::numeric+coalesce((SELECT sum((f->>''amount_minor'')::numeric) FROM jsonb_array_elements(fees) f WHERE f->''taxes'' ? code),0) THEN RAISE EXCEPTION ''Guest document tax base disagrees with its recorded fee selections'';END IF;
  END IF;
  taxes:=taxes||jsonb_build_array(jsonb_build_object(''code'',code,''label'',label,''basis_points'',tax->''basis_points'',''taxable_base_minor'',tax->''taxable_base_minor'',''amount_minor'',amount));tax_sum:=tax_sum+amount;
 END LOOP;
 IF tax_sum IS DISTINCT FROM (amounts->>''taxes_minor'')::numeric OR fee_sum IS DISTINCT FROM (amounts->>''hotel_fees_minor'')::numeric THEN RAISE EXCEPTION ''Guest document tax and fee lines do not reconcile'';END IF;
 output:=jsonb_build_object(''schema_version'',1,''mode'',mode,''currency'',''USD'',''arrival'',arrival,''departure'',departure,''taxes'',taxes,''fees'',fees,''fees_retained'',mode=''adjusted'',''requires_reconciliation'',mode=''adjusted'',''fee_basis_arrival'',basis_arrival,''fee_basis_departure'',basis_departure)||amounts;
 RETURN output;
END $$;

CREATE FUNCTION irp_pms.guest_document_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE prop jsonb:=p_capture->''property'';res jsonb:=p_capture->''reservation'';party jsonb:=p_capture->''party'';source_opening jsonb:=p_capture->''opening'';book jsonb:=p_capture->''deposit_book'';raw_entries jsonb:=p_capture->''entries'';deposit_events jsonb:=p_capture->''deposit_events'';
 component text;components jsonb:=''{}'';opening_components jsonb:=''{}'';current_item jsonb;opening_item jsonb;opening jsonb;contact jsonb;billing jsonb;stay_guest jsonb;account jsonb;deposit jsonb;reservation jsonb;output jsonb;entries jsonb:=''[]'';entry jsonb;target jsonb;event jsonb;amount bigint;value bigint;kind text;label text;source_key text;safe_name text;safe_reference text;recorded boolean;known boolean:=true;frozen boolean;available boolean;changed boolean:=false;opening_warning boolean:=false;current_warning boolean:=false;
 additional numeric:=0;reversed numeric:=0;payments numeric:=0;refunds numeric:=0;corrections numeric:=0;charges numeric;paid numeric;balance numeric;charge_effect bigint;payment_effect bigint;target_sum numeric;totals jsonb;deposit_received numeric:=0;deposit_refunded numeric:=0;deposit_reduced numeric:=0;deposit_held numeric;entry_count integer;deposit_count integer;room_type jsonb;room jsonb;arrival date;departure date;source_version bigint;party_version bigint;profile_version bigint;copied_version bigint;book_version bigint;
BEGIN
 IF p_capture IS NULL OR prop IS NULL OR res IS NULL OR prop=''null''::jsonb OR res=''null''::jsonb OR p_actor IS NULL OR p_role NOT IN(''owner'',''manager'',''staff'') OR p_role IS NULL OR NOT isfinite(p_generated) THEN RAISE EXCEPTION ''Guest document snapshot context is incomplete'';END IF;
 IF prop->>''currency'' IS DISTINCT FROM ''USD'' OR prop->>''operating_model'' IS NULL OR prop->>''operating_model'' NOT IN(''hotel'',''whole_home'') OR res->>''status'' IS NULL OR res->>''status'' NOT IN(''Confirmed'',''Cancelled'',''In house'',''Checked out'') THEN RAISE EXCEPTION ''Guest document source context is not supported'';END IF;
 PERFORM irp_pms.guest_document_label(prop->>''name'',200);PERFORM irp_pms.guest_document_label(prop->>''time_zone'',200);
 source_version:=irp_pms.guest_document_number(res->''source_version'',1,9007199254740991);
 safe_name:=irp_pms.guest_document_label(res->>''guest_name'',200,true,true);safe_reference:=irp_pms.guest_document_label(res->>''source_booking_id'',128,false,true);
 PERFORM irp_pms.guest_document_label(res->>''source'',100);
 arrival:=(res->>''arrival'')::date;departure:=(res->>''departure'')::date;
 IF (arrival IS NOT NULL AND NOT isfinite(arrival)) OR (departure IS NOT NULL AND NOT isfinite(departure)) OR (arrival IS NOT NULL AND departure IS NOT NULL AND departure-arrival NOT BETWEEN 1 AND 30) THEN RAISE EXCEPTION ''Guest document stay dates are invalid'';END IF;
 PERFORM irp_pms.guest_document_number(res->''guests'',1,2147483647,true);
 IF (res->>''checked_in_at'' IS NOT NULL AND NOT isfinite((res->>''checked_in_at'')::timestamptz)) OR (res->>''checked_out_at'' IS NOT NULL AND NOT isfinite((res->>''checked_out_at'')::timestamptz)) THEN RAISE EXCEPTION ''Guest document actual stay times are invalid'';END IF;
 FOREACH component IN ARRAY ARRAY[''accommodation_minor'',''taxes_minor'',''hotel_fees_minor'',''ota_fees_minor'',''total_minor''] LOOP
  source_key:=CASE WHEN component=''total_minor'' THEN ''guest_total_minor'' ELSE component END;
  value:=irp_pms.guest_document_number(res->source_key,0,999999999999,true);known:=known AND value IS NOT NULL;components:=components||jsonb_build_object(component,value);
 END LOOP;
 IF known AND (components->>''accommodation_minor'')::numeric+(components->>''taxes_minor'')::numeric+(components->>''hotel_fees_minor'')::numeric+(components->>''ota_fees_minor'')::numeric IS DISTINCT FROM (components->>''total_minor'')::numeric THEN RAISE EXCEPTION ''Current guest document charges do not reconcile'';END IF;
 current_item:=irp_pms.guest_document_itemization(res->''charge_breakdown'',components);
 IF current_item IS NOT NULL AND ((arrival IS NOT NULL AND current_item->>''arrival'' IS DISTINCT FROM arrival::text) OR (departure IS NOT NULL AND current_item->>''departure'' IS DISTINCT FROM departure::text)) THEN RAISE EXCEPTION ''Current guest document pricing dates disagree'';END IF;
 current_warning:=coalesce((current_item->>''requires_reconciliation'')::boolean,false);
 IF p_capture->''room_type'' IS NOT NULL AND p_capture->''room_type''<>''null''::jsonb THEN
  room_type:=jsonb_build_object(''id'',p_capture->''room_type''->>''id'',''name'',irp_pms.guest_document_label(p_capture->''room_type''->>''name'',200));
 END IF;
 IF p_capture->''room'' IS NOT NULL AND p_capture->''room''<>''null''::jsonb THEN
  room:=jsonb_build_object(''id'',p_capture->''room''->>''id'',''label'',irp_pms.guest_document_label(p_capture->''room''->>''label'',40),''current_occupancy'',res->>''status''=''In house'');
 END IF;
 IF (res->>''room_type_id'' IS NOT NULL AND room_type IS NULL) OR (res->>''physical_room_id'' IS NOT NULL AND room IS NULL) THEN RAISE EXCEPTION ''Guest document room scope is incomplete'';END IF;
 reservation:=jsonb_build_object(''id'',res->>''id'',''source'',res->>''source'',''source_booking_id'',safe_reference,''source_version'',source_version,''status'',res->>''status'',''cancellation_kind'',CASE WHEN res->>''cancellation_disposition''=''no_show'' THEN ''no_show'' END,''booked_name'',safe_name,''arrival'',arrival,''departure'',departure,''nights'',departure-arrival,''guests'',res->''guests'',''room_type'',room_type,''recorded_room'',room,''checked_in_at'',res->''checked_in_at'',''checked_out_at'',res->''checked_out_at'',''current_charges'',components||jsonb_build_object(''known'',known,''itemization'',current_item),''text_normalized'',safe_name IS DISTINCT FROM res->>''guest_name'' OR safe_reference IS DISTINCT FROM res->>''source_booking_id'');
 recorded:=party IS NOT NULL AND party<>''null''::jsonb;
 IF recorded THEN
  party_version:=irp_pms.guest_document_number(party->''version'',1,9007199254740991);
  contact:=irp_pms.normalize_guest_data(party->''contact'',''contact'');billing:=irp_pms.normalize_guest_data(party->''billing_party'',''billing'');
  IF contact IS DISTINCT FROM party->''contact'' OR billing IS DISTINCT FROM party->''billing_party'' OR party->>''updated_at'' IS NULL OR NOT isfinite((party->>''updated_at'')::timestamptz) THEN RAISE EXCEPTION ''Saved guest document parties are not canonical'';END IF;
  copied_version:=irp_pms.guest_document_number(party->''guest_profile_version'',1,9007199254740991,true);profile_version:=irp_pms.guest_document_number(p_capture->''linked_profile_version'',1,9007199254740991,true);
  IF (party->>''guest_id'' IS NULL AND (copied_version IS NOT NULL OR profile_version IS NOT NULL)) OR (party->>''guest_id'' IS NOT NULL AND (copied_version IS NULL OR profile_version IS NULL)) THEN RAISE EXCEPTION ''Guest document linked profile context is incomplete'';END IF;
 ELSE party_version:=0;
 END IF;
 stay_guest:=jsonb_build_object(''recorded'',recorded,''version'',party_version,''contact'',contact,''billing_party'',billing,''guest_id'',CASE WHEN recorded THEN party->>''guest_id'' END,''copied_profile_version'',copied_version,''linked_profile_current_version'',profile_version,''linked_profile_changed'',recorded AND party->>''guest_id'' IS NOT NULL AND copied_version IS DISTINCT FROM profile_version,''updated_at'',CASE WHEN recorded THEN party->''updated_at'' END);
 IF jsonb_typeof(raw_entries) IS DISTINCT FROM ''array'' OR jsonb_typeof(deposit_events) IS DISTINCT FROM ''array'' THEN RAISE EXCEPTION ''Guest document event capture is incomplete'';END IF;
 entry_count:=jsonb_array_length(raw_entries);deposit_count:=jsonb_array_length(deposit_events);
 IF entry_count>1000 OR deposit_count>1000 THEN RAISE EXCEPTION ''Guest document exceeds its complete 1000-entry history limit'';END IF;
 frozen:=source_opening IS NOT NULL AND source_opening<>''null''::jsonb;available:=frozen OR known;
 IF NOT frozen AND entry_count<>0 THEN RAISE EXCEPTION ''Guest document entries have no frozen opening'';END IF;
 IF available THEN
  IF frozen THEN
   FOREACH component IN ARRAY ARRAY[''accommodation_minor'',''taxes_minor'',''hotel_fees_minor'',''ota_fees_minor'',''total_minor''] LOOP
    source_key:=CASE WHEN component=''ota_fees_minor'' THEN ''fees_minor'' ELSE component END;
    value:=irp_pms.guest_document_number(source_opening->source_key);opening_components:=opening_components||jsonb_build_object(component,value);
    changed:=changed OR value IS DISTINCT FROM (components->>component)::bigint;
   END LOOP;
   IF source_opening->>''currency'' IS DISTINCT FROM ''USD'' OR source_opening->>''opened_at'' IS NULL OR NOT isfinite((source_opening->>''opened_at'')::timestamptz) THEN RAISE EXCEPTION ''Guest document opening context is incomplete'';END IF;
   PERFORM irp_pms.guest_document_number(source_opening->''source_version'',1,9007199254740991);PERFORM irp_pms.guest_document_label(source_opening->>''reservation_source'',100);
   opening_item:=irp_pms.guest_document_itemization(source_opening->''charge_breakdown'',opening_components);changed:=changed OR source_opening->''charge_breakdown'' IS DISTINCT FROM res->''charge_breakdown'';
  ELSE opening_components:=components;opening_item:=current_item;
  END IF;
  IF (opening_components->>''accommodation_minor'')::numeric+(opening_components->>''taxes_minor'')::numeric+(opening_components->>''hotel_fees_minor'')::numeric+(opening_components->>''ota_fees_minor'')::numeric IS DISTINCT FROM (opening_components->>''total_minor'')::numeric THEN RAISE EXCEPTION ''Guest document opening does not reconcile'';END IF;
  opening:=opening_components||jsonb_build_object(''itemization'',opening_item,''source'',CASE WHEN frozen THEN source_opening->>''reservation_source'' ELSE res->>''source'' END,''source_version'',CASE WHEN frozen THEN (source_opening->>''source_version'')::bigint ELSE source_version END,''opened_at'',CASE WHEN frozen THEN source_opening->''opened_at'' END);
  opening_warning:=coalesce((opening_item->>''requires_reconciliation'')::boolean,false);
 END IF;
 IF (SELECT count(DISTINCT x->>''id'') FROM jsonb_array_elements(raw_entries) x) IS DISTINCT FROM entry_count::bigint THEN RAISE EXCEPTION ''Guest document contains duplicate or missing entry identities'';END IF;
 FOR entry IN SELECT x FROM jsonb_array_elements(raw_entries) x LOOP
  PERFORM (entry->>''id'')::uuid;amount:=irp_pms.guest_document_number(entry->''amount_minor'',1);kind:=entry->>''kind'';
  IF entry->>''currency'' IS DISTINCT FROM ''USD'' OR entry->>''created_at'' IS NULL OR NOT isfinite((entry->>''created_at'')::timestamptz) THEN RAISE EXCEPTION ''Guest document entry context is invalid'';END IF;
  label:=CASE kind WHEN ''charge'' THEN ''Additional charge'' WHEN ''charge_reversal'' THEN ''Charge reversal'' WHEN ''external_payment'' THEN ''External payment recorded'' WHEN ''external_refund'' THEN ''External refund recorded'' WHEN ''payment_correction'' THEN ''Payment record correction'' END;
  IF label IS NULL OR (kind IN(''charge'',''external_payment'') AND entry->>''target_entry_id'' IS NOT NULL) OR (kind IN(''external_refund'',''payment_correction'') AND entry->>''target_entry_id'' IS NULL) THEN RAISE EXCEPTION ''Guest document entry kind or target is invalid'';END IF;
  IF entry->>''target_entry_id'' IS NOT NULL THEN
   SELECT x INTO target FROM jsonb_array_elements(raw_entries) x WHERE x->>''id''=entry->>''target_entry_id'';
   IF target IS NULL OR target->>''kind'' IS DISTINCT FROM (CASE WHEN kind=''charge_reversal'' THEN ''charge'' ELSE ''external_payment'' END) THEN RAISE EXCEPTION ''Guest document target is not a same-account source entry'';END IF;
  END IF;
  charge_effect:=CASE kind WHEN ''charge'' THEN amount WHEN ''charge_reversal'' THEN -amount ELSE 0 END;payment_effect:=CASE kind WHEN ''external_payment'' THEN amount WHEN ''external_refund'' THEN -amount WHEN ''payment_correction'' THEN -amount ELSE 0 END;
  additional:=additional+CASE WHEN kind=''charge'' THEN amount ELSE 0 END;reversed:=reversed+CASE WHEN kind=''charge_reversal'' THEN amount ELSE 0 END;payments:=payments+CASE WHEN kind=''external_payment'' THEN amount ELSE 0 END;refunds:=refunds+CASE WHEN kind=''external_refund'' THEN amount ELSE 0 END;corrections:=corrections+CASE WHEN kind=''payment_correction'' THEN amount ELSE 0 END;
  entries:=entries||jsonb_build_array(jsonb_build_object(''id'',entry->>''id'',''kind'',kind,''label'',label,''amount_minor'',amount,''currency'',''USD'',''target_entry_id'',entry->>''target_entry_id'',''recorded_at'',entry->''created_at'',''charge_effect_minor'',charge_effect,''payment_effect_minor'',payment_effect,''balance_effect_minor'',charge_effect-payment_effect));
 END LOOP;
 IF available THEN
  SELECT coalesce(sum((x->>''amount_minor'')::numeric),0) INTO target_sum FROM jsonb_array_elements(raw_entries) x WHERE x->>''kind''=''charge_reversal'' AND x->>''target_entry_id'' IS NULL;
  IF target_sum>(opening->>''total_minor'')::numeric THEN RAISE EXCEPTION ''Guest document opening reversals exceed original charges'';END IF;
  FOR target IN SELECT x FROM jsonb_array_elements(raw_entries) x WHERE x->>''kind'' IN(''charge'',''external_payment'') LOOP
   SELECT coalesce(sum((x->>''amount_minor'')::numeric),0) INTO target_sum FROM jsonb_array_elements(raw_entries) x WHERE x->>''target_entry_id''=target->>''id'';
   IF target_sum>(target->>''amount_minor'')::numeric THEN RAISE EXCEPTION ''Guest document linked adjustments exceed their source'';END IF;
  END LOOP;
  charges:=(opening->>''total_minor'')::numeric+additional-reversed;paid:=payments-refunds-corrections;balance:=charges-paid;
  IF least(charges,paid)<0 OR greatest(additional,reversed,payments,refunds,corrections,charges)>999999999999 OR abs(balance)>9007199254740991 THEN RAISE EXCEPTION ''Guest document ledger totals are outside their supported range'';END IF;
  totals:=jsonb_build_object(''additional_minor'',additional::bigint,''reversed_minor'',reversed::bigint,''charges_minor'',charges::bigint,''external_payments_minor'',payments::bigint,''external_refunds_minor'',refunds::bigint,''corrected_payments_minor'',corrections::bigint,''paid_minor'',paid::bigint,''balance_minor'',balance::bigint);
 END IF;
 account:=jsonb_build_object(''available'',available,''unavailable_reason'',CASE WHEN NOT available THEN ''reservation_charges_unavailable'' END,''opening_mode'',CASE WHEN frozen THEN ''frozen'' WHEN known THEN ''reservation_preview'' END,''opening'',opening,''totals'',totals,''entries'',entries,''reservation_amounts_changed'',changed,''opening_pricing_reconciliation_required'',opening_warning,''current_pricing_reconciliation_required'',current_warning,''pricing_reconciliation_required'',changed OR opening_warning OR current_warning,''itemization_available'',opening_item IS NOT NULL,''adjustments_itemized'',false,''payment_recording'',''external_only'');
 IF book IS NOT NULL AND book<>''null''::jsonb THEN
  book_version:=irp_pms.guest_document_number(book->''version'',1,1000);
  IF book->>''currency'' IS DISTINCT FROM ''USD'' OR book_version IS DISTINCT FROM deposit_count::bigint OR book->>''creation_operating_model'' IS NULL OR book->>''creation_operating_model'' NOT IN(''hotel'',''whole_home'') OR book->>''updated_at'' IS NULL OR NOT isfinite((book->>''updated_at'')::timestamptz) THEN RAISE EXCEPTION ''Guest document deposit context is incomplete'';END IF;
  PERFORM irp_pms.guest_document_label(book->>''recording_time_zone'',200);
  FOR event IN SELECT x FROM jsonb_array_elements(deposit_events) x LOOP
   amount:=irp_pms.guest_document_number(event->''amount_minor'',1);kind:=event->>''kind'';
   IF kind IS NULL OR kind NOT IN(''external_receipt'',''external_refund'',''receipt_reduction'') OR event->>''currency'' IS DISTINCT FROM ''USD'' THEN RAISE EXCEPTION ''Guest document deposit event is invalid'';END IF;
   deposit_received:=deposit_received+CASE WHEN kind=''external_receipt'' THEN amount ELSE 0 END;deposit_refunded:=deposit_refunded+CASE WHEN kind=''external_refund'' THEN amount ELSE 0 END;deposit_reduced:=deposit_reduced+CASE WHEN kind=''receipt_reduction'' THEN amount ELSE 0 END;
  END LOOP;
  deposit_held:=deposit_received-deposit_refunded-deposit_reduced;
  IF deposit_held<0 OR greatest(deposit_received,deposit_refunded,deposit_reduced)>999999999999 OR irp_pms.guest_document_number(book->''received_minor'') IS DISTINCT FROM deposit_received OR irp_pms.guest_document_number(book->''refunded_minor'') IS DISTINCT FROM deposit_refunded OR irp_pms.guest_document_number(book->''reduced_minor'') IS DISTINCT FROM deposit_reduced OR irp_pms.guest_document_number(book->''held_minor'') IS DISTINCT FROM deposit_held THEN RAISE EXCEPTION ''Guest document deposit totals do not reconcile'';END IF;
  deposit:=jsonb_build_object(''recorded'',true,''book_id'',book->>''id'',''version'',book_version,''recording_time_zone'',book->>''recording_time_zone'',''creation_operating_model'',book->>''creation_operating_model'',''updated_at'',book->''updated_at'',''event_count'',deposit_count,''totals'',jsonb_build_object(''received_minor'',deposit_received::bigint,''refunded_minor'',deposit_refunded::bigint,''reduced_minor'',deposit_reduced::bigint,''held_minor'',deposit_held::bigint),''financial_review_required'',deposit_held>0 AND res->>''status'' IN(''Checked out'',''Cancelled''));
 ELSE
  IF deposit_count<>0 THEN RAISE EXCEPTION ''Guest document deposit events lack a book'';END IF;
  deposit:=jsonb_build_object(''recorded'',false,''book_id'',NULL,''version'',0,''recording_time_zone'',NULL,''creation_operating_model'',NULL,''updated_at'',NULL,''event_count'',0,''totals'',NULL,''financial_review_required'',false);
 END IF;
 deposit:=deposit||jsonb_build_object(''currency'',''USD'',''recording_mode'',''external_only'',''purpose'',''refundable_security'',''applied_to_account'',false);
 output:=jsonb_build_object(''schema_version'',1,''tenant_id'',prop->>''tenant_id'',''property_id'',prop->>''id'',''reservation_id'',res->>''id'',''actor_id'',p_actor,''role'',p_role,''generated_at'',p_generated,''property_business_date'',(p_generated AT TIME ZONE (prop->>''time_zone''))::date,''property'',jsonb_build_object(''id'',prop->>''id'',''name'',prop->>''name'',''currency'',''USD'',''time_zone'',prop->>''time_zone'',''operating_model'',prop->>''operating_model''),''reservation'',reservation,''stay_guest'',stay_guest,''account'',account,''security_deposit'',deposit,''completeness'',jsonb_build_object(''complete'',true,''rows_truncated'',false,''folio_entry_count'',entry_count,''deposit_event_count'',deposit_count,''account_amounts_available'',available),''semantics'',jsonb_build_object(''document_mode'',''current_read_only_summary'',''invoice_issued'',false,''signature_recorded'',false,''consent_recorded'',false,''payment_moved'',false,''settlement_verified'',false,''folio_opened'',false,''deposit_book_created'',false,''financial_records_changed'',false,''internal_notes_included'',false));
 IF octet_length(output::text)>2097152 THEN RAISE EXCEPTION ''Guest document response exceeds its complete output size limit'';END IF;
 RETURN output;
END $$;
CREATE FUNCTION public.irp_pms_pilot_guest_documents(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;captured jsonb;generated timestamptz;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL THEN RAISE EXCEPTION ''A scoped reservation is required'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 generated:=clock_timestamp();
 -- DOCUMENT173_CAPTURE_BEGIN: one persistent relational statement snapshot.
 WITH doc_folio_rows AS MATERIALIZED(
  SELECT e.* FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.created_at,e.id LIMIT 1001
 ),doc_deposit_rows AS MATERIALIZED(
  SELECT e.* FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.to_version LIMIT 1001
 )
 SELECT jsonb_build_object(''property'',to_jsonb(p),''reservation'',to_jsonb(r),''party'',to_jsonb(g),''linked_profile_version'',gp.version,''room_type'',to_jsonb(rt),''room'',to_jsonb(room),''opening'',to_jsonb(f),''deposit_book'',to_jsonb(b),''entries'',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM doc_folio_rows e),''[]''::jsonb),''deposit_events'',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.to_version) FROM doc_deposit_rows e),''[]''::jsonb))
 INTO captured
 FROM irp_pms.properties p
 JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id AND r.id=p_reservation
 LEFT JOIN irp_pms.reservation_parties g ON g.tenant_id=r.tenant_id AND g.property_id=r.property_id AND g.reservation_id=r.id
 LEFT JOIN irp_pms.guest_profiles gp ON gp.tenant_id=g.tenant_id AND gp.property_id=g.property_id AND gp.id=g.guest_id
 LEFT JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id
 LEFT JOIN irp_pms.rooms room ON room.tenant_id=r.tenant_id AND room.property_id=r.property_id AND room.id=r.physical_room_id
 LEFT JOIN irp_pms.folio_openings f ON f.tenant_id=r.tenant_id AND f.property_id=r.property_id AND f.reservation_id=r.id
 LEFT JOIN irp_pms.security_deposit_books b ON b.tenant_id=r.tenant_id AND b.property_id=r.property_id AND b.reservation_id=r.id
 WHERE p.tenant_id=p_tenant AND p.id=p_property;
 -- DOCUMENT173_CAPTURE_END: projection below reads captured values only.
 IF captured IS NULL THEN RAISE EXCEPTION ''Unknown scoped reservation'';END IF;
 RETURN irp_pms.guest_document_projection(captured,auth.uid(),member_role,generated);
END $$;
REVOKE ALL ON FUNCTION irp_pms.guest_document_number(jsonb,bigint,bigint,boolean),irp_pms.guest_document_label(text,integer,boolean,boolean),irp_pms.guest_document_itemization(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.guest_document_projection(jsonb,uuid,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_guest_documents(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_guest_documents(uuid,uuid,uuid) TO authenticated;
']);
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='202609070173';
