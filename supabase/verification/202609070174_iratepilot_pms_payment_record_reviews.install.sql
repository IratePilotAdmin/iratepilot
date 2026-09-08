BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Read-only174 preflight: frozen173 effective bodies and observed retained
-- execution privileges plus53 table shapes and30 migration receipts.
DO $preflight$
DECLARE expected record;actual record;matched integer;column_hash text;
BEGIN
 IF to_regclass('irp_pms.payment_record_review_heads') IS NOT NULL OR to_regclass('irp_pms.payment_record_reviews') IS NOT NULL OR to_regclass('irp_pms.payment_record_review_requests') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' AND(p.proname LIKE 'payment_review_%' OR p.proname='normalize_payment_record_review') OR n.nspname='public' AND p.proname IN('irp_pms_pilot_payment_record_review','irp_pms_pilot_save_payment_record_review','irp_pms_pilot_payment_record_review_request_status','irp_pms_pilot_retire_payment_record_review_request','irp_pms_pilot_cashier_activity_report')) THEN RAISE EXCEPTION 'Payment-review174 objects already exist; inspect before proceeding';END IF;
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'Migration receipt table is required';END IF;
 SELECT count(*) INTO matched FROM supabase_migrations.schema_migrations WHERE version IN('202609070142','202609070143','202609070144','202609070145','202609070146','202609070147','202609070149','202609070150','202609070151','202609070152','202609070153','202609070154','202609070155','202609070156','202609070158','202609070159','202609070160','202609070161','202609070162','202609070163','202609070164','202609070165','202609070166','202609070167','202609070168','202609070169','202609070170','202609070171','202609070172','202609070173');
 IF matched<>30 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609070174') THEN RAISE EXCEPTION 'Require all30 installed destination add-ons through173 and no174 receipt';END IF;
 FOR expected IN SELECT * FROM(VALUES
 ('irp_pms.apply_operating_model(uuid, uuid, text, integer)','8cfaf0f913962f4d96e82cdac6c617da',false,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.apply_reservation(uuid, uuid, jsonb)','8f9b2eefa99b11fb9ff59d0adaf8a483',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.effective_capacity(uuid, uuid, uuid, date)','5bad369ad5cd5e1c08dbf7ab45e63ccd',false,'s','search_path=pg_catalog','integer',false,false,false),
 ('irp_pms.enqueue_turnover(uuid, uuid, uuid, text, text, uuid, bigint, uuid, timestamp with time zone, text, date, uuid)','d44ef3fe132b4823db819aa166f924a7',false,'v','search_path=pg_catalog','uuid',false,false,false),
 ('irp_pms.guest_document_itemization(jsonb, jsonb)','2862beef4724ad442951f6b670231248',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.guest_document_label(text, integer, boolean, boolean)','0666862bbdf0da8df6777dafb7da4f18',false,'i','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.guest_document_number(jsonb, bigint, bigint, boolean)','21ad4766403d51ab263438a4cfaa01e4',false,'i','search_path=pg_catalog','bigint',false,false,false),
 ('irp_pms.guest_document_projection(jsonb, uuid, text, timestamp with time zone)','a725d7c2844ee9525471719443e4fe19',false,'s','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.maintenance_capacity(uuid, uuid, uuid, date)','5d4c821ca818276a201c0e8d650e2f76',false,'s','search_path=pg_catalog','record',false,false,false),
 ('irp_pms.normalize_cleaning_fee(jsonb)','f93d2eb53ca20597d6ea1f0311288857',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.normalize_guest_data(jsonb, text)','0388fc6f0233c187a050025c636a2dde',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.normalize_security_deposit_command(jsonb)','c824fe057a7f4dfda989891919de4e0d',false,'i','search_path=pg_catalog','jsonb',false,false,false),
 ('irp_pms.pilot_require(uuid, uuid, boolean)','cabb54e80f1484442d3a69e8c2c4daed',true,'v','search_path=pg_catalog','text',false,false,false),
 ('irp_pms.pilot_require_owner(uuid, uuid, boolean)','dcab1314bc63ce9c0b5e77b26c576c28',true,'v','search_path=pg_catalog','void',false,false,false),
 ('irp_pms.property_fee_guard()','7820e99301d9dfbe3ae70fc95384cbde',false,'v','search_path=pg_catalog','trigger',false,false,false),
 ('irp_pms.receive_reservation(uuid, uuid, text, text, bigint, text, jsonb, text)','13e11e82e3de65e17e88d6cac5c989d3',true,'v','search_path=pg_catalog','jsonb',false,false,true),
 ('irp_pms.report_exact_numbers(jsonb)','d9f21503bacddf373d65f0499d89544a',false,'i','search_path=pg_catalog','jsonb',false,false,false),
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
 ('public.irp_pms_pilot_guest_documents(uuid, uuid, uuid)','be81d7c9b53f1a87f21ee81c96df04c9',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_guest_profile(uuid, uuid, uuid)','a36fa44f48b62ae8737ee7a0cf7d69fe',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_housekeeping(uuid, uuid, uuid, text)','50c04bb7ba40b44d6e6e7c8e6bccfdf8',true,'v','search_path=pg_catalog','jsonb',false,false,false),
 ('public.irp_pms_pilot_maintenance(uuid, uuid, date, date)','53bf3b78ee8a491a3fa2ac2f6327d6c7',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_maintenance_request_status(uuid, uuid, uuid)','526a5c5d43517c77566a49634568abd3',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_move_room(uuid, uuid, uuid, uuid, bigint, uuid, bigint, uuid, bigint, text)','ace648612ff1847ee313d36d81591a0f',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_operational_report(uuid, uuid, date, date)','6167970d76fd1ce8e8d36c7d00ed863f',true,'v','search_path=pg_catalog','jsonb',false,true,false),
 ('public.irp_pms_pilot_post_folio(uuid, uuid, uuid, uuid, text, bigint, text, text, uuid)','7a7d69d4009e3747d98e5c716d6ddc65',true,'v','search_path=pg_catalog','jsonb',false,true,true),
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
  IF NOT FOUND OR md5(regexp_replace(actual.prosrc,E'\r\n?',E'\n','g')) IS DISTINCT FROM expected.body_md5 OR actual.prosecdef IS DISTINCT FROM expected.definer OR actual.provolatile::text IS DISTINCT FROM expected.volatility OR actual.config_string IS DISTINCT FROM expected.config OR actual.return_name IS DISTINCT FROM expected.returns THEN RAISE EXCEPTION 'Effective173 definition differs: %',expected.signature;END IF;
  IF has_function_privilege('anon',actual.oid,'EXECUTE') IS DISTINCT FROM expected.anon OR has_function_privilege('authenticated',actual.oid,'EXECUTE') IS DISTINCT FROM expected.authenticated OR has_function_privilege('service_role',actual.oid,'EXECUTE') IS DISTINCT FROM expected.service_role THEN RAISE EXCEPTION 'Effective173 execution grants differ: %',expected.signature;END IF;
 END LOOP;
 FOR expected IN SELECT * FROM(VALUES
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
  IF column_hash IS DISTINCT FROM expected.columns_md5 THEN RAISE EXCEPTION 'Effective173 column shape differs: %',expected.table_name;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmed test organization owner required for transaction-only proof';END IF;
END $preflight$;
SELECT 'payment_record_reviews_preflight_passed' AS verification;


CREATE TABLE irp_pms.payment_record_review_heads(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,entry_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 1000),current_review_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
 updated_at timestamptz NOT NULL CHECK(isfinite(updated_at)),
 PRIMARY KEY(tenant_id,property_id,reservation_id,entry_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id)
);
CREATE TABLE irp_pms.payment_record_reviews(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,entry_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),reviewed_at timestamptz NOT NULL CHECK(isfinite(reviewed_at)),
 from_version bigint NOT NULL CHECK(from_version BETWEEN 0 AND 999),to_version bigint NOT NULL CHECK(to_version BETWEEN 1 AND 1000 AND to_version=from_version+1),
 method text NOT NULL CHECK(method IN('cash','card','bank_transfer','other','unknown')),method_detail text,
 evidence_basis text NOT NULL CHECK(evidence_basis IN('external_record_reviewed','operator_report_only','insufficient_evidence')),evidence_reference text,reason text NOT NULL,
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=8192),
 PRIMARY KEY(tenant_id,property_id,reservation_id,entry_id,id),
 UNIQUE(tenant_id,property_id,reservation_id,entry_id,to_version),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.payment_record_review_heads(tenant_id,property_id,reservation_id,entry_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((method='other' AND method_detail IS NOT NULL AND length(method_detail) BETWEEN 4 AND 100 AND method_detail=trim(method_detail) AND method_detail !~ '[[:cntrl:]]') OR(method<>'other' AND method_detail IS NULL)),
 CHECK(evidence_reference IS NULL OR(length(evidence_reference) BETWEEN 4 AND 200 AND evidence_reference=trim(evidence_reference) AND evidence_reference !~ '[[:cntrl:]]')),
 CHECK((evidence_basis='external_record_reviewed' AND method<>'unknown' AND evidence_reference IS NOT NULL)
 OR(evidence_basis='operator_report_only' AND method<>'unknown') OR(evidence_basis='insufficient_evidence' AND method='unknown')),
 CHECK(length(reason) BETWEEN 4 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]')
);
ALTER TABLE irp_pms.payment_record_review_heads ADD CONSTRAINT payment_record_head_latest
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id,current_review_id) REFERENCES irp_pms.payment_record_reviews(tenant_id,property_id,reservation_id,entry_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE irp_pms.payment_record_review_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,entry_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 outcome text NOT NULL CHECK(outcome IN('reviewed','retired')),review_id uuid,retirement_reason text,
 command jsonb NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=4096),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=16384),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id,review_id) REFERENCES irp_pms.payment_record_reviews(tenant_id,property_id,reservation_id,entry_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((outcome='reviewed' AND review_id IS NOT NULL AND retirement_reason IS NULL)
 OR(outcome='retired' AND review_id IS NULL AND retirement_reason IS NOT NULL AND length(retirement_reason) BETWEEN 4 AND 500 AND retirement_reason=trim(retirement_reason) AND retirement_reason !~ '[[:cntrl:]]'))
);
ALTER TABLE irp_pms.payment_record_reviews ADD CONSTRAINT payment_record_review_request
 FOREIGN KEY(tenant_id,property_id,request_id) REFERENCES irp_pms.payment_record_review_requests(tenant_id,property_id,request_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE irp_pms.payment_record_review_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.payment_record_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.payment_record_review_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.payment_record_review_heads,irp_pms.payment_record_reviews,irp_pms.payment_record_review_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.payment_record_review_heads,irp_pms.payment_record_reviews,irp_pms.payment_record_review_requests TO service_role;

CREATE FUNCTION irp_pms.normalize_payment_record_review(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE reservation uuid;entry uuid;version bigint;method text;detail text;basis text;reference text;reason text;result jsonb;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>4096
 OR NOT(p_data?&ARRAY['reservation_id','entry_id','expected_version','method','method_detail','evidence_basis','evidence_reference','reason','confirmed'])
 OR p_data-ARRAY['reservation_id','entry_id','expected_version','method','method_detail','evidence_basis','evidence_reference','reason','confirmed']<>'{}'::jsonb
 OR jsonb_typeof(p_data->'reservation_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'entry_id') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'method') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'evidence_basis') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'method_detail') NOT IN('string','null') OR jsonb_typeof(p_data->'evidence_reference') NOT IN('string','null')
 OR jsonb_typeof(p_data->'reason') IS DISTINCT FROM 'string' OR p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'Review command must contain its exact typed fields and confirmation';END IF;
 reservation:=(p_data->>'reservation_id')::uuid;entry:=(p_data->>'entry_id')::uuid;
 version:=irp_pms.guest_document_number(p_data->'expected_version',0,1000);
 method:=p_data->>'method';detail:=trim(p_data->>'method_detail');basis:=p_data->>'evidence_basis';reference:=trim(p_data->>'evidence_reference');reason:=trim(p_data->>'reason');
 IF reservation IS NULL OR entry IS NULL OR method NOT IN('cash','card','bank_transfer','other','unknown')
 OR basis NOT IN('external_record_reviewed','operator_report_only','insufficient_evidence')
 OR(method='other' AND(detail IS NULL OR length(detail) NOT BETWEEN 4 AND 100 OR detail~'[[:cntrl:]]')) OR(method<>'other' AND detail IS NOT NULL)
 OR(reference IS NOT NULL AND(length(reference) NOT BETWEEN 4 AND 200 OR reference~'[[:cntrl:]]'))
 OR(basis='external_record_reviewed' AND(method='unknown' OR reference IS NULL))
 OR(basis='operator_report_only' AND method='unknown') OR(basis='insufficient_evidence' AND method<>'unknown')
 OR reason IS NULL OR length(reason) NOT BETWEEN 4 AND 500 OR reason~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Review method, evidence basis, details, reference and reason do not agree';END IF;
 result:=jsonb_build_object('reservation_id',reservation,'entry_id',entry,'expected_version',version,'method',method,'method_detail',detail,'evidence_basis',basis,'evidence_reference',reference,'reason',reason,'confirmed',true);
 IF octet_length(result::text)>4096 THEN RAISE EXCEPTION 'Review command exceeds its byte limit';END IF;
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.payment_review_no_financial_effects() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('financial_changed',false,'folio_changed',false,'security_deposit_changed',false,'revenue_changed',false,'taxes_changed',false,'money_moved',false)
$$;
CREATE FUNCTION irp_pms.payment_review_assurance() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('mode','operator_record_information','processor_verified',false,'settlement_verified',false,'cash_counted',false,'invoice_issued',false)
$$;
CREATE FUNCTION irp_pms.payment_review_source(p_row irp_pms.folio_entries) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF p_row.id IS NULL OR p_row.reservation_id IS NULL OR p_row.request_id IS NULL OR p_row.actor_id IS NULL OR p_row.kind IS NULL
 OR p_row.kind NOT IN('external_payment','external_refund','payment_correction') OR p_row.amount_minor IS NULL OR p_row.amount_minor NOT BETWEEN 1 AND 999999999999
 OR p_row.currency IS DISTINCT FROM 'USD' OR p_row.reference IS NULL OR p_row.reason IS NULL OR p_row.created_at IS NULL OR NOT isfinite(p_row.created_at)
 OR(p_row.kind='external_payment' AND p_row.target_entry_id IS NOT NULL) OR(p_row.kind<>'external_payment' AND p_row.target_entry_id IS NULL)
 THEN RAISE EXCEPTION 'Payment review requires an exact supported original source record';END IF;
 result:=jsonb_build_object('reservation_id',p_row.reservation_id,'id',p_row.id,'request_id',p_row.request_id,'kind',p_row.kind,'amount_minor',p_row.amount_minor,'currency',p_row.currency,'reference',p_row.reference,'reason',p_row.reason,'target_entry_id',p_row.target_entry_id,'actor_id',p_row.actor_id,'recorded_at',p_row.created_at);
 IF octet_length(result::text)>8192 THEN RAISE EXCEPTION 'Original payment source exceeds review byte limit';END IF;
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.payment_review_json(p_row irp_pms.payment_record_reviews) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',p_row.id,'request_id',p_row.request_id,'actor_id',p_row.actor_id,'reviewed_at',p_row.reviewed_at,'from_version',p_row.from_version,'to_version',p_row.to_version,'method',p_row.method,'method_detail',p_row.method_detail,'evidence_basis',p_row.evidence_basis,'evidence_reference',p_row.evidence_reference,'reason',p_row.reason,'source',p_row.source_snapshot)
$$;
CREATE FUNCTION irp_pms.payment_review_command(p_row irp_pms.payment_record_reviews) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE command jsonb;
BEGIN
 command:=irp_pms.normalize_payment_record_review(jsonb_build_object('reservation_id',p_row.reservation_id,'entry_id',p_row.entry_id,'expected_version',p_row.from_version,'method',p_row.method,'method_detail',p_row.method_detail,'evidence_basis',p_row.evidence_basis,'evidence_reference',p_row.evidence_reference,'reason',p_row.reason,'confirmed',true));
 IF(command->>'method_detail',command->>'evidence_reference',command->>'reason') IS DISTINCT FROM(p_row.method_detail,p_row.evidence_reference,p_row.reason) THEN RAISE EXCEPTION 'Stored review text must already be canonical';END IF;
 RETURN command;
END
$$;
CREATE FUNCTION irp_pms.payment_review_result(p_row irp_pms.payment_record_reviews) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schema_version',1,'outcome','reviewed','action','save_payment_record_review','tenant_id',p_row.tenant_id,'property_id',p_row.property_id,'reservation_id',p_row.reservation_id,'entry_id',p_row.entry_id,'request_id',p_row.request_id,'command',irp_pms.payment_review_command(p_row),'review',irp_pms.payment_review_json(p_row),'expected_version',p_row.from_version,'version',p_row.to_version,'financial_effects',irp_pms.payment_review_no_financial_effects(),'assurance',irp_pms.payment_review_assurance(),'replayed',false)
$$;
CREATE FUNCTION irp_pms.payment_review_retired_result(p_row irp_pms.payment_record_review_requests) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schema_version',1,'outcome','retired','action','retire_payment_record_review_request','tenant_id',p_row.tenant_id,'property_id',p_row.property_id,'reservation_id',p_row.reservation_id,'entry_id',p_row.entry_id,'request_id',p_row.request_id,'command',p_row.command,'retirement_reason',p_row.retirement_reason,'retired_by',p_row.actor_id,'retired_at',p_row.recorded_at,'review_version_changed',false,'financial_effects',irp_pms.payment_review_no_financial_effects(),'assurance',irp_pms.payment_review_assurance(),'replayed',false)
$$;

CREATE FUNCTION irp_pms.payment_review_property(p_data jsonb,p_zone_supported boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE name text:=trim(regexp_replace(p_data->>'name','[[:cntrl:]]',' ','g'));zone text:=p_data->>'time_zone';id uuid;
BEGIN
 id:=(p_data->>'id')::uuid;
 IF id IS NULL OR name IS NULL OR length(name) NOT BETWEEN 1 AND 200 OR p_data->>'currency' IS DISTINCT FROM 'USD'
 OR p_data->>'operating_model' IS NULL OR p_data->>'operating_model' NOT IN('hotel','whole_home')
 OR zone IS NULL OR length(zone) NOT BETWEEN 1 AND 100 OR p_zone_supported IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unsupported payment review property context';END IF;
 RETURN jsonb_build_object('id',id,'name',name,'text_normalized',name IS DISTINCT FROM p_data->>'name','currency','USD','time_zone',zone,'operating_model',p_data->>'operating_model');
END $$;
CREATE FUNCTION irp_pms.payment_review_booking(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE id uuid;reference text:=p_data->>'source_booking_id';
BEGIN
 id:=(p_data->>'id')::uuid;
 IF id IS NULL OR p_data->>'source' IS NULL OR p_data->>'source' NOT IN('direct','migration','iratepilot-ota')
 OR p_data->>'status' IS NULL OR p_data->>'status' NOT IN('Confirmed','In house','Checked out','Cancelled')
 OR reference IS NULL OR length(reference) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Unsupported payment review reservation label';END IF;
 RETURN jsonb_build_object('id',id,'source',p_data->>'source','source_booking_id',reference,'status',p_data->>'status','cancellation_kind',CASE WHEN p_data->>'cancellation_disposition'='no_show' THEN 'no_show' END);
END $$;

CREATE FUNCTION irp_pms.payment_review_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME<>'payment_record_review_heads' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment reviews and request outcomes are immutable; heads cannot be deleted';END IF;
 IF NEW.version IS DISTINCT FROM OLD.version+1 OR (NEW.tenant_id,NEW.property_id,NEW.reservation_id,NEW.entry_id,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM(OLD.tenant_id,OLD.property_id,OLD.reservation_id,OLD.entry_id,OLD.created_by,OLD.created_at)
 THEN RAISE EXCEPTION 'Payment review identity is immutable and its version advances exactly once';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_review_head_history BEFORE UPDATE OR DELETE ON irp_pms.payment_record_review_heads FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_history_guard();
CREATE TRIGGER payment_review_event_history BEFORE UPDATE OR DELETE ON irp_pms.payment_record_reviews FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_history_guard();
CREATE TRIGGER payment_review_request_history BEFORE UPDATE OR DELETE ON irp_pms.payment_record_review_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_history_guard();

CREATE FUNCTION irp_pms.payment_review_insert_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source irp_pms.folio_entries;target irp_pms.folio_entries;head irp_pms.payment_record_review_heads;
BEGIN
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND id=NEW.entry_id FOR KEY SHARE;
 IF source.id IS NULL OR source.kind NOT IN('external_payment','external_refund') THEN RAISE EXCEPTION 'Only an existing scoped external payment or refund can be reviewed';END IF;
 IF source.target_entry_id IS NOT NULL THEN
  SELECT * INTO target FROM irp_pms.folio_entries WHERE tenant_id=source.tenant_id AND property_id=source.property_id AND reservation_id=source.reservation_id AND id=source.target_entry_id;
  IF target.id IS NULL OR target.kind IS DISTINCT FROM 'external_payment' OR source.amount_minor>target.amount_minor THEN RAISE EXCEPTION 'Refund review requires its exact scoped original payment target';END IF;
 END IF;
 IF TG_TABLE_NAME='payment_record_review_heads' THEN
  IF NEW.version IS DISTINCT FROM 1::bigint OR NEW.updated_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'A review head starts with exactly one accepted review';END IF;
 ELSIF TG_TABLE_NAME='payment_record_reviews' THEN
  SELECT * INTO head FROM irp_pms.payment_record_review_heads WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND entry_id=NEW.entry_id FOR UPDATE;
  IF head.entry_id IS NULL OR (NEW.to_version,NEW.id,NEW.reviewed_at) IS DISTINCT FROM(head.version,head.current_review_id,head.updated_at)
  OR NEW.source_snapshot IS DISTINCT FROM irp_pms.payment_review_source(source)
  OR NEW.from_version IS DISTINCT FROM(SELECT count(*) FROM irp_pms.payment_record_reviews WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND entry_id=NEW.entry_id)
  OR(NEW.to_version=1 AND(NEW.actor_id,NEW.reviewed_at) IS DISTINCT FROM(head.created_by,head.created_at))
  THEN RAISE EXCEPTION 'Review must append the exact next version, original source and creation context';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_review_head_context BEFORE INSERT ON irp_pms.payment_record_review_heads FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_insert_guard();
CREATE TRIGGER payment_review_event_context BEFORE INSERT ON irp_pms.payment_record_reviews FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_insert_guard();
CREATE TRIGGER payment_review_request_context BEFORE INSERT ON irp_pms.payment_record_review_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_insert_guard();

CREATE FUNCTION irp_pms.payment_review_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE head irp_pms.payment_record_review_heads;event irp_pms.payment_record_reviews;request irp_pms.payment_record_review_requests;source irp_pms.folio_entries;n bigint;first_version bigint;last_version bigint;history jsonb;
BEGIN
 IF TG_TABLE_NAME='payment_record_review_requests' THEN
  SELECT * INTO request FROM irp_pms.payment_record_review_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id;
  IF request.command IS DISTINCT FROM irp_pms.normalize_payment_record_review(request.command)
  OR(request.command->>'reservation_id',request.command->>'entry_id') IS DISTINCT FROM(request.reservation_id::text,request.entry_id::text)
  THEN RAISE EXCEPTION 'Review request must preserve its canonical scoped command';END IF;
  IF request.outcome='retired' THEN
   IF request.result IS DISTINCT FROM irp_pms.payment_review_retired_result(request)
   OR EXISTS(SELECT 1 FROM irp_pms.payment_record_reviews WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND request_id=request.request_id)
   THEN RAISE EXCEPTION 'Retired payment review must preserve an exact nonfinancial fence without an event';END IF;
  ELSE
   SELECT * INTO event FROM irp_pms.payment_record_reviews WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND reservation_id=request.reservation_id AND entry_id=request.entry_id AND id=request.review_id;
   IF event.id IS NULL OR(request.request_id,request.actor_id,request.recorded_at) IS DISTINCT FROM(event.request_id,event.actor_id,event.reviewed_at)
   OR request.command IS DISTINCT FROM irp_pms.payment_review_command(event) OR request.result IS DISTINCT FROM irp_pms.payment_review_result(event)
   THEN RAISE EXCEPTION 'Accepted review request must match its exact event and original historical receipt';END IF;
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO head FROM irp_pms.payment_record_review_heads WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND entry_id=NEW.entry_id;
 SELECT count(*),min(to_version),max(to_version),coalesce(jsonb_agg(irp_pms.payment_review_json(e) ORDER BY to_version),'[]'::jsonb)
 INTO n,first_version,last_version,history FROM irp_pms.payment_record_reviews e WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND entry_id=head.entry_id;
 IF head.entry_id IS NULL OR n IS DISTINCT FROM head.version OR first_version IS DISTINCT FROM 1::bigint OR last_version IS DISTINCT FROM head.version OR octet_length(history::text)>3145728
 THEN RAISE EXCEPTION 'Payment review history must be complete, contiguous and readable within its byte budget';END IF;
 SELECT * INTO event FROM irp_pms.payment_record_reviews WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND entry_id=head.entry_id AND to_version=head.version;
 IF(head.current_review_id,head.updated_at) IS DISTINCT FROM(event.id,event.reviewed_at) THEN RAISE EXCEPTION 'Review head must match the latest immutable event';END IF;
 SELECT * INTO event FROM irp_pms.payment_record_reviews WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND entry_id=head.entry_id AND to_version=1;
 IF(head.created_by,head.created_at) IS DISTINCT FROM(event.actor_id,event.reviewed_at) THEN RAISE EXCEPTION 'Review head must retain its original creation context';END IF;
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND id=head.entry_id;
 IF EXISTS(SELECT 1 FROM irp_pms.payment_record_reviews e LEFT JOIN irp_pms.payment_record_review_requests r ON r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.request_id=e.request_id
 WHERE e.tenant_id=head.tenant_id AND e.property_id=head.property_id AND e.reservation_id=head.reservation_id AND e.entry_id=head.entry_id
 AND(r.request_id IS NULL OR r.outcome IS DISTINCT FROM 'reviewed' OR(r.reservation_id,r.entry_id,r.review_id,r.actor_id,r.recorded_at) IS DISTINCT FROM(e.reservation_id,e.entry_id,e.id,e.actor_id,e.reviewed_at)
 OR e.source_snapshot IS DISTINCT FROM irp_pms.payment_review_source(source)))
 THEN RAISE EXCEPTION 'Each review requires its exact accepted request and unchanged original source';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_review_head_consistency AFTER INSERT OR UPDATE ON irp_pms.payment_record_review_heads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_consistency();
CREATE CONSTRAINT TRIGGER payment_review_event_consistency AFTER INSERT ON irp_pms.payment_record_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_consistency();
CREATE CONSTRAINT TRIGGER payment_review_request_consistency AFTER INSERT ON irp_pms.payment_record_review_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_consistency();

CREATE FUNCTION irp_pms.payment_review_detail_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE tenant uuid;property uuid;reservation uuid;entry uuid;prop jsonb;label jsonb;source irp_pms.folio_entries;target irp_pms.folio_entries;head irp_pms.payment_record_review_heads;e irp_pms.payment_record_reviews;r irp_pms.payment_record_review_requests;
 raw jsonb;request_raw jsonb;request_map jsonb;src jsonb;history jsonb;projected_reviews jsonb[]:='{}';current_review jsonb;head_json jsonb;result jsonb;n bigint:=0;matched integer;requests uuid[]:='{}';ids uuid[]:='{}';first_actor uuid;first_at timestamptz;
BEGIN
 IF p_actor IS NULL OR p_role IS NULL OR p_role NOT IN('owner','manager','staff') OR p_generated IS NULL OR NOT isfinite(p_generated)
 OR p_capture IS NULL OR jsonb_typeof(p_capture) IS DISTINCT FROM 'object' OR NOT(p_capture?&ARRAY['tenant_id','property_id','reservation_id','entry_id','property','zone_supported','reservation','source','target','head','reviews','requests'])
 OR jsonb_typeof(p_capture->'reviews') IS DISTINCT FROM 'array' OR jsonb_typeof(p_capture->'requests') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_capture->'head') NOT IN('object','null') OR jsonb_typeof(p_capture->'target') NOT IN('object','null') THEN RAISE EXCEPTION 'Payment review detail capture is incomplete';END IF;
 tenant:=(p_capture->>'tenant_id')::uuid;property:=(p_capture->>'property_id')::uuid;reservation:=(p_capture->>'reservation_id')::uuid;entry:=(p_capture->>'entry_id')::uuid;
 IF tenant IS NULL OR property IS NULL OR reservation IS NULL OR entry IS NULL THEN RAISE EXCEPTION 'Payment review detail scope is required';END IF;
 prop:=irp_pms.payment_review_property(p_capture->'property',(p_capture->>'zone_supported')::boolean);label:=irp_pms.payment_review_booking(p_capture->'reservation');
 IF(p_capture->'property'->>'tenant_id',prop->>'id',p_capture->'reservation'->>'tenant_id',p_capture->'reservation'->>'property_id',label->>'id')
 IS DISTINCT FROM(tenant::text,property::text,tenant::text,property::text,reservation::text) THEN RAISE EXCEPTION 'Payment review property/reservation scope is inconsistent';END IF;
 source:=jsonb_populate_record(NULL::irp_pms.folio_entries,p_capture->'source');src:=irp_pms.payment_review_source(source);
 IF(source.tenant_id,source.property_id,source.reservation_id,source.id) IS DISTINCT FROM(tenant,property,reservation,entry) OR source.kind NOT IN('external_payment','external_refund') THEN RAISE EXCEPTION 'Detail requires an exact scoped reviewable payment/refund';END IF;
 IF source.target_entry_id IS NULL THEN
  IF p_capture->'target' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Payment has an unexpected target';END IF;
 ELSE
  target:=jsonb_populate_record(NULL::irp_pms.folio_entries,p_capture->'target');
  IF(target.tenant_id,target.property_id,target.reservation_id,target.id,target.kind,target.currency) IS DISTINCT FROM(tenant,property,reservation,source.target_entry_id,'external_payment'::text,'USD'::text)
  OR target.amount_minor IS NULL OR source.amount_minor>target.amount_minor THEN RAISE EXCEPTION 'Refund detail target is inconsistent';END IF;
 END IF;
 IF jsonb_array_length(p_capture->'reviews')>1000 OR jsonb_array_length(p_capture->'requests')>1000 THEN RAISE EXCEPTION 'Payment review detail exceeds1000 complete reviews';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_capture->'requests') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR jsonb_typeof(x->'request_id') IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'Review history request capture is incomplete';END IF;
 SELECT count(DISTINCT x->>'request_id'),coalesce(jsonb_object_agg(x->>'request_id',x),'{}'::jsonb) INTO matched,request_map FROM jsonb_array_elements(p_capture->'requests') x;
 IF matched<>jsonb_array_length(p_capture->'requests') THEN RAISE EXCEPTION 'Review history contains duplicate request identities';END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p_capture->'reviews') LOOP
  n:=n+1;e:=jsonb_populate_record(NULL::irp_pms.payment_record_reviews,raw);
  IF(e.tenant_id,e.property_id,e.reservation_id,e.entry_id,e.from_version,e.to_version) IS DISTINCT FROM(tenant,property,reservation,entry,n-1,n)
  OR e.id IS NULL OR e.actor_id IS NULL OR e.request_id IS NULL OR e.reviewed_at IS NULL OR NOT isfinite(e.reviewed_at)
  OR e.source_snapshot IS DISTINCT FROM src OR e.id=ANY(ids) OR e.request_id=ANY(requests) THEN RAISE EXCEPTION 'Payment review history has inconsistent scope, source or versions';END IF;
  PERFORM irp_pms.payment_review_command(e);
  request_raw:=request_map->(e.request_id::text);
  IF request_raw IS NULL THEN RAISE EXCEPTION 'Review history lacks one exact immutable request receipt';END IF;
  r:=jsonb_populate_record(NULL::irp_pms.payment_record_review_requests,request_raw);
  IF(r.tenant_id,r.property_id,r.reservation_id,r.entry_id,r.request_id,r.actor_id,r.review_id,r.outcome,r.recorded_at)
  IS DISTINCT FROM(tenant,property,reservation,entry,e.request_id,e.actor_id,e.id,'reviewed'::text,e.reviewed_at)
  OR r.retirement_reason IS NOT NULL OR r.command IS DISTINCT FROM irp_pms.payment_review_command(e) OR r.result IS DISTINCT FROM irp_pms.payment_review_result(e)
  THEN RAISE EXCEPTION 'Review historical receipt does not match its event';END IF;
  ids:=array_append(ids,e.id);requests:=array_append(requests,e.request_id);current_review:=irp_pms.payment_review_json(e);projected_reviews:=array_append(projected_reviews,current_review);
  IF n=1 THEN first_actor:=e.actor_id;first_at:=e.reviewed_at;END IF;
 END LOOP;
 IF jsonb_array_length(p_capture->'requests') IS DISTINCT FROM n::integer THEN RAISE EXCEPTION 'Review detail contains extra request rows';END IF;
 IF n=0 THEN
  IF p_capture->'head' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Empty review history cannot have a head';END IF;
 ELSE
  head:=jsonb_populate_record(NULL::irp_pms.payment_record_review_heads,p_capture->'head');
  IF(head.tenant_id,head.property_id,head.reservation_id,head.entry_id,head.version,head.current_review_id,head.created_by,head.created_at,head.updated_at)
  IS DISTINCT FROM(tenant,property,reservation,entry,n,e.id,first_actor,first_at,e.reviewed_at) THEN RAISE EXCEPTION 'Review head does not match its complete history';END IF;
  head_json:=jsonb_build_object('version',head.version,'current_review_id',head.current_review_id,'created_by',head.created_by,'created_at',head.created_at,'updated_at',head.updated_at);
 END IF;
 history:=to_jsonb(projected_reviews);
 IF octet_length(history::text)>3145728 THEN RAISE EXCEPTION 'Complete payment review history exceeds its3MiB readability budget';END IF;
 result:=jsonb_build_object('schema_version',1,'tenant_id',tenant,'property_id',property,'reservation_id',reservation,'entry_id',entry,'actor_id',p_actor,'role',p_role,'can_manage',p_role IN('owner','manager'),'property',prop,'generated_at',p_generated,'reservation',label,'source',src,'recorded',n>0,'version',n,'head',head_json,'current_review',current_review,'reviews',history,'rows_truncated',false,'financial_effects',irp_pms.payment_review_no_financial_effects(),'assurance',irp_pms.payment_review_assurance());
 IF octet_length(jsonb_set(result,'{reviews}','[]'::jsonb)::text)>65536 OR octet_length(result::text)>4194304 THEN RAISE EXCEPTION 'Payment review detail exceeds its reserved readable response budget';END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_payment_record_review(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;generated timestamptz;captured jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_entry IS NULL THEN RAISE EXCEPTION 'Reservation and payment entry are required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);generated:=clock_timestamp();
 -- REVIEW174_DETAIL_CAPTURE_BEGIN: one persistent relational statement snapshot.
 WITH history AS MATERIALIZED(
  SELECT e.* FROM irp_pms.payment_record_reviews e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.entry_id=p_entry ORDER BY e.to_version LIMIT 1001
 )
 SELECT jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,'entry_id',p_entry,
 'property',to_jsonb(p),'zone_supported',EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=p.time_zone),'reservation',to_jsonb(r),'source',to_jsonb(s),
 'target',CASE WHEN target.id IS NOT NULL THEN to_jsonb(target) END,'head',CASE WHEN h.entry_id IS NOT NULL THEN to_jsonb(h) END,
 'reviews',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.to_version) FROM history e),'[]'::jsonb),
 'requests',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY e.to_version) FROM history e LEFT JOIN irp_pms.payment_record_review_requests q ON q.tenant_id=e.tenant_id AND q.property_id=e.property_id AND q.request_id=e.request_id),'[]'::jsonb))
 INTO captured FROM irp_pms.properties p JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id AND r.id=p_reservation
 JOIN irp_pms.folio_entries s ON s.tenant_id=r.tenant_id AND s.property_id=r.property_id AND s.reservation_id=r.id AND s.id=p_entry
 LEFT JOIN irp_pms.folio_entries target ON target.tenant_id=s.tenant_id AND target.property_id=s.property_id AND target.reservation_id=s.reservation_id AND target.id=s.target_entry_id
 LEFT JOIN irp_pms.payment_record_review_heads h ON h.tenant_id=s.tenant_id AND h.property_id=s.property_id AND h.reservation_id=s.reservation_id AND h.entry_id=s.id
 WHERE p.tenant_id=p_tenant AND p.id=p_property;
 -- REVIEW174_DETAIL_CAPTURE_END: subsequent projection reads captured values only.
 IF captured IS NULL THEN RAISE EXCEPTION 'Unknown scoped payment entry';END IF;
 RETURN irp_pms.payment_review_detail_projection(captured,auth.uid(),member_role,generated);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_payment_record_review(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid,p_request uuid,p_expected_version bigint,p_method text,p_method_detail text,p_evidence_basis text,p_evidence_reference text,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;command jsonb;prop irp_pms.properties;reservation irp_pms.reservations;source irp_pms.folio_entries;target irp_pms.folio_entries;
 head irp_pms.payment_record_review_heads;event irp_pms.payment_record_reviews;prior irp_pms.payment_record_review_requests;request irp_pms.payment_record_review_requests;
 head_exists boolean;version bigint;recorded timestamptz;history jsonb;receipts jsonb;captured jsonb;prospective jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A payment review request identity is required';END IF;
 command:=irp_pms.normalize_payment_record_review(jsonb_build_object('reservation_id',p_reservation,'entry_id',p_entry,'expected_version',p_expected_version,'method',p_method,'method_detail',p_method_detail,'evidence_basis',p_evidence_basis,'evidence_reference',p_evidence_reference,'reason',p_reason,'confirmed',p_confirmed));
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO reservation FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_entry FOR UPDATE;
 IF reservation.id IS NULL OR source.id IS NULL OR source.kind NOT IN('external_payment','external_refund') THEN RAISE EXCEPTION 'Only an existing scoped external payment/refund can be reviewed';END IF;
 SELECT * INTO prior FROM irp_pms.payment_record_review_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF(prior.reservation_id,prior.entry_id,prior.actor_id) IS DISTINCT FROM(p_reservation,p_entry,auth.uid()) OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Payment review request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO head FROM irp_pms.payment_record_review_heads WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry FOR UPDATE;
 head_exists:=FOUND;version:=CASE WHEN head_exists THEN head.version ELSE 0 END;
 IF p_expected_version IS DISTINCT FROM version THEN RAISE EXCEPTION 'Payment review version changed; refresh the original entry before saving' USING ERRCODE='PT409';END IF;
 IF version>=1000 THEN RAISE EXCEPTION 'This payment entry has reached1000 reviews; existing history and request recovery remain available';END IF;
 IF source.target_entry_id IS NOT NULL THEN SELECT * INTO target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=source.target_entry_id;END IF;
 recorded:=clock_timestamp();
 event.tenant_id:=p_tenant;event.property_id:=p_property;event.reservation_id:=p_reservation;event.entry_id:=p_entry;event.id:=gen_random_uuid();event.request_id:=p_request;event.actor_id:=auth.uid();event.reviewed_at:=recorded;
 event.from_version:=version;event.to_version:=version+1;event.method:=command->>'method';event.method_detail:=command->>'method_detail';event.evidence_basis:=command->>'evidence_basis';event.evidence_reference:=command->>'evidence_reference';event.reason:=command->>'reason';event.source_snapshot:=irp_pms.payment_review_source(source);
 request.tenant_id:=p_tenant;request.property_id:=p_property;request.request_id:=p_request;request.reservation_id:=p_reservation;request.entry_id:=p_entry;request.actor_id:=auth.uid();request.command:=command;request.outcome:='reviewed';request.review_id:=event.id;request.recorded_at:=recorded;request.result:=irp_pms.payment_review_result(event);
 IF octet_length(request.result::text)>16384 THEN RAISE EXCEPTION 'Payment review receipt exceeds its readable byte limit';END IF;
 IF NOT head_exists THEN head.tenant_id:=p_tenant;head.property_id:=p_property;head.reservation_id:=p_reservation;head.entry_id:=p_entry;head.created_by:=auth.uid();head.created_at:=recorded;END IF;
 head.version:=version+1;head.current_review_id:=event.id;head.updated_at:=recorded;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.to_version),'[]'::jsonb),coalesce(jsonb_agg(to_jsonb(q) ORDER BY e.to_version),'[]'::jsonb)
 INTO history,receipts FROM irp_pms.payment_record_reviews e LEFT JOIN irp_pms.payment_record_review_requests q ON q.tenant_id=e.tenant_id AND q.property_id=e.property_id AND q.request_id=e.request_id
 WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.entry_id=p_entry;
 captured:=jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,'entry_id',p_entry,'property',to_jsonb(prop),'zone_supported',EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=prop.time_zone),
 'reservation',to_jsonb(reservation),'source',to_jsonb(source),'target',CASE WHEN target.id IS NOT NULL THEN to_jsonb(target) END,'head',to_jsonb(head),
 'reviews',history||jsonb_build_array(to_jsonb(event)),'requests',receipts||jsonb_build_array(to_jsonb(request)));
 -- Same pure projection as the reader: every accepted append preserves complete
 -- history and response readability before any metadata or audit is persisted.
 prospective:=irp_pms.payment_review_detail_projection(captured,auth.uid(),member_role,recorded);
 IF prospective->>'version' IS DISTINCT FROM head.version::text THEN RAISE EXCEPTION 'Prospective payment review detail is inconsistent';END IF;
 IF NOT head_exists THEN INSERT INTO irp_pms.payment_record_review_heads SELECT head.*;
 ELSE UPDATE irp_pms.payment_record_review_heads SET version=head.version,current_review_id=head.current_review_id,updated_at=head.updated_at WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry;END IF;
 INSERT INTO irp_pms.payment_record_reviews SELECT event.*;
 INSERT INTO irp_pms.payment_record_review_requests SELECT request.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),'payment_record_reviewed',p_reservation,jsonb_build_object('request_id',p_request,'entry_id',p_entry,'review_id',event.id,'from_version',event.from_version,'to_version',event.to_version,'financial_changed',false),recorded);
 RETURN request.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_retire_payment_record_review_request(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid,p_request uuid,p_command jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;reason text:=trim(p_reason);source irp_pms.folio_entries;prior irp_pms.payment_record_review_requests;request irp_pms.payment_record_review_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);command:=irp_pms.normalize_payment_record_review(p_command);
 IF p_request IS NULL OR(command->>'reservation_id',command->>'entry_id') IS DISTINCT FROM(p_reservation::text,p_entry::text)
 OR reason IS NULL OR length(reason) NOT BETWEEN 4 AND 500 OR reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Retirement requires the exact original scoped command, request and reviewed reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_entry FOR UPDATE;
 IF source.id IS NULL OR source.kind NOT IN('external_payment','external_refund') THEN RAISE EXCEPTION 'Unknown scoped external payment/refund for request retirement';END IF;
 PERFORM 1 FROM irp_pms.payment_record_review_heads WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry FOR UPDATE;
 SELECT * INTO prior FROM irp_pms.payment_record_review_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF(prior.reservation_id,prior.entry_id,prior.actor_id) IS DISTINCT FROM(p_reservation,p_entry,auth.uid()) OR prior.command IS DISTINCT FROM command
  OR(prior.outcome='retired' AND prior.retirement_reason IS DISTINCT FROM reason) THEN RAISE EXCEPTION 'Payment review request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 request.tenant_id:=p_tenant;request.property_id:=p_property;request.reservation_id:=p_reservation;request.entry_id:=p_entry;request.request_id:=p_request;request.actor_id:=auth.uid();request.command:=command;request.outcome:='retired';request.retirement_reason:=reason;request.recorded_at:=clock_timestamp();request.result:=irp_pms.payment_review_retired_result(request);
 INSERT INTO irp_pms.payment_record_review_requests SELECT request.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),'payment_record_review_request_retired',p_reservation,jsonb_build_object('request_id',p_request,'entry_id',p_entry,'financial_changed',false,'review_version_changed',false),request.recorded_at);
 RETURN request.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_payment_record_review_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE request irp_pms.payment_record_review_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A payment review request identity is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO request FROM irp_pms.payment_record_review_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action',request.result->>'action','result',request.result);
