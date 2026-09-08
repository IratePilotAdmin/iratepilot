BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Read-only172 preflight. Frozen171 effective definitions, observed retained
-- grants and50 table column shapes; no configuration or financial mutation.
DO $preflight$
DECLARE expected record;actual record;matched integer;column_hash text;
BEGIN
 IF to_regclass('irp_pms.security_deposit_books') IS NOT NULL OR to_regclass('irp_pms.security_deposit_events') IS NOT NULL OR to_regclass('irp_pms.security_deposit_requests') IS NOT NULL THEN RAISE EXCEPTION 'Security-deposit172 storage already exists; inspect before proceeding';END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'Migration receipt table is required';END IF;
 SELECT count(*) INTO matched FROM supabase_migrations.schema_migrations WHERE version IN ('202609070142','202609070143','202609070144','202609070145','202609070146','202609070147','202609070149','202609070150','202609070151','202609070152','202609070153','202609070154','202609070155','202609070156','202609070158','202609070159','202609070160','202609070161','202609070162','202609070163','202609070164','202609070165','202609070166','202609070167','202609070168','202609070169','202609070170','202609070171');
 IF matched<>28 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609070172') THEN RAISE EXCEPTION 'Require all28 installed destination add-ons through171 and no172 receipt';END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('irp_pms.apply_operating_model(uuid, uuid, text, integer)','8cfaf0f913962f4d96e82cdac6c617da',false,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.apply_reservation(uuid, uuid, jsonb)','8f9b2eefa99b11fb9ff59d0adaf8a483',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.effective_capacity(uuid, uuid, uuid, date)','5bad369ad5cd5e1c08dbf7ab45e63ccd',false,'s','search_path=pg_catalog','integer',false,false,false),
 ('irp_pms.enqueue_turnover(uuid, uuid, uuid, text, text, uuid, bigint, uuid, timestamp with time zone, text, date, uuid)','d44ef3fe132b4823db819aa166f924a7',false,'v','search_path=pg_catalog','uuid',false,false,false),
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
 ('public.irp_pms_pilot_housekeeping(uuid, uuid, uuid, text)','50c04bb7ba40b44d6e6e7c8e6bccfdf8',true,'v','search_path=pg_catalog','jsonb',false,false,false),
 ('public.irp_pms_pilot_maintenance(uuid, uuid, date, date)','53bf3b78ee8a491a3fa2ac2f6327d6c7',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_maintenance_request_status(uuid, uuid, uuid)','526a5c5d43517c77566a49634568abd3',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_move_room(uuid, uuid, uuid, uuid, bigint, uuid, bigint, uuid, bigint, text)','ace648612ff1847ee313d36d81591a0f',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_operational_report(uuid, uuid, date, date)','6167970d76fd1ce8e8d36c7d00ed863f',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_release_room_closure(uuid, uuid, uuid, uuid, bigint, date, text)','88f60e31713647de48bda7b56dd17499',true,'v','search_path=pg_catalog','jsonb',false,true,false),
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
  IF NOT FOUND OR md5(regexp_replace(actual.prosrc,E'\r\n?',E'\n','g')) IS DISTINCT FROM expected.body_md5 OR actual.prosecdef IS DISTINCT FROM expected.definer OR actual.provolatile::text IS DISTINCT FROM expected.volatility OR actual.config_string IS DISTINCT FROM expected.config OR actual.return_name IS DISTINCT FROM expected.returns THEN RAISE EXCEPTION 'Effective171 definition differs: %',expected.signature;END IF;
  IF has_function_privilege('anon',actual.oid,'EXECUTE') IS DISTINCT FROM expected.anon OR has_function_privilege('authenticated',actual.oid,'EXECUTE') IS DISTINCT FROM expected.authenticated OR has_function_privilege('service_role',actual.oid,'EXECUTE') IS DISTINCT FROM expected.service_role THEN RAISE EXCEPTION 'Effective171 execution grants differ: %',expected.signature;END IF;
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
  IF column_hash IS DISTINCT FROM expected.columns_md5 THEN RAISE EXCEPTION 'Effective171 column shape differs: %',expected.table_name;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmed test organization owner required for transaction-only proof';END IF;
END $preflight$;
SELECT 'security_deposit_preflight_passed' AS verification;

CREATE TABLE irp_pms.security_deposit_books(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),reservation_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 1000),currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 recording_time_zone text NOT NULL CHECK(length(recording_time_zone) BETWEEN 1 AND 100 AND recording_time_zone=trim(recording_time_zone) AND recording_time_zone !~ '[[:cntrl:]]'),
 creation_operating_model text NOT NULL CHECK(creation_operating_model IN('hotel','whole_home')),
 created_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL,
 received_minor bigint NOT NULL CHECK(received_minor BETWEEN 1 AND 999999999999),
 refunded_minor bigint NOT NULL CHECK(refunded_minor BETWEEN 0 AND 999999999999),
 reduced_minor bigint NOT NULL CHECK(reduced_minor BETWEEN 0 AND 999999999999),
 held_minor bigint GENERATED ALWAYS AS(received_minor-refunded_minor-reduced_minor) STORED CHECK(held_minor>=0),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,reservation_id),UNIQUE(tenant_id,property_id,id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.security_deposit_events(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),book_id uuid NOT NULL,reservation_id uuid NOT NULL,request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('external_receipt','external_refund','receipt_reduction')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 target_event_id uuid,recorded_method text,reference text NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL,recording_time_zone text NOT NULL,recording_date date NOT NULL CHECK(isfinite(recording_date)),
 from_version bigint NOT NULL CHECK(from_version BETWEEN 0 AND 999),to_version bigint NOT NULL CHECK(to_version=from_version+1),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,book_id,to_version),UNIQUE(tenant_id,property_id,book_id,id),
 UNIQUE(tenant_id,property_id,book_id,reservation_id,id),
 FOREIGN KEY(tenant_id,property_id,book_id,reservation_id) REFERENCES irp_pms.security_deposit_books(tenant_id,property_id,id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,book_id,target_event_id) REFERENCES irp_pms.security_deposit_events(tenant_id,property_id,book_id,id),
 CHECK((kind='external_receipt' AND target_event_id IS NULL) OR (kind IN('external_refund','receipt_reduction') AND target_event_id IS NOT NULL)),
 CHECK((kind='receipt_reduction' AND recorded_method IS NULL) OR (kind IN('external_receipt','external_refund') AND recorded_method IS NOT NULL AND recorded_method IN('cash','card','bank_transfer','other'))),
 CHECK(length(reference) BETWEEN 4 AND 200 AND reference=trim(reference) AND reference !~ '[[:cntrl:]]'),
 CHECK(length(reason) BETWEEN 4 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]'),
 CHECK(isfinite(recorded_at) AND recording_date=(recorded_at AT TIME ZONE recording_time_zone)::date)
);
CREATE INDEX security_deposit_event_recording_date ON irp_pms.security_deposit_events(tenant_id,property_id,recording_date,id);
CREATE INDEX security_deposit_event_target ON irp_pms.security_deposit_events(tenant_id,property_id,book_id,target_event_id);
CREATE TABLE irp_pms.security_deposit_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 outcome text NOT NULL CHECK(outcome IN('recorded','retired')),book_id uuid,event_id uuid,retirement_reason text,
 command jsonb NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=16384),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=16384),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,book_id,reservation_id,event_id) REFERENCES irp_pms.security_deposit_events(tenant_id,property_id,book_id,reservation_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((outcome='recorded' AND book_id IS NOT NULL AND event_id IS NOT NULL AND retirement_reason IS NULL)
  OR (outcome='retired' AND book_id IS NULL AND event_id IS NULL AND retirement_reason IS NOT NULL AND length(retirement_reason) BETWEEN 4 AND 500 AND retirement_reason=trim(retirement_reason) AND retirement_reason !~ '[[:cntrl:]]'))
);
ALTER TABLE irp_pms.security_deposit_events ADD CONSTRAINT security_deposit_event_request
 FOREIGN KEY(tenant_id,property_id,request_id) REFERENCES irp_pms.security_deposit_requests(tenant_id,property_id,request_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE irp_pms.security_deposit_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.security_deposit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.security_deposit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.security_deposit_books,irp_pms.security_deposit_events,irp_pms.security_deposit_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.security_deposit_books,irp_pms.security_deposit_events,irp_pms.security_deposit_requests TO service_role;

CREATE FUNCTION irp_pms.normalize_security_deposit_command(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE reservation uuid;target uuid;version bigint;amount bigint;zone text;day date;kind text;method text;reference text;reason text;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16384
 OR p_data-ARRAY['reservation_id','expected_version','expected_recording_time_zone','expected_recording_date','kind','amount_minor','method','reference','reason','target_event_id','confirmed']<>'{}'::jsonb
 OR (SELECT count(*) FROM jsonb_object_keys(p_data))<>11
 OR jsonb_typeof(p_data->'reservation_id') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'expected_version') IS DISTINCT FROM 'number' OR p_data->>'expected_version' !~ '^[0-9]{1,4}$'
 OR jsonb_typeof(p_data->'amount_minor') IS DISTINCT FROM 'number' OR p_data->>'amount_minor' !~ '^[0-9]{1,12}$'
 OR jsonb_typeof(p_data->'expected_recording_time_zone') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'expected_recording_date') IS DISTINCT FROM 'string' OR p_data->>'expected_recording_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR jsonb_typeof(p_data->'kind') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'method') NOT IN('string','null')
 OR jsonb_typeof(p_data->'reference') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'reason') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'target_event_id') NOT IN('string','null') OR p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'Provide the complete reviewed security-deposit command with exact fields and integer amounts';END IF;
 reservation:=(p_data->>'reservation_id')::uuid;target:=(p_data->>'target_event_id')::uuid;version:=(p_data->>'expected_version')::bigint;amount:=(p_data->>'amount_minor')::bigint;
 zone:=trim(p_data->>'expected_recording_time_zone');day:=(p_data->>'expected_recording_date')::date;kind:=p_data->>'kind';method:=p_data->>'method';reference:=trim(p_data->>'reference');reason:=trim(p_data->>'reason');
 IF reservation IS NULL OR version NOT BETWEEN 0 AND 1000 OR amount NOT BETWEEN 1 AND 999999999999
 OR length(zone) NOT BETWEEN 1 AND 100 OR zone~'[[:cntrl:]]' OR NOT isfinite(day)
 OR kind NOT IN('external_receipt','external_refund','receipt_reduction')
 OR length(reference) NOT BETWEEN 4 AND 200 OR reference~'[[:cntrl:]]' OR length(reason) NOT BETWEEN 4 AND 500 OR reason~'[[:cntrl:]]'
 OR (kind='external_receipt' AND target IS NOT NULL) OR (kind<>'external_receipt' AND target IS NULL)
 OR (kind='receipt_reduction' AND method IS NOT NULL)
 OR (kind<>'receipt_reduction' AND (method IS NULL OR method NOT IN('cash','card','bank_transfer','other')))
 THEN RAISE EXCEPTION 'Review the receipt/refund/reduction, positive USD amount, target, recorded method, date, reference and reason';END IF;
 RETURN jsonb_build_object('reservation_id',reservation,'expected_version',version,'expected_recording_time_zone',zone,'expected_recording_date',day,'kind',kind,'amount_minor',amount,'method',method,'reference',reference,'reason',reason,'target_event_id',target,'confirmed',true);