END $$;

CREATE FUNCTION irp_pms.payment_review_classification(p_state text,p_method text DEFAULT NULL,p_review irp_pms.payment_record_reviews DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('state',p_state,'method',CASE WHEN p_state='reviewed' THEN p_review.method ELSE p_method END,
 'method_detail',CASE WHEN p_state='reviewed' THEN p_review.method_detail END,'evidence_basis',CASE WHEN p_state='reviewed' THEN p_review.evidence_basis END,
 'evidence_reference',CASE WHEN p_state='reviewed' THEN p_review.evidence_reference END,'review_version',CASE WHEN p_state='reviewed' THEN p_review.to_version ELSE 0 END,
 'review_id',CASE WHEN p_state='reviewed' THEN p_review.id END,'reviewed_by',CASE WHEN p_state='reviewed' THEN p_review.actor_id END,
 'reviewed_at',CASE WHEN p_state='reviewed' THEN p_review.reviewed_at END,'review_reason',CASE WHEN p_state='reviewed' THEN p_review.reason END)
$$;
CREATE FUNCTION irp_pms.payment_review_empty_totals() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('record_count',0,'external_record_count',0,'reduction_record_count',0,'received_minor',0,'refunded_minor',0,'reduced_minor',0,'external_record_effect_minor',0,'record_balance_effect_minor',0,'unknown_method_record_count',0,
 'classification_counts',jsonb_build_object('unreviewed',0,'reviewed_external_record',0,'reviewed_operator_report',0,'reviewed_insufficient_evidence',0,'original_deposit_method',0,'not_money_movement',0),
 'by_method',(SELECT jsonb_agg(jsonb_build_object('method',m,'record_count',0,'received_minor',0,'refunded_minor',0,'external_record_effect_minor',0) ORDER BY ordinal) FROM unnest(ARRAY['cash','card','bank_transfer','other','unknown']) WITH ORDINALITY methods(m,ordinal)))
$$;
CREATE FUNCTION irp_pms.payment_review_add_totals(p_totals jsonb,p_effects jsonb,p_class jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result jsonb:=p_totals;methods jsonb:='[]';m jsonb;key text;class_key text;movement boolean:=p_class->>'state'<>'not_money_movement';
BEGIN
 FOR key IN SELECT unnest(ARRAY['received_minor','refunded_minor','reduced_minor','external_record_effect_minor','record_balance_effect_minor']) LOOP
  result:=jsonb_set(result,ARRAY[key],to_jsonb((result->>key)::numeric+(p_effects->>key)::numeric));
 END LOOP;
 result:=jsonb_set(result,'{record_count}',to_jsonb((result->>'record_count')::integer+1));
 key:=CASE WHEN movement THEN 'external_record_count' ELSE 'reduction_record_count' END;result:=jsonb_set(result,ARRAY[key],to_jsonb((result->>key)::integer+1));
 class_key:=CASE WHEN p_class->>'state'='reviewed' THEN CASE p_class->>'evidence_basis' WHEN 'external_record_reviewed' THEN 'reviewed_external_record' WHEN 'operator_report_only' THEN 'reviewed_operator_report' WHEN 'insufficient_evidence' THEN 'reviewed_insufficient_evidence' END ELSE p_class->>'state' END;
 IF class_key IS NULL OR NOT(result->'classification_counts'?class_key) THEN RAISE EXCEPTION 'Cashier classification is inconsistent';END IF;
 result:=jsonb_set(result,ARRAY['classification_counts',class_key],to_jsonb((result->'classification_counts'->>class_key)::integer+1));
 IF movement THEN
  IF p_class->>'method' IS NULL OR p_class->>'method' NOT IN('cash','card','bank_transfer','other','unknown') THEN RAISE EXCEPTION 'Cashier external record requires an explicit method bucket';END IF;
  IF p_class->>'method'='unknown' THEN result:=jsonb_set(result,'{unknown_method_record_count}',to_jsonb((result->>'unknown_method_record_count')::integer+1));END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(result->'by_method') LOOP
   IF m->>'method'=p_class->>'method' THEN
    m:=jsonb_set(m,'{record_count}',to_jsonb((m->>'record_count')::integer+1));
    FOR key IN SELECT unnest(ARRAY['received_minor','refunded_minor','external_record_effect_minor']) LOOP m:=jsonb_set(m,ARRAY[key],to_jsonb((m->>key)::numeric+(p_effects->>key)::numeric));END LOOP;
   END IF;
   PERFORM irp_pms.report_exact_numbers(m);methods:=methods||jsonb_build_array(m);
  END LOOP;
  result:=jsonb_set(result,'{by_method}',methods);
 END IF;
 RETURN irp_pms.report_exact_numbers(result);
END $$;

CREATE FUNCTION irp_pms.payment_review_report_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE tenant uuid;property uuid;prop jsonb;zone text;start_at timestamptz;end_at timestamptz;raw jsonb;label jsonb;record jsonb;classification jsonb;effects jsonb;rows jsonb;projected_rows jsonb[]:='{}';result jsonb;
 source irp_pms.folio_entries;target irp_pms.folio_entries;deposit irp_pms.security_deposit_events;deposit_target irp_pms.security_deposit_events;book irp_pms.security_deposit_books;
 head irp_pms.payment_record_review_heads;review irp_pms.payment_record_reviews;request irp_pms.payment_record_review_requests;
 folio_totals jsonb:=irp_pms.payment_review_empty_totals();deposit_totals jsonb:=irp_pms.payment_review_empty_totals();ledger text;purpose text;kind text;recorded timestamptz;amount bigint;received bigint;refunded bigint;reduced bigint;n integer:=0;folio_count integer:=0;deposit_count integer:=0;
 identity text;identities text[]:='{}';previous_identity text;previous_recorded timestamptz;command jsonb;
BEGIN
 IF p_actor IS NULL OR p_role IS NULL OR p_role NOT IN('owner','manager','staff') OR p_generated IS NULL OR NOT isfinite(p_generated)
 OR p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366
 OR p_capture IS NULL OR jsonb_typeof(p_capture) IS DISTINCT FROM 'object' OR NOT(p_capture?&ARRAY['tenant_id','property_id','property','zone_supported','records'])
 OR jsonb_typeof(p_capture->'records') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Cashier report capture is incomplete';END IF;
 tenant:=(p_capture->>'tenant_id')::uuid;property:=(p_capture->>'property_id')::uuid;prop:=irp_pms.payment_review_property(p_capture->'property',(p_capture->>'zone_supported')::boolean);zone:=prop->>'time_zone';
 IF tenant IS NULL OR property IS NULL OR(p_capture->'property'->>'tenant_id',prop->>'id') IS DISTINCT FROM(tenant::text,property::text) THEN RAISE EXCEPTION 'Cashier report property scope is inconsistent';END IF;
 start_at:=p_start::timestamp AT TIME ZONE zone;end_at:=p_end::timestamp AT TIME ZONE zone;
 IF jsonb_array_length(p_capture->'records')>10000 THEN RAISE EXCEPTION 'Cashier activity exceeds10000 combined records; narrow the period. No rows were truncated';END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p_capture->'records') LOOP
  n:=n+1;ledger:=raw->>'ledger';
  IF ledger IS NULL OR ledger NOT IN('folio','security_deposit') OR NOT(raw?&ARRAY['ledger','reservation','record','target','head','review','request','book','zone_supported']) THEN RAISE EXCEPTION 'Cashier source tuple is incomplete';END IF;
  label:=irp_pms.payment_review_booking(raw->'reservation');
  IF(raw->'reservation'->>'tenant_id',raw->'reservation'->>'property_id') IS DISTINCT FROM(tenant::text,property::text) THEN RAISE EXCEPTION 'Cashier reservation scope is inconsistent';END IF;
  IF ledger='folio' THEN
   folio_count:=folio_count+1;purpose:='guest_folio';source:=jsonb_populate_record(NULL::irp_pms.folio_entries,raw->'record');record:=irp_pms.payment_review_source(source);
   IF(source.tenant_id,source.property_id,source.reservation_id::text) IS DISTINCT FROM(tenant,property,label->>'id') THEN RAISE EXCEPTION 'Cashier folio source scope is inconsistent';END IF;
   kind:=source.kind;recorded:=source.created_at;amount:=source.amount_minor;
   IF source.target_entry_id IS NULL THEN
    IF raw->'target' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Cashier payment has an unexpected target';END IF;
   ELSE
    target:=jsonb_populate_record(NULL::irp_pms.folio_entries,raw->'target');
    IF(target.tenant_id,target.property_id,target.reservation_id,target.id,target.kind,target.currency) IS DISTINCT FROM(tenant,property,source.reservation_id,source.target_entry_id,'external_payment'::text,'USD'::text)
    OR target.amount_minor IS NULL OR amount>target.amount_minor THEN RAISE EXCEPTION 'Cashier refund/correction target is inconsistent';END IF;
   END IF;
   IF kind='payment_correction' THEN
    IF raw->'head' IS DISTINCT FROM 'null'::jsonb OR raw->'review' IS DISTINCT FROM 'null'::jsonb OR raw->'request' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'A payment correction cannot have tender metadata';END IF;
    classification:=irp_pms.payment_review_classification('not_money_movement');
   ELSIF raw->'head'='null'::jsonb THEN
    IF raw->'review' IS DISTINCT FROM 'null'::jsonb OR raw->'request' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'An unreviewed payment has unexpected review evidence';END IF;
    classification:=irp_pms.payment_review_classification('unreviewed','unknown');
   ELSE
    head:=jsonb_populate_record(NULL::irp_pms.payment_record_review_heads,raw->'head');review:=jsonb_populate_record(NULL::irp_pms.payment_record_reviews,raw->'review');request:=jsonb_populate_record(NULL::irp_pms.payment_record_review_requests,raw->'request');
    command:=irp_pms.payment_review_command(review);
    IF(head.tenant_id,head.property_id,head.reservation_id,head.entry_id,head.version,head.current_review_id,head.updated_at) IS DISTINCT FROM(tenant,property,source.reservation_id,source.id,review.to_version,review.id,review.reviewed_at)
    OR head.version IS NULL OR head.version NOT BETWEEN 1 AND 1000 OR head.created_by IS NULL OR head.created_at IS NULL OR NOT isfinite(head.created_at)
    OR(review.tenant_id,review.property_id,review.reservation_id,review.entry_id,review.from_version) IS DISTINCT FROM(tenant,property,source.reservation_id,source.id,head.version-1)
    OR review.id IS NULL OR review.request_id IS NULL OR review.actor_id IS NULL OR review.reviewed_at IS NULL OR NOT isfinite(review.reviewed_at) OR review.source_snapshot IS DISTINCT FROM record
    OR(request.tenant_id,request.property_id,request.reservation_id,request.entry_id,request.request_id,request.actor_id,request.review_id,request.outcome,request.recorded_at)
    IS DISTINCT FROM(tenant,property,source.reservation_id,source.id,review.request_id,review.actor_id,review.id,'reviewed'::text,review.reviewed_at)
    OR request.retirement_reason IS NOT NULL OR request.command IS DISTINCT FROM command OR request.result IS DISTINCT FROM irp_pms.payment_review_result(review)
    THEN RAISE EXCEPTION 'Cashier classification does not match its current head, source and immutable receipt';END IF;
    classification:=irp_pms.payment_review_classification('reviewed',NULL,review);
   END IF;
  ELSE
   deposit_count:=deposit_count+1;purpose:='refundable_security';deposit:=jsonb_populate_record(NULL::irp_pms.security_deposit_events,raw->'record');book:=jsonb_populate_record(NULL::irp_pms.security_deposit_books,raw->'book');
   IF(deposit.tenant_id,deposit.property_id,deposit.reservation_id::text,deposit.currency) IS DISTINCT FROM(tenant,property,label->>'id','USD'::text)
   OR deposit.id IS NULL OR deposit.request_id IS NULL OR deposit.actor_id IS NULL OR deposit.amount_minor IS NULL OR deposit.amount_minor NOT BETWEEN 1 AND 999999999999
   OR deposit.kind IS NULL OR deposit.kind NOT IN('external_receipt','external_refund','receipt_reduction') OR deposit.recorded_at IS NULL OR NOT isfinite(deposit.recorded_at)
   OR deposit.recording_date IS NULL OR NOT isfinite(deposit.recording_date) OR deposit.recording_time_zone IS NULL OR length(deposit.recording_time_zone) NOT BETWEEN 1 AND 100 OR raw->'zone_supported' IS DISTINCT FROM 'true'::jsonb
   OR deposit.recording_date IS DISTINCT FROM(deposit.recorded_at AT TIME ZONE deposit.recording_time_zone)::date
   OR deposit.from_version IS NULL OR deposit.from_version NOT BETWEEN 0 AND 999 OR deposit.to_version IS DISTINCT FROM deposit.from_version+1
   OR deposit.reference IS NULL OR length(deposit.reference) NOT BETWEEN 4 AND 200 OR deposit.reference IS DISTINCT FROM trim(deposit.reference) OR deposit.reference~'[[:cntrl:]]'
   OR deposit.reason IS NULL OR length(deposit.reason) NOT BETWEEN 4 AND 500 OR deposit.reason IS DISTINCT FROM trim(deposit.reason) OR deposit.reason~'[[:cntrl:]]'
   OR(book.tenant_id,book.property_id,book.id,book.reservation_id,book.currency,book.recording_time_zone) IS DISTINCT FROM(tenant,property,deposit.book_id,deposit.reservation_id,'USD'::text,deposit.recording_time_zone)
   OR book.version IS NULL OR book.version<deposit.to_version OR book.version>1000
   THEN RAISE EXCEPTION 'Cashier security-deposit source or frozen context is inconsistent';END IF;
   kind:=deposit.kind;recorded:=deposit.recorded_at;amount:=deposit.amount_minor;
   IF kind='external_receipt' THEN
    IF deposit.target_event_id IS NOT NULL OR raw->'target' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Deposit receipt has an unexpected target';END IF;
   ELSE
    deposit_target:=jsonb_populate_record(NULL::irp_pms.security_deposit_events,raw->'target');
    IF(deposit_target.tenant_id,deposit_target.property_id,deposit_target.book_id,deposit_target.reservation_id,deposit_target.id,deposit_target.kind,deposit_target.currency)
    IS DISTINCT FROM(tenant,property,deposit.book_id,deposit.reservation_id,deposit.target_event_id,'external_receipt'::text,'USD'::text)
    OR deposit_target.id IS NULL OR deposit_target.amount_minor IS NULL OR amount>deposit_target.amount_minor OR deposit_target.to_version IS NULL OR deposit_target.to_version>=deposit.to_version THEN RAISE EXCEPTION 'Deposit refund/reduction target is inconsistent';END IF;
   END IF;
   IF raw->'head' IS DISTINCT FROM 'null'::jsonb OR raw->'review' IS DISTINCT FROM 'null'::jsonb OR raw->'request' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Deposit source cannot carry a folio review';END IF;
   IF kind='receipt_reduction' THEN
    IF deposit.recorded_method IS NOT NULL THEN RAISE EXCEPTION 'A deposit record reduction has no tender';END IF;classification:=irp_pms.payment_review_classification('not_money_movement');
   ELSE
    IF deposit.recorded_method IS NULL OR deposit.recorded_method NOT IN('cash','card','bank_transfer','other') THEN RAISE EXCEPTION 'Deposit method evidence is missing';END IF;
    classification:=irp_pms.payment_review_classification('original_deposit_method',deposit.recorded_method);
   END IF;
   record:=jsonb_build_object('reservation_id',deposit.reservation_id,'id',deposit.id,'book_id',deposit.book_id,'request_id',deposit.request_id,'kind',deposit.kind,'amount_minor',deposit.amount_minor,'currency',deposit.currency,
    'reference',deposit.reference,'reason',deposit.reason,'target_event_id',deposit.target_event_id,'actor_id',deposit.actor_id,'recorded_at',deposit.recorded_at,'recorded_method',deposit.recorded_method,
    'recording_date',deposit.recording_date,'recording_time_zone',deposit.recording_time_zone,'from_version',deposit.from_version,'to_version',deposit.to_version);
  END IF;
  IF recorded<start_at OR recorded>=end_at THEN RAISE EXCEPTION 'Cashier source is outside the exact selected recording interval';END IF;
  identity:=ledger||'/'||(label->>'id')||'/'||(record->>'id');IF identity=ANY(identities) THEN RAISE EXCEPTION 'Cashier report contains duplicate source identities';END IF;identities:=array_append(identities,identity);
  IF previous_recorded IS NOT NULL AND(recorded,identity)<(previous_recorded,previous_identity) THEN RAISE EXCEPTION 'Cashier report source ordering is inconsistent';END IF;previous_recorded:=recorded;previous_identity:=identity;
  received:=CASE WHEN kind IN('external_payment','external_receipt') THEN amount ELSE 0 END;refunded:=CASE WHEN kind='external_refund' THEN amount ELSE 0 END;reduced:=CASE WHEN kind IN('payment_correction','receipt_reduction') THEN amount ELSE 0 END;
  effects:=jsonb_build_object('received_minor',received,'refunded_minor',refunded,'reduced_minor',reduced,'external_record_effect_minor',received-refunded,'record_balance_effect_minor',received-refunded-reduced);
  projected_rows:=array_append(projected_rows,jsonb_build_object('ledger',ledger,'purpose',purpose,'reservation',label,'record',record,'report_local_date',(recorded AT TIME ZONE zone)::date,'classification',classification,'effects',effects));
  IF ledger='folio' THEN folio_totals:=irp_pms.payment_review_add_totals(folio_totals,effects,classification);ELSE deposit_totals:=irp_pms.payment_review_add_totals(deposit_totals,effects,classification);END IF;
 END LOOP;
 rows:=to_jsonb(projected_rows);
 result:=jsonb_build_object('schema_version',1,'tenant_id',tenant,'property_id',property,'actor_id',p_actor,'role',p_role,'can_manage',p_role IN('owner','manager'),'property',prop,'generated_at',p_generated,'currency','USD',
 'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true,'start_at',start_at,'end_at',end_at,'basis','recorded_timestamp_in_current_property_zone'),'rows',rows,
 'summary',jsonb_build_object('row_count',n,'folio_row_count',folio_count,'security_deposit_row_count',deposit_count,'complete',true),'totals',jsonb_build_object('guest_folio',folio_totals,'refundable_security',deposit_totals),
 'rows_truncated',false,'financial_effects',irp_pms.payment_review_no_financial_effects(),'assurance',irp_pms.payment_review_assurance(),
 'semantics',jsonb_build_object('snapshot','current_prepared_record_activity','classification_basis','latest_review_at_preparation','purposes_combined',false,'current_balances_included',false,'cashier_session',false,'closed',false,'external_transactions_deduplicated',false));
 IF octet_length(result::text)>33554432 THEN RAISE EXCEPTION 'Cashier report exceeds32MiB; narrow the selected period. No rows were truncated';END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_cashier_activity_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;generated timestamptz;start_at timestamptz;end_at timestamptz;captured jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Choose1 to366 recording dates with an exclusive end';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);generated:=clock_timestamp();start_at:=p_start::timestamp AT TIME ZONE prop.time_zone;end_at:=p_end::timestamp AT TIME ZONE prop.time_zone;
 -- REVIEW174_REPORT_CAPTURE_BEGIN: one persistent relational statement snapshot.
 WITH candidates AS MATERIALIZED(
  SELECT * FROM(
   SELECT 'folio'::text ledger,e.created_at recorded_at,e.reservation_id,e.id,e folio_row,NULL::irp_pms.security_deposit_events deposit_row FROM irp_pms.folio_entries e
   WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.kind IN('external_payment','external_refund','payment_correction') AND e.created_at>=start_at AND e.created_at<end_at
   UNION ALL
   SELECT 'security_deposit'::text,d.recorded_at,d.reservation_id,d.id,NULL::irp_pms.folio_entries,d FROM irp_pms.security_deposit_events d
   WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND d.recorded_at>=start_at AND d.recorded_at<end_at
  ) selected ORDER BY recorded_at,ledger,reservation_id,id LIMIT 10001
 ), records AS MATERIALIZED(
  SELECT c.ledger,c.recorded_at,c.reservation_id,c.id,jsonb_build_object('ledger',c.ledger,'reservation',to_jsonb(r),
   'record',CASE WHEN c.ledger='folio' THEN to_jsonb(f) ELSE to_jsonb(d) END,
   'target',CASE WHEN c.ledger='folio' AND ft.id IS NOT NULL THEN to_jsonb(ft) WHEN c.ledger='security_deposit' AND dt.id IS NOT NULL THEN to_jsonb(dt) END,
   'head',CASE WHEN h.entry_id IS NOT NULL THEN to_jsonb(h) END,'review',CASE WHEN v.id IS NOT NULL THEN to_jsonb(v) END,'request',CASE WHEN q.request_id IS NOT NULL THEN to_jsonb(q) END,
   'book',CASE WHEN b.id IS NOT NULL THEN to_jsonb(b) END,'zone_supported',CASE WHEN d.id IS NOT NULL THEN EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=d.recording_time_zone) END) data
  FROM candidates c
  -- Keep the selected typed source row in the bounded candidate set, avoiding
  -- a second scan of its ledger. Every original source scope check remains.
  -- Each related complete scoped key has at most one match. OFFSET0
  -- keeps these parameterized lookups from flattening into property-wide
  -- joins when a newly populated property's cardinality is underestimated.
  -- LEFT preserves a missing context so the pure validator still rejects it.
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.reservations x WHERE x.tenant_id=p_tenant AND x.property_id=p_property AND x.id=c.reservation_id OFFSET 0) r ON true
  LEFT JOIN LATERAL(SELECT (c.folio_row).* WHERE c.ledger='folio' AND (c.folio_row).tenant_id=p_tenant AND (c.folio_row).property_id=p_property AND (c.folio_row).reservation_id=c.reservation_id AND (c.folio_row).id=c.id OFFSET 0) f ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.folio_entries x WHERE x.tenant_id=f.tenant_id AND x.property_id=f.property_id AND x.reservation_id=f.reservation_id AND x.id=f.target_entry_id OFFSET 0) ft ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.payment_record_review_heads x WHERE x.tenant_id=f.tenant_id AND x.property_id=f.property_id AND x.reservation_id=f.reservation_id AND x.entry_id=f.id OFFSET 0) h ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.payment_record_reviews x WHERE x.tenant_id=h.tenant_id AND x.property_id=h.property_id AND x.reservation_id=h.reservation_id AND x.entry_id=h.entry_id AND x.id=h.current_review_id OFFSET 0) v ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.payment_record_review_requests x WHERE x.tenant_id=v.tenant_id AND x.property_id=v.property_id AND x.request_id=v.request_id OFFSET 0) q ON true
  LEFT JOIN LATERAL(SELECT (c.deposit_row).* WHERE c.ledger='security_deposit' AND (c.deposit_row).tenant_id=p_tenant AND (c.deposit_row).property_id=p_property AND (c.deposit_row).reservation_id=c.reservation_id AND (c.deposit_row).id=c.id OFFSET 0) d ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.security_deposit_books x WHERE x.tenant_id=d.tenant_id AND x.property_id=d.property_id AND x.reservation_id=d.reservation_id AND x.id=d.book_id OFFSET 0) b ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.security_deposit_events x WHERE x.tenant_id=d.tenant_id AND x.property_id=d.property_id AND x.book_id=d.book_id AND x.reservation_id=d.reservation_id AND x.id=d.target_event_id OFFSET 0) dt ON true
 )
 SELECT jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'property',to_jsonb(p),'zone_supported',EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=p.time_zone),
 'records',coalesce((SELECT jsonb_agg(data ORDER BY recorded_at,ledger,reservation_id,id) FROM records),'[]'::jsonb)) INTO captured
 FROM irp_pms.properties p WHERE p.tenant_id=p_tenant AND p.id=p_property;
 -- REVIEW174_REPORT_CAPTURE_END: subsequent projection reads captured values only.
 IF captured IS NULL THEN RAISE EXCEPTION 'Unknown scoped cashier report property';END IF;
 RETURN irp_pms.payment_review_report_projection(captured,auth.uid(),member_role,generated,p_start,p_end);