END $$;

CREATE FUNCTION irp_pms.security_deposit_reservation_json(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',r.id,'source',r.source,'source_booking_id',r.source_booking_id,'status',r.status,'cancellation_kind',r.cancellation_disposition,'guest_name',r.guest_name,'arrival',r.arrival,'departure',r.departure)
 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id=p_reservation
$$;
CREATE FUNCTION irp_pms.security_deposit_event_json(p_event irp_pms.security_deposit_events) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT to_jsonb(p_event)-ARRAY['tenant_id','property_id'] $$;
CREATE FUNCTION irp_pms.security_deposit_book_json(p_tenant uuid,p_property uuid,p_book uuid,p_version bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE b irp_pms.security_deposit_books;e irp_pms.security_deposit_events;received bigint;refunded bigint;reduced bigint;
BEGIN
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_book;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_version IS NULL THEN received:=b.received_minor;refunded:=b.refunded_minor;reduced:=b.reduced_minor;
 ELSE
  SELECT * INTO e FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=p_book AND to_version=p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown security-deposit history version';END IF;
  SELECT coalesce(sum(amount_minor) FILTER(WHERE kind='external_receipt'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='receipt_reduction'),0)
  INTO received,refunded,reduced FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=p_book AND to_version<=p_version;
  b.version:=p_version;b.updated_at:=e.recorded_at;
 END IF;
 RETURN jsonb_build_object('id',b.id,'reservation_id',b.reservation_id,'version',b.version,'currency',b.currency,'recording_time_zone',b.recording_time_zone,'creation_operating_model',b.creation_operating_model,'created_at',b.created_at,'created_by',b.created_by,'updated_at',b.updated_at,
 'totals',jsonb_build_object('received_minor',received,'refunded_minor',refunded,'reduced_minor',reduced,'held_minor',received-refunded-reduced));
END $$;
CREATE FUNCTION irp_pms.security_deposit_result_json(p_tenant uuid,p_property uuid,p_event uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schema_version',1,'outcome','recorded','tenant_id',e.tenant_id,'property_id',e.property_id,'request_id',e.request_id,'action','record_security_deposit',
 'book',irp_pms.security_deposit_book_json(e.tenant_id,e.property_id,e.book_id,e.to_version),'event',irp_pms.security_deposit_event_json(e),'expected_version',e.from_version,'recording_date',e.recording_date,'recording_time_zone',e.recording_time_zone,
 'recording_mode','external_only','purpose','refundable_security','folio_changed',false,'revenue_changed',false,'replayed',false)
 FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.id=p_event
$$;
CREATE FUNCTION irp_pms.security_deposit_retired_json(p_row irp_pms.security_deposit_requests) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schema_version',1,'outcome','retired','tenant_id',p_row.tenant_id,'property_id',p_row.property_id,'reservation_id',p_row.reservation_id,'request_id',p_row.request_id,'action','retire_security_deposit_request',
 'command',p_row.command,'retirement_reason',p_row.retirement_reason,'retired_by',p_row.actor_id,'retired_at',p_row.recorded_at,'book_version_changed',false,'financial_changed',false,'folio_changed',false,'revenue_changed',false,'replayed',false)
$$;

CREATE FUNCTION irp_pms.security_deposit_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME<>'security_deposit_books' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Security-deposit events and request outcomes are immutable; books cannot be deleted';END IF;
 IF NEW.version IS DISTINCT FROM OLD.version+1 OR (NEW.tenant_id,NEW.property_id,NEW.id,NEW.reservation_id,NEW.currency,NEW.recording_time_zone,NEW.creation_operating_model,NEW.created_at,NEW.created_by)
 IS DISTINCT FROM(OLD.tenant_id,OLD.property_id,OLD.id,OLD.reservation_id,OLD.currency,OLD.recording_time_zone,OLD.creation_operating_model,OLD.created_at,OLD.created_by)
 THEN RAISE EXCEPTION 'Security-deposit book identity/context is immutable and revisions advance exactly once';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER security_deposit_book_history BEFORE UPDATE OR DELETE ON irp_pms.security_deposit_books FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_history_guard();
CREATE TRIGGER security_deposit_event_history BEFORE UPDATE OR DELETE ON irp_pms.security_deposit_events FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_history_guard();
CREATE TRIGGER security_deposit_request_history BEFORE UPDATE OR DELETE ON irp_pms.security_deposit_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_history_guard();

CREATE FUNCTION irp_pms.security_deposit_insert_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;b irp_pms.security_deposit_books;target irp_pms.security_deposit_events;
BEGIN
 IF TG_TABLE_NAME='security_deposit_books' THEN
  SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id;
  IF prop.id IS NULL OR NEW.version IS DISTINCT FROM 1::bigint OR NEW.refunded_minor IS DISTINCT FROM 0::bigint OR NEW.reduced_minor IS DISTINCT FROM 0::bigint OR NEW.updated_at IS DISTINCT FROM NEW.created_at
  OR (NEW.recording_time_zone,NEW.creation_operating_model,NEW.currency) IS DISTINCT FROM(prop.time_zone,prop.operating_model,prop.currency)
  THEN RAISE EXCEPTION 'First deposit book context must match its property and start with one external receipt';END IF;
 ELSE
  SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.book_id FOR UPDATE;
  IF b.id IS NULL OR NEW.reservation_id IS DISTINCT FROM b.reservation_id OR NEW.to_version IS DISTINCT FROM b.version
  OR NEW.recording_time_zone IS DISTINCT FROM b.recording_time_zone OR NEW.recorded_at IS DISTINCT FROM b.updated_at
  OR NEW.from_version IS DISTINCT FROM(SELECT count(*) FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id)
  THEN RAISE EXCEPTION 'Deposit event must append the exact next scoped book version and frozen recording context';END IF;
  IF NEW.to_version=1 AND (NEW.kind IS DISTINCT FROM 'external_receipt' OR NEW.recorded_at IS DISTINCT FROM b.created_at OR NEW.actor_id IS DISTINCT FROM b.created_by) THEN RAISE EXCEPTION 'First deposit event must match the creation receipt';END IF;
  IF NEW.target_event_id IS NOT NULL THEN
   SELECT * INTO target FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id AND id=NEW.target_event_id;
   IF target.id IS NULL OR target.kind IS DISTINCT FROM 'external_receipt' OR target.to_version>=NEW.to_version THEN RAISE EXCEPTION 'A deposit adjustment must target an earlier receipt in this same book';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER security_deposit_book_context BEFORE INSERT ON irp_pms.security_deposit_books FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_insert_guard();
CREATE TRIGGER security_deposit_event_context BEFORE INSERT ON irp_pms.security_deposit_events FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_insert_guard();

CREATE FUNCTION irp_pms.security_deposit_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b irp_pms.security_deposit_books;e irp_pms.security_deposit_events;request irp_pms.security_deposit_requests;received numeric;refunded numeric;reduced numeric;n bigint;last_version bigint;first_version bigint;expected jsonb;checked_book_id uuid;
BEGIN
 IF TG_TABLE_NAME='security_deposit_requests' THEN
  SELECT * INTO request FROM irp_pms.security_deposit_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id;
  IF request.command IS DISTINCT FROM irp_pms.normalize_security_deposit_command(request.command) OR request.command->>'reservation_id' IS DISTINCT FROM request.reservation_id::text THEN RAISE EXCEPTION 'Deposit request command must be canonical and scoped';END IF;
  IF request.outcome='retired' THEN
   IF request.result IS DISTINCT FROM irp_pms.security_deposit_retired_json(request) OR EXISTS(SELECT 1 FROM irp_pms.security_deposit_events WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND request_id=request.request_id)
   THEN RAISE EXCEPTION 'Retired deposit request must preserve its exact nonfinancial fence and have no event';END IF;
  ELSE
   SELECT * INTO e FROM irp_pms.security_deposit_events WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND id=request.event_id;
   expected:=irp_pms.normalize_security_deposit_command(jsonb_build_object('reservation_id',e.reservation_id,'expected_version',e.from_version,'expected_recording_time_zone',e.recording_time_zone,'expected_recording_date',e.recording_date,'kind',e.kind,'amount_minor',e.amount_minor,'method',e.recorded_method,'reference',e.reference,'reason',e.reason,'target_event_id',e.target_event_id,'confirmed',true));
   IF e.id IS NULL OR (request.book_id,request.reservation_id,request.request_id,request.actor_id,request.recorded_at) IS DISTINCT FROM(e.book_id,e.reservation_id,e.request_id,e.actor_id,e.recorded_at)
   OR request.command IS DISTINCT FROM expected OR request.result IS DISTINCT FROM irp_pms.security_deposit_result_json(e.tenant_id,e.property_id,e.id)
   THEN RAISE EXCEPTION 'Recorded deposit request must match its exact event and historical prefix result';END IF;
  END IF;
  RETURN NULL;
 END IF;
 IF TG_TABLE_NAME='security_deposit_books' THEN checked_book_id:=NEW.id;ELSE checked_book_id:=NEW.book_id;END IF;
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=checked_book_id;
 SELECT count(*),min(to_version),max(to_version),coalesce(sum(amount_minor) FILTER(WHERE kind='external_receipt'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='receipt_reduction'),0)
 INTO n,first_version,last_version,received,refunded,reduced FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id;
 IF n IS DISTINCT FROM b.version OR first_version IS DISTINCT FROM 1::bigint OR last_version IS DISTINCT FROM b.version
 OR (received,refunded,reduced) IS DISTINCT FROM(b.received_minor::numeric,b.refunded_minor::numeric,b.reduced_minor::numeric)
 OR b.updated_at IS DISTINCT FROM(SELECT recorded_at FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id AND to_version=b.version)
 THEN RAISE EXCEPTION 'Deposit book totals and version must equal its complete contiguous event history';END IF;
 IF EXISTS(
  SELECT 1 FROM irp_pms.security_deposit_events original
  LEFT JOIN irp_pms.security_deposit_events adjustment ON adjustment.tenant_id=original.tenant_id AND adjustment.property_id=original.property_id AND adjustment.book_id=original.book_id AND adjustment.target_event_id=original.id
  WHERE original.tenant_id=b.tenant_id AND original.property_id=b.property_id AND original.book_id=b.id AND original.kind='external_receipt'
  GROUP BY original.id,original.amount_minor HAVING coalesce(sum(adjustment.amount_minor),0)>original.amount_minor
 ) THEN RAISE EXCEPTION 'Refunds and record reductions exceed their original security-deposit receipt';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.security_deposit_events x LEFT JOIN irp_pms.security_deposit_requests r ON r.tenant_id=x.tenant_id AND r.property_id=x.property_id AND r.request_id=x.request_id
 WHERE x.tenant_id=b.tenant_id AND x.property_id=b.property_id AND x.book_id=b.id AND (r.request_id IS NULL OR r.outcome IS DISTINCT FROM 'recorded' OR (r.book_id,r.reservation_id,r.event_id,r.actor_id) IS DISTINCT FROM(x.book_id,x.reservation_id,x.id,x.actor_id)))
 THEN RAISE EXCEPTION 'Every deposit event requires its exact recorded request';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER security_deposit_book_consistency AFTER INSERT OR UPDATE ON irp_pms.security_deposit_books DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_consistency();