END $$;

REVOKE ALL ON FUNCTION
 irp_pms.normalize_payment_record_review(jsonb),irp_pms.payment_review_no_financial_effects(),irp_pms.payment_review_assurance(),
 irp_pms.payment_review_source(irp_pms.folio_entries),irp_pms.payment_review_json(irp_pms.payment_record_reviews),irp_pms.payment_review_command(irp_pms.payment_record_reviews),
 irp_pms.payment_review_result(irp_pms.payment_record_reviews),irp_pms.payment_review_retired_result(irp_pms.payment_record_review_requests),
 irp_pms.payment_review_property(jsonb,boolean),irp_pms.payment_review_booking(jsonb),irp_pms.payment_review_history_guard(),irp_pms.payment_review_insert_guard(),irp_pms.payment_review_consistency(),
 irp_pms.payment_review_detail_projection(jsonb,uuid,text,timestamptz),irp_pms.payment_review_classification(text,text,irp_pms.payment_record_reviews),
 irp_pms.payment_review_empty_totals(),irp_pms.payment_review_add_totals(jsonb,jsonb,jsonb),irp_pms.payment_review_report_projection(jsonb,uuid,text,timestamptz,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
 public.irp_pms_pilot_payment_record_review(uuid,uuid,uuid,uuid),
 public.irp_pms_pilot_save_payment_record_review(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,boolean),
 public.irp_pms_pilot_retire_payment_record_review_request(uuid,uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_payment_record_review_request_status(uuid,uuid,uuid),public.irp_pms_pilot_cashier_activity_report(uuid,uuid,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.irp_pms_pilot_payment_record_review(uuid,uuid,uuid,uuid),
 public.irp_pms_pilot_save_payment_record_review(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,boolean),
 public.irp_pms_pilot_retire_payment_record_review_request(uuid,uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_payment_record_review_request_status(uuid,uuid,uuid),public.irp_pms_pilot_cashier_activity_report(uuid,uuid,date,date)
 TO authenticated;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('202609070174','iratepilot_pms_payment_record_reviews',ARRAY['
CREATE TABLE irp_pms.payment_record_review_heads(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,entry_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 1000),current_review_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
 updated_at timestamptz NOT NULL CHECK(isfinite(updated_at)),
 PRIMARY KEY(tenant_id,property_id,reservation_id,entry_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id)
);
CREATE TABLE irp_pms.payment_record_reviews(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,entry_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),reviewed_at timestamptz NOT NULL CHECK(isfinite(reviewed_at)),
 from_version bigint NOT NULL CHECK(from_version BETWEEN 0 AND 999),to_version bigint NOT NULL CHECK(to_version BETWEEN 1 AND 1000 AND to_version=from_version+1),
 method text NOT NULL CHECK(method IN(''cash'',''card'',''bank_transfer'',''other'',''unknown'')),method_detail text,
 evidence_basis text NOT NULL CHECK(evidence_basis IN(''external_record_reviewed'',''operator_report_only'',''insufficient_evidence'')),evidence_reference text,reason text NOT NULL,
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)=''object'' AND octet_length(source_snapshot::text)<=8192),
 PRIMARY KEY(tenant_id,property_id,reservation_id,entry_id,id),
 UNIQUE(tenant_id,property_id,reservation_id,entry_id,to_version),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.payment_record_review_heads(tenant_id,property_id,reservation_id,entry_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((method=''other'' AND method_detail IS NOT NULL AND length(method_detail) BETWEEN 4 AND 100 AND method_detail=trim(method_detail) AND method_detail !~ ''[[:cntrl:]]'') OR(method<>''other'' AND method_detail IS NULL)),
 CHECK(evidence_reference IS NULL OR(length(evidence_reference) BETWEEN 4 AND 200 AND evidence_reference=trim(evidence_reference) AND evidence_reference !~ ''[[:cntrl:]]'')),
 CHECK((evidence_basis=''external_record_reviewed'' AND method<>''unknown'' AND evidence_reference IS NOT NULL)
 OR(evidence_basis=''operator_report_only'' AND method<>''unknown'') OR(evidence_basis=''insufficient_evidence'' AND method=''unknown'')),
 CHECK(length(reason) BETWEEN 4 AND 500 AND reason=trim(reason) AND reason !~ ''[[:cntrl:]]'')
);
ALTER TABLE irp_pms.payment_record_review_heads ADD CONSTRAINT payment_record_head_latest
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id,current_review_id) REFERENCES irp_pms.payment_record_reviews(tenant_id,property_id,reservation_id,entry_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE irp_pms.payment_record_review_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,entry_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 outcome text NOT NULL CHECK(outcome IN(''reviewed'',''retired'')),review_id uuid,retirement_reason text,
 command jsonb NOT NULL CHECK(jsonb_typeof(command)=''object'' AND octet_length(command::text)<=4096),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)=''object'' AND octet_length(result::text)<=16384),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id,review_id) REFERENCES irp_pms.payment_record_reviews(tenant_id,property_id,reservation_id,entry_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((outcome=''reviewed'' AND review_id IS NOT NULL AND retirement_reason IS NULL)
 OR(outcome=''retired'' AND review_id IS NULL AND retirement_reason IS NOT NULL AND length(retirement_reason) BETWEEN 4 AND 500 AND retirement_reason=trim(retirement_reason) AND retirement_reason !~ ''[[:cntrl:]]''))
);
ALTER TABLE irp_pms.payment_record_reviews ADD CONSTRAINT payment_record_review_request
 FOREIGN KEY(tenant_id,property_id,request_id) REFERENCES irp_pms.payment_record_review_requests(tenant_id,property_id,request_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE irp_pms.payment_record_review_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.payment_record_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.payment_record_review_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.payment_record_review_heads,irp_pms.payment_record_reviews,irp_pms.payment_record_review_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.payment_record_review_heads,irp_pms.payment_record_reviews,irp_pms.payment_record_review_requests TO service_role;

CREATE FUNCTION irp_pms.normalize_payment_record_review(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE reservation uuid;entry uuid;version bigint;method text;detail text;basis text;reference text;reason text;result jsonb;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM ''object'' OR octet_length(p_data::text)>4096
 OR NOT(p_data?&ARRAY[''reservation_id'',''entry_id'',''expected_version'',''method'',''method_detail'',''evidence_basis'',''evidence_reference'',''reason'',''confirmed''])
 OR p_data-ARRAY[''reservation_id'',''entry_id'',''expected_version'',''method'',''method_detail'',''evidence_basis'',''evidence_reference'',''reason'',''confirmed'']<>''{}''::jsonb
 OR jsonb_typeof(p_data->''reservation_id'') IS DISTINCT FROM ''string'' OR jsonb_typeof(p_data->''entry_id'') IS DISTINCT FROM ''string''
 OR jsonb_typeof(p_data->''method'') IS DISTINCT FROM ''string'' OR jsonb_typeof(p_data->''evidence_basis'') IS DISTINCT FROM ''string''
 OR jsonb_typeof(p_data->''method_detail'') NOT IN(''string'',''null'') OR jsonb_typeof(p_data->''evidence_reference'') NOT IN(''string'',''null'')
 OR jsonb_typeof(p_data->''reason'') IS DISTINCT FROM ''string'' OR p_data->''confirmed'' IS DISTINCT FROM ''true''::jsonb
 THEN RAISE EXCEPTION ''Review command must contain its exact typed fields and confirmation'';END IF;
 reservation:=(p_data->>''reservation_id'')::uuid;entry:=(p_data->>''entry_id'')::uuid;
 version:=irp_pms.guest_document_number(p_data->''expected_version'',0,1000);
 method:=p_data->>''method'';detail:=trim(p_data->>''method_detail'');basis:=p_data->>''evidence_basis'';reference:=trim(p_data->>''evidence_reference'');reason:=trim(p_data->>''reason'');
 IF reservation IS NULL OR entry IS NULL OR method NOT IN(''cash'',''card'',''bank_transfer'',''other'',''unknown'')
 OR basis NOT IN(''external_record_reviewed'',''operator_report_only'',''insufficient_evidence'')
 OR(method=''other'' AND(detail IS NULL OR length(detail) NOT BETWEEN 4 AND 100 OR detail~''[[:cntrl:]]'')) OR(method<>''other'' AND detail IS NOT NULL)
 OR(reference IS NOT NULL AND(length(reference) NOT BETWEEN 4 AND 200 OR reference~''[[:cntrl:]]''))
 OR(basis=''external_record_reviewed'' AND(method=''unknown'' OR reference IS NULL))
 OR(basis=''operator_report_only'' AND method=''unknown'') OR(basis=''insufficient_evidence'' AND method<>''unknown'')
 OR reason IS NULL OR length(reason) NOT BETWEEN 4 AND 500 OR reason~''[[:cntrl:]]''
 THEN RAISE EXCEPTION ''Review method, evidence basis, details, reference and reason do not agree'';END IF;
 result:=jsonb_build_object(''reservation_id'',reservation,''entry_id'',entry,''expected_version'',version,''method'',method,''method_detail'',detail,''evidence_basis'',basis,''evidence_reference'',reference,''reason'',reason,''confirmed'',true);
 IF octet_length(result::text)>4096 THEN RAISE EXCEPTION ''Review command exceeds its byte limit'';END IF;
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.payment_review_no_financial_effects() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''financial_changed'',false,''folio_changed'',false,''security_deposit_changed'',false,''revenue_changed'',false,''taxes_changed'',false,''money_moved'',false)
$$;
CREATE FUNCTION irp_pms.payment_review_assurance() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''mode'',''operator_record_information'',''processor_verified'',false,''settlement_verified'',false,''cash_counted'',false,''invoice_issued'',false)
$$;
CREATE FUNCTION irp_pms.payment_review_source(p_row irp_pms.folio_entries) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF p_row.id IS NULL OR p_row.reservation_id IS NULL OR p_row.request_id IS NULL OR p_row.actor_id IS NULL OR p_row.kind IS NULL
 OR p_row.kind NOT IN(''external_payment'',''external_refund'',''payment_correction'') OR p_row.amount_minor IS NULL OR p_row.amount_minor NOT BETWEEN 1 AND 999999999999
 OR p_row.currency IS DISTINCT FROM ''USD'' OR p_row.reference IS NULL OR p_row.reason IS NULL OR p_row.created_at IS NULL OR NOT isfinite(p_row.created_at)
 OR(p_row.kind=''external_payment'' AND p_row.target_entry_id IS NOT NULL) OR(p_row.kind<>''external_payment'' AND p_row.target_entry_id IS NULL)
 THEN RAISE EXCEPTION ''Payment review requires an exact supported original source record'';END IF;
 result:=jsonb_build_object(''reservation_id'',p_row.reservation_id,''id'',p_row.id,''request_id'',p_row.request_id,''kind'',p_row.kind,''amount_minor'',p_row.amount_minor,''currency'',p_row.currency,''reference'',p_row.reference,''reason'',p_row.reason,''target_entry_id'',p_row.target_entry_id,''actor_id'',p_row.actor_id,''recorded_at'',p_row.created_at);
 IF octet_length(result::text)>8192 THEN RAISE EXCEPTION ''Original payment source exceeds review byte limit'';END IF;
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.payment_review_json(p_row irp_pms.payment_record_reviews) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''id'',p_row.id,''request_id'',p_row.request_id,''actor_id'',p_row.actor_id,''reviewed_at'',p_row.reviewed_at,''from_version'',p_row.from_version,''to_version'',p_row.to_version,''method'',p_row.method,''method_detail'',p_row.method_detail,''evidence_basis'',p_row.evidence_basis,''evidence_reference'',p_row.evidence_reference,''reason'',p_row.reason,''source'',p_row.source_snapshot)
$$;
CREATE FUNCTION irp_pms.payment_review_command(p_row irp_pms.payment_record_reviews) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE command jsonb;
BEGIN
 command:=irp_pms.normalize_payment_record_review(jsonb_build_object(''reservation_id'',p_row.reservation_id,''entry_id'',p_row.entry_id,''expected_version'',p_row.from_version,''method'',p_row.method,''method_detail'',p_row.method_detail,''evidence_basis'',p_row.evidence_basis,''evidence_reference'',p_row.evidence_reference,''reason'',p_row.reason,''confirmed'',true));
 IF(command->>''method_detail'',command->>''evidence_reference'',command->>''reason'') IS DISTINCT FROM(p_row.method_detail,p_row.evidence_reference,p_row.reason) THEN RAISE EXCEPTION ''Stored review text must already be canonical'';END IF;
 RETURN command;
END
$$;
CREATE FUNCTION irp_pms.payment_review_result(p_row irp_pms.payment_record_reviews) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''schema_version'',1,''outcome'',''reviewed'',''action'',''save_payment_record_review'',''tenant_id'',p_row.tenant_id,''property_id'',p_row.property_id,''reservation_id'',p_row.reservation_id,''entry_id'',p_row.entry_id,''request_id'',p_row.request_id,''command'',irp_pms.payment_review_command(p_row),''review'',irp_pms.payment_review_json(p_row),''expected_version'',p_row.from_version,''version'',p_row.to_version,''financial_effects'',irp_pms.payment_review_no_financial_effects(),''assurance'',irp_pms.payment_review_assurance(),''replayed'',false)
$$;
CREATE FUNCTION irp_pms.payment_review_retired_result(p_row irp_pms.payment_record_review_requests) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''schema_version'',1,''outcome'',''retired'',''action'',''retire_payment_record_review_request'',''tenant_id'',p_row.tenant_id,''property_id'',p_row.property_id,''reservation_id'',p_row.reservation_id,''entry_id'',p_row.entry_id,''request_id'',p_row.request_id,''command'',p_row.command,''retirement_reason'',p_row.retirement_reason,''retired_by'',p_row.actor_id,''retired_at'',p_row.recorded_at,''review_version_changed'',false,''financial_effects'',irp_pms.payment_review_no_financial_effects(),''assurance'',irp_pms.payment_review_assurance(),''replayed'',false)
$$;