CREATE CONSTRAINT TRIGGER security_deposit_event_consistency AFTER INSERT ON irp_pms.security_deposit_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_consistency();
CREATE CONSTRAINT TRIGGER security_deposit_request_consistency AFTER INSERT ON irp_pms.security_deposit_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_consistency();

REVOKE ALL ON FUNCTION irp_pms.normalize_security_deposit_command(jsonb),irp_pms.security_deposit_reservation_json(uuid,uuid,uuid),irp_pms.security_deposit_event_json(irp_pms.security_deposit_events),irp_pms.security_deposit_book_json(uuid,uuid,uuid,bigint),irp_pms.security_deposit_result_json(uuid,uuid,uuid),irp_pms.security_deposit_retired_json(irp_pms.security_deposit_requests),irp_pms.security_deposit_history_guard(),irp_pms.security_deposit_insert_guard(),irp_pms.security_deposit_consistency() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.irp_pms_pilot_record_security_deposit(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_expected_recording_time_zone text,p_expected_recording_date date,p_kind text,p_amount_minor bigint,p_method text,p_reference text,p_reason text,p_target uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;prior irp_pms.security_deposit_requests;prop irp_pms.properties;b irp_pms.security_deposit_books;e irp_pms.security_deposit_events;target irp_pms.security_deposit_events;book_exists boolean;version bigint;zone text;recorded timestamptz;day date;against_target bigint;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A security-deposit request identity is required';END IF;
 command:=irp_pms.normalize_security_deposit_command(jsonb_build_object('reservation_id',p_reservation,'expected_version',p_expected_version,'expected_recording_time_zone',p_expected_recording_time_zone,'expected_recording_date',p_expected_recording_date,'kind',p_kind,'amount_minor',p_amount_minor,'method',p_method,'reference',p_reference,'reason',p_reason,'target_event_id',p_target,'confirmed',p_confirmed));
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 SELECT * INTO prior FROM irp_pms.security_deposit_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.reservation_id IS DISTINCT FROM p_reservation OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Security-deposit request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation FOR UPDATE;
 book_exists:=FOUND;version:=CASE WHEN book_exists THEN b.version ELSE 0 END;zone:=CASE WHEN book_exists THEN b.recording_time_zone ELSE prop.time_zone END;
 recorded:=clock_timestamp();day:=(recorded AT TIME ZONE zone)::date;
 IF p_expected_version IS DISTINCT FROM version THEN RAISE EXCEPTION 'Security-deposit book version changed; refresh the reviewed record' USING ERRCODE='PT409';END IF;
 IF command->>'expected_recording_time_zone' IS DISTINCT FROM zone THEN RAISE EXCEPTION 'Security-deposit recording time zone changed; refresh before recording' USING ERRCODE='PT409';END IF;
 IF p_expected_recording_date IS DISTINCT FROM day THEN RAISE EXCEPTION 'Security-deposit recording date changed; review the current date' USING ERRCODE='PT412';END IF;
 IF version>=1000 THEN RAISE EXCEPTION 'Security-deposit book exceeds the supported1000 event limit';END IF;
 IF NOT book_exists THEN
  IF p_kind<>'external_receipt' THEN RAISE EXCEPTION 'Only an external receipt can create a security-deposit book';END IF;
  INSERT INTO irp_pms.security_deposit_books(tenant_id,property_id,reservation_id,version,recording_time_zone,creation_operating_model,created_at,created_by,updated_at,received_minor,refunded_minor,reduced_minor)
  VALUES(p_tenant,p_property,p_reservation,1,zone,prop.operating_model,recorded,auth.uid(),recorded,p_amount_minor,0,0) RETURNING * INTO b;
 ELSE
  IF p_kind<>'external_receipt' THEN
   SELECT * INTO target FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=b.id AND id=p_target;
   IF NOT FOUND OR target.kind<>'external_receipt' THEN RAISE EXCEPTION 'Choose an original receipt in this same security-deposit book';END IF;
   SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=b.id AND target_event_id=p_target;
   IF against_target+p_amount_minor>target.amount_minor THEN RAISE EXCEPTION 'Refund or reduction exceeds the remaining original security-deposit receipt';END IF;
  END IF;
  IF (p_kind='external_receipt' AND b.received_minor+p_amount_minor>999999999999) OR (p_kind='external_refund' AND b.refunded_minor+p_amount_minor>999999999999) OR (p_kind='receipt_reduction' AND b.reduced_minor+p_amount_minor>999999999999) THEN RAISE EXCEPTION 'Security-deposit book amount exceeds supported integer range';END IF;
  UPDATE irp_pms.security_deposit_books SET version=b.version+1,updated_at=recorded,
   received_minor=received_minor+CASE WHEN p_kind='external_receipt' THEN p_amount_minor ELSE 0 END,
   refunded_minor=refunded_minor+CASE WHEN p_kind='external_refund' THEN p_amount_minor ELSE 0 END,
   reduced_minor=reduced_minor+CASE WHEN p_kind='receipt_reduction' THEN p_amount_minor ELSE 0 END
  WHERE tenant_id=p_tenant AND property_id=p_property AND id=b.id RETURNING * INTO b;
 END IF;
 INSERT INTO irp_pms.security_deposit_events(tenant_id,property_id,book_id,reservation_id,request_id,kind,amount_minor,target_event_id,recorded_method,reference,reason,actor_id,recorded_at,recording_time_zone,recording_date,from_version,to_version)
 VALUES(p_tenant,p_property,b.id,p_reservation,p_request,p_kind,p_amount_minor,p_target,p_method,command->>'reference',command->>'reason',auth.uid(),recorded,zone,day,version,b.version) RETURNING * INTO e;
 result:=irp_pms.security_deposit_result_json(p_tenant,p_property,e.id);
 INSERT INTO irp_pms.security_deposit_requests(tenant_id,property_id,request_id,reservation_id,actor_id,outcome,book_id,event_id,command,result,recorded_at)
 VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),'recorded',b.id,e.id,command,result,recorded);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),'security_deposit_recorded',p_reservation,jsonb_build_object('book_id',b.id,'event_id',e.id,'request_id',p_request,'kind',p_kind,'amount_minor',p_amount_minor,'version',b.version,'recording_mode','external_only','purpose','refundable_security'),recorded);
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_retire_security_deposit_request(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_command jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;prior irp_pms.security_deposit_requests;retired irp_pms.security_deposit_requests;reason text:=trim(p_reason);
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 command:=irp_pms.normalize_security_deposit_command(p_command);
 IF p_request IS NULL OR p_reservation IS NULL OR command->>'reservation_id' IS DISTINCT FROM p_reservation::text OR reason IS NULL OR length(reason) NOT BETWEEN 4 AND 500 OR reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Retirement requires the exact original reservation command, request and reviewed reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 SELECT * INTO prior FROM irp_pms.security_deposit_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.reservation_id IS DISTINCT FROM p_reservation OR prior.command IS DISTINCT FROM command OR (prior.outcome='retired' AND prior.retirement_reason IS DISTINCT FROM reason) THEN RAISE EXCEPTION 'Security-deposit request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 retired.tenant_id:=p_tenant;retired.property_id:=p_property;retired.request_id:=p_request;retired.reservation_id:=p_reservation;retired.actor_id:=auth.uid();retired.outcome:='retired';retired.command:=command;retired.retirement_reason:=reason;retired.recorded_at:=clock_timestamp();
 retired.result:=irp_pms.security_deposit_retired_json(retired);
 INSERT INTO irp_pms.security_deposit_requests SELECT retired.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),'security_deposit_request_retired',p_reservation,jsonb_build_object('request_id',p_request,'purpose','refundable_security','financial_changed',false,'book_version_changed',false),retired.recorded_at);
 RETURN retired.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.security_deposit_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A security-deposit request identity is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.security_deposit_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action',CASE WHEN prior.outcome='recorded' THEN 'record_security_deposit' ELSE 'retire_security_deposit_request' END,'result',prior.result);
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;b irp_pms.security_deposit_books;reservation jsonb;book jsonb;events jsonb:='[]';targets jsonb:='[]';zone text;generated timestamptz;n bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 reservation:=irp_pms.security_deposit_reservation_json(p_tenant,p_property,p_reservation);
 IF reservation IS NULL THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF FOUND THEN
  SELECT count(*) INTO n FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=b.id;
  IF n>1000 OR n IS DISTINCT FROM b.version THEN RAISE EXCEPTION 'Security-deposit detail exceeds its supported complete event history';END IF;
  book:=irp_pms.security_deposit_book_json(p_tenant,p_property,b.id);zone:=b.recording_time_zone;
  SELECT coalesce(jsonb_agg(irp_pms.security_deposit_event_json(e) ORDER BY e.to_version),'[]') INTO events FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.book_id=b.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('event_id',x.id,'received_minor',x.amount_minor,'refunded_minor',x.refunded,'reduced_minor',x.reduced,'remaining_minor',x.amount_minor-x.refunded-x.reduced) ORDER BY x.to_version),'[]') INTO targets FROM(
   SELECT r.id,r.amount_minor,r.to_version,coalesce(sum(a.amount_minor) FILTER(WHERE a.kind='external_refund'),0) refunded,coalesce(sum(a.amount_minor) FILTER(WHERE a.kind='receipt_reduction'),0) reduced
   FROM irp_pms.security_deposit_events r LEFT JOIN irp_pms.security_deposit_events a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.book_id=r.book_id AND a.target_event_id=r.id
   WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.book_id=b.id AND r.kind='external_receipt' GROUP BY r.id,r.amount_minor,r.to_version
  ) x;
 ELSE zone:=prop.time_zone;
 END IF;
 generated:=clock_timestamp();
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation',reservation,'role',member_role,'can_manage',member_role IN('owner','manager'),'property_time_zone',prop.time_zone,'recording_time_zone',zone,'recording_date',(generated AT TIME ZONE zone)::date,'generated_at',generated,'book',book,'version',coalesce(b.version,0),'totals',book->'totals','events',events,'refundable_receipts',targets,'recording_mode','external_only','purpose','refundable_security','folio_changed',false,'rows_truncated',false);
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit_register(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;n bigint;received numeric;refunded numeric;reduced numeric;held numeric;rows jsonb;summary jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT count(*),coalesce(sum(received_minor),0),coalesce(sum(refunded_minor),0),coalesce(sum(reduced_minor),0),coalesce(sum(held_minor),0) INTO n,received,refunded,reduced,held FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF n>10000 THEN RAISE EXCEPTION 'Security-deposit register exceeds10000 books; no rows were truncated';END IF;
 IF greatest(received,refunded,reduced,held)>9007199254740991 THEN RAISE EXCEPTION 'Security-deposit register totals exceed the exact JSON integer range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('reservation',irp_pms.security_deposit_reservation_json(b.tenant_id,b.property_id,b.reservation_id),'book',irp_pms.security_deposit_book_json(b.tenant_id,b.property_id,b.id),'financial_review_required',b.held_minor>0 AND r.status IN('Checked out','Cancelled')) ORDER BY b.created_at,b.id),'[]'),
 jsonb_build_object('book_count',count(*),'with_held_count',count(*) FILTER(WHERE b.held_minor>0),'zero_held_count',count(*) FILTER(WHERE b.held_minor=0),'ended_with_held_count',count(*) FILTER(WHERE b.held_minor>0 AND r.status IN('Checked out','Cancelled')),'ended_held_minor',coalesce(sum(b.held_minor) FILTER(WHERE b.held_minor>0 AND r.status IN('Checked out','Cancelled')),0))
 INTO rows,summary FROM irp_pms.security_deposit_books b JOIN irp_pms.reservations r ON r.tenant_id=b.tenant_id AND r.property_id=b.property_id AND r.id=b.reservation_id WHERE b.tenant_id=p_tenant AND b.property_id=p_property;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'generated_at',clock_timestamp(),'property_time_zone',prop.time_zone,'role',member_role,'can_manage',member_role IN('owner','manager'),'currency','USD','rows',rows,'totals',jsonb_build_object('received_minor',received,'refunded_minor',refunded,'reduced_minor',reduced,'held_minor',held),'summary',summary,'recording_mode','external_only','purpose','refundable_security','rows_truncated',false,
 'definitions',jsonb_build_object('scope','Current totals for explicit refundable security-deposit books in every reservation status; reservations without a book and legacy folio payments are not inferred as deposits.','held','External receipt records minus linked external refunds and receipt-record reductions. Held records do not establish processor settlement or an approved refund.','review','Checked-out or cancelled reservations with recorded held funds need separate financial review; no-show is counted once as cancelled.','method','Method is operator-reported information. References may identify shared documents or batches and are not verified unique provider transactions.','financial','Deposit records do not change guest folios, revenue, taxes, inventory or physical checkout.'));
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit_activity(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;n bigint;received numeric;refunded numeric;reduced numeric;effect numeric;rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Choose1 to366 recording civil dates with an exclusive end';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT count(*),coalesce(sum(amount_minor) FILTER(WHERE kind='external_receipt'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='receipt_reduction'),0)
 INTO n,received,refunded,reduced FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND recording_date>=p_start AND recording_date<p_end;
 effect:=received-refunded-reduced;
 IF n>10000 THEN RAISE EXCEPTION 'Security-deposit activity exceeds10000 events; narrow the dates';END IF;
 IF greatest(received,refunded,reduced,abs(effect))>9007199254740991 THEN RAISE EXCEPTION 'Security-deposit activity totals exceed the exact JSON integer range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('reservation',irp_pms.security_deposit_reservation_json(e.tenant_id,e.property_id,e.reservation_id),'event',irp_pms.security_deposit_event_json(e),'held_effect_minor',CASE WHEN e.kind='external_receipt' THEN e.amount_minor ELSE -e.amount_minor END) ORDER BY e.recording_date,e.recorded_at,e.book_id,e.to_version),'[]')
 INTO rows FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.recording_date>=p_start AND e.recording_date<p_end;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'generated_at',clock_timestamp(),'property_time_zone',prop.time_zone,'currency','USD','period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true,'basis','stored_recording_date'),'rows',rows,'totals',jsonb_build_object('event_count',n,'received_minor',received,'refunded_minor',refunded,'reduced_minor',reduced,'held_effect_minor',effect),'recording_mode','external_only','purpose','refundable_security','rows_truncated',false,
 'definitions',jsonb_build_object('period','Stored event recording civil dates in each book''s frozen recording time zone; no backdated transaction or settlement date. Books can use different zones.','effect','Receipt records increase held funds; external refund records and receipt-record reductions decrease them. A record reduction asserts no refund or money movement.','balance','Net activity in these dates is not the current held balance. An empty period does not mean no funds remain held.','labels','Reservation name, source, dates and status are current labels; event identity, amount, actor and recording context are immutable.','financial','These records neither settle a guest folio nor post revenue, taxes or real processor transactions.'));