CREATE FUNCTION irp_pms.payment_review_property(p_data jsonb,p_zone_supported boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE name text:=trim(regexp_replace(p_data->>''name'',''[[:cntrl:]]'','' '',''g''));zone text:=p_data->>''time_zone'';id uuid;
BEGIN
 id:=(p_data->>''id'')::uuid;
 IF id IS NULL OR name IS NULL OR length(name) NOT BETWEEN 1 AND 200 OR p_data->>''currency'' IS DISTINCT FROM ''USD''
 OR p_data->>''operating_model'' IS NULL OR p_data->>''operating_model'' NOT IN(''hotel'',''whole_home'')
 OR zone IS NULL OR length(zone) NOT BETWEEN 1 AND 100 OR p_zone_supported IS DISTINCT FROM true THEN RAISE EXCEPTION ''Unsupported payment review property context'';END IF;
 RETURN jsonb_build_object(''id'',id,''name'',name,''text_normalized'',name IS DISTINCT FROM p_data->>''name'',''currency'',''USD'',''time_zone'',zone,''operating_model'',p_data->>''operating_model'');
END $$;
CREATE FUNCTION irp_pms.payment_review_booking(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE id uuid;reference text:=p_data->>''source_booking_id'';
BEGIN
 id:=(p_data->>''id'')::uuid;
 IF id IS NULL OR p_data->>''source'' IS NULL OR p_data->>''source'' NOT IN(''direct'',''migration'',''iratepilot-ota'')
 OR p_data->>''status'' IS NULL OR p_data->>''status'' NOT IN(''Confirmed'',''In house'',''Checked out'',''Cancelled'')
 OR reference IS NULL OR length(reference) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION ''Unsupported payment review reservation label'';END IF;
 RETURN jsonb_build_object(''id'',id,''source'',p_data->>''source'',''source_booking_id'',reference,''status'',p_data->>''status'',''cancellation_kind'',CASE WHEN p_data->>''cancellation_disposition''=''no_show'' THEN ''no_show'' END);
END $$;

CREATE FUNCTION irp_pms.payment_review_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME<>''payment_record_review_heads'' OR TG_OP=''DELETE'' THEN RAISE EXCEPTION ''Payment reviews and request outcomes are immutable; heads cannot be deleted'';END IF;
 IF NEW.version IS DISTINCT FROM OLD.version+1 OR (NEW.tenant_id,NEW.property_id,NEW.reservation_id,NEW.entry_id,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM(OLD.tenant_id,OLD.property_id,OLD.reservation_id,OLD.entry_id,OLD.created_by,OLD.created_at)
 THEN RAISE EXCEPTION ''Payment review identity is immutable and its version advances exactly once'';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_review_head_history BEFORE UPDATE OR DELETE ON irp_pms.payment_record_review_heads FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_history_guard();
CREATE TRIGGER payment_review_event_history BEFORE UPDATE OR DELETE ON irp_pms.payment_record_reviews FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_history_guard();
CREATE TRIGGER payment_review_request_history BEFORE UPDATE OR DELETE ON irp_pms.payment_record_review_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_history_guard();

CREATE FUNCTION irp_pms.payment_review_insert_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source irp_pms.folio_entries;target irp_pms.folio_entries;head irp_pms.payment_record_review_heads;
BEGIN
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND id=NEW.entry_id FOR KEY SHARE;
 IF source.id IS NULL OR source.kind NOT IN(''external_payment'',''external_refund'') THEN RAISE EXCEPTION ''Only an existing scoped external payment or refund can be reviewed'';END IF;
 IF source.target_entry_id IS NOT NULL THEN
  SELECT * INTO target FROM irp_pms.folio_entries WHERE tenant_id=source.tenant_id AND property_id=source.property_id AND reservation_id=source.reservation_id AND id=source.target_entry_id;
  IF target.id IS NULL OR target.kind IS DISTINCT FROM ''external_payment'' OR source.amount_minor>target.amount_minor THEN RAISE EXCEPTION ''Refund review requires its exact scoped original payment target'';END IF;
 END IF;
 IF TG_TABLE_NAME=''payment_record_review_heads'' THEN
  IF NEW.version IS DISTINCT FROM 1::bigint OR NEW.updated_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION ''A review head starts with exactly one accepted review'';END IF;
 ELSIF TG_TABLE_NAME=''payment_record_reviews'' THEN
  SELECT * INTO head FROM irp_pms.payment_record_review_heads WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND entry_id=NEW.entry_id FOR UPDATE;
  IF head.entry_id IS NULL OR (NEW.to_version,NEW.id,NEW.reviewed_at) IS DISTINCT FROM(head.version,head.current_review_id,head.updated_at)
  OR NEW.source_snapshot IS DISTINCT FROM irp_pms.payment_review_source(source)
  OR NEW.from_version IS DISTINCT FROM(SELECT count(*) FROM irp_pms.payment_record_reviews WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND entry_id=NEW.entry_id)
  OR(NEW.to_version=1 AND(NEW.actor_id,NEW.reviewed_at) IS DISTINCT FROM(head.created_by,head.created_at))
  THEN RAISE EXCEPTION ''Review must append the exact next version, original source and creation context'';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_review_head_context BEFORE INSERT ON irp_pms.payment_record_review_heads FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_insert_guard();
CREATE TRIGGER payment_review_event_context BEFORE INSERT ON irp_pms.payment_record_reviews FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_insert_guard();
CREATE TRIGGER payment_review_request_context BEFORE INSERT ON irp_pms.payment_record_review_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_insert_guard();

CREATE FUNCTION irp_pms.payment_review_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE head irp_pms.payment_record_review_heads;event irp_pms.payment_record_reviews;request irp_pms.payment_record_review_requests;source irp_pms.folio_entries;n bigint;first_version bigint;last_version bigint;history jsonb;
BEGIN
 IF TG_TABLE_NAME=''payment_record_review_requests'' THEN
  SELECT * INTO request FROM irp_pms.payment_record_review_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id;
  IF request.command IS DISTINCT FROM irp_pms.normalize_payment_record_review(request.command)
  OR(request.command->>''reservation_id'',request.command->>''entry_id'') IS DISTINCT FROM(request.reservation_id::text,request.entry_id::text)
  THEN RAISE EXCEPTION ''Review request must preserve its canonical scoped command'';END IF;
  IF request.outcome=''retired'' THEN
   IF request.result IS DISTINCT FROM irp_pms.payment_review_retired_result(request)
   OR EXISTS(SELECT 1 FROM irp_pms.payment_record_reviews WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND request_id=request.request_id)
   THEN RAISE EXCEPTION ''Retired payment review must preserve an exact nonfinancial fence without an event'';END IF;
  ELSE
   SELECT * INTO event FROM irp_pms.payment_record_reviews WHERE tenant_id=request.tenant_id AND property_id=request.property_id AND reservation_id=request.reservation_id AND entry_id=request.entry_id AND id=request.review_id;
   IF event.id IS NULL OR(request.request_id,request.actor_id,request.recorded_at) IS DISTINCT FROM(event.request_id,event.actor_id,event.reviewed_at)
   OR request.command IS DISTINCT FROM irp_pms.payment_review_command(event) OR request.result IS DISTINCT FROM irp_pms.payment_review_result(event)
   THEN RAISE EXCEPTION ''Accepted review request must match its exact event and original historical receipt'';END IF;
  END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO head FROM irp_pms.payment_record_review_heads WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND entry_id=NEW.entry_id;
 SELECT count(*),min(to_version),max(to_version),coalesce(jsonb_agg(irp_pms.payment_review_json(e) ORDER BY to_version),''[]''::jsonb)
 INTO n,first_version,last_version,history FROM irp_pms.payment_record_reviews e WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND entry_id=head.entry_id;
 IF head.entry_id IS NULL OR n IS DISTINCT FROM head.version OR first_version IS DISTINCT FROM 1::bigint OR last_version IS DISTINCT FROM head.version OR octet_length(history::text)>3145728
 THEN RAISE EXCEPTION ''Payment review history must be complete, contiguous and readable within its byte budget'';END IF;
 SELECT * INTO event FROM irp_pms.payment_record_reviews WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND entry_id=head.entry_id AND to_version=head.version;
 IF(head.current_review_id,head.updated_at) IS DISTINCT FROM(event.id,event.reviewed_at) THEN RAISE EXCEPTION ''Review head must match the latest immutable event'';END IF;
 SELECT * INTO event FROM irp_pms.payment_record_reviews WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND entry_id=head.entry_id AND to_version=1;
 IF(head.created_by,head.created_at) IS DISTINCT FROM(event.actor_id,event.reviewed_at) THEN RAISE EXCEPTION ''Review head must retain its original creation context'';END IF;
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=head.tenant_id AND property_id=head.property_id AND reservation_id=head.reservation_id AND id=head.entry_id;
 IF EXISTS(SELECT 1 FROM irp_pms.payment_record_reviews e LEFT JOIN irp_pms.payment_record_review_requests r ON r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.request_id=e.request_id
 WHERE e.tenant_id=head.tenant_id AND e.property_id=head.property_id AND e.reservation_id=head.reservation_id AND e.entry_id=head.entry_id
 AND(r.request_id IS NULL OR r.outcome IS DISTINCT FROM ''reviewed'' OR(r.reservation_id,r.entry_id,r.review_id,r.actor_id,r.recorded_at) IS DISTINCT FROM(e.reservation_id,e.entry_id,e.id,e.actor_id,e.reviewed_at)
 OR e.source_snapshot IS DISTINCT FROM irp_pms.payment_review_source(source)))
 THEN RAISE EXCEPTION ''Each review requires its exact accepted request and unchanged original source'';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_review_head_consistency AFTER INSERT OR UPDATE ON irp_pms.payment_record_review_heads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_consistency();
CREATE CONSTRAINT TRIGGER payment_review_event_consistency AFTER INSERT ON irp_pms.payment_record_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_consistency();
CREATE CONSTRAINT TRIGGER payment_review_request_consistency AFTER INSERT ON irp_pms.payment_record_review_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.payment_review_consistency();

CREATE FUNCTION irp_pms.payment_review_detail_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE tenant uuid;property uuid;reservation uuid;entry uuid;prop jsonb;label jsonb;source irp_pms.folio_entries;target irp_pms.folio_entries;head irp_pms.payment_record_review_heads;e irp_pms.payment_record_reviews;r irp_pms.payment_record_review_requests;
 raw jsonb;request_raw jsonb;request_map jsonb;src jsonb;history jsonb;projected_reviews jsonb[]:=''{}'';current_review jsonb;head_json jsonb;result jsonb;n bigint:=0;matched integer;requests uuid[]:=''{}'';ids uuid[]:=''{}'';first_actor uuid;first_at timestamptz;
BEGIN
 IF p_actor IS NULL OR p_role IS NULL OR p_role NOT IN(''owner'',''manager'',''staff'') OR p_generated IS NULL OR NOT isfinite(p_generated)
 OR p_capture IS NULL OR jsonb_typeof(p_capture) IS DISTINCT FROM ''object'' OR NOT(p_capture?&ARRAY[''tenant_id'',''property_id'',''reservation_id'',''entry_id'',''property'',''zone_supported'',''reservation'',''source'',''target'',''head'',''reviews'',''requests''])
 OR jsonb_typeof(p_capture->''reviews'') IS DISTINCT FROM ''array'' OR jsonb_typeof(p_capture->''requests'') IS DISTINCT FROM ''array''
 OR jsonb_typeof(p_capture->''head'') NOT IN(''object'',''null'') OR jsonb_typeof(p_capture->''target'') NOT IN(''object'',''null'') THEN RAISE EXCEPTION ''Payment review detail capture is incomplete'';END IF;
 tenant:=(p_capture->>''tenant_id'')::uuid;property:=(p_capture->>''property_id'')::uuid;reservation:=(p_capture->>''reservation_id'')::uuid;entry:=(p_capture->>''entry_id'')::uuid;
 IF tenant IS NULL OR property IS NULL OR reservation IS NULL OR entry IS NULL THEN RAISE EXCEPTION ''Payment review detail scope is required'';END IF;
 prop:=irp_pms.payment_review_property(p_capture->''property'',(p_capture->>''zone_supported'')::boolean);label:=irp_pms.payment_review_booking(p_capture->''reservation'');
 IF(p_capture->''property''->>''tenant_id'',prop->>''id'',p_capture->''reservation''->>''tenant_id'',p_capture->''reservation''->>''property_id'',label->>''id'')
 IS DISTINCT FROM(tenant::text,property::text,tenant::text,property::text,reservation::text) THEN RAISE EXCEPTION ''Payment review property/reservation scope is inconsistent'';END IF;
 source:=jsonb_populate_record(NULL::irp_pms.folio_entries,p_capture->''source'');src:=irp_pms.payment_review_source(source);
 IF(source.tenant_id,source.property_id,source.reservation_id,source.id) IS DISTINCT FROM(tenant,property,reservation,entry) OR source.kind NOT IN(''external_payment'',''external_refund'') THEN RAISE EXCEPTION ''Detail requires an exact scoped reviewable payment/refund'';END IF;
 IF source.target_entry_id IS NULL THEN
  IF p_capture->''target'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''Payment has an unexpected target'';END IF;
 ELSE
  target:=jsonb_populate_record(NULL::irp_pms.folio_entries,p_capture->''target'');
  IF(target.tenant_id,target.property_id,target.reservation_id,target.id,target.kind,target.currency) IS DISTINCT FROM(tenant,property,reservation,source.target_entry_id,''external_payment''::text,''USD''::text)
  OR target.amount_minor IS NULL OR source.amount_minor>target.amount_minor THEN RAISE EXCEPTION ''Refund detail target is inconsistent'';END IF;
 END IF;
 IF jsonb_array_length(p_capture->''reviews'')>1000 OR jsonb_array_length(p_capture->''requests'')>1000 THEN RAISE EXCEPTION ''Payment review detail exceeds1000 complete reviews'';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_capture->''requests'') x WHERE jsonb_typeof(x) IS DISTINCT FROM ''object'' OR jsonb_typeof(x->''request_id'') IS DISTINCT FROM ''string'') THEN RAISE EXCEPTION ''Review history request capture is incomplete'';END IF;
 SELECT count(DISTINCT x->>''request_id''),coalesce(jsonb_object_agg(x->>''request_id'',x),''{}''::jsonb) INTO matched,request_map FROM jsonb_array_elements(p_capture->''requests'') x;
 IF matched<>jsonb_array_length(p_capture->''requests'') THEN RAISE EXCEPTION ''Review history contains duplicate request identities'';END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p_capture->''reviews'') LOOP
  n:=n+1;e:=jsonb_populate_record(NULL::irp_pms.payment_record_reviews,raw);
  IF(e.tenant_id,e.property_id,e.reservation_id,e.entry_id,e.from_version,e.to_version) IS DISTINCT FROM(tenant,property,reservation,entry,n-1,n)
  OR e.id IS NULL OR e.actor_id IS NULL OR e.request_id IS NULL OR e.reviewed_at IS NULL OR NOT isfinite(e.reviewed_at)
  OR e.source_snapshot IS DISTINCT FROM src OR e.id=ANY(ids) OR e.request_id=ANY(requests) THEN RAISE EXCEPTION ''Payment review history has inconsistent scope, source or versions'';END IF;
  PERFORM irp_pms.payment_review_command(e);
  request_raw:=request_map->(e.request_id::text);
  IF request_raw IS NULL THEN RAISE EXCEPTION ''Review history lacks one exact immutable request receipt'';END IF;
  r:=jsonb_populate_record(NULL::irp_pms.payment_record_review_requests,request_raw);
  IF(r.tenant_id,r.property_id,r.reservation_id,r.entry_id,r.request_id,r.actor_id,r.review_id,r.outcome,r.recorded_at)
  IS DISTINCT FROM(tenant,property,reservation,entry,e.request_id,e.actor_id,e.id,''reviewed''::text,e.reviewed_at)
  OR r.retirement_reason IS NOT NULL OR r.command IS DISTINCT FROM irp_pms.payment_review_command(e) OR r.result IS DISTINCT FROM irp_pms.payment_review_result(e)
  THEN RAISE EXCEPTION ''Review historical receipt does not match its event'';END IF;
  ids:=array_append(ids,e.id);requests:=array_append(requests,e.request_id);current_review:=irp_pms.payment_review_json(e);projected_reviews:=array_append(projected_reviews,current_review);
  IF n=1 THEN first_actor:=e.actor_id;first_at:=e.reviewed_at;END IF;
 END LOOP;
 IF jsonb_array_length(p_capture->''requests'') IS DISTINCT FROM n::integer THEN RAISE EXCEPTION ''Review detail contains extra request rows'';END IF;
 IF n=0 THEN
  IF p_capture->''head'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''Empty review history cannot have a head'';END IF;
 ELSE
  head:=jsonb_populate_record(NULL::irp_pms.payment_record_review_heads,p_capture->''head'');
  IF(head.tenant_id,head.property_id,head.reservation_id,head.entry_id,head.version,head.current_review_id,head.created_by,head.created_at,head.updated_at)
  IS DISTINCT FROM(tenant,property,reservation,entry,n,e.id,first_actor,first_at,e.reviewed_at) THEN RAISE EXCEPTION ''Review head does not match its complete history'';END IF;
  head_json:=jsonb_build_object(''version'',head.version,''current_review_id'',head.current_review_id,''created_by'',head.created_by,''created_at'',head.created_at,''updated_at'',head.updated_at);
 END IF;
 history:=to_jsonb(projected_reviews);
 IF octet_length(history::text)>3145728 THEN RAISE EXCEPTION ''Complete payment review history exceeds its3MiB readability budget'';END IF;
 result:=jsonb_build_object(''schema_version'',1,''tenant_id'',tenant,''property_id'',property,''reservation_id'',reservation,''entry_id'',entry,''actor_id'',p_actor,''role'',p_role,''can_manage'',p_role IN(''owner'',''manager''),''property'',prop,''generated_at'',p_generated,''reservation'',label,''source'',src,''recorded'',n>0,''version'',n,''head'',head_json,''current_review'',current_review,''reviews'',history,''rows_truncated'',false,''financial_effects'',irp_pms.payment_review_no_financial_effects(),''assurance'',irp_pms.payment_review_assurance());
 IF octet_length(jsonb_set(result,''{reviews}'',''[]''::jsonb)::text)>65536 OR octet_length(result::text)>4194304 THEN RAISE EXCEPTION ''Payment review detail exceeds its reserved readable response budget'';END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_payment_record_review(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;generated timestamptz;captured jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_entry IS NULL THEN RAISE EXCEPTION ''Reservation and payment entry are required'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);generated:=clock_timestamp();
 -- REVIEW174_DETAIL_CAPTURE_BEGIN: one persistent relational statement snapshot.
 WITH history AS MATERIALIZED(
  SELECT e.* FROM irp_pms.payment_record_reviews e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.entry_id=p_entry ORDER BY e.to_version LIMIT 1001
 )
 SELECT jsonb_build_object(''tenant_id'',p_tenant,''property_id'',p_property,''reservation_id'',p_reservation,''entry_id'',p_entry,
 ''property'',to_jsonb(p),''zone_supported'',EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=p.time_zone),''reservation'',to_jsonb(r),''source'',to_jsonb(s),
 ''target'',CASE WHEN target.id IS NOT NULL THEN to_jsonb(target) END,''head'',CASE WHEN h.entry_id IS NOT NULL THEN to_jsonb(h) END,
 ''reviews'',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.to_version) FROM history e),''[]''::jsonb),
 ''requests'',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY e.to_version) FROM history e LEFT JOIN irp_pms.payment_record_review_requests q ON q.tenant_id=e.tenant_id AND q.property_id=e.property_id AND q.request_id=e.request_id),''[]''::jsonb))
 INTO captured FROM irp_pms.properties p JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id AND r.id=p_reservation
 JOIN irp_pms.folio_entries s ON s.tenant_id=r.tenant_id AND s.property_id=r.property_id AND s.reservation_id=r.id AND s.id=p_entry
 LEFT JOIN irp_pms.folio_entries target ON target.tenant_id=s.tenant_id AND target.property_id=s.property_id AND target.reservation_id=s.reservation_id AND target.id=s.target_entry_id
 LEFT JOIN irp_pms.payment_record_review_heads h ON h.tenant_id=s.tenant_id AND h.property_id=s.property_id AND h.reservation_id=s.reservation_id AND h.entry_id=s.id
 WHERE p.tenant_id=p_tenant AND p.id=p_property;
 -- REVIEW174_DETAIL_CAPTURE_END: subsequent projection reads captured values only.
 IF captured IS NULL THEN RAISE EXCEPTION ''Unknown scoped payment entry'';END IF;
 RETURN irp_pms.payment_review_detail_projection(captured,auth.uid(),member_role,generated);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_payment_record_review(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid,p_request uuid,p_expected_version bigint,p_method text,p_method_detail text,p_evidence_basis text,p_evidence_reference text,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;command jsonb;prop irp_pms.properties;reservation irp_pms.reservations;source irp_pms.folio_entries;target irp_pms.folio_entries;
 head irp_pms.payment_record_review_heads;event irp_pms.payment_record_reviews;prior irp_pms.payment_record_review_requests;request irp_pms.payment_record_review_requests;
 head_exists boolean;version bigint;recorded timestamptz;history jsonb;receipts jsonb;captured jsonb;prospective jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL THEN RAISE EXCEPTION ''A payment review request identity is required'';END IF;
 command:=irp_pms.normalize_payment_record_review(jsonb_build_object(''reservation_id'',p_reservation,''entry_id'',p_entry,''expected_version'',p_expected_version,''method'',p_method,''method_detail'',p_method_detail,''evidence_basis'',p_evidence_basis,''evidence_reference'',p_evidence_reference,''reason'',p_reason,''confirmed'',p_confirmed));
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO reservation FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_entry FOR UPDATE;
 IF reservation.id IS NULL OR source.id IS NULL OR source.kind NOT IN(''external_payment'',''external_refund'') THEN RAISE EXCEPTION ''Only an existing scoped external payment/refund can be reviewed'';END IF;
 SELECT * INTO prior FROM irp_pms.payment_record_review_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF(prior.reservation_id,prior.entry_id,prior.actor_id) IS DISTINCT FROM(p_reservation,p_entry,auth.uid()) OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION ''Payment review request identity already used'';END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 SELECT * INTO head FROM irp_pms.payment_record_review_heads WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry FOR UPDATE;
 head_exists:=FOUND;version:=CASE WHEN head_exists THEN head.version ELSE 0 END;
 IF p_expected_version IS DISTINCT FROM version THEN RAISE EXCEPTION ''Payment review version changed; refresh the original entry before saving'' USING ERRCODE=''PT409'';END IF;
 IF version>=1000 THEN RAISE EXCEPTION ''This payment entry has reached1000 reviews; existing history and request recovery remain available'';END IF;
 IF source.target_entry_id IS NOT NULL THEN SELECT * INTO target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=source.target_entry_id;END IF;
 recorded:=clock_timestamp();
 event.tenant_id:=p_tenant;event.property_id:=p_property;event.reservation_id:=p_reservation;event.entry_id:=p_entry;event.id:=gen_random_uuid();event.request_id:=p_request;event.actor_id:=auth.uid();event.reviewed_at:=recorded;
 event.from_version:=version;event.to_version:=version+1;event.method:=command->>''method'';event.method_detail:=command->>''method_detail'';event.evidence_basis:=command->>''evidence_basis'';event.evidence_reference:=command->>''evidence_reference'';event.reason:=command->>''reason'';event.source_snapshot:=irp_pms.payment_review_source(source);
 request.tenant_id:=p_tenant;request.property_id:=p_property;request.request_id:=p_request;request.reservation_id:=p_reservation;request.entry_id:=p_entry;request.actor_id:=auth.uid();request.command:=command;request.outcome:=''reviewed'';request.review_id:=event.id;request.recorded_at:=recorded;request.result:=irp_pms.payment_review_result(event);
 IF octet_length(request.result::text)>16384 THEN RAISE EXCEPTION ''Payment review receipt exceeds its readable byte limit'';END IF;
 IF NOT head_exists THEN head.tenant_id:=p_tenant;head.property_id:=p_property;head.reservation_id:=p_reservation;head.entry_id:=p_entry;head.created_by:=auth.uid();head.created_at:=recorded;END IF;
 head.version:=version+1;head.current_review_id:=event.id;head.updated_at:=recorded;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.to_version),''[]''::jsonb),coalesce(jsonb_agg(to_jsonb(q) ORDER BY e.to_version),''[]''::jsonb)
 INTO history,receipts FROM irp_pms.payment_record_reviews e LEFT JOIN irp_pms.payment_record_review_requests q ON q.tenant_id=e.tenant_id AND q.property_id=e.property_id AND q.request_id=e.request_id
 WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.entry_id=p_entry;
 captured:=jsonb_build_object(''tenant_id'',p_tenant,''property_id'',p_property,''reservation_id'',p_reservation,''entry_id'',p_entry,''property'',to_jsonb(prop),''zone_supported'',EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=prop.time_zone),
 ''reservation'',to_jsonb(reservation),''source'',to_jsonb(source),''target'',CASE WHEN target.id IS NOT NULL THEN to_jsonb(target) END,''head'',to_jsonb(head),
 ''reviews'',history||jsonb_build_array(to_jsonb(event)),''requests'',receipts||jsonb_build_array(to_jsonb(request)));
 -- Same pure projection as the reader: every accepted append preserves complete
 -- history and response readability before any metadata or audit is persisted.
 prospective:=irp_pms.payment_review_detail_projection(captured,auth.uid(),member_role,recorded);
 IF prospective->>''version'' IS DISTINCT FROM head.version::text THEN RAISE EXCEPTION ''Prospective payment review detail is inconsistent'';END IF;
 IF NOT head_exists THEN INSERT INTO irp_pms.payment_record_review_heads SELECT head.*;
 ELSE UPDATE irp_pms.payment_record_review_heads SET version=head.version,current_review_id=head.current_review_id,updated_at=head.updated_at WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry;END IF;
 INSERT INTO irp_pms.payment_record_reviews SELECT event.*;
 INSERT INTO irp_pms.payment_record_review_requests SELECT request.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),''payment_record_reviewed'',p_reservation,jsonb_build_object(''request_id'',p_request,''entry_id'',p_entry,''review_id'',event.id,''from_version'',event.from_version,''to_version'',event.to_version,''financial_changed'',false),recorded);
 RETURN request.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_retire_payment_record_review_request(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid,p_request uuid,p_command jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;reason text:=trim(p_reason);source irp_pms.folio_entries;prior irp_pms.payment_record_review_requests;request irp_pms.payment_record_review_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);command:=irp_pms.normalize_payment_record_review(p_command);
 IF p_request IS NULL OR(command->>''reservation_id'',command->>''entry_id'') IS DISTINCT FROM(p_reservation::text,p_entry::text)
 OR reason IS NULL OR length(reason) NOT BETWEEN 4 AND 500 OR reason~''[[:cntrl:]]'' THEN RAISE EXCEPTION ''Retirement requires the exact original scoped command, request and reviewed reason'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_entry FOR UPDATE;
 IF source.id IS NULL OR source.kind NOT IN(''external_payment'',''external_refund'') THEN RAISE EXCEPTION ''Unknown scoped external payment/refund for request retirement'';END IF;
 PERFORM 1 FROM irp_pms.payment_record_review_heads WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry FOR UPDATE;
 SELECT * INTO prior FROM irp_pms.payment_record_review_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF(prior.reservation_id,prior.entry_id,prior.actor_id) IS DISTINCT FROM(p_reservation,p_entry,auth.uid()) OR prior.command IS DISTINCT FROM command
  OR(prior.outcome=''retired'' AND prior.retirement_reason IS DISTINCT FROM reason) THEN RAISE EXCEPTION ''Payment review request identity already used'';END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 request.tenant_id:=p_tenant;request.property_id:=p_property;request.reservation_id:=p_reservation;request.entry_id:=p_entry;request.request_id:=p_request;request.actor_id:=auth.uid();request.command:=command;request.outcome:=''retired'';request.retirement_reason:=reason;request.recorded_at:=clock_timestamp();request.result:=irp_pms.payment_review_retired_result(request);
 INSERT INTO irp_pms.payment_record_review_requests SELECT request.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),''payment_record_review_request_retired'',p_reservation,jsonb_build_object(''request_id'',p_request,''entry_id'',p_entry,''financial_changed'',false,''review_version_changed'',false),request.recorded_at);
 RETURN request.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_payment_record_review_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE request irp_pms.payment_record_review_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION ''A payment review request identity is required'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO request FROM irp_pms.payment_record_review_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object(''found'',false);END IF;
 RETURN jsonb_build_object(''found'',true,''action'',request.result->>''action'',''result'',request.result);
END $$;

CREATE FUNCTION irp_pms.payment_review_classification(p_state text,p_method text DEFAULT NULL,p_review irp_pms.payment_record_reviews DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''state'',p_state,''method'',CASE WHEN p_state=''reviewed'' THEN p_review.method ELSE p_method END,
 ''method_detail'',CASE WHEN p_state=''reviewed'' THEN p_review.method_detail END,''evidence_basis'',CASE WHEN p_state=''reviewed'' THEN p_review.evidence_basis END,
 ''evidence_reference'',CASE WHEN p_state=''reviewed'' THEN p_review.evidence_reference END,''review_version'',CASE WHEN p_state=''reviewed'' THEN p_review.to_version ELSE 0 END,
 ''review_id'',CASE WHEN p_state=''reviewed'' THEN p_review.id END,''reviewed_by'',CASE WHEN p_state=''reviewed'' THEN p_review.actor_id END,
 ''reviewed_at'',CASE WHEN p_state=''reviewed'' THEN p_review.reviewed_at END,''review_reason'',CASE WHEN p_state=''reviewed'' THEN p_review.reason END)
$$;
CREATE FUNCTION irp_pms.payment_review_empty_totals() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(''record_count'',0,''external_record_count'',0,''reduction_record_count'',0,''received_minor'',0,''refunded_minor'',0,''reduced_minor'',0,''external_record_effect_minor'',0,''record_balance_effect_minor'',0,''unknown_method_record_count'',0,
 ''classification_counts'',jsonb_build_object(''unreviewed'',0,''reviewed_external_record'',0,''reviewed_operator_report'',0,''reviewed_insufficient_evidence'',0,''original_deposit_method'',0,''not_money_movement'',0),
 ''by_method'',(SELECT jsonb_agg(jsonb_build_object(''method'',m,''record_count'',0,''received_minor'',0,''refunded_minor'',0,''external_record_effect_minor'',0) ORDER BY ordinal) FROM unnest(ARRAY[''cash'',''card'',''bank_transfer'',''other'',''unknown'']) WITH ORDINALITY methods(m,ordinal)))