END $$;

REVOKE ALL ON FUNCTION
 public.irp_pms_pilot_record_security_deposit(uuid,uuid,uuid,uuid,bigint,text,date,text,bigint,text,text,text,uuid,boolean),
 public.irp_pms_pilot_retire_security_deposit_request(uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_security_deposit_request_status(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit_register(uuid,uuid),
 public.irp_pms_pilot_security_deposit_activity(uuid,uuid,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.irp_pms_pilot_record_security_deposit(uuid,uuid,uuid,uuid,bigint,text,date,text,bigint,text,text,text,uuid,boolean),
 public.irp_pms_pilot_retire_security_deposit_request(uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_security_deposit_request_status(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit_register(uuid,uuid),
 public.irp_pms_pilot_security_deposit_activity(uuid,uuid,date,date)
 TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('202609070172','iratepilot_pms_security_deposits',ARRAY['CREATE TABLE irp_pms.security_deposit_books(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),reservation_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 1000),currency text NOT NULL DEFAULT ''USD'' CHECK(currency=''USD''),
 recording_time_zone text NOT NULL CHECK(length(recording_time_zone) BETWEEN 1 AND 100 AND recording_time_zone=trim(recording_time_zone) AND recording_time_zone !~ ''[[:cntrl:]]''),
 creation_operating_model text NOT NULL CHECK(creation_operating_model IN(''hotel'',''whole_home'')),
 created_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL,
 received_minor bigint NOT NULL CHECK(received_minor BETWEEN 1 AND 999999999999),
 refunded_minor bigint NOT NULL CHECK(refunded_minor BETWEEN 0 AND 999999999999),
 reduced_minor bigint NOT NULL CHECK(reduced_minor BETWEEN 0 AND 999999999999),
 held_minor bigint GENERATED ALWAYS AS(received_minor-refunded_minor-reduced_minor) STORED CHECK(held_minor>=0),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,reservation_id),UNIQUE(tenant_id,property_id,id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.security_deposit_events(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),book_id uuid NOT NULL,reservation_id uuid NOT NULL,request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN(''external_receipt'',''external_refund'',''receipt_reduction'')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),currency text NOT NULL DEFAULT ''USD'' CHECK(currency=''USD''),
 target_event_id uuid,recorded_method text,reference text NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL,recording_time_zone text NOT NULL,recording_date date NOT NULL CHECK(isfinite(recording_date)),
 from_version bigint NOT NULL CHECK(from_version BETWEEN 0 AND 999),to_version bigint NOT NULL CHECK(to_version=from_version+1),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,book_id,to_version),UNIQUE(tenant_id,property_id,book_id,id),
 UNIQUE(tenant_id,property_id,book_id,reservation_id,id),
 FOREIGN KEY(tenant_id,property_id,book_id,reservation_id) REFERENCES irp_pms.security_deposit_books(tenant_id,property_id,id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,book_id,target_event_id) REFERENCES irp_pms.security_deposit_events(tenant_id,property_id,book_id,id),
 CHECK((kind=''external_receipt'' AND target_event_id IS NULL) OR (kind IN(''external_refund'',''receipt_reduction'') AND target_event_id IS NOT NULL)),
 CHECK((kind=''receipt_reduction'' AND recorded_method IS NULL) OR (kind IN(''external_receipt'',''external_refund'') AND recorded_method IS NOT NULL AND recorded_method IN(''cash'',''card'',''bank_transfer'',''other''))),
 CHECK(length(reference) BETWEEN 4 AND 200 AND reference=trim(reference) AND reference !~ ''[[:cntrl:]]''),
 CHECK(length(reason) BETWEEN 4 AND 500 AND reason=trim(reason) AND reason !~ ''[[:cntrl:]]''),
 CHECK(isfinite(recorded_at) AND recording_date=(recorded_at AT TIME ZONE recording_time_zone)::date)
);
CREATE INDEX security_deposit_event_recording_date ON irp_pms.security_deposit_events(tenant_id,property_id,recording_date,id);
CREATE INDEX security_deposit_event_target ON irp_pms.security_deposit_events(tenant_id,property_id,book_id,target_event_id);
CREATE TABLE irp_pms.security_deposit_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 outcome text NOT NULL CHECK(outcome IN(''recorded'',''retired'')),book_id uuid,event_id uuid,retirement_reason text,
 command jsonb NOT NULL CHECK(jsonb_typeof(command)=''object'' AND octet_length(command::text)<=16384),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)=''object'' AND octet_length(result::text)<=16384),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,book_id,reservation_id,event_id) REFERENCES irp_pms.security_deposit_events(tenant_id,property_id,book_id,reservation_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((outcome=''recorded'' AND book_id IS NOT NULL AND event_id IS NOT NULL AND retirement_reason IS NULL)
  OR (outcome=''retired'' AND book_id IS NULL AND event_id IS NULL AND retirement_reason IS NOT NULL AND length(retirement_reason) BETWEEN 4 AND 500 AND retirement_reason=trim(retirement_reason) AND retirement_reason !~ ''[[:cntrl:]]''))
);
ALTER TABLE irp_pms.security_deposit_events ADD CONSTRAINT security_deposit_event_request
 FOREIGN KEY(tenant_id,property_id,request_id) REFERENCES irp_pms.security_deposit_requests(tenant_id,property_id,request_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE irp_pms.security_deposit_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.security_deposit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.security_deposit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.security_deposit_books,irp_pms.security_deposit_events,irp_pms.security_deposit_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.security_deposit_books,irp_pms.security_deposit_events,irp_pms.security_deposit_requests TO service_role;

CREATE FUNCTION irp_pms.normalize_security_deposit_command(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE reservation uuid;target uuid;version bigint;amount bigint;zone text;day date;kind text;method text;reference text;reason text;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>''object'' OR octet_length(p_data::text)>16384
 OR p_data-ARRAY[''reservation_id'',''expected_version'',''expected_recording_time_zone'',''expected_recording_date'',''kind'',''amount_minor'',''method'',''reference'',''reason'',''target_event_id'',''confirmed'']<>''{}''::jsonb
 OR (SELECT count(*) FROM jsonb_object_keys(p_data))<>11
 OR jsonb_typeof(p_data->''reservation_id'') IS DISTINCT FROM ''string''
 OR jsonb_typeof(p_data->''expected_version'') IS DISTINCT FROM ''number'' OR p_data->>''expected_version'' !~ ''^[0-9]{1,4}$''
 OR jsonb_typeof(p_data->''amount_minor'') IS DISTINCT FROM ''number'' OR p_data->>''amount_minor'' !~ ''^[0-9]{1,12}$''
 OR jsonb_typeof(p_data->''expected_recording_time_zone'') IS DISTINCT FROM ''string''
 OR jsonb_typeof(p_data->''expected_recording_date'') IS DISTINCT FROM ''string'' OR p_data->>''expected_recording_date'' !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$''
 OR jsonb_typeof(p_data->''kind'') IS DISTINCT FROM ''string''
 OR jsonb_typeof(p_data->''method'') NOT IN(''string'',''null'')
 OR jsonb_typeof(p_data->''reference'') IS DISTINCT FROM ''string'' OR jsonb_typeof(p_data->''reason'') IS DISTINCT FROM ''string''
 OR jsonb_typeof(p_data->''target_event_id'') NOT IN(''string'',''null'') OR p_data->''confirmed'' IS DISTINCT FROM ''true''::jsonb
 THEN RAISE EXCEPTION ''Provide the complete reviewed security-deposit command with exact fields and integer amounts'';END IF;
 reservation:=(p_data->>''reservation_id'')::uuid;target:=(p_data->>''target_event_id'')::uuid;version:=(p_data->>''expected_version'')::bigint;amount:=(p_data->>''amount_minor'')::bigint;
 zone:=trim(p_data->>''expected_recording_time_zone'');day:=(p_data->>''expected_recording_date'')::date;kind:=p_data->>''kind'';method:=p_data->>''method'';reference:=trim(p_data->>''reference'');reason:=trim(p_data->>''reason'');
 IF reservation IS NULL OR version NOT BETWEEN 0 AND 1000 OR amount NOT BETWEEN 1 AND 999999999999
 OR length(zone) NOT BETWEEN 1 AND 100 OR zone~''[[:cntrl:]]'' OR NOT isfinite(day)
 OR kind NOT IN(''external_receipt'',''external_refund'',''receipt_reduction'')
 OR length(reference) NOT BETWEEN 4 AND 200 OR reference~''[[:cntrl:]]'' OR length(reason) NOT BETWEEN 4 AND 500 OR reason~''[[:cntrl:]]''
 OR (kind=''external_receipt'' AND target IS NOT NULL) OR (kind<>''external_receipt'' AND target IS NULL)
 OR (kind=''receipt_reduction'' AND method IS NOT NULL)
 OR (kind<>''receipt_reduction'' AND (method IS NULL OR method NOT IN(''cash'',''card'',''bank_transfer'',''other'')))
 THEN RAISE EXCEPTION ''Review the receipt/refund/reduction, positive USD amount, target, recorded method, date, reference and reason'';END IF;
 RETURN jsonb_build_object(''reservation_id'',reservation,''expected_version'',version,''expected_recording_time_zone'',zone,''expected_recording_date'',day,''kind'',kind,''amount_minor'',amount,''method'',method,''reference'',reference,''reason'',reason,''target_event_id'',target,''confirmed'',true);
END $$;

CREATE FUNCTION irp_pms.security_deposit_reservation_json(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''id'',r.id,''source'',r.source,''source_booking_id'',r.source_booking_id,''status'',r.status,''cancellation_kind'',r.cancellation_disposition,''guest_name'',r.guest_name,''arrival'',r.arrival,''departure'',r.departure)
 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id=p_reservation
$$;
CREATE FUNCTION irp_pms.security_deposit_event_json(p_event irp_pms.security_deposit_events) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT to_jsonb(p_event)-ARRAY[''tenant_id'',''property_id''] $$;
CREATE FUNCTION irp_pms.security_deposit_book_json(p_tenant uuid,p_property uuid,p_book uuid,p_version bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE b irp_pms.security_deposit_books;e irp_pms.security_deposit_events;received bigint;refunded bigint;reduced bigint;
BEGIN
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_book;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_version IS NULL THEN received:=b.received_minor;refunded:=b.refunded_minor;reduced:=b.reduced_minor;
 ELSE
  SELECT * INTO e FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=p_book AND to_version=p_version;
  IF NOT FOUND THEN RAISE EXCEPTION ''Unknown security-deposit history version'';END IF;
  SELECT coalesce(sum(amount_minor) FILTER(WHERE kind=''external_receipt''),0),coalesce(sum(amount_minor) FILTER(WHERE kind=''external_refund''),0),coalesce(sum(amount_minor) FILTER(WHERE kind=''receipt_reduction''),0)
  INTO received,refunded,reduced FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=p_book AND to_version<=p_version;
  b.version:=p_version;b.updated_at:=e.recorded_at;
 END IF;
 RETURN jsonb_build_object(''id'',b.id,''reservation_id'',b.reservation_id,''version'',b.version,''currency'',b.currency,''recording_time_zone'',b.recording_time_zone,''creation_operating_model'',b.creation_operating_model,''created_at'',b.created_at,''created_by'',b.created_by,''updated_at'',b.updated_at,
 ''totals'',jsonb_build_object(''received_minor'',received,''refunded_minor'',refunded,''reduced_minor'',reduced,''held_minor'',received-refunded-reduced));
END $$;
CREATE FUNCTION irp_pms.security_deposit_result_json(p_tenant uuid,p_property uuid,p_event uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''schema_version'',1,''outcome'',''recorded'',''tenant_id'',e.tenant_id,''property_id'',e.property_id,''request_id'',e.request_id,''action'',''record_security_deposit'',
 ''book'',irp_pms.security_deposit_book_json(e.tenant_id,e.property_id,e.book_id,e.to_version),''event'',irp_pms.security_deposit_event_json(e),''expected_version'',e.from_version,''recording_date'',e.recording_date,''recording_time_zone'',e.recording_time_zone,
 ''recording_mode'',''external_only'',''purpose'',''refundable_security'',''folio_changed'',false,''revenue_changed'',false,''replayed'',false)
 FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.id=p_event
$$;
CREATE FUNCTION irp_pms.security_deposit_retired_json(p_row irp_pms.security_deposit_requests) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''schema_version'',1,''outcome'',''retired'',''tenant_id'',p_row.tenant_id,''property_id'',p_row.property_id,''reservation_id'',p_row.reservation_id,''request_id'',p_row.request_id,''action'',''retire_security_deposit_request'',
 ''command'',p_row.command,''retirement_reason'',p_row.retirement_reason,''retired_by'',p_row.actor_id,''retired_at'',p_row.recorded_at,''book_version_changed'',false,''financial_changed'',false,''folio_changed'',false,''revenue_changed'',false,''replayed'',false)
$$;

CREATE FUNCTION irp_pms.security_deposit_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME<>''security_deposit_books'' OR TG_OP=''DELETE'' THEN RAISE EXCEPTION ''Security-deposit events and request outcomes are immutable; books cannot be deleted'';END IF;
 IF NEW.version IS DISTINCT FROM OLD.version+1 OR (NEW.tenant_id,NEW.property_id,NEW.id,NEW.reservation_id,NEW.currency,NEW.recording_time_zone,NEW.creation_operating_model,NEW.created_at,NEW.created_by)
 IS DISTINCT FROM(OLD.tenant_id,OLD.property_id,OLD.id,OLD.reservation_id,OLD.currency,OLD.recording_time_zone,OLD.creation_operating_model,OLD.created_at,OLD.created_by)
 THEN RAISE EXCEPTION ''Security-deposit book identity/context is immutable and revisions advance exactly once'';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER security_deposit_book_history BEFORE UPDATE OR DELETE ON irp_pms.security_deposit_books FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_history_guard();
CREATE TRIGGER security_deposit_event_history BEFORE UPDATE OR DELETE ON irp_pms.security_deposit_events FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_history_guard();
CREATE TRIGGER security_deposit_request_history BEFORE UPDATE OR DELETE ON irp_pms.security_deposit_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_history_guard();

CREATE FUNCTION irp_pms.security_deposit_insert_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;b irp_pms.security_deposit_books;target irp_pms.security_deposit_events;
BEGIN
 IF TG_TABLE_NAME=''security_deposit_books'' THEN
  SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id;
  IF prop.id IS NULL OR NEW.version IS DISTINCT FROM 1::bigint OR NEW.refunded_minor IS DISTINCT FROM 0::bigint OR NEW.reduced_minor IS DISTINCT FROM 0::bigint OR NEW.updated_at IS DISTINCT FROM NEW.created_at
  OR (NEW.recording_time_zone,NEW.creation_operating_model,NEW.currency) IS DISTINCT FROM(prop.time_zone,prop.operating_model,prop.currency)
  THEN RAISE EXCEPTION ''First deposit book context must match its property and start with one external receipt'';END IF;
 ELSE
  SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.book_id FOR UPDATE;
  IF b.id IS NULL OR NEW.reservation_id IS DISTINCT FROM b.reservation_id OR NEW.to_version IS DISTINCT FROM b.version
  OR NEW.recording_time_zone IS DISTINCT FROM b.recording_time_zone OR NEW.recorded_at IS DISTINCT FROM b.updated_at
  OR NEW.from_version IS DISTINCT FROM(SELECT count(*) FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id)
  THEN RAISE EXCEPTION ''Deposit event must append the exact next scoped book version and frozen recording context'';END IF;
  IF NEW.to_version=1 AND (NEW.kind IS DISTINCT FROM ''external_receipt'' OR NEW.recorded_at IS DISTINCT FROM b.created_at OR NEW.actor_id IS DISTINCT FROM b.created_by) THEN RAISE EXCEPTION ''First deposit event must match the creation receipt'';END IF;
  IF NEW.target_event_id IS NOT NULL THEN
   SELECT * INTO target FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id AND id=NEW.target_event_id;
   IF target.id IS NULL OR target.kind IS DISTINCT FROM ''external_receipt'' OR target.to_version>=NEW.to_version THEN RAISE EXCEPTION ''A deposit adjustment must target an earlier receipt in this same book'';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER security_deposit_book_context BEFORE INSERT ON irp_pms.security_deposit_books FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_insert_guard();
CREATE TRIGGER security_deposit_event_context BEFORE INSERT ON irp_pms.security_deposit_events FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_insert_guard();

CREATE FUNCTION irp_pms.security_deposit_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b irp_pms.security_deposit_books;e irp_pms.security_deposit_events;request irp_pms.security_deposit_requests;received numeric;refunded numeric;reduced numeric;n bigint;last_version bigint;first_version bigint;expected jsonb;checked_book_id uuid;
BEGIN
 IF TG_TABLE_NAME=''security_deposit_requests'' THEN
  SELECT * INTO request FROM irp_pms.security_deposit_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id;
  IF request.command IS DISTINCT FROM irp_pms.normalize_security_deposit_command(request.command) OR request.command->>''reservation_id'' IS DISTINCT FROM request.reservation_id::text THEN RAISE EXCEPTION ''Deposit request command must be canonical and scoped'';END IF;
  IF request.outcome=''retired'' THEN
   IF request.result IS DISTINCT FROM irp_pms.security_deposit_retired_json(request) OR EXISTS(SELECT 1 FROM irp_pms.security_deposit_events WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND request_id=request.request_id)
   THEN RAISE EXCEPTION ''Retired deposit request must preserve its exact nonfinancial fence and have no event'';END IF;
  ELSE
   SELECT * INTO e FROM irp_pms.security_deposit_events WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND id=request.event_id;
   expected:=irp_pms.normalize_security_deposit_command(jsonb_build_object(''reservation_id'',e.reservation_id,''expected_version'',e.from_version,''expected_recording_time_zone'',e.recording_time_zone,''expected_recording_date'',e.recording_date,''kind'',e.kind,''amount_minor'',e.amount_minor,''method'',e.recorded_method,''reference'',e.reference,''reason'',e.reason,''target_event_id'',e.target_event_id,''confirmed'',true));
   IF e.id IS NULL OR (request.book_id,request.reservation_id,request.request_id,request.actor_id,request.recorded_at) IS DISTINCT FROM(e.book_id,e.reservation_id,e.request_id,e.actor_id,e.recorded_at)
   OR request.command IS DISTINCT FROM expected OR request.result IS DISTINCT FROM irp_pms.security_deposit_result_json(e.tenant_id,e.property_id,e.id)
   THEN RAISE EXCEPTION ''Recorded deposit request must match its exact event and historical prefix result'';END IF;
  END IF;
  RETURN NULL;
 END IF;
 IF TG_TABLE_NAME=''security_deposit_books'' THEN checked_book_id:=NEW.id;ELSE checked_book_id:=NEW.book_id;END IF;
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=checked_book_id;
 SELECT count(*),min(to_version),max(to_version),coalesce(sum(amount_minor) FILTER(WHERE kind=''external_receipt''),0),coalesce(sum(amount_minor) FILTER(WHERE kind=''external_refund''),0),coalesce(sum(amount_minor) FILTER(WHERE kind=''receipt_reduction''),0)
 INTO n,first_version,last_version,received,refunded,reduced FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id;
 IF n IS DISTINCT FROM b.version OR first_version IS DISTINCT FROM 1::bigint OR last_version IS DISTINCT FROM b.version
 OR (received,refunded,reduced) IS DISTINCT FROM(b.received_minor::numeric,b.refunded_minor::numeric,b.reduced_minor::numeric)
 OR b.updated_at IS DISTINCT FROM(SELECT recorded_at FROM irp_pms.security_deposit_events WHERE tenant_id=b.tenant_id AND property_id=b.property_id AND book_id=b.id AND to_version=b.version)
 THEN RAISE EXCEPTION ''Deposit book totals and version must equal its complete contiguous event history'';END IF;
 IF EXISTS(
  SELECT 1 FROM irp_pms.security_deposit_events original
  LEFT JOIN irp_pms.security_deposit_events adjustment ON adjustment.tenant_id=original.tenant_id AND adjustment.property_id=original.property_id AND adjustment.book_id=original.book_id AND adjustment.target_event_id=original.id
  WHERE original.tenant_id=b.tenant_id AND original.property_id=b.property_id AND original.book_id=b.id AND original.kind=''external_receipt''
  GROUP BY original.id,original.amount_minor HAVING coalesce(sum(adjustment.amount_minor),0)>original.amount_minor
 ) THEN RAISE EXCEPTION ''Refunds and record reductions exceed their original security-deposit receipt'';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.security_deposit_events x LEFT JOIN irp_pms.security_deposit_requests r ON r.tenant_id=x.tenant_id AND r.property_id=x.property_id AND r.request_id=x.request_id
 WHERE x.tenant_id=b.tenant_id AND x.property_id=b.property_id AND x.book_id=b.id AND (r.request_id IS NULL OR r.outcome IS DISTINCT FROM ''recorded'' OR (r.book_id,r.reservation_id,r.event_id,r.actor_id) IS DISTINCT FROM(x.book_id,x.reservation_id,x.id,x.actor_id)))
 THEN RAISE EXCEPTION ''Every deposit event requires its exact recorded request'';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER security_deposit_book_consistency AFTER INSERT OR UPDATE ON irp_pms.security_deposit_books DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_consistency();
CREATE CONSTRAINT TRIGGER security_deposit_event_consistency AFTER INSERT ON irp_pms.security_deposit_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_consistency();
CREATE CONSTRAINT TRIGGER security_deposit_request_consistency AFTER INSERT ON irp_pms.security_deposit_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.security_deposit_consistency();

REVOKE ALL ON FUNCTION irp_pms.normalize_security_deposit_command(jsonb),irp_pms.security_deposit_reservation_json(uuid,uuid,uuid),irp_pms.security_deposit_event_json(irp_pms.security_deposit_events),irp_pms.security_deposit_book_json(uuid,uuid,uuid,bigint),irp_pms.security_deposit_result_json(uuid,uuid,uuid),irp_pms.security_deposit_retired_json(irp_pms.security_deposit_requests),irp_pms.security_deposit_history_guard(),irp_pms.security_deposit_insert_guard(),irp_pms.security_deposit_consistency() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.irp_pms_pilot_record_security_deposit(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_expected_recording_time_zone text,p_expected_recording_date date,p_kind text,p_amount_minor bigint,p_method text,p_reference text,p_reason text,p_target uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;prior irp_pms.security_deposit_requests;prop irp_pms.properties;b irp_pms.security_deposit_books;e irp_pms.security_deposit_events;target irp_pms.security_deposit_events;book_exists boolean;version bigint;zone text;recorded timestamptz;day date;against_target bigint;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL THEN RAISE EXCEPTION ''A security-deposit request identity is required'';END IF;
 command:=irp_pms.normalize_security_deposit_command(jsonb_build_object(''reservation_id'',p_reservation,''expected_version'',p_expected_version,''expected_recording_time_zone'',p_expected_recording_time_zone,''expected_recording_date'',p_expected_recording_date,''kind'',p_kind,''amount_minor'',p_amount_minor,''method'',p_method,''reference'',p_reference,''reason'',p_reason,''target_event_id'',p_target,''confirmed'',p_confirmed));
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped reservation'';END IF;
 SELECT * INTO prior FROM irp_pms.security_deposit_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.reservation_id IS DISTINCT FROM p_reservation OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION ''Security-deposit request identity already used'';END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation FOR UPDATE;
 book_exists:=FOUND;version:=CASE WHEN book_exists THEN b.version ELSE 0 END;zone:=CASE WHEN book_exists THEN b.recording_time_zone ELSE prop.time_zone END;
 recorded:=clock_timestamp();day:=(recorded AT TIME ZONE zone)::date;
 IF p_expected_version IS DISTINCT FROM version THEN RAISE EXCEPTION ''Security-deposit book version changed; refresh the reviewed record'' USING ERRCODE=''PT409'';END IF;
 IF command->>''expected_recording_time_zone'' IS DISTINCT FROM zone THEN RAISE EXCEPTION ''Security-deposit recording time zone changed; refresh before recording'' USING ERRCODE=''PT409'';END IF;
 IF p_expected_recording_date IS DISTINCT FROM day THEN RAISE EXCEPTION ''Security-deposit recording date changed; review the current date'' USING ERRCODE=''PT412'';END IF;
 IF version>=1000 THEN RAISE EXCEPTION ''Security-deposit book exceeds the supported1000 event limit'';END IF;
 IF NOT book_exists THEN
  IF p_kind<>''external_receipt'' THEN RAISE EXCEPTION ''Only an external receipt can create a security-deposit book'';END IF;
  INSERT INTO irp_pms.security_deposit_books(tenant_id,property_id,reservation_id,version,recording_time_zone,creation_operating_model,created_at,created_by,updated_at,received_minor,refunded_minor,reduced_minor)
  VALUES(p_tenant,p_property,p_reservation,1,zone,prop.operating_model,recorded,auth.uid(),recorded,p_amount_minor,0,0) RETURNING * INTO b;
 ELSE
  IF p_kind<>''external_receipt'' THEN
   SELECT * INTO target FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=b.id AND id=p_target;
   IF NOT FOUND OR target.kind<>''external_receipt'' THEN RAISE EXCEPTION ''Choose an original receipt in this same security-deposit book'';END IF;
   SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=b.id AND target_event_id=p_target;
   IF against_target+p_amount_minor>target.amount_minor THEN RAISE EXCEPTION ''Refund or reduction exceeds the remaining original security-deposit receipt'';END IF;
  END IF;
  IF (p_kind=''external_receipt'' AND b.received_minor+p_amount_minor>999999999999) OR (p_kind=''external_refund'' AND b.refunded_minor+p_amount_minor>999999999999) OR (p_kind=''receipt_reduction'' AND b.reduced_minor+p_amount_minor>999999999999) THEN RAISE EXCEPTION ''Security-deposit book amount exceeds supported integer range'';END IF;
  UPDATE irp_pms.security_deposit_books SET version=b.version+1,updated_at=recorded,
   received_minor=received_minor+CASE WHEN p_kind=''external_receipt'' THEN p_amount_minor ELSE 0 END,
   refunded_minor=refunded_minor+CASE WHEN p_kind=''external_refund'' THEN p_amount_minor ELSE 0 END,
   reduced_minor=reduced_minor+CASE WHEN p_kind=''receipt_reduction'' THEN p_amount_minor ELSE 0 END
  WHERE tenant_id=p_tenant AND property_id=p_property AND id=b.id RETURNING * INTO b;
 END IF;
 INSERT INTO irp_pms.security_deposit_events(tenant_id,property_id,book_id,reservation_id,request_id,kind,amount_minor,target_event_id,recorded_method,reference,reason,actor_id,recorded_at,recording_time_zone,recording_date,from_version,to_version)
 VALUES(p_tenant,p_property,b.id,p_reservation,p_request,p_kind,p_amount_minor,p_target,p_method,command->>''reference'',command->>''reason'',auth.uid(),recorded,zone,day,version,b.version) RETURNING * INTO e;
 result:=irp_pms.security_deposit_result_json(p_tenant,p_property,e.id);
 INSERT INTO irp_pms.security_deposit_requests(tenant_id,property_id,request_id,reservation_id,actor_id,outcome,book_id,event_id,command,result,recorded_at)
 VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),''recorded'',b.id,e.id,command,result,recorded);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),''security_deposit_recorded'',p_reservation,jsonb_build_object(''book_id'',b.id,''event_id'',e.id,''request_id'',p_request,''kind'',p_kind,''amount_minor'',p_amount_minor,''version'',b.version,''recording_mode'',''external_only'',''purpose'',''refundable_security''),recorded);
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_retire_security_deposit_request(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_command jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;prior irp_pms.security_deposit_requests;retired irp_pms.security_deposit_requests;reason text:=trim(p_reason);
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 command:=irp_pms.normalize_security_deposit_command(p_command);
 IF p_request IS NULL OR p_reservation IS NULL OR command->>''reservation_id'' IS DISTINCT FROM p_reservation::text OR reason IS NULL OR length(reason) NOT BETWEEN 4 AND 500 OR reason~''[[:cntrl:]]'' THEN RAISE EXCEPTION ''Retirement requires the exact original reservation command, request and reviewed reason'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped reservation'';END IF;
 SELECT * INTO prior FROM irp_pms.security_deposit_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.reservation_id IS DISTINCT FROM p_reservation OR prior.command IS DISTINCT FROM command OR (prior.outcome=''retired'' AND prior.retirement_reason IS DISTINCT FROM reason) THEN RAISE EXCEPTION ''Security-deposit request identity already used'';END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 retired.tenant_id:=p_tenant;retired.property_id:=p_property;retired.request_id:=p_request;retired.reservation_id:=p_reservation;retired.actor_id:=auth.uid();retired.outcome:=''retired'';retired.command:=command;retired.retirement_reason:=reason;retired.recorded_at:=clock_timestamp();
 retired.result:=irp_pms.security_deposit_retired_json(retired);
 INSERT INTO irp_pms.security_deposit_requests SELECT retired.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),''security_deposit_request_retired'',p_reservation,jsonb_build_object(''request_id'',p_request,''purpose'',''refundable_security'',''financial_changed'',false,''book_version_changed'',false),retired.recorded_at);
 RETURN retired.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.security_deposit_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION ''A security-deposit request identity is required'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.security_deposit_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object(''found'',false);END IF;
 RETURN jsonb_build_object(''found'',true,''action'',CASE WHEN prior.outcome=''recorded'' THEN ''record_security_deposit'' ELSE ''retire_security_deposit_request'' END,''result'',prior.result);
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;b irp_pms.security_deposit_books;reservation jsonb;book jsonb;events jsonb:=''[]'';targets jsonb:=''[]'';zone text;generated timestamptz;n bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 reservation:=irp_pms.security_deposit_reservation_json(p_tenant,p_property,p_reservation);
 IF reservation IS NULL THEN RAISE EXCEPTION ''Unknown scoped reservation'';END IF;
 SELECT * INTO b FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF FOUND THEN
  SELECT count(*) INTO n FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND book_id=b.id;
  IF n>1000 OR n IS DISTINCT FROM b.version THEN RAISE EXCEPTION ''Security-deposit detail exceeds its supported complete event history'';END IF;
  book:=irp_pms.security_deposit_book_json(p_tenant,p_property,b.id);zone:=b.recording_time_zone;
  SELECT coalesce(jsonb_agg(irp_pms.security_deposit_event_json(e) ORDER BY e.to_version),''[]'') INTO events FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.book_id=b.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(''event_id'',x.id,''received_minor'',x.amount_minor,''refunded_minor'',x.refunded,''reduced_minor'',x.reduced,''remaining_minor'',x.amount_minor-x.refunded-x.reduced) ORDER BY x.to_version),''[]'') INTO targets FROM(
   SELECT r.id,r.amount_minor,r.to_version,coalesce(sum(a.amount_minor) FILTER(WHERE a.kind=''external_refund''),0) refunded,coalesce(sum(a.amount_minor) FILTER(WHERE a.kind=''receipt_reduction''),0) reduced
   FROM irp_pms.security_deposit_events r LEFT JOIN irp_pms.security_deposit_events a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.book_id=r.book_id AND a.target_event_id=r.id
   WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.book_id=b.id AND r.kind=''external_receipt'' GROUP BY r.id,r.amount_minor,r.to_version
  ) x;
 ELSE zone:=prop.time_zone;
 END IF;
 generated:=clock_timestamp();
 RETURN jsonb_build_object(''schema_version'',1,''tenant_id'',p_tenant,''property_id'',p_property,''reservation'',reservation,''role'',member_role,''can_manage'',member_role IN(''owner'',''manager''),''property_time_zone'',prop.time_zone,''recording_time_zone'',zone,''recording_date'',(generated AT TIME ZONE zone)::date,''generated_at'',generated,''book'',book,''version'',coalesce(b.version,0),''totals'',book->''totals'',''events'',events,''refundable_receipts'',targets,''recording_mode'',''external_only'',''purpose'',''refundable_security'',''folio_changed'',false,''rows_truncated'',false);
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit_register(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;n bigint;received numeric;refunded numeric;reduced numeric;held numeric;rows jsonb;summary jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT count(*),coalesce(sum(received_minor),0),coalesce(sum(refunded_minor),0),coalesce(sum(reduced_minor),0),coalesce(sum(held_minor),0) INTO n,received,refunded,reduced,held FROM irp_pms.security_deposit_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF n>10000 THEN RAISE EXCEPTION ''Security-deposit register exceeds10000 books; no rows were truncated'';END IF;
 IF greatest(received,refunded,reduced,held)>9007199254740991 THEN RAISE EXCEPTION ''Security-deposit register totals exceed the exact JSON integer range'';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(''reservation'',irp_pms.security_deposit_reservation_json(b.tenant_id,b.property_id,b.reservation_id),''book'',irp_pms.security_deposit_book_json(b.tenant_id,b.property_id,b.id),''financial_review_required'',b.held_minor>0 AND r.status IN(''Checked out'',''Cancelled'')) ORDER BY b.created_at,b.id),''[]''),
 jsonb_build_object(''book_count'',count(*),''with_held_count'',count(*) FILTER(WHERE b.held_minor>0),''zero_held_count'',count(*) FILTER(WHERE b.held_minor=0),''ended_with_held_count'',count(*) FILTER(WHERE b.held_minor>0 AND r.status IN(''Checked out'',''Cancelled'')),''ended_held_minor'',coalesce(sum(b.held_minor) FILTER(WHERE b.held_minor>0 AND r.status IN(''Checked out'',''Cancelled'')),0))
 INTO rows,summary FROM irp_pms.security_deposit_books b JOIN irp_pms.reservations r ON r.tenant_id=b.tenant_id AND r.property_id=b.property_id AND r.id=b.reservation_id WHERE b.tenant_id=p_tenant AND b.property_id=p_property;
 RETURN jsonb_build_object(''schema_version'',1,''tenant_id'',p_tenant,''property_id'',p_property,''generated_at'',clock_timestamp(),''property_time_zone'',prop.time_zone,''role'',member_role,''can_manage'',member_role IN(''owner'',''manager''),''currency'',''USD'',''rows'',rows,''totals'',jsonb_build_object(''received_minor'',received,''refunded_minor'',refunded,''reduced_minor'',reduced,''held_minor'',held),''summary'',summary,''recording_mode'',''external_only'',''purpose'',''refundable_security'',''rows_truncated'',false,
 ''definitions'',jsonb_build_object(''scope'',''Current totals for explicit refundable security-deposit books in every reservation status; reservations without a book and legacy folio payments are not inferred as deposits.'',''held'',''External receipt records minus linked external refunds and receipt-record reductions. Held records do not establish processor settlement or an approved refund.'',''review'',''Checked-out or cancelled reservations with recorded held funds need separate financial review; no-show is counted once as cancelled.'',''method'',''Method is operator-reported information. References may identify shared documents or batches and are not verified unique provider transactions.'',''financial'',''Deposit records do not change guest folios, revenue, taxes, inventory or physical checkout.''));