$$;
CREATE FUNCTION irp_pms.payment_review_add_totals(p_totals jsonb,p_effects jsonb,p_class jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result jsonb:=p_totals;methods jsonb:=''[]'';m jsonb;key text;class_key text;movement boolean:=p_class->>''state''<>''not_money_movement'';
BEGIN
 FOR key IN SELECT unnest(ARRAY[''received_minor'',''refunded_minor'',''reduced_minor'',''external_record_effect_minor'',''record_balance_effect_minor'']) LOOP
  result:=jsonb_set(result,ARRAY[key],to_jsonb((result->>key)::numeric+(p_effects->>key)::numeric));
 END LOOP;
 result:=jsonb_set(result,''{record_count}'',to_jsonb((result->>''record_count'')::integer+1));
 key:=CASE WHEN movement THEN ''external_record_count'' ELSE ''reduction_record_count'' END;result:=jsonb_set(result,ARRAY[key],to_jsonb((result->>key)::integer+1));
 class_key:=CASE WHEN p_class->>''state''=''reviewed'' THEN CASE p_class->>''evidence_basis'' WHEN ''external_record_reviewed'' THEN ''reviewed_external_record'' WHEN ''operator_report_only'' THEN ''reviewed_operator_report'' WHEN ''insufficient_evidence'' THEN ''reviewed_insufficient_evidence'' END ELSE p_class->>''state'' END;
 IF class_key IS NULL OR NOT(result->''classification_counts''?class_key) THEN RAISE EXCEPTION ''Cashier classification is inconsistent'';END IF;
 result:=jsonb_set(result,ARRAY[''classification_counts'',class_key],to_jsonb((result->''classification_counts''->>class_key)::integer+1));
 IF movement THEN
  IF p_class->>''method'' IS NULL OR p_class->>''method'' NOT IN(''cash'',''card'',''bank_transfer'',''other'',''unknown'') THEN RAISE EXCEPTION ''Cashier external record requires an explicit method bucket'';END IF;
  IF p_class->>''method''=''unknown'' THEN result:=jsonb_set(result,''{unknown_method_record_count}'',to_jsonb((result->>''unknown_method_record_count'')::integer+1));END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(result->''by_method'') LOOP
   IF m->>''method''=p_class->>''method'' THEN
    m:=jsonb_set(m,''{record_count}'',to_jsonb((m->>''record_count'')::integer+1));
    FOR key IN SELECT unnest(ARRAY[''received_minor'',''refunded_minor'',''external_record_effect_minor'']) LOOP m:=jsonb_set(m,ARRAY[key],to_jsonb((m->>key)::numeric+(p_effects->>key)::numeric));END LOOP;
   END IF;
   PERFORM irp_pms.report_exact_numbers(m);methods:=methods||jsonb_build_array(m);
  END LOOP;
  result:=jsonb_set(result,''{by_method}'',methods);
 END IF;
 RETURN irp_pms.report_exact_numbers(result);
END $$;

CREATE FUNCTION irp_pms.payment_review_report_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE tenant uuid;property uuid;prop jsonb;zone text;start_at timestamptz;end_at timestamptz;raw jsonb;label jsonb;record jsonb;classification jsonb;effects jsonb;rows jsonb;projected_rows jsonb[]:=''{}'';result jsonb;
 source irp_pms.folio_entries;target irp_pms.folio_entries;deposit irp_pms.security_deposit_events;deposit_target irp_pms.security_deposit_events;book irp_pms.security_deposit_books;
 head irp_pms.payment_record_review_heads;review irp_pms.payment_record_reviews;request irp_pms.payment_record_review_requests;
 folio_totals jsonb:=irp_pms.payment_review_empty_totals();deposit_totals jsonb:=irp_pms.payment_review_empty_totals();ledger text;purpose text;kind text;recorded timestamptz;amount bigint;received bigint;refunded bigint;reduced bigint;n integer:=0;folio_count integer:=0;deposit_count integer:=0;
 identity text;identities text[]:=''{}'';previous_identity text;previous_recorded timestamptz;command jsonb;
BEGIN
 IF p_actor IS NULL OR p_role IS NULL OR p_role NOT IN(''owner'',''manager'',''staff'') OR p_generated IS NULL OR NOT isfinite(p_generated)
 OR p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366
 OR p_capture IS NULL OR jsonb_typeof(p_capture) IS DISTINCT FROM ''object'' OR NOT(p_capture?&ARRAY[''tenant_id'',''property_id'',''property'',''zone_supported'',''records''])
 OR jsonb_typeof(p_capture->''records'') IS DISTINCT FROM ''array'' THEN RAISE EXCEPTION ''Cashier report capture is incomplete'';END IF;
 tenant:=(p_capture->>''tenant_id'')::uuid;property:=(p_capture->>''property_id'')::uuid;prop:=irp_pms.payment_review_property(p_capture->''property'',(p_capture->>''zone_supported'')::boolean);zone:=prop->>''time_zone'';
 IF tenant IS NULL OR property IS NULL OR(p_capture->''property''->>''tenant_id'',prop->>''id'') IS DISTINCT FROM(tenant::text,property::text) THEN RAISE EXCEPTION ''Cashier report property scope is inconsistent'';END IF;
 start_at:=p_start::timestamp AT TIME ZONE zone;end_at:=p_end::timestamp AT TIME ZONE zone;
 IF jsonb_array_length(p_capture->''records'')>10000 THEN RAISE EXCEPTION ''Cashier activity exceeds10000 combined records; narrow the period. No rows were truncated'';END IF;
 FOR raw IN SELECT value FROM jsonb_array_elements(p_capture->''records'') LOOP
  n:=n+1;ledger:=raw->>''ledger'';
  IF ledger IS NULL OR ledger NOT IN(''folio'',''security_deposit'') OR NOT(raw?&ARRAY[''ledger'',''reservation'',''record'',''target'',''head'',''review'',''request'',''book'',''zone_supported'']) THEN RAISE EXCEPTION ''Cashier source tuple is incomplete'';END IF;
  label:=irp_pms.payment_review_booking(raw->''reservation'');
  IF(raw->''reservation''->>''tenant_id'',raw->''reservation''->>''property_id'') IS DISTINCT FROM(tenant::text,property::text) THEN RAISE EXCEPTION ''Cashier reservation scope is inconsistent'';END IF;
  IF ledger=''folio'' THEN
   folio_count:=folio_count+1;purpose:=''guest_folio'';source:=jsonb_populate_record(NULL::irp_pms.folio_entries,raw->''record'');record:=irp_pms.payment_review_source(source);
   IF(source.tenant_id,source.property_id,source.reservation_id::text) IS DISTINCT FROM(tenant,property,label->>''id'') THEN RAISE EXCEPTION ''Cashier folio source scope is inconsistent'';END IF;
   kind:=source.kind;recorded:=source.created_at;amount:=source.amount_minor;
   IF source.target_entry_id IS NULL THEN
    IF raw->''target'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''Cashier payment has an unexpected target'';END IF;
   ELSE
    target:=jsonb_populate_record(NULL::irp_pms.folio_entries,raw->''target'');
    IF(target.tenant_id,target.property_id,target.reservation_id,target.id,target.kind,target.currency) IS DISTINCT FROM(tenant,property,source.reservation_id,source.target_entry_id,''external_payment''::text,''USD''::text)
    OR target.amount_minor IS NULL OR amount>target.amount_minor THEN RAISE EXCEPTION ''Cashier refund/correction target is inconsistent'';END IF;
   END IF;
   IF kind=''payment_correction'' THEN
    IF raw->''head'' IS DISTINCT FROM ''null''::jsonb OR raw->''review'' IS DISTINCT FROM ''null''::jsonb OR raw->''request'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''A payment correction cannot have tender metadata'';END IF;
    classification:=irp_pms.payment_review_classification(''not_money_movement'');
   ELSIF raw->''head''=''null''::jsonb THEN
    IF raw->''review'' IS DISTINCT FROM ''null''::jsonb OR raw->''request'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''An unreviewed payment has unexpected review evidence'';END IF;
    classification:=irp_pms.payment_review_classification(''unreviewed'',''unknown'');
   ELSE
    head:=jsonb_populate_record(NULL::irp_pms.payment_record_review_heads,raw->''head'');review:=jsonb_populate_record(NULL::irp_pms.payment_record_reviews,raw->''review'');request:=jsonb_populate_record(NULL::irp_pms.payment_record_review_requests,raw->''request'');
    command:=irp_pms.payment_review_command(review);
    IF(head.tenant_id,head.property_id,head.reservation_id,head.entry_id,head.version,head.current_review_id,head.updated_at) IS DISTINCT FROM(tenant,property,source.reservation_id,source.id,review.to_version,review.id,review.reviewed_at)
    OR head.version IS NULL OR head.version NOT BETWEEN 1 AND 1000 OR head.created_by IS NULL OR head.created_at IS NULL OR NOT isfinite(head.created_at)
    OR(review.tenant_id,review.property_id,review.reservation_id,review.entry_id,review.from_version) IS DISTINCT FROM(tenant,property,source.reservation_id,source.id,head.version-1)
    OR review.id IS NULL OR review.request_id IS NULL OR review.actor_id IS NULL OR review.reviewed_at IS NULL OR NOT isfinite(review.reviewed_at) OR review.source_snapshot IS DISTINCT FROM record
    OR(request.tenant_id,request.property_id,request.reservation_id,request.entry_id,request.request_id,request.actor_id,request.review_id,request.outcome,request.recorded_at)
    IS DISTINCT FROM(tenant,property,source.reservation_id,source.id,review.request_id,review.actor_id,review.id,''reviewed''::text,review.reviewed_at)
    OR request.retirement_reason IS NOT NULL OR request.command IS DISTINCT FROM command OR request.result IS DISTINCT FROM irp_pms.payment_review_result(review)
    THEN RAISE EXCEPTION ''Cashier classification does not match its current head, source and immutable receipt'';END IF;
    classification:=irp_pms.payment_review_classification(''reviewed'',NULL,review);
   END IF;
  ELSE
   deposit_count:=deposit_count+1;purpose:=''refundable_security'';deposit:=jsonb_populate_record(NULL::irp_pms.security_deposit_events,raw->''record'');book:=jsonb_populate_record(NULL::irp_pms.security_deposit_books,raw->''book'');
   IF(deposit.tenant_id,deposit.property_id,deposit.reservation_id::text,deposit.currency) IS DISTINCT FROM(tenant,property,label->>''id'',''USD''::text)
   OR deposit.id IS NULL OR deposit.request_id IS NULL OR deposit.actor_id IS NULL OR deposit.amount_minor IS NULL OR deposit.amount_minor NOT BETWEEN 1 AND 999999999999
   OR deposit.kind IS NULL OR deposit.kind NOT IN(''external_receipt'',''external_refund'',''receipt_reduction'') OR deposit.recorded_at IS NULL OR NOT isfinite(deposit.recorded_at)
   OR deposit.recording_date IS NULL OR NOT isfinite(deposit.recording_date) OR deposit.recording_time_zone IS NULL OR length(deposit.recording_time_zone) NOT BETWEEN 1 AND 100 OR raw->''zone_supported'' IS DISTINCT FROM ''true''::jsonb
   OR deposit.recording_date IS DISTINCT FROM(deposit.recorded_at AT TIME ZONE deposit.recording_time_zone)::date
   OR deposit.from_version IS NULL OR deposit.from_version NOT BETWEEN 0 AND 999 OR deposit.to_version IS DISTINCT FROM deposit.from_version+1
   OR deposit.reference IS NULL OR length(deposit.reference) NOT BETWEEN 4 AND 200 OR deposit.reference IS DISTINCT FROM trim(deposit.reference) OR deposit.reference~''[[:cntrl:]]''
   OR deposit.reason IS NULL OR length(deposit.reason) NOT BETWEEN 4 AND 500 OR deposit.reason IS DISTINCT FROM trim(deposit.reason) OR deposit.reason~''[[:cntrl:]]''
   OR(book.tenant_id,book.property_id,book.id,book.reservation_id,book.currency,book.recording_time_zone) IS DISTINCT FROM(tenant,property,deposit.book_id,deposit.reservation_id,''USD''::text,deposit.recording_time_zone)
   OR book.version IS NULL OR book.version<deposit.to_version OR book.version>1000
   THEN RAISE EXCEPTION ''Cashier security-deposit source or frozen context is inconsistent'';END IF;
   kind:=deposit.kind;recorded:=deposit.recorded_at;amount:=deposit.amount_minor;
   IF kind=''external_receipt'' THEN
    IF deposit.target_event_id IS NOT NULL OR raw->''target'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''Deposit receipt has an unexpected target'';END IF;
   ELSE
    deposit_target:=jsonb_populate_record(NULL::irp_pms.security_deposit_events,raw->''target'');
    IF(deposit_target.tenant_id,deposit_target.property_id,deposit_target.book_id,deposit_target.reservation_id,deposit_target.id,deposit_target.kind,deposit_target.currency)
    IS DISTINCT FROM(tenant,property,deposit.book_id,deposit.reservation_id,deposit.target_event_id,''external_receipt''::text,''USD''::text)
    OR deposit_target.id IS NULL OR deposit_target.amount_minor IS NULL OR amount>deposit_target.amount_minor OR deposit_target.to_version IS NULL OR deposit_target.to_version>=deposit.to_version THEN RAISE EXCEPTION ''Deposit refund/reduction target is inconsistent'';END IF;
   END IF;
   IF raw->''head'' IS DISTINCT FROM ''null''::jsonb OR raw->''review'' IS DISTINCT FROM ''null''::jsonb OR raw->''request'' IS DISTINCT FROM ''null''::jsonb THEN RAISE EXCEPTION ''Deposit source cannot carry a folio review'';END IF;
   IF kind=''receipt_reduction'' THEN
    IF deposit.recorded_method IS NOT NULL THEN RAISE EXCEPTION ''A deposit record reduction has no tender'';END IF;classification:=irp_pms.payment_review_classification(''not_money_movement'');
   ELSE
    IF deposit.recorded_method IS NULL OR deposit.recorded_method NOT IN(''cash'',''card'',''bank_transfer'',''other'') THEN RAISE EXCEPTION ''Deposit method evidence is missing'';END IF;
    classification:=irp_pms.payment_review_classification(''original_deposit_method'',deposit.recorded_method);
   END IF;
   record:=jsonb_build_object(''reservation_id'',deposit.reservation_id,''id'',deposit.id,''book_id'',deposit.book_id,''request_id'',deposit.request_id,''kind'',deposit.kind,''amount_minor'',deposit.amount_minor,''currency'',deposit.currency,
    ''reference'',deposit.reference,''reason'',deposit.reason,''target_event_id'',deposit.target_event_id,''actor_id'',deposit.actor_id,''recorded_at'',deposit.recorded_at,''recorded_method'',deposit.recorded_method,
    ''recording_date'',deposit.recording_date,''recording_time_zone'',deposit.recording_time_zone,''from_version'',deposit.from_version,''to_version'',deposit.to_version);
  END IF;
  IF recorded<start_at OR recorded>=end_at THEN RAISE EXCEPTION ''Cashier source is outside the exact selected recording interval'';END IF;
  identity:=ledger||''/''||(label->>''id'')||''/''||(record->>''id'');IF identity=ANY(identities) THEN RAISE EXCEPTION ''Cashier report contains duplicate source identities'';END IF;identities:=array_append(identities,identity);
  IF previous_recorded IS NOT NULL AND(recorded,identity)<(previous_recorded,previous_identity) THEN RAISE EXCEPTION ''Cashier report source ordering is inconsistent'';END IF;previous_recorded:=recorded;previous_identity:=identity;
  received:=CASE WHEN kind IN(''external_payment'',''external_receipt'') THEN amount ELSE 0 END;refunded:=CASE WHEN kind=''external_refund'' THEN amount ELSE 0 END;reduced:=CASE WHEN kind IN(''payment_correction'',''receipt_reduction'') THEN amount ELSE 0 END;
  effects:=jsonb_build_object(''received_minor'',received,''refunded_minor'',refunded,''reduced_minor'',reduced,''external_record_effect_minor'',received-refunded,''record_balance_effect_minor'',received-refunded-reduced);
  projected_rows:=array_append(projected_rows,jsonb_build_object(''ledger'',ledger,''purpose'',purpose,''reservation'',label,''record'',record,''report_local_date'',(recorded AT TIME ZONE zone)::date,''classification'',classification,''effects'',effects));
  IF ledger=''folio'' THEN folio_totals:=irp_pms.payment_review_add_totals(folio_totals,effects,classification);ELSE deposit_totals:=irp_pms.payment_review_add_totals(deposit_totals,effects,classification);END IF;
 END LOOP;
 rows:=to_jsonb(projected_rows);
 result:=jsonb_build_object(''schema_version'',1,''tenant_id'',tenant,''property_id'',property,''actor_id'',p_actor,''role'',p_role,''can_manage'',p_role IN(''owner'',''manager''),''property'',prop,''generated_at'',p_generated,''currency'',''USD'',
 ''period'',jsonb_build_object(''start'',p_start,''end'',p_end,''end_exclusive'',true,''start_at'',start_at,''end_at'',end_at,''basis'',''recorded_timestamp_in_current_property_zone''),''rows'',rows,
 ''summary'',jsonb_build_object(''row_count'',n,''folio_row_count'',folio_count,''security_deposit_row_count'',deposit_count,''complete'',true),''totals'',jsonb_build_object(''guest_folio'',folio_totals,''refundable_security'',deposit_totals),
 ''rows_truncated'',false,''financial_effects'',irp_pms.payment_review_no_financial_effects(),''assurance'',irp_pms.payment_review_assurance(),
 ''semantics'',jsonb_build_object(''snapshot'',''current_prepared_record_activity'',''classification_basis'',''latest_review_at_preparation'',''purposes_combined'',false,''current_balances_included'',false,''cashier_session'',false,''closed'',false,''external_transactions_deduplicated'',false));
 IF octet_length(result::text)>33554432 THEN RAISE EXCEPTION ''Cashier report exceeds32MiB; narrow the selected period. No rows were truncated'';END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_cashier_activity_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;generated timestamptz;start_at timestamptz;end_at timestamptz;captured jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION ''Choose1 to366 recording dates with an exclusive end'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);generated:=clock_timestamp();start_at:=p_start::timestamp AT TIME ZONE prop.time_zone;end_at:=p_end::timestamp AT TIME ZONE prop.time_zone;
 -- REVIEW174_REPORT_CAPTURE_BEGIN: one persistent relational statement snapshot.
 WITH candidates AS MATERIALIZED(
  SELECT * FROM(
   SELECT ''folio''::text ledger,e.created_at recorded_at,e.reservation_id,e.id,e folio_row,NULL::irp_pms.security_deposit_events deposit_row FROM irp_pms.folio_entries e
   WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.kind IN(''external_payment'',''external_refund'',''payment_correction'') AND e.created_at>=start_at AND e.created_at<end_at
   UNION ALL
   SELECT ''security_deposit''::text,d.recorded_at,d.reservation_id,d.id,NULL::irp_pms.folio_entries,d FROM irp_pms.security_deposit_events d
   WHERE d.tenant_id=p_tenant AND d.property_id=p_property AND d.recorded_at>=start_at AND d.recorded_at<end_at
  ) selected ORDER BY recorded_at,ledger,reservation_id,id LIMIT 10001
 ), records AS MATERIALIZED(
  SELECT c.ledger,c.recorded_at,c.reservation_id,c.id,jsonb_build_object(''ledger'',c.ledger,''reservation'',to_jsonb(r),
   ''record'',CASE WHEN c.ledger=''folio'' THEN to_jsonb(f) ELSE to_jsonb(d) END,
   ''target'',CASE WHEN c.ledger=''folio'' AND ft.id IS NOT NULL THEN to_jsonb(ft) WHEN c.ledger=''security_deposit'' AND dt.id IS NOT NULL THEN to_jsonb(dt) END,
   ''head'',CASE WHEN h.entry_id IS NOT NULL THEN to_jsonb(h) END,''review'',CASE WHEN v.id IS NOT NULL THEN to_jsonb(v) END,''request'',CASE WHEN q.request_id IS NOT NULL THEN to_jsonb(q) END,
   ''book'',CASE WHEN b.id IS NOT NULL THEN to_jsonb(b) END,''zone_supported'',CASE WHEN d.id IS NOT NULL THEN EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=d.recording_time_zone) END) data
  FROM candidates c
  -- Keep the selected typed source row in the bounded candidate set, avoiding
  -- a second scan of its ledger. Every original source scope check remains.
  -- Each related complete scoped key has at most one match. OFFSET0
  -- keeps these parameterized lookups from flattening into property-wide
  -- joins when a newly populated property''s cardinality is underestimated.
  -- LEFT preserves a missing context so the pure validator still rejects it.
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.reservations x WHERE x.tenant_id=p_tenant AND x.property_id=p_property AND x.id=c.reservation_id OFFSET 0) r ON true
  LEFT JOIN LATERAL(SELECT (c.folio_row).* WHERE c.ledger=''folio'' AND (c.folio_row).tenant_id=p_tenant AND (c.folio_row).property_id=p_property AND (c.folio_row).reservation_id=c.reservation_id AND (c.folio_row).id=c.id OFFSET 0) f ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.folio_entries x WHERE x.tenant_id=f.tenant_id AND x.property_id=f.property_id AND x.reservation_id=f.reservation_id AND x.id=f.target_entry_id OFFSET 0) ft ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.payment_record_review_heads x WHERE x.tenant_id=f.tenant_id AND x.property_id=f.property_id AND x.reservation_id=f.reservation_id AND x.entry_id=f.id OFFSET 0) h ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.payment_record_reviews x WHERE x.tenant_id=h.tenant_id AND x.property_id=h.property_id AND x.reservation_id=h.reservation_id AND x.entry_id=h.entry_id AND x.id=h.current_review_id OFFSET 0) v ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.payment_record_review_requests x WHERE x.tenant_id=v.tenant_id AND x.property_id=v.property_id AND x.request_id=v.request_id OFFSET 0) q ON true
  LEFT JOIN LATERAL(SELECT (c.deposit_row).* WHERE c.ledger=''security_deposit'' AND (c.deposit_row).tenant_id=p_tenant AND (c.deposit_row).property_id=p_property AND (c.deposit_row).reservation_id=c.reservation_id AND (c.deposit_row).id=c.id OFFSET 0) d ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.security_deposit_books x WHERE x.tenant_id=d.tenant_id AND x.property_id=d.property_id AND x.reservation_id=d.reservation_id AND x.id=d.book_id OFFSET 0) b ON true
  LEFT JOIN LATERAL(SELECT x.* FROM irp_pms.security_deposit_events x WHERE x.tenant_id=d.tenant_id AND x.property_id=d.property_id AND x.book_id=d.book_id AND x.reservation_id=d.reservation_id AND x.id=d.target_event_id OFFSET 0) dt ON true
 )
 SELECT jsonb_build_object(''tenant_id'',p_tenant,''property_id'',p_property,''property'',to_jsonb(p),''zone_supported'',EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=p.time_zone),
 ''records'',coalesce((SELECT jsonb_agg(data ORDER BY recorded_at,ledger,reservation_id,id) FROM records),''[]''::jsonb)) INTO captured
 FROM irp_pms.properties p WHERE p.tenant_id=p_tenant AND p.id=p_property;
 -- REVIEW174_REPORT_CAPTURE_END: subsequent projection reads captured values only.
 IF captured IS NULL THEN RAISE EXCEPTION ''Unknown scoped cashier report property'';END IF;
 RETURN irp_pms.payment_review_report_projection(captured,auth.uid(),member_role,generated,p_start,p_end);