END $$;

CREATE FUNCTION public.irp_pms_pilot_security_deposit_activity(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;n bigint;received numeric;refunded numeric;reduced numeric;effect numeric;rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION ''Choose1 to366 recording civil dates with an exclusive end'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT count(*),coalesce(sum(amount_minor) FILTER(WHERE kind=''external_receipt''),0),coalesce(sum(amount_minor) FILTER(WHERE kind=''external_refund''),0),coalesce(sum(amount_minor) FILTER(WHERE kind=''receipt_reduction''),0)
 INTO n,received,refunded,reduced FROM irp_pms.security_deposit_events WHERE tenant_id=p_tenant AND property_id=p_property AND recording_date>=p_start AND recording_date<p_end;
 effect:=received-refunded-reduced;
 IF n>10000 THEN RAISE EXCEPTION ''Security-deposit activity exceeds10000 events; narrow the dates'';END IF;
 IF greatest(received,refunded,reduced,abs(effect))>9007199254740991 THEN RAISE EXCEPTION ''Security-deposit activity totals exceed the exact JSON integer range'';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(''reservation'',irp_pms.security_deposit_reservation_json(e.tenant_id,e.property_id,e.reservation_id),''event'',irp_pms.security_deposit_event_json(e),''held_effect_minor'',CASE WHEN e.kind=''external_receipt'' THEN e.amount_minor ELSE -e.amount_minor END) ORDER BY e.recording_date,e.recorded_at,e.book_id,e.to_version),''[]'')
 INTO rows FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.recording_date>=p_start AND e.recording_date<p_end;
 RETURN jsonb_build_object(''schema_version'',1,''tenant_id'',p_tenant,''property_id'',p_property,''generated_at'',clock_timestamp(),''property_time_zone'',prop.time_zone,''currency'',''USD'',''period'',jsonb_build_object(''start'',p_start,''end'',p_end,''end_exclusive'',true,''basis'',''stored_recording_date''),''rows'',rows,''totals'',jsonb_build_object(''event_count'',n,''received_minor'',received,''refunded_minor'',refunded,''reduced_minor'',reduced,''held_effect_minor'',effect),''recording_mode'',''external_only'',''purpose'',''refundable_security'',''rows_truncated'',false,
 ''definitions'',jsonb_build_object(''period'',''Stored event recording civil dates in each book''''s frozen recording time zone; no backdated transaction or settlement date. Books can use different zones.'',''effect'',''Receipt records increase held funds; external refund records and receipt-record reductions decrease them. A record reduction asserts no refund or money movement.'',''balance'',''Net activity in these dates is not the current held balance. An empty period does not mean no funds remain held.'',''labels'',''Reservation name, source, dates and status are current labels; event identity, amount, actor and recording context are immutable.'',''financial'',''These records neither settle a guest folio nor post revenue, taxes or real processor transactions.''));
END $$;

REVOKE ALL ON FUNCTION
 public.irp_pms_pilot_record_security_deposit(uuid,uuid,uuid,uuid,bigint,text,date,text,bigint,text,text,text,uuid,boolean),
 public.irp_pms_pilot_retire_security_deposit_request(uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_security_deposit_request_status(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit_register(uuid,uuid),
 public.irp_pms_pilot_security_deposit_activity(uuid,uuid,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.irp_pms_pilot_record_security_deposit(uuid,uuid,uuid,uuid,bigint,text,date,text,bigint,text,text,text,uuid,boolean),
 public.irp_pms_pilot_retire_security_deposit_request(uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_security_deposit_request_status(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit(uuid,uuid,uuid),
 public.irp_pms_pilot_security_deposit_register(uuid,uuid),
 public.irp_pms_pilot_security_deposit_activity(uuid,uuid,date,date)
 TO authenticated;
']);
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='202609070172';