END $$;

REVOKE ALL ON FUNCTION
 irp_pms.normalize_payment_record_review(jsonb),irp_pms.payment_review_no_financial_effects(),irp_pms.payment_review_assurance(),
 irp_pms.payment_review_source(irp_pms.folio_entries),irp_pms.payment_review_json(irp_pms.payment_record_reviews),irp_pms.payment_review_command(irp_pms.payment_record_reviews),
 irp_pms.payment_review_result(irp_pms.payment_record_reviews),irp_pms.payment_review_retired_result(irp_pms.payment_record_review_requests),
 irp_pms.payment_review_property(jsonb,boolean),irp_pms.payment_review_booking(jsonb),irp_pms.payment_review_history_guard(),irp_pms.payment_review_insert_guard(),irp_pms.payment_review_consistency(),
 irp_pms.payment_review_detail_projection(jsonb,uuid,text,timestamptz),irp_pms.payment_review_classification(text,text,irp_pms.payment_record_reviews),
 irp_pms.payment_review_empty_totals(),irp_pms.payment_review_add_totals(jsonb,jsonb,jsonb),irp_pms.payment_review_report_projection(jsonb,uuid,text,timestamptz,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
 public.irp_pms_pilot_payment_record_review(uuid,uuid,uuid,uuid),
 public.irp_pms_pilot_save_payment_record_review(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,boolean),
 public.irp_pms_pilot_retire_payment_record_review_request(uuid,uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_payment_record_review_request_status(uuid,uuid,uuid),public.irp_pms_pilot_cashier_activity_report(uuid,uuid,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.irp_pms_pilot_payment_record_review(uuid,uuid,uuid,uuid),
 public.irp_pms_pilot_save_payment_record_review(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,boolean),
 public.irp_pms_pilot_retire_payment_record_review_request(uuid,uuid,uuid,uuid,uuid,jsonb,text),
 public.irp_pms_pilot_payment_record_review_request_status(uuid,uuid,uuid),public.irp_pms_pilot_cashier_activity_report(uuid,uuid,date,date)
 TO authenticated;
']);
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='202609070174';
