BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
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

CREATE TABLE irp_pms.turnover_tasks(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),room_id uuid NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 work_generation bigint NOT NULL DEFAULT 1 CHECK(work_generation BETWEEN 1 AND 9007199254740991),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','in_progress','awaiting_inspection','completed','cancelled')),
 assignee_id uuid REFERENCES auth.users(id),due_date date NOT NULL CHECK(isfinite(due_date)),
 created_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_time_zone text NOT NULL,
 creation_operating_model text NOT NULL CHECK(creation_operating_model IN('hotel','whole_home')),
 created_room_label text NOT NULL,created_room_type_id uuid NOT NULL,origin_kind text NOT NULL CHECK(origin_kind IN('checkout','room_move','manual','readiness_dirty')),
 checklist_version integer NOT NULL DEFAULT 1 CHECK(checklist_version=1),checklist jsonb NOT NULL CHECK(jsonb_typeof(checklist)='array' AND jsonb_array_length(checklist) BETWEEN 5 AND 6),
 started_at timestamptz,started_by uuid REFERENCES auth.users(id),submitted_at timestamptz,submitted_by uuid REFERENCES auth.users(id),submitted_room_version bigint,submission jsonb,
 inspected_at timestamptz,inspected_by uuid REFERENCES auth.users(id),closed_at timestamptz,closed_by uuid REFERENCES auth.users(id),close_reason text,
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,room_id) REFERENCES irp_pms.rooms(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,created_room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id),
 CHECK((started_at IS NULL)=(started_by IS NULL)),
 CHECK((submitted_at IS NULL AND submitted_by IS NULL AND submitted_room_version IS NULL AND submission IS NULL)
  OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND submitted_room_version IS NOT NULL AND submitted_room_version BETWEEN 1 AND 9007199254740991 AND submission IS NOT NULL AND jsonb_typeof(submission)='object')),
 CHECK((inspected_at IS NULL)=(inspected_by IS NULL)),
 CHECK((state IN('completed','cancelled') AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  OR (state NOT IN('completed','cancelled') AND closed_at IS NULL AND closed_by IS NULL AND close_reason IS NULL)),
 CHECK(state<>'queued' OR (started_at IS NULL AND submitted_at IS NULL AND inspected_at IS NULL)),
 CHECK(state NOT IN('in_progress','awaiting_inspection','completed') OR started_at IS NOT NULL),
 CHECK(state NOT IN('awaiting_inspection','completed') OR submitted_at IS NOT NULL),
 CHECK(state<>'completed' OR inspected_at IS NOT NULL),
 CHECK(state<>'cancelled' OR (close_reason IS NOT NULL AND length(trim(close_reason)) BETWEEN 4 AND 500 AND close_reason !~ '[[:cntrl:]]'))
);
CREATE UNIQUE INDEX irp_pms_one_open_turnover ON irp_pms.turnover_tasks(tenant_id,property_id,room_id) WHERE state NOT IN('completed','cancelled');
CREATE INDEX irp_pms_turnover_queue ON irp_pms.turnover_tasks(tenant_id,property_id,state,due_date);
CREATE TABLE irp_pms.turnover_origins(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),task_id uuid NOT NULL,
 origin_kind text NOT NULL CHECK(origin_kind IN('checkout','room_move','manual','readiness_dirty')),origin_key text NOT NULL CHECK(length(origin_key) BETWEEN 1 AND 200),
 reservation_id uuid,source_version bigint,room_state_version bigint NOT NULL CHECK(room_state_version BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES auth.users(id),recorded_at timestamptz NOT NULL,reason text NOT NULL,
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,task_id,id),UNIQUE(tenant_id,property_id,origin_kind,origin_key),
 FOREIGN KEY(tenant_id,property_id,task_id) REFERENCES irp_pms.turnover_tasks(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 CHECK((reservation_id IS NULL AND source_version IS NULL) OR (reservation_id IS NOT NULL AND source_version IS NOT NULL AND source_version BETWEEN 1 AND 9007199254740991))
);
CREATE TABLE irp_pms.turnover_events(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),task_id uuid NOT NULL,
 request_id uuid,origin_id uuid,action text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),recorded_at timestamptz NOT NULL,
 from_version bigint,to_version bigint NOT NULL,from_state text,to_state text NOT NULL,work_generation bigint NOT NULL,
 room_version_before bigint NOT NULL,room_version_after bigint NOT NULL,details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,task_id,to_version),
 FOREIGN KEY(tenant_id,property_id,task_id) REFERENCES irp_pms.turnover_tasks(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,task_id,origin_id) REFERENCES irp_pms.turnover_origins(tenant_id,property_id,task_id,id),
 CHECK(to_version BETWEEN 1 AND 9007199254740991 AND ((from_version IS NULL AND to_version=1) OR (from_version IS NOT NULL AND from_version BETWEEN 1 AND 9007199254740990 AND to_version=from_version+1))),
 CHECK(work_generation BETWEEN 1 AND 9007199254740991 AND room_version_before BETWEEN 1 AND 9007199254740991 AND room_version_after BETWEEN room_version_before AND 9007199254740991)
);
CREATE TABLE irp_pms.turnover_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,task_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,command jsonb NOT NULL CHECK(jsonb_typeof(command)='object'),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,task_id) REFERENCES irp_pms.turnover_tasks(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.turnover_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.turnover_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.turnover_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.turnover_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.turnover_tasks,irp_pms.turnover_origins,irp_pms.turnover_events,irp_pms.turnover_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.turnover_tasks,irp_pms.turnover_origins,irp_pms.turnover_events,irp_pms.turnover_requests TO service_role;

CREATE FUNCTION irp_pms.turnover_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME<>'turnover_tasks' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Turnover origins, events and request receipts are immutable; task history cannot be deleted';END IF;
 IF OLD.state IN('completed','cancelled') THEN RAISE EXCEPTION 'Completed and cancelled turnover tasks are immutable; create new work';END IF;
 IF NEW.version<>OLD.version+1 OR NEW.work_generation NOT IN(OLD.work_generation,OLD.work_generation+1) THEN RAISE EXCEPTION 'Turnover revisions must advance exactly once';END IF;
 IF NEW.work_generation<>OLD.work_generation AND NEW.state<>'queued' THEN RAISE EXCEPTION 'A new work generation must return to queued';END IF;
 IF (NEW.tenant_id,NEW.property_id,NEW.id,NEW.room_id,NEW.created_at,NEW.created_by,NEW.created_time_zone,NEW.creation_operating_model,NEW.created_room_label,NEW.created_room_type_id,NEW.origin_kind,NEW.checklist_version,NEW.checklist)
 IS DISTINCT FROM (OLD.tenant_id,OLD.property_id,OLD.id,OLD.room_id,OLD.created_at,OLD.created_by,OLD.created_time_zone,OLD.creation_operating_model,OLD.created_room_label,OLD.created_room_type_id,OLD.origin_kind,OLD.checklist_version,OLD.checklist)
 THEN RAISE EXCEPTION 'Turnover identity and creation context are immutable';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_turnover_task_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_tasks FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();
CREATE TRIGGER irp_pms_turnover_origin_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_origins FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();
CREATE TRIGGER irp_pms_turnover_event_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_events FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();
CREATE TRIGGER irp_pms_turnover_request_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();

CREATE FUNCTION irp_pms.turnover_property_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- A direct trusted service UPDATE already owns the property row lock. Do
 -- not acquire a tenant lock here in reverse order. Ordinary RPCs retain169.
 IF NEW.operating_model IS DISTINCT FROM OLD.operating_model AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=OLD.tenant_id AND c.property_id=OLD.id AND c.effective_end>c.scheduled_start AND c.effective_end>(clock_timestamp() AT TIME ZONE OLD.time_zone)::date)
 THEN RAISE EXCEPTION 'Resolve current and future maintenance closures before changing the property operating model';END IF;
 IF NEW.time_zone IS DISTINCT FROM OLD.time_zone AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=OLD.tenant_id AND c.property_id=OLD.id AND c.effective_end>c.scheduled_start AND (c.effective_end>(clock_timestamp() AT TIME ZONE OLD.time_zone)::date OR c.effective_end>(clock_timestamp() AT TIME ZONE NEW.time_zone)::date))
 THEN RAISE EXCEPTION 'Resolve maintenance closures before changing a time zone that affects their current or future dates';END IF;
 IF (NEW.time_zone IS DISTINCT FROM OLD.time_zone OR NEW.operating_model IS DISTINCT FROM OLD.operating_model)
 AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks t WHERE t.tenant_id=OLD.tenant_id AND t.property_id=OLD.id AND t.state NOT IN('completed','cancelled'))
 THEN RAISE EXCEPTION 'Resolve open turnover work before changing property time zone or operating model';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_turnover_property_guard BEFORE UPDATE ON irp_pms.properties FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_property_guard();

CREATE FUNCTION irp_pms.turnover_checklist(p_model text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT '[{"key":"linen","label":"Linen prepared"},{"key":"bathroom","label":"Bathroom cleaned"},{"key":"surfaces","label":"Surfaces cleaned"},{"key":"waste","label":"Waste removed"},{"key":"supplies","label":"Guest supplies checked"}]'::jsonb
 ||CASE WHEN p_model='whole_home' THEN '[{"key":"kitchen","label":"Kitchen cleaned and checked"}]'::jsonb ELSE '[]'::jsonb END
$$;
CREATE FUNCTION irp_pms.turnover_task_json(p_tenant uuid,p_property uuid,p_task uuid,p_business_date date) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT to_jsonb(t)-ARRAY['tenant_id','property_id']||jsonb_build_object(
  'room_label',r.label,'room_type_id',r.room_type_id,'room_type_name',rt.name,'room_state_version',r.state_version,'housekeeping',r.housekeeping,
  'assignee_label',CASE WHEN t.assignee_id IS NULL THEN NULL ELSE coalesce(u.email,t.assignee_id::text) END,
  'assignee_current_member',t.assignee_id IS NULL OR m.user_id IS NOT NULL,'occupied_reservation_id',o.id,
  'blocked_reasons',CASE WHEN o.id IS NOT NULL THEN '["occupied"]'::jsonb ELSE '[]'::jsonb END
   ||CASE WHEN irp_pms.room_is_closed(t.tenant_id,t.property_id,t.room_id,p_business_date,p_business_date+1) THEN '["maintenance_active"]'::jsonb ELSE '[]'::jsonb END
   ||CASE WHEN t.assignee_id IS NOT NULL AND m.user_id IS NULL THEN '["assignee_removed"]'::jsonb ELSE '[]'::jsonb END
   ||CASE WHEN t.state='awaiting_inspection' AND t.submitted_room_version IS DISTINCT FROM r.state_version THEN '["submission_context_changed"]'::jsonb ELSE '[]'::jsonb END,
  'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-ARRAY['tenant_id','property_id','task_id','request_id','origin_id'] ORDER BY e.to_version,e.id) FROM irp_pms.turnover_events e WHERE e.tenant_id=t.tenant_id AND e.property_id=t.property_id AND e.task_id=t.id),'[]'::jsonb))
 FROM irp_pms.turnover_tasks t JOIN irp_pms.rooms r ON r.tenant_id=t.tenant_id AND r.property_id=t.property_id AND r.id=t.room_id
 JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id
 LEFT JOIN auth.users u ON u.id=t.assignee_id LEFT JOIN irp_pms.memberships m ON m.tenant_id=t.tenant_id AND m.user_id=t.assignee_id
 LEFT JOIN irp_pms.reservations o ON o.tenant_id=t.tenant_id AND o.property_id=t.property_id AND o.physical_room_id=t.room_id AND o.status='In house'
 WHERE t.tenant_id=p_tenant AND t.property_id=p_property AND t.id=p_task
$$;

CREATE FUNCTION irp_pms.turnover_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;prop irp_pms.properties;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.room_id;
 IF room.id IS NULL OR prop.id IS NULL OR NEW.version<>1 OR NEW.work_generation<>1 OR NEW.state<>'queued'
 OR (NEW.created_room_label,NEW.created_room_type_id,NEW.created_time_zone,NEW.creation_operating_model,NEW.checklist)
 IS DISTINCT FROM (room.label,room.room_type_id,prop.time_zone,prop.operating_model,irp_pms.turnover_checklist(prop.operating_model))
 THEN RAISE EXCEPTION 'Turnover creation snapshot must match the scoped room and property';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_turnover_snapshot_guard BEFORE INSERT ON irp_pms.turnover_tasks FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_snapshot_guard();
REVOKE ALL ON FUNCTION irp_pms.turnover_snapshot_guard() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION irp_pms.turnover_history_guard(),irp_pms.turnover_property_guard(),irp_pms.turnover_checklist(text),irp_pms.turnover_task_json(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
-- Callers hold tenant SHARE and property UPDATE before entering this helper.
-- Lifecycle parents own the reservation and room locks already. Never take
-- tenant/property locks here in reverse order. Origin identity is immutable.
CREATE FUNCTION irp_pms.enqueue_turnover(p_tenant uuid,p_property uuid,p_room uuid,p_origin_kind text,p_origin_key text,p_reservation uuid,p_source_version bigint,p_actor uuid,p_recorded_at timestamptz,p_reason text,p_due_date date DEFAULT NULL,p_assignee uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;room irp_pms.rooms;task irp_pms.turnover_tasks;before_task irp_pms.turnover_tasks;origin uuid;prior_task uuid;before_room_version bigint;business_date date;event_action text;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped turnover room';END IF;
 SELECT task_id INTO prior_task FROM irp_pms.turnover_origins WHERE tenant_id=p_tenant AND property_id=p_property AND origin_kind=p_origin_kind AND origin_key=p_origin_key;
 IF FOUND THEN RETURN prior_task;END IF;
 IF p_origin_kind IS NULL OR p_origin_kind NOT IN('checkout','room_move','manual','readiness_dirty') OR p_actor IS NULL OR p_recorded_at IS NULL THEN RAISE EXCEPTION 'Invalid turnover origin';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status='In house') THEN RAISE EXCEPTION 'Occupied rooms cannot begin vacancy turnover work';END IF;
 business_date:=(p_recorded_at AT TIME ZONE prop.time_zone)::date;before_room_version:=room.state_version;
 SELECT * INTO before_task FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_room AND state NOT IN('completed','cancelled') FOR UPDATE;
 -- Checkout/move already advance the occupancy revision. Explicit manual
 -- Dirty invalidates an old review even when the room was already Dirty.
 UPDATE irp_pms.rooms SET housekeeping='Dirty',state_version=state_version+CASE WHEN housekeeping='Dirty' AND p_origin_kind IN('manual','readiness_dirty') THEN 1 ELSE 0 END WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 IF before_task.id IS NULL THEN
  INSERT INTO irp_pms.turnover_tasks(tenant_id,property_id,room_id,assignee_id,due_date,created_at,created_by,created_time_zone,creation_operating_model,created_room_label,created_room_type_id,origin_kind,checklist)
  VALUES(p_tenant,p_property,p_room,p_assignee,coalesce(p_due_date,business_date),p_recorded_at,p_actor,prop.time_zone,prop.operating_model,room.label,room.room_type_id,p_origin_kind,irp_pms.turnover_checklist(prop.operating_model)) RETURNING * INTO task;
  event_action:='created';
 ELSE
  UPDATE irp_pms.turnover_tasks SET version=version+1,work_generation=work_generation+1,state='queued',started_at=NULL,started_by=NULL,submitted_at=NULL,submitted_by=NULL,submitted_room_version=NULL,submission=NULL,inspected_at=NULL,inspected_by=NULL
  WHERE tenant_id=p_tenant AND property_id=p_property AND id=before_task.id RETURNING * INTO task;
  event_action:='origin_reset';
 END IF;
 INSERT INTO irp_pms.turnover_origins(tenant_id,property_id,task_id,origin_kind,origin_key,reservation_id,source_version,room_state_version,actor_id,recorded_at,reason)
 VALUES(p_tenant,p_property,task.id,p_origin_kind,p_origin_key,p_reservation,p_source_version,room.state_version,p_actor,p_recorded_at,p_reason) RETURNING id INTO origin;
 INSERT INTO irp_pms.turnover_events(tenant_id,property_id,task_id,origin_id,action,actor_id,recorded_at,from_version,to_version,from_state,to_state,work_generation,room_version_before,room_version_after,details)
 VALUES(p_tenant,p_property,task.id,origin,event_action,p_actor,p_recorded_at,before_task.version,task.version,before_task.state,task.state,task.work_generation,before_room_version,room.state_version,
 jsonb_build_object('origin_kind',p_origin_kind,'origin_key',p_origin_key,'reservation_id',p_reservation,'source_version',p_source_version,'reason',p_reason,'due_date',task.due_date,'assignee_id',task.assignee_id));
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,p_actor,'turnover_'||event_action,task.id,jsonb_build_object('room_id',p_room,'origin_id',origin,'origin_kind',p_origin_kind,'version',task.version,'work_generation',task.work_generation));
 RETURN task.id;
END $$;
REVOKE ALL ON FUNCTION irp_pms.enqueue_turnover(uuid,uuid,uuid,text,text,uuid,bigint,uuid,timestamptz,text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_create_turnover(p_tenant uuid,p_property uuid,p_room uuid,p_request uuid,p_expected_room_version bigint,p_expected_business_date date,p_due_date date,p_assignee uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;room irp_pms.rooms;prior irp_pms.turnover_requests;command jsonb;result jsonb;task_id uuid;business_date date;recorded timestamptz;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_room IS NULL OR p_request IS NULL OR p_expected_room_version IS NULL OR p_expected_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR NOT isfinite(p_expected_business_date) OR p_due_date IS NULL OR NOT isfinite(p_due_date) OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide a room, request, expected revision, business and due dates, and a 4 to 500 character reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 command:=jsonb_build_object('room_id',p_room,'expected_room_version',p_expected_room_version,'expected_business_date',p_expected_business_date,'due_date',p_due_date,'assignee_id',p_assignee,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.turnover_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.action<>'create_turnover' OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Turnover request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped physical room';END IF;
 IF room.state_version<>p_expected_room_version THEN RAISE EXCEPTION 'Room state changed; refresh before creating turnover' USING ERRCODE='PT409';END IF;
 recorded:=clock_timestamp();business_date:=(recorded AT TIME ZONE prop.time_zone)::date;
 IF business_date<>p_expected_business_date THEN RAISE EXCEPTION 'Property business date changed; review turnover again' USING ERRCODE='PT412';END IF;
 IF p_due_date<business_date OR p_due_date>business_date+366 THEN RAISE EXCEPTION 'Turnover due date must be today or within the next 366 days';END IF;
 IF p_assignee IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=p_assignee) OR (member_role='staff' AND p_assignee<>auth.uid())) THEN RAISE EXCEPTION 'Choose an eligible assignee; staff can assign new work only to themselves';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_room AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'This room already has open turnover work; review that task';END IF;
 task_id:=irp_pms.enqueue_turnover(p_tenant,p_property,p_room,'manual',p_request::text,NULL,NULL,auth.uid(),recorded,trim(p_reason),p_due_date,p_assignee);
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room;
 result:=jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'action','create_turnover','task',irp_pms.turnover_task_json(p_tenant,p_property,task_id,business_date),'room',jsonb_build_object('id',room.id,'state_version',room.state_version,'housekeeping',room.housekeeping),'business_date',business_date,'room_state_changed',room.state_version<>p_expected_room_version,'financial_changed',false,'configured_capacity_changed',false,'replayed',false);
 INSERT INTO irp_pms.turnover_requests(tenant_id,property_id,request_id,task_id,actor_id,action,command,result) VALUES(p_tenant,p_property,p_request,task_id,auth.uid(),'create_turnover',command,result);
 RETURN result;
END $$;
CREATE FUNCTION public.irp_pms_pilot_turnover_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.turnover_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A request identity is required';END IF;
 SELECT * INTO prior FROM irp_pms.turnover_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action',prior.action,'result',prior.result);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_create_turnover(uuid,uuid,uuid,uuid,bigint,date,date,uuid,text),public.irp_pms_pilot_turnover_request_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_create_turnover(uuid,uuid,uuid,uuid,bigint,date,date,uuid,text),public.irp_pms_pilot_turnover_request_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_update_turnover(p_tenant uuid,p_property uuid,p_task uuid,p_request uuid,p_expected_task_version bigint,p_expected_room_version bigint,p_expected_business_date date,p_action text,p_details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;manager_action boolean;prop irp_pms.properties;room irp_pms.rooms;task irp_pms.turnover_tasks;previous irp_pms.turnover_tasks;prior irp_pms.turnover_requests;
 command jsonb;details jsonb;result jsonb;recorded timestamptz;business_date date;reason text;note text;assignee uuid;due date;checks jsonb;required_checks jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('assign','set_due_date','start','submit_cleaning','approve_inspection','return_for_cleaning','cancel') THEN RAISE EXCEPTION 'Unknown turnover action';END IF;
 manager_action:=p_action IN('assign','set_due_date','approve_inspection','return_for_cleaning','cancel');
 member_role:=irp_pms.pilot_require(p_tenant,p_property,manager_action);
 IF p_task IS NULL OR p_request IS NULL OR p_expected_task_version IS NULL OR p_expected_task_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_room_version IS NULL OR p_expected_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR NOT isfinite(p_expected_business_date) OR p_details IS NULL OR jsonb_typeof(p_details)<>'object' THEN RAISE EXCEPTION 'Provide task and request identities, reviewed versions and business date, and action details';END IF;
 details:=p_details;
 IF p_action IN('assign','set_due_date','return_for_cleaning','cancel') THEN
  IF jsonb_typeof(details->'reason') IS DISTINCT FROM 'string' OR length(trim(details->>'reason')) NOT BETWEEN 4 AND 500 OR details->>'reason'~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide a 4 to 500 character reason without controls';END IF;
  reason:=trim(details->>'reason');details:=jsonb_set(details,'{reason}',to_jsonb(reason));
 END IF;
 IF p_action IN('submit_cleaning','approve_inspection') THEN
  IF details ? 'note' AND jsonb_typeof(details->'note') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'The optional note must be text';END IF;
  note:=coalesce(details->>'note','');
  IF length(note)>1000 OR translate(note,E'\n\t','')~'[[:cntrl:]]' THEN RAISE EXCEPTION 'The note must be at most 1000 characters without unsupported controls';END IF;
  details:=details||jsonb_build_object('note',note);
 END IF;
 IF p_action='assign' THEN
  IF details-ARRAY['assignee_id','reason']<>'{}'::jsonb OR NOT(details ? 'assignee_id') OR jsonb_typeof(details->'assignee_id') NOT IN('null','string') THEN RAISE EXCEPTION 'Assignment requires only assignee_id and reason';END IF;
  assignee:=(details->>'assignee_id')::uuid;details:=details||jsonb_build_object('assignee_id',assignee);
 ELSIF p_action='set_due_date' THEN
  IF details-ARRAY['due_date','reason']<>'{}'::jsonb OR jsonb_typeof(details->'due_date') IS DISTINCT FROM 'string' OR details->>'due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Due date requires only an ISO due_date and reason';END IF;
  due:=(details->>'due_date')::date;IF NOT isfinite(due) THEN RAISE EXCEPTION 'Due date must be finite';END IF;
 ELSIF p_action='start' THEN
  IF details<>'{}'::jsonb THEN RAISE EXCEPTION 'Start does not accept extra details';END IF;
 ELSIF p_action='submit_cleaning' THEN
  IF details-ARRAY['checklist','note']<>'{}'::jsonb OR jsonb_typeof(details->'checklist') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Submit the checklist and optional note only';END IF;
 ELSIF p_action='approve_inspection' THEN
  IF details-ARRAY['work_reviewed','room_ready','note']<>'{}'::jsonb OR details->'work_reviewed' IS DISTINCT FROM 'true'::jsonb OR details->'room_ready' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Confirm both work reviewed and room ready before approval';END IF;
 ELSE
  IF details-ARRAY['reason']<>'{}'::jsonb THEN RAISE EXCEPTION 'This action accepts only a reason';END IF;
 END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property,manager_action);
 command:=jsonb_build_object('task_id',p_task,'expected_task_version',p_expected_task_version,'expected_room_version',p_expected_room_version,'expected_business_date',p_expected_business_date,'action',p_action,'details',details);
 SELECT * INTO prior FROM irp_pms.turnover_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.action<>p_action OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Turnover request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 -- Read the scoped immutable room identity before locking; the property lock
 -- serializes supported task writers. Always acquire room before task.
 SELECT * INTO task FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_task;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped turnover task';END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=task.room_id FOR UPDATE;
 SELECT * INTO task FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_task FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property,manager_action);
 IF room.state_version<>p_expected_room_version OR task.version<>p_expected_task_version THEN RAISE EXCEPTION 'Room or turnover changed; refresh and review the action' USING ERRCODE='PT409';END IF;
 recorded:=clock_timestamp();business_date:=(recorded AT TIME ZONE prop.time_zone)::date;
 IF business_date<>p_expected_business_date THEN RAISE EXCEPTION 'Property business date changed; review turnover again' USING ERRCODE='PT412';END IF;
 IF task.state IN('completed','cancelled') THEN RAISE EXCEPTION 'This turnover is closed; create new work when needed';END IF;
 IF task.version>=9007199254740991 OR (SELECT count(*) FROM irp_pms.turnover_events WHERE tenant_id=p_tenant AND property_id=p_property AND task_id=p_task)>=50000 THEN RAISE EXCEPTION 'Turnover history limit reached';END IF;
 IF p_action IN('start','submit_cleaning') AND member_role='staff' AND task.assignee_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Staff can work only on their assigned turnover';END IF;
 IF p_action IN('start','submit_cleaning','approve_inspection') THEN
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=task.room_id AND status='In house') THEN RAISE EXCEPTION 'The room is physically occupied; resolve the stay first';END IF;
  IF irp_pms.room_is_closed(p_tenant,p_property,task.room_id,business_date,business_date+1) THEN RAISE EXCEPTION 'Resolve the active maintenance closure before cleaning or inspection';END IF;
 END IF;
 previous:=task;
 IF p_action='assign' THEN
  IF task.assignee_id IS NOT DISTINCT FROM assignee THEN RAISE EXCEPTION 'Choose a different assignee';END IF;
  IF assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=assignee) THEN RAISE EXCEPTION 'Assignee is no longer a current organization member';END IF;
  task.assignee_id:=assignee;
 ELSIF p_action='set_due_date' THEN
  IF task.due_date=due OR due<business_date OR due>business_date+366 THEN RAISE EXCEPTION 'Choose a different due date, today or within the next 366 days';END IF;
  task.due_date:=due;
 ELSIF p_action='start' THEN
  IF task.state<>'queued' OR room.housekeeping<>'Dirty' THEN RAISE EXCEPTION 'Start requires queued work and a Dirty room';END IF;
  task.state:='in_progress';task.started_at:=recorded;task.started_by:=auth.uid();
 ELSIF p_action='submit_cleaning' THEN
  IF task.state<>'in_progress' OR room.housekeeping<>'Dirty' THEN RAISE EXCEPTION 'Submit cleaning only after starting work on a Dirty room';END IF;
  SELECT jsonb_object_agg(x->>'key',true) INTO required_checks FROM jsonb_array_elements(task.checklist) x;
  IF details->'checklist' IS DISTINCT FROM required_checks THEN RAISE EXCEPTION 'Complete every item in the saved cleaning checklist without extra items';END IF;
  UPDATE irp_pms.rooms SET housekeeping='Inspect' WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:='awaiting_inspection';task.submitted_at:=recorded;task.submitted_by:=auth.uid();task.submitted_room_version:=room.state_version;task.submission:=details;
 ELSIF p_action='approve_inspection' THEN
  IF task.state<>'awaiting_inspection' OR room.housekeeping<>'Inspect' THEN RAISE EXCEPTION 'Inspection requires submitted cleaning and an Inspect room';END IF;
  IF task.submitted_room_version IS DISTINCT FROM room.state_version THEN RAISE EXCEPTION 'Room context changed after cleaning was submitted; return work for cleaning confirmation';END IF;
  UPDATE irp_pms.rooms SET housekeeping='Clean' WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:='completed';task.inspected_at:=recorded;task.inspected_by:=auth.uid();task.closed_at:=recorded;task.closed_by:=auth.uid();
 ELSIF p_action='return_for_cleaning' THEN
  IF task.state NOT IN('in_progress','awaiting_inspection') THEN RAISE EXCEPTION 'Only started or submitted work can return for cleaning';END IF;
  UPDATE irp_pms.rooms SET housekeeping='Dirty',state_version=state_version+1 WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:='queued';task.work_generation:=task.work_generation+1;task.started_at:=NULL;task.started_by:=NULL;task.submitted_at:=NULL;task.submitted_by:=NULL;task.submitted_room_version:=NULL;task.submission:=NULL;task.inspected_at:=NULL;task.inspected_by:=NULL;
 ELSE
  UPDATE irp_pms.rooms SET housekeeping='Dirty',state_version=state_version+1 WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:='cancelled';task.closed_at:=recorded;task.closed_by:=auth.uid();task.close_reason:=reason;
 END IF;
 UPDATE irp_pms.turnover_tasks SET version=version+1,work_generation=task.work_generation,state=task.state,assignee_id=task.assignee_id,due_date=task.due_date,started_at=task.started_at,started_by=task.started_by,submitted_at=task.submitted_at,submitted_by=task.submitted_by,submitted_room_version=task.submitted_room_version,submission=task.submission,inspected_at=task.inspected_at,inspected_by=task.inspected_by,closed_at=task.closed_at,closed_by=task.closed_by,close_reason=task.close_reason
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_task RETURNING * INTO task;
 INSERT INTO irp_pms.turnover_events(tenant_id,property_id,task_id,request_id,action,actor_id,recorded_at,from_version,to_version,from_state,to_state,work_generation,room_version_before,room_version_after,details)
 VALUES(p_tenant,p_property,p_task,p_request,p_action,auth.uid(),recorded,previous.version,task.version,previous.state,task.state,task.work_generation,p_expected_room_version,room.state_version,details);
 result:=jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'action',p_action,'task',irp_pms.turnover_task_json(p_tenant,p_property,p_task,business_date),'room',jsonb_build_object('id',room.id,'state_version',room.state_version,'housekeeping',room.housekeeping),'business_date',business_date,'room_state_changed',room.state_version<>p_expected_room_version,'financial_changed',false,'configured_capacity_changed',false,'replayed',false);
 INSERT INTO irp_pms.turnover_requests(tenant_id,property_id,request_id,task_id,actor_id,action,command,result) VALUES(p_tenant,p_property,p_request,p_task,auth.uid(),p_action,command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'turnover_'||p_action,p_task,command||jsonb_build_object('request_id',p_request,'version',task.version,'work_generation',task.work_generation,'room_version_after',room.state_version));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_update_turnover(uuid,uuid,uuid,uuid,bigint,bigint,date,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_update_turnover(uuid,uuid,uuid,uuid,bigint,bigint,date,text,jsonb) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_turnovers(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;business_date date;generated timestamptz;task_ids uuid[];opened jsonb;closed jsonb;assignees jsonb;projected jsonb;demand jsonb;summary jsonb;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read turnover for 1 to 366 days with an exclusive end date';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 generated:=clock_timestamp();business_date:=(generated AT TIME ZONE prop.time_zone)::date;
 IF (SELECT count(*) FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN('completed','cancelled'))>1000
 OR (SELECT count(*) FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state IN('completed','cancelled') AND (closed_at AT TIME ZONE prop.time_zone)::date>=p_start AND (closed_at AT TIME ZONE prop.time_zone)::date<p_end)>5000
 OR (SELECT count(*) FROM irp_pms.memberships WHERE tenant_id=p_tenant)>1000
 OR (SELECT count(*) FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND status IN('Confirmed','In house') AND (departure>=p_start AND departure<p_end OR status='In house' AND departure<business_date OR status='Confirmed' AND arrival>=p_start AND arrival<p_end))>10000
 THEN RAISE EXCEPTION 'Turnover queue is too large for this period or property; narrow the read scope';END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO task_ids FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND (state NOT IN('completed','cancelled') OR (closed_at AT TIME ZONE prop.time_zone)::date>=p_start AND (closed_at AT TIME ZONE prop.time_zone)::date<p_end);
 IF (SELECT count(*) FROM irp_pms.turnover_events WHERE tenant_id=p_tenant AND property_id=p_property AND task_id=ANY(task_ids))>50000 THEN RAISE EXCEPTION 'Turnover event history is too large; narrow the read scope';END IF;
 SELECT coalesce(jsonb_agg(irp_pms.turnover_task_json(p_tenant,p_property,id,business_date) ORDER BY due_date,created_at,id),'[]'::jsonb) INTO opened FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=ANY(task_ids) AND state NOT IN('completed','cancelled');
 SELECT coalesce(jsonb_agg(irp_pms.turnover_task_json(p_tenant,p_property,id,business_date) ORDER BY closed_at DESC,id),'[]'::jsonb) INTO closed FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=ANY(task_ids) AND state IN('completed','cancelled');
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'label',coalesce(u.email,m.user_id::text),'role',m.role,'is_self',m.user_id=auth.uid()) ORDER BY coalesce(u.email,m.user_id::text),m.user_id),'[]'::jsonb) INTO assignees FROM irp_pms.memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.tenant_id=p_tenant;
 SELECT coalesce(jsonb_agg(jsonb_build_object('reservation_id',r.id,'room_id',r.physical_room_id,'room_label',room.label,'room_type_id',r.room_type_id,'room_type_name',rt.name,'guest_name',r.guest_name,'status',r.status,'scheduled_departure',r.departure,'checked_out_at',NULL,'physically_occupied',r.status='In house' AND r.physical_room_id IS NOT NULL,'projection_only',true) ORDER BY r.departure,r.id),'[]'::jsonb) INTO projected
 FROM irp_pms.reservations r JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id LEFT JOIN irp_pms.rooms room ON room.tenant_id=r.tenant_id AND room.property_id=r.property_id AND room.id=r.physical_room_id
 WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status IN('Confirmed','In house') AND (r.departure>=p_start AND r.departure<p_end OR r.status='In house' AND r.departure<business_date);
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.stay_date,a.room_type_name,a.room_type_id),'[]'::jsonb) INTO demand FROM (
 SELECT r.arrival stay_date,r.room_type_id,rt.name room_type_name,count(*) confirmed_arrivals,count(*) FILTER(WHERE r.physical_room_id IS NOT NULL) assigned_arrivals
 FROM irp_pms.reservations r JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id
 WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status='Confirmed' AND r.arrival>=p_start AND r.arrival<p_end GROUP BY r.arrival,r.room_type_id,rt.name) a;
 IF jsonb_array_length(projected)+jsonb_array_length(demand)>10000 THEN RAISE EXCEPTION 'Turnover projection output is too large; narrow the read scope';END IF;
 SELECT jsonb_build_object('open',count(*),'queued',count(*) FILTER(WHERE x->>'state'='queued'),'in_progress',count(*) FILTER(WHERE x->>'state'='in_progress'),'awaiting_inspection',count(*) FILTER(WHERE x->>'state'='awaiting_inspection'),
 'due_today',count(*) FILTER(WHERE (x->>'due_date')::date=business_date),'overdue',count(*) FILTER(WHERE (x->>'due_date')::date<business_date),'blocked_occupied',count(*) FILTER(WHERE x->'blocked_reasons' ? 'occupied'),'blocked_maintenance',count(*) FILTER(WHERE x->'blocked_reasons' ? 'maintenance_active'),'invalid_assignee',count(*) FILTER(WHERE x->'blocked_reasons' ? 'assignee_removed'),
 'completed_in_period',(SELECT count(*) FROM jsonb_array_elements(closed) y WHERE y->>'state'='completed'),'cancelled_in_period',(SELECT count(*) FROM jsonb_array_elements(closed) y WHERE y->>'state'='cancelled')) INTO summary FROM jsonb_array_elements(opened) x;
 RETURN jsonb_build_object('property_id',p_property,'time_zone',prop.time_zone,'business_date',business_date,'role',member_role,'can_manage',member_role IN('owner','manager'),'generated_at',generated,'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true),'open_tasks',opened,'closed_tasks',closed,'eligible_assignees',assignees,'projected_departures',projected,'arrival_demand',demand,'summary',summary,
 'definitions',jsonb_build_object('departure_projection','Scheduled departures are planning information. Turnover starts only after actual checkout, room move, or an explicit vacant-room request.','ready','A vacant room becomes Clean only after submitted cleaning and manager inspection. Maintenance and open turnover continue to block physical arrival.','automation','No scheduled dispatch, external cleaner notification, or message is sent.','financial','Cleaning tasks do not post cleaning fees, change reservation prices, or reduce configured nightly capacity.'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_turnovers(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_turnovers(uuid,uuid,date,date) TO authenticated;
-- Frozen-source forward definitions follow.
-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_stay_action(p_tenant uuid,p_property uuid,p_reservation uuid,p_action text,p_room uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; res irp_pms.reservations; room irp_pms.rooms; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reservation'; END IF;
 IF p_action='check_in' THEN
  IF res.status='In house' AND res.physical_room_id=p_room THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'Confirmed' OR business_date<res.arrival OR business_date>=res.departure THEN RAISE EXCEPTION 'Reservation cannot check in on this business date'; END IF;
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
  IF NOT FOUND OR room.room_type_id IS DISTINCT FROM res.room_type_id OR room.housekeeping<>'Clean' THEN RAISE EXCEPTION 'A clean room of the booked type is required'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_room AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Physical room has unfinished turnover work';END IF;
  IF irp_pms.room_is_closed(p_tenant,p_property,p_room,business_date,res.departure) THEN RAISE EXCEPTION 'Physical room has a maintenance closure during the remaining stay'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND id<>res.id AND status='In house') THEN RAISE EXCEPTION 'Physical room is occupied'; END IF;
  UPDATE irp_pms.reservations SET status='In house',physical_room_id=p_room,checked_in_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 ELSIF p_action='check_out' THEN
  IF res.status='Checked out' THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'In house' OR business_date<res.arrival THEN RAISE EXCEPTION 'Only an in-house reservation can check out'; END IF;
  UPDATE irp_pms.reservations SET status='Checked out',checked_out_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
  IF res.physical_room_id IS NOT NULL THEN
   PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,res.physical_room_id,'checkout',res.id::text,res.id,res.source_version,auth.uid(),res.checked_out_at,'Actual guest checkout');
  END IF;
 ELSIF p_action='cancel' THEN
  RAISE EXCEPTION 'Cancellation now requires review; use irp_pms_pilot_cancellation_preview and irp_pms_pilot_cancel_reservation';
 ELSE RAISE EXCEPTION 'Unknown stay action';
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),p_action,res.id);
 RETURN to_jsonb(res);
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_move_room(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_from_room uuid,p_expected_from_room_version bigint,p_to_room uuid,p_expected_to_room_version bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;res irp_pms.reservations;old_room irp_pms.rooms;new_room irp_pms.rooms;prior irp_pms.room_move_requests;command jsonb;result jsonb;business_date date;moved_at timestamptz;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_from_room IS NULL OR p_to_room IS NULL OR p_from_room=p_to_room OR p_expected_source_version IS NULL OR p_expected_source_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_from_room_version IS NULL OR p_expected_from_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_to_room_version IS NULL OR p_expected_to_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide distinct scoped rooms, expected stay and room versions, a request and a4 to500 character reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('reservation_id',p_reservation,'source_version',p_expected_source_version,'from_room_id',p_from_room,'from_room_version',p_expected_from_room_version,'to_room_id',p_to_room,'to_room_version',p_expected_to_room_version,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.room_move_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Room move request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF prop.operating_model<>'hotel' THEN RAISE EXCEPTION 'Whole-home properties have one exclusive unit and cannot move rooms';END IF;
 moved_at:=clock_timestamp();business_date:=(moved_at AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 IF res.source_version<>p_expected_source_version OR res.physical_room_id IS DISTINCT FROM p_from_room THEN RAISE EXCEPTION 'Stay assignment or source version changed; refresh before moving' USING ERRCODE='PT409';END IF;
 IF res.status<>'In house' OR res.arrival>business_date THEN RAISE EXCEPTION 'Only a currently in-house stay can move rooms';END IF;
 -- Same stable room ordering as156 occupancy revision. The property lock also
 -- serializes legacy check-in/out, housekeeping, bookings and all room moves.
 PERFORM 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id IN(p_from_room,p_to_room) ORDER BY id FOR UPDATE;
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped origin room';END IF;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped destination room';END IF;
 IF old_room.state_version<>p_expected_from_room_version OR new_room.state_version<>p_expected_to_room_version THEN RAISE EXCEPTION 'Room state changed; refresh before moving' USING ERRCODE='PT409';END IF;
 IF old_room.room_type_id IS DISTINCT FROM res.room_type_id OR new_room.room_type_id IS DISTINCT FROM res.room_type_id THEN RAISE EXCEPTION 'Both rooms must match the booked room type';END IF;
 IF new_room.housekeeping<>'Clean' THEN RAISE EXCEPTION 'The destination room must be Clean';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_to_room AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Destination room has unfinished turnover work';END IF;
 IF irp_pms.room_is_closed(p_tenant,p_property,p_to_room,business_date,CASE WHEN res.departure<business_date THEN NULL ELSE greatest(res.departure,business_date+1) END) THEN RAISE EXCEPTION 'Destination room has a maintenance closure during the remaining stay';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id IN(p_from_room,p_to_room) AND r.status='In house') THEN RAISE EXCEPTION 'A selected room is occupied by another in-house stay';END IF;
 -- A due-out guest still physically occupies today's room until checkout.
 -- An overdue stay has no resolved end, so all future assignments conflict.
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id=p_to_room AND r.status='Confirmed' AND r.departure>business_date AND (res.departure<business_date OR r.arrival<greatest(res.departure,business_date+1))) THEN RAISE EXCEPTION 'Destination room has an overlapping assigned reservation';END IF;
 UPDATE irp_pms.reservations SET physical_room_id=p_to_room WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,p_from_room,'room_move',p_request::text,res.id,res.source_version,auth.uid(),moved_at,trim(p_reason));
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 result:=jsonb_build_object('request_id',p_request,'reservation',to_jsonb(res),'from_room',to_jsonb(old_room),'to_room',to_jsonb(new_room),'business_date',business_date,'moved_at',moved_at,'source_version_retained',true,'pricing_changed',false,'folio_changed',false,'replayed',false);
 INSERT INTO irp_pms.room_move_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'room_moved',p_reservation,command||jsonb_build_object('request_id',p_request,'from_room_version_after',old_room.state_version,'to_room_version_after',new_room.state_version,'business_date',business_date,'moved_at',moved_at));
 RETURN result;
END $$;

-- Forward from 202609070168_iratepilot_pms_operational_authorization.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_housekeeping(p_tenant uuid,p_property uuid,p_room uuid,p_request uuid,p_expected_version bigint,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;prior irp_pms.housekeeping_requests;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_room IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_status IS NULL OR p_status NOT IN('Clean','Dirty','Inspect') THEN RAISE EXCEPTION 'Room, request, expected state version and housekeeping status are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 -- Recheck membership after a possible lock wait before applying a new action.
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.housekeeping_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.room_id IS DISTINCT FROM p_room OR prior.expected_version IS DISTINCT FROM p_expected_version OR prior.requested_status IS DISTINCT FROM p_status THEN RAISE EXCEPTION 'Housekeeping request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_status IN('Clean','Inspect') THEN RAISE EXCEPTION 'Use turnover cleaning and manager inspection to mark a room ready';END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped physical room'; END IF;
 IF room.state_version<>p_expected_version THEN RAISE EXCEPTION 'Room state changed; refresh before updating housekeeping' USING ERRCODE='PT409'; END IF;
 IF p_status IN('Clean','Inspect') AND EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status='In house') THEN RAISE EXCEPTION 'Occupied room cannot be marked ready'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status='In house') THEN
  UPDATE irp_pms.rooms SET housekeeping=p_status WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 ELSE
  PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,p_room,'readiness_dirty',p_request::text,NULL,NULL,auth.uid(),clock_timestamp(),'Room explicitly marked Dirty');
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room;
 END IF;
 result:=jsonb_build_object('room',to_jsonb(room),'request_id',p_request,'replayed',false);
 INSERT INTO irp_pms.housekeeping_requests(tenant_id,property_id,request_id,room_id,actor_id,expected_version,requested_status,result) VALUES(p_tenant,p_property,p_request,p_room,auth.uid(),p_expected_version,p_status,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'housekeeping_updated',p_room,jsonb_build_object('status',p_status,'previous_version',p_expected_version,'state_version',room.state_version,'request_id',p_request));
 RETURN result;
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_workspace(p_tenant uuid,p_property uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 IF (SELECT count(*) FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND c.effective_end>business_date)>10000 THEN RAISE EXCEPTION 'Too many active or future maintenance intervals for this workspace'; END IF;
 RETURN jsonb_build_object('property',to_jsonb(prop),'role',member_role,'business_date',business_date,'overdue_policy','block_future_until_resolved',
 'room_types',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM irp_pms.room_types r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'rooms',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('open_turnover_task',(SELECT jsonb_build_object('id',t.id,'version',t.version,'state',t.state) FROM irp_pms.turnover_tasks t WHERE t.tenant_id=r.tenant_id AND t.property_id=r.property_id AND t.room_id=r.id AND t.state NOT IN('completed','cancelled')),'maintenance_intervals',coalesce((SELECT jsonb_agg(jsonb_build_object('closure_id',m.id,'start',m.scheduled_start,'end',m.effective_end,'end_exclusive',true) ORDER BY m.scheduled_start,m.id) FROM irp_pms.room_closures m WHERE m.tenant_id=r.tenant_id AND m.property_id=r.property_id AND m.room_id=r.id AND m.effective_end>m.scheduled_start AND m.effective_end>business_date),'[]'::jsonb)) ORDER BY r.label) FROM irp_pms.rooms r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.status='In house' AND r.departure<business_date) ORDER BY r.arrival,r.id) FROM irp_pms.reservations r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'capacity',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('configured_units',m.configured_units,'physical_units',m.physical_units,'closed_units',m.closed_units,'effective_units',m.effective_units,'reserved_units',u.used,'available_units',CASE WHEN m.effective_units IS NULL THEN NULL ELSE greatest(0,m.effective_units-u.used) END,'shortfall_units',CASE WHEN m.effective_units IS NULL THEN NULL ELSE greatest(0,u.used-m.effective_units) END,'overdue_units',u.overdue) ORDER BY c.stay_date,c.room_type_id) FROM irp_pms.nightly_capacity c CROSS JOIN LATERAL irp_pms.maintenance_capacity(c.tenant_id,c.property_id,c.room_type_id,c.stay_date) m CROSS JOIN LATERAL (SELECT count(*)::integer used,count(*) FILTER(WHERE r.status='In house' AND r.departure<business_date)::integer overdue FROM irp_pms.reservations r WHERE r.tenant_id=c.tenant_id AND r.property_id=c.property_id AND r.room_type_id=c.room_type_id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,c.stay_date,business_date)) u WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.stay_date>=business_date),'[]'::jsonb),
 'activity',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id DESC) FROM (SELECT * FROM irp_pms.activity WHERE tenant_id=p_tenant AND property_id=p_property ORDER BY id DESC LIMIT 50) a),'[]'::jsonb));
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_configure_property(p_tenant uuid,p_property uuid,p_name text,p_time_zone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_time_zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone) THEN RAISE EXCEPTION 'Unknown property time zone'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Resolve open turnover work before changing property time zone';END IF;
 IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND (c.effective_end>(clock_timestamp() AT TIME ZONE prop.time_zone)::date OR c.effective_end>(clock_timestamp() AT TIME ZONE p_time_zone)::date)) THEN RAISE EXCEPTION 'Resolve maintenance closures before changing a time zone that affects their current or future dates'; END IF;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 UPDATE irp_pms.properties SET name=trim(p_name),time_zone=p_time_zone WHERE tenant_id=p_tenant AND id=p_property RETURNING * INTO prop;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'property_updated',p_property);
 RETURN to_jsonb(prop);
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION irp_pms.apply_operating_model(p_tenant uuid,p_property uuid,p_mode text,p_max_guests integer) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; unit_type uuid;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN('hotel','whole_home') OR (p_mode='hotel' AND p_max_guests IS NOT NULL) OR (p_mode='whole_home' AND (p_max_guests IS NULL OR p_max_guests NOT BETWEEN 1 AND 20)) THEN RAISE EXCEPTION 'Choose hotel with no unit guest limit, or whole_home with 1 to 20 guests'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Resolve open turnover work before changing property operating model';END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND c.effective_end>(clock_timestamp() AT TIME ZONE prop.time_zone)::date) THEN RAISE EXCEPTION 'Resolve current and future maintenance closures before changing the property operating model'; END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND status IN('Confirmed','In house')) THEN RAISE EXCEPTION 'Resolve active reservations before changing the property operating model'; END IF;
 IF p_mode='whole_home' THEN
  IF (SELECT count(*) FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property)>1 OR (SELECT count(*) FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property)>1 OR EXISTS(SELECT 1 FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND units>1) THEN RAISE EXCEPTION 'Whole-home conversion requires at most one existing room type, one physical unit and no capacity above one'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND status IN('Confirmed','In house') AND guests>p_max_guests) THEN RAISE EXCEPTION 'Guest limit is below existing reservations'; END IF;
 END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode OR prop.whole_home_max_guests IS DISTINCT FROM p_max_guests THEN
  UPDATE irp_pms.properties SET operating_model=p_mode,whole_home_max_guests=p_max_guests,operating_model_version=operating_model_version+1 WHERE tenant_id=p_tenant AND id=p_property;
 END IF;
 IF p_mode='whole_home' THEN
  SELECT id INTO unit_type FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property;
  IF NOT FOUND THEN
   INSERT INTO irp_pms.room_types(tenant_id,property_id,name,max_guests) VALUES(p_tenant,p_property,'Entire home',p_max_guests) RETURNING id INTO unit_type;
  ELSE
   UPDATE irp_pms.room_types SET max_guests=p_max_guests WHERE tenant_id=p_tenant AND property_id=p_property AND id=unit_type;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property) THEN
   INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label) VALUES(p_tenant,p_property,unit_type,'HOME');
  END IF;
 END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('202609070171','iratepilot_pms_turnover_workflow',ARRAY['CREATE TABLE irp_pms.turnover_tasks(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),room_id uuid NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 work_generation bigint NOT NULL DEFAULT 1 CHECK(work_generation BETWEEN 1 AND 9007199254740991),
 state text NOT NULL DEFAULT ''queued'' CHECK(state IN(''queued'',''in_progress'',''awaiting_inspection'',''completed'',''cancelled'')),
 assignee_id uuid REFERENCES auth.users(id),due_date date NOT NULL CHECK(isfinite(due_date)),
 created_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_time_zone text NOT NULL,
 creation_operating_model text NOT NULL CHECK(creation_operating_model IN(''hotel'',''whole_home'')),
 created_room_label text NOT NULL,created_room_type_id uuid NOT NULL,origin_kind text NOT NULL CHECK(origin_kind IN(''checkout'',''room_move'',''manual'',''readiness_dirty'')),
 checklist_version integer NOT NULL DEFAULT 1 CHECK(checklist_version=1),checklist jsonb NOT NULL CHECK(jsonb_typeof(checklist)=''array'' AND jsonb_array_length(checklist) BETWEEN 5 AND 6),
 started_at timestamptz,started_by uuid REFERENCES auth.users(id),submitted_at timestamptz,submitted_by uuid REFERENCES auth.users(id),submitted_room_version bigint,submission jsonb,
 inspected_at timestamptz,inspected_by uuid REFERENCES auth.users(id),closed_at timestamptz,closed_by uuid REFERENCES auth.users(id),close_reason text,
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,room_id) REFERENCES irp_pms.rooms(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,created_room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id),
 CHECK((started_at IS NULL)=(started_by IS NULL)),
 CHECK((submitted_at IS NULL AND submitted_by IS NULL AND submitted_room_version IS NULL AND submission IS NULL)
  OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND submitted_room_version IS NOT NULL AND submitted_room_version BETWEEN 1 AND 9007199254740991 AND submission IS NOT NULL AND jsonb_typeof(submission)=''object'')),
 CHECK((inspected_at IS NULL)=(inspected_by IS NULL)),
 CHECK((state IN(''completed'',''cancelled'') AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  OR (state NOT IN(''completed'',''cancelled'') AND closed_at IS NULL AND closed_by IS NULL AND close_reason IS NULL)),
 CHECK(state<>''queued'' OR (started_at IS NULL AND submitted_at IS NULL AND inspected_at IS NULL)),
 CHECK(state NOT IN(''in_progress'',''awaiting_inspection'',''completed'') OR started_at IS NOT NULL),
 CHECK(state NOT IN(''awaiting_inspection'',''completed'') OR submitted_at IS NOT NULL),
 CHECK(state<>''completed'' OR inspected_at IS NOT NULL),
 CHECK(state<>''cancelled'' OR (close_reason IS NOT NULL AND length(trim(close_reason)) BETWEEN 4 AND 500 AND close_reason !~ ''[[:cntrl:]]''))
);
CREATE UNIQUE INDEX irp_pms_one_open_turnover ON irp_pms.turnover_tasks(tenant_id,property_id,room_id) WHERE state NOT IN(''completed'',''cancelled'');
CREATE INDEX irp_pms_turnover_queue ON irp_pms.turnover_tasks(tenant_id,property_id,state,due_date);
CREATE TABLE irp_pms.turnover_origins(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),task_id uuid NOT NULL,
 origin_kind text NOT NULL CHECK(origin_kind IN(''checkout'',''room_move'',''manual'',''readiness_dirty'')),origin_key text NOT NULL CHECK(length(origin_key) BETWEEN 1 AND 200),
 reservation_id uuid,source_version bigint,room_state_version bigint NOT NULL CHECK(room_state_version BETWEEN 1 AND 9007199254740991),
 actor_id uuid NOT NULL REFERENCES auth.users(id),recorded_at timestamptz NOT NULL,reason text NOT NULL,
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,task_id,id),UNIQUE(tenant_id,property_id,origin_kind,origin_key),
 FOREIGN KEY(tenant_id,property_id,task_id) REFERENCES irp_pms.turnover_tasks(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 CHECK((reservation_id IS NULL AND source_version IS NULL) OR (reservation_id IS NOT NULL AND source_version IS NOT NULL AND source_version BETWEEN 1 AND 9007199254740991))
);
CREATE TABLE irp_pms.turnover_events(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),task_id uuid NOT NULL,
 request_id uuid,origin_id uuid,action text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),recorded_at timestamptz NOT NULL,
 from_version bigint,to_version bigint NOT NULL,from_state text,to_state text NOT NULL,work_generation bigint NOT NULL,
 room_version_before bigint NOT NULL,room_version_after bigint NOT NULL,details jsonb NOT NULL CHECK(jsonb_typeof(details)=''object''),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,task_id,to_version),
 FOREIGN KEY(tenant_id,property_id,task_id) REFERENCES irp_pms.turnover_tasks(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,task_id,origin_id) REFERENCES irp_pms.turnover_origins(tenant_id,property_id,task_id,id),
 CHECK(to_version BETWEEN 1 AND 9007199254740991 AND ((from_version IS NULL AND to_version=1) OR (from_version IS NOT NULL AND from_version BETWEEN 1 AND 9007199254740990 AND to_version=from_version+1))),
 CHECK(work_generation BETWEEN 1 AND 9007199254740991 AND room_version_before BETWEEN 1 AND 9007199254740991 AND room_version_after BETWEEN room_version_before AND 9007199254740991)
);
CREATE TABLE irp_pms.turnover_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,task_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,command jsonb NOT NULL CHECK(jsonb_typeof(command)=''object''),result jsonb NOT NULL CHECK(jsonb_typeof(result)=''object''),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,task_id) REFERENCES irp_pms.turnover_tasks(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.turnover_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.turnover_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.turnover_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.turnover_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.turnover_tasks,irp_pms.turnover_origins,irp_pms.turnover_events,irp_pms.turnover_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.turnover_tasks,irp_pms.turnover_origins,irp_pms.turnover_events,irp_pms.turnover_requests TO service_role;

CREATE FUNCTION irp_pms.turnover_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME<>''turnover_tasks'' OR TG_OP=''DELETE'' THEN RAISE EXCEPTION ''Turnover origins, events and request receipts are immutable; task history cannot be deleted'';END IF;
 IF OLD.state IN(''completed'',''cancelled'') THEN RAISE EXCEPTION ''Completed and cancelled turnover tasks are immutable; create new work'';END IF;
 IF NEW.version<>OLD.version+1 OR NEW.work_generation NOT IN(OLD.work_generation,OLD.work_generation+1) THEN RAISE EXCEPTION ''Turnover revisions must advance exactly once'';END IF;
 IF NEW.work_generation<>OLD.work_generation AND NEW.state<>''queued'' THEN RAISE EXCEPTION ''A new work generation must return to queued'';END IF;
 IF (NEW.tenant_id,NEW.property_id,NEW.id,NEW.room_id,NEW.created_at,NEW.created_by,NEW.created_time_zone,NEW.creation_operating_model,NEW.created_room_label,NEW.created_room_type_id,NEW.origin_kind,NEW.checklist_version,NEW.checklist)
 IS DISTINCT FROM (OLD.tenant_id,OLD.property_id,OLD.id,OLD.room_id,OLD.created_at,OLD.created_by,OLD.created_time_zone,OLD.creation_operating_model,OLD.created_room_label,OLD.created_room_type_id,OLD.origin_kind,OLD.checklist_version,OLD.checklist)
 THEN RAISE EXCEPTION ''Turnover identity and creation context are immutable'';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_turnover_task_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_tasks FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();
CREATE TRIGGER irp_pms_turnover_origin_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_origins FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();
CREATE TRIGGER irp_pms_turnover_event_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_events FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();
CREATE TRIGGER irp_pms_turnover_request_history BEFORE UPDATE OR DELETE ON irp_pms.turnover_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();

CREATE FUNCTION irp_pms.turnover_property_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- A direct trusted service UPDATE already owns the property row lock. Do
 -- not acquire a tenant lock here in reverse order. Ordinary RPCs retain169.
 IF NEW.operating_model IS DISTINCT FROM OLD.operating_model AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=OLD.tenant_id AND c.property_id=OLD.id AND c.effective_end>c.scheduled_start AND c.effective_end>(clock_timestamp() AT TIME ZONE OLD.time_zone)::date)
 THEN RAISE EXCEPTION ''Resolve current and future maintenance closures before changing the property operating model'';END IF;
 IF NEW.time_zone IS DISTINCT FROM OLD.time_zone AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=OLD.tenant_id AND c.property_id=OLD.id AND c.effective_end>c.scheduled_start AND (c.effective_end>(clock_timestamp() AT TIME ZONE OLD.time_zone)::date OR c.effective_end>(clock_timestamp() AT TIME ZONE NEW.time_zone)::date))
 THEN RAISE EXCEPTION ''Resolve maintenance closures before changing a time zone that affects their current or future dates'';END IF;
 IF (NEW.time_zone IS DISTINCT FROM OLD.time_zone OR NEW.operating_model IS DISTINCT FROM OLD.operating_model)
 AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks t WHERE t.tenant_id=OLD.tenant_id AND t.property_id=OLD.id AND t.state NOT IN(''completed'',''cancelled''))
 THEN RAISE EXCEPTION ''Resolve open turnover work before changing property time zone or operating model'';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_turnover_property_guard BEFORE UPDATE ON irp_pms.properties FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_property_guard();

CREATE FUNCTION irp_pms.turnover_checklist(p_model text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT ''[{"key":"linen","label":"Linen prepared"},{"key":"bathroom","label":"Bathroom cleaned"},{"key":"surfaces","label":"Surfaces cleaned"},{"key":"waste","label":"Waste removed"},{"key":"supplies","label":"Guest supplies checked"}]''::jsonb
 ||CASE WHEN p_model=''whole_home'' THEN ''[{"key":"kitchen","label":"Kitchen cleaned and checked"}]''::jsonb ELSE ''[]''::jsonb END
$$;
CREATE FUNCTION irp_pms.turnover_task_json(p_tenant uuid,p_property uuid,p_task uuid,p_business_date date) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT to_jsonb(t)-ARRAY[''tenant_id'',''property_id'']||jsonb_build_object(
  ''room_label'',r.label,''room_type_id'',r.room_type_id,''room_type_name'',rt.name,''room_state_version'',r.state_version,''housekeeping'',r.housekeeping,
  ''assignee_label'',CASE WHEN t.assignee_id IS NULL THEN NULL ELSE coalesce(u.email,t.assignee_id::text) END,
  ''assignee_current_member'',t.assignee_id IS NULL OR m.user_id IS NOT NULL,''occupied_reservation_id'',o.id,
  ''blocked_reasons'',CASE WHEN o.id IS NOT NULL THEN ''["occupied"]''::jsonb ELSE ''[]''::jsonb END
   ||CASE WHEN irp_pms.room_is_closed(t.tenant_id,t.property_id,t.room_id,p_business_date,p_business_date+1) THEN ''["maintenance_active"]''::jsonb ELSE ''[]''::jsonb END
   ||CASE WHEN t.assignee_id IS NOT NULL AND m.user_id IS NULL THEN ''["assignee_removed"]''::jsonb ELSE ''[]''::jsonb END
   ||CASE WHEN t.state=''awaiting_inspection'' AND t.submitted_room_version IS DISTINCT FROM r.state_version THEN ''["submission_context_changed"]''::jsonb ELSE ''[]''::jsonb END,
  ''events'',coalesce((SELECT jsonb_agg(to_jsonb(e)-ARRAY[''tenant_id'',''property_id'',''task_id'',''request_id'',''origin_id''] ORDER BY e.to_version,e.id) FROM irp_pms.turnover_events e WHERE e.tenant_id=t.tenant_id AND e.property_id=t.property_id AND e.task_id=t.id),''[]''::jsonb))
 FROM irp_pms.turnover_tasks t JOIN irp_pms.rooms r ON r.tenant_id=t.tenant_id AND r.property_id=t.property_id AND r.id=t.room_id
 JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id
 LEFT JOIN auth.users u ON u.id=t.assignee_id LEFT JOIN irp_pms.memberships m ON m.tenant_id=t.tenant_id AND m.user_id=t.assignee_id
 LEFT JOIN irp_pms.reservations o ON o.tenant_id=t.tenant_id AND o.property_id=t.property_id AND o.physical_room_id=t.room_id AND o.status=''In house''
 WHERE t.tenant_id=p_tenant AND t.property_id=p_property AND t.id=p_task
$$;

CREATE FUNCTION irp_pms.turnover_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;prop irp_pms.properties;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.room_id;
 IF room.id IS NULL OR prop.id IS NULL OR NEW.version<>1 OR NEW.work_generation<>1 OR NEW.state<>''queued''
 OR (NEW.created_room_label,NEW.created_room_type_id,NEW.created_time_zone,NEW.creation_operating_model,NEW.checklist)
 IS DISTINCT FROM (room.label,room.room_type_id,prop.time_zone,prop.operating_model,irp_pms.turnover_checklist(prop.operating_model))
 THEN RAISE EXCEPTION ''Turnover creation snapshot must match the scoped room and property'';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_turnover_snapshot_guard BEFORE INSERT ON irp_pms.turnover_tasks FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_snapshot_guard();
REVOKE ALL ON FUNCTION irp_pms.turnover_snapshot_guard() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION irp_pms.turnover_history_guard(),irp_pms.turnover_property_guard(),irp_pms.turnover_checklist(text),irp_pms.turnover_task_json(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
-- Callers hold tenant SHARE and property UPDATE before entering this helper.
-- Lifecycle parents own the reservation and room locks already. Never take
-- tenant/property locks here in reverse order. Origin identity is immutable.
CREATE FUNCTION irp_pms.enqueue_turnover(p_tenant uuid,p_property uuid,p_room uuid,p_origin_kind text,p_origin_key text,p_reservation uuid,p_source_version bigint,p_actor uuid,p_recorded_at timestamptz,p_reason text,p_due_date date DEFAULT NULL,p_assignee uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;room irp_pms.rooms;task irp_pms.turnover_tasks;before_task irp_pms.turnover_tasks;origin uuid;prior_task uuid;before_room_version bigint;business_date date;event_action text;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped turnover room'';END IF;
 SELECT task_id INTO prior_task FROM irp_pms.turnover_origins WHERE tenant_id=p_tenant AND property_id=p_property AND origin_kind=p_origin_kind AND origin_key=p_origin_key;
 IF FOUND THEN RETURN prior_task;END IF;
 IF p_origin_kind IS NULL OR p_origin_kind NOT IN(''checkout'',''room_move'',''manual'',''readiness_dirty'') OR p_actor IS NULL OR p_recorded_at IS NULL THEN RAISE EXCEPTION ''Invalid turnover origin'';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status=''In house'') THEN RAISE EXCEPTION ''Occupied rooms cannot begin vacancy turnover work'';END IF;
 business_date:=(p_recorded_at AT TIME ZONE prop.time_zone)::date;before_room_version:=room.state_version;
 SELECT * INTO before_task FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_room AND state NOT IN(''completed'',''cancelled'') FOR UPDATE;
 -- Checkout/move already advance the occupancy revision. Explicit manual
 -- Dirty invalidates an old review even when the room was already Dirty.
 UPDATE irp_pms.rooms SET housekeeping=''Dirty'',state_version=state_version+CASE WHEN housekeeping=''Dirty'' AND p_origin_kind IN(''manual'',''readiness_dirty'') THEN 1 ELSE 0 END WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 IF before_task.id IS NULL THEN
  INSERT INTO irp_pms.turnover_tasks(tenant_id,property_id,room_id,assignee_id,due_date,created_at,created_by,created_time_zone,creation_operating_model,created_room_label,created_room_type_id,origin_kind,checklist)
  VALUES(p_tenant,p_property,p_room,p_assignee,coalesce(p_due_date,business_date),p_recorded_at,p_actor,prop.time_zone,prop.operating_model,room.label,room.room_type_id,p_origin_kind,irp_pms.turnover_checklist(prop.operating_model)) RETURNING * INTO task;
  event_action:=''created'';
 ELSE
  UPDATE irp_pms.turnover_tasks SET version=version+1,work_generation=work_generation+1,state=''queued'',started_at=NULL,started_by=NULL,submitted_at=NULL,submitted_by=NULL,submitted_room_version=NULL,submission=NULL,inspected_at=NULL,inspected_by=NULL
  WHERE tenant_id=p_tenant AND property_id=p_property AND id=before_task.id RETURNING * INTO task;
  event_action:=''origin_reset'';
 END IF;
 INSERT INTO irp_pms.turnover_origins(tenant_id,property_id,task_id,origin_kind,origin_key,reservation_id,source_version,room_state_version,actor_id,recorded_at,reason)
 VALUES(p_tenant,p_property,task.id,p_origin_kind,p_origin_key,p_reservation,p_source_version,room.state_version,p_actor,p_recorded_at,p_reason) RETURNING id INTO origin;
 INSERT INTO irp_pms.turnover_events(tenant_id,property_id,task_id,origin_id,action,actor_id,recorded_at,from_version,to_version,from_state,to_state,work_generation,room_version_before,room_version_after,details)
 VALUES(p_tenant,p_property,task.id,origin,event_action,p_actor,p_recorded_at,before_task.version,task.version,before_task.state,task.state,task.work_generation,before_room_version,room.state_version,
 jsonb_build_object(''origin_kind'',p_origin_kind,''origin_key'',p_origin_key,''reservation_id'',p_reservation,''source_version'',p_source_version,''reason'',p_reason,''due_date'',task.due_date,''assignee_id'',task.assignee_id));
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,p_actor,''turnover_''||event_action,task.id,jsonb_build_object(''room_id'',p_room,''origin_id'',origin,''origin_kind'',p_origin_kind,''version'',task.version,''work_generation'',task.work_generation));
 RETURN task.id;
END $$;
REVOKE ALL ON FUNCTION irp_pms.enqueue_turnover(uuid,uuid,uuid,text,text,uuid,bigint,uuid,timestamptz,text,date,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_create_turnover(p_tenant uuid,p_property uuid,p_room uuid,p_request uuid,p_expected_room_version bigint,p_expected_business_date date,p_due_date date,p_assignee uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;room irp_pms.rooms;prior irp_pms.turnover_requests;command jsonb;result jsonb;task_id uuid;business_date date;recorded timestamptz;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_room IS NULL OR p_request IS NULL OR p_expected_room_version IS NULL OR p_expected_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR NOT isfinite(p_expected_business_date) OR p_due_date IS NULL OR NOT isfinite(p_due_date) OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~''[[:cntrl:]]'' THEN RAISE EXCEPTION ''Provide a room, request, expected revision, business and due dates, and a 4 to 500 character reason'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 command:=jsonb_build_object(''room_id'',p_room,''expected_room_version'',p_expected_room_version,''expected_business_date'',p_expected_business_date,''due_date'',p_due_date,''assignee_id'',p_assignee,''reason'',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.turnover_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.action<>''create_turnover'' OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION ''Turnover request identity already used'';END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped physical room'';END IF;
 IF room.state_version<>p_expected_room_version THEN RAISE EXCEPTION ''Room state changed; refresh before creating turnover'' USING ERRCODE=''PT409'';END IF;
 recorded:=clock_timestamp();business_date:=(recorded AT TIME ZONE prop.time_zone)::date;
 IF business_date<>p_expected_business_date THEN RAISE EXCEPTION ''Property business date changed; review turnover again'' USING ERRCODE=''PT412'';END IF;
 IF p_due_date<business_date OR p_due_date>business_date+366 THEN RAISE EXCEPTION ''Turnover due date must be today or within the next 366 days'';END IF;
 IF p_assignee IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=p_assignee) OR (member_role=''staff'' AND p_assignee<>auth.uid())) THEN RAISE EXCEPTION ''Choose an eligible assignee; staff can assign new work only to themselves'';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_room AND state NOT IN(''completed'',''cancelled'')) THEN RAISE EXCEPTION ''This room already has open turnover work; review that task'';END IF;
 task_id:=irp_pms.enqueue_turnover(p_tenant,p_property,p_room,''manual'',p_request::text,NULL,NULL,auth.uid(),recorded,trim(p_reason),p_due_date,p_assignee);
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room;
 result:=jsonb_build_object(''tenant_id'',p_tenant,''property_id'',p_property,''request_id'',p_request,''action'',''create_turnover'',''task'',irp_pms.turnover_task_json(p_tenant,p_property,task_id,business_date),''room'',jsonb_build_object(''id'',room.id,''state_version'',room.state_version,''housekeeping'',room.housekeeping),''business_date'',business_date,''room_state_changed'',room.state_version<>p_expected_room_version,''financial_changed'',false,''configured_capacity_changed'',false,''replayed'',false);
 INSERT INTO irp_pms.turnover_requests(tenant_id,property_id,request_id,task_id,actor_id,action,command,result) VALUES(p_tenant,p_property,p_request,task_id,auth.uid(),''create_turnover'',command,result);
 RETURN result;
END $$;
CREATE FUNCTION public.irp_pms_pilot_turnover_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.turnover_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION ''A request identity is required'';END IF;
 SELECT * INTO prior FROM irp_pms.turnover_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object(''found'',false);END IF;
 RETURN jsonb_build_object(''found'',true,''action'',prior.action,''result'',prior.result);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_create_turnover(uuid,uuid,uuid,uuid,bigint,date,date,uuid,text),public.irp_pms_pilot_turnover_request_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_create_turnover(uuid,uuid,uuid,uuid,bigint,date,date,uuid,text),public.irp_pms_pilot_turnover_request_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_update_turnover(p_tenant uuid,p_property uuid,p_task uuid,p_request uuid,p_expected_task_version bigint,p_expected_room_version bigint,p_expected_business_date date,p_action text,p_details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;manager_action boolean;prop irp_pms.properties;room irp_pms.rooms;task irp_pms.turnover_tasks;previous irp_pms.turnover_tasks;prior irp_pms.turnover_requests;
 command jsonb;details jsonb;result jsonb;recorded timestamptz;business_date date;reason text;note text;assignee uuid;due date;checks jsonb;required_checks jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN(''assign'',''set_due_date'',''start'',''submit_cleaning'',''approve_inspection'',''return_for_cleaning'',''cancel'') THEN RAISE EXCEPTION ''Unknown turnover action'';END IF;
 manager_action:=p_action IN(''assign'',''set_due_date'',''approve_inspection'',''return_for_cleaning'',''cancel'');
 member_role:=irp_pms.pilot_require(p_tenant,p_property,manager_action);
 IF p_task IS NULL OR p_request IS NULL OR p_expected_task_version IS NULL OR p_expected_task_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_room_version IS NULL OR p_expected_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR NOT isfinite(p_expected_business_date) OR p_details IS NULL OR jsonb_typeof(p_details)<>''object'' THEN RAISE EXCEPTION ''Provide task and request identities, reviewed versions and business date, and action details'';END IF;
 details:=p_details;
 IF p_action IN(''assign'',''set_due_date'',''return_for_cleaning'',''cancel'') THEN
  IF jsonb_typeof(details->''reason'') IS DISTINCT FROM ''string'' OR length(trim(details->>''reason'')) NOT BETWEEN 4 AND 500 OR details->>''reason''~''[[:cntrl:]]'' THEN RAISE EXCEPTION ''Provide a 4 to 500 character reason without controls'';END IF;
  reason:=trim(details->>''reason'');details:=jsonb_set(details,''{reason}'',to_jsonb(reason));
 END IF;
 IF p_action IN(''submit_cleaning'',''approve_inspection'') THEN
  IF details ? ''note'' AND jsonb_typeof(details->''note'') IS DISTINCT FROM ''string'' THEN RAISE EXCEPTION ''The optional note must be text'';END IF;
  note:=coalesce(details->>''note'','''');
  IF length(note)>1000 OR translate(note,E''\n\t'','''')~''[[:cntrl:]]'' THEN RAISE EXCEPTION ''The note must be at most 1000 characters without unsupported controls'';END IF;
  details:=details||jsonb_build_object(''note'',note);
 END IF;
 IF p_action=''assign'' THEN
  IF details-ARRAY[''assignee_id'',''reason'']<>''{}''::jsonb OR NOT(details ? ''assignee_id'') OR jsonb_typeof(details->''assignee_id'') NOT IN(''null'',''string'') THEN RAISE EXCEPTION ''Assignment requires only assignee_id and reason'';END IF;
  assignee:=(details->>''assignee_id'')::uuid;details:=details||jsonb_build_object(''assignee_id'',assignee);
 ELSIF p_action=''set_due_date'' THEN
  IF details-ARRAY[''due_date'',''reason'']<>''{}''::jsonb OR jsonb_typeof(details->''due_date'') IS DISTINCT FROM ''string'' OR details->>''due_date'' !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' THEN RAISE EXCEPTION ''Due date requires only an ISO due_date and reason'';END IF;
  due:=(details->>''due_date'')::date;IF NOT isfinite(due) THEN RAISE EXCEPTION ''Due date must be finite'';END IF;
 ELSIF p_action=''start'' THEN
  IF details<>''{}''::jsonb THEN RAISE EXCEPTION ''Start does not accept extra details'';END IF;
 ELSIF p_action=''submit_cleaning'' THEN
  IF details-ARRAY[''checklist'',''note'']<>''{}''::jsonb OR jsonb_typeof(details->''checklist'') IS DISTINCT FROM ''object'' THEN RAISE EXCEPTION ''Submit the checklist and optional note only'';END IF;
 ELSIF p_action=''approve_inspection'' THEN
  IF details-ARRAY[''work_reviewed'',''room_ready'',''note'']<>''{}''::jsonb OR details->''work_reviewed'' IS DISTINCT FROM ''true''::jsonb OR details->''room_ready'' IS DISTINCT FROM ''true''::jsonb THEN RAISE EXCEPTION ''Confirm both work reviewed and room ready before approval'';END IF;
 ELSE
  IF details-ARRAY[''reason'']<>''{}''::jsonb THEN RAISE EXCEPTION ''This action accepts only a reason'';END IF;
 END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property,manager_action);
 command:=jsonb_build_object(''task_id'',p_task,''expected_task_version'',p_expected_task_version,''expected_room_version'',p_expected_room_version,''expected_business_date'',p_expected_business_date,''action'',p_action,''details'',details);
 SELECT * INTO prior FROM irp_pms.turnover_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.action<>p_action OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION ''Turnover request identity already used'';END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 -- Read the scoped immutable room identity before locking; the property lock
 -- serializes supported task writers. Always acquire room before task.
 SELECT * INTO task FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_task;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped turnover task'';END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=task.room_id FOR UPDATE;
 SELECT * INTO task FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_task FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property,manager_action);
 IF room.state_version<>p_expected_room_version OR task.version<>p_expected_task_version THEN RAISE EXCEPTION ''Room or turnover changed; refresh and review the action'' USING ERRCODE=''PT409'';END IF;
 recorded:=clock_timestamp();business_date:=(recorded AT TIME ZONE prop.time_zone)::date;
 IF business_date<>p_expected_business_date THEN RAISE EXCEPTION ''Property business date changed; review turnover again'' USING ERRCODE=''PT412'';END IF;
 IF task.state IN(''completed'',''cancelled'') THEN RAISE EXCEPTION ''This turnover is closed; create new work when needed'';END IF;
 IF task.version>=9007199254740991 OR (SELECT count(*) FROM irp_pms.turnover_events WHERE tenant_id=p_tenant AND property_id=p_property AND task_id=p_task)>=50000 THEN RAISE EXCEPTION ''Turnover history limit reached'';END IF;
 IF p_action IN(''start'',''submit_cleaning'') AND member_role=''staff'' AND task.assignee_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION ''Staff can work only on their assigned turnover'';END IF;
 IF p_action IN(''start'',''submit_cleaning'',''approve_inspection'') THEN
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=task.room_id AND status=''In house'') THEN RAISE EXCEPTION ''The room is physically occupied; resolve the stay first'';END IF;
  IF irp_pms.room_is_closed(p_tenant,p_property,task.room_id,business_date,business_date+1) THEN RAISE EXCEPTION ''Resolve the active maintenance closure before cleaning or inspection'';END IF;
 END IF;
 previous:=task;
 IF p_action=''assign'' THEN
  IF task.assignee_id IS NOT DISTINCT FROM assignee THEN RAISE EXCEPTION ''Choose a different assignee'';END IF;
  IF assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=assignee) THEN RAISE EXCEPTION ''Assignee is no longer a current organization member'';END IF;
  task.assignee_id:=assignee;
 ELSIF p_action=''set_due_date'' THEN
  IF task.due_date=due OR due<business_date OR due>business_date+366 THEN RAISE EXCEPTION ''Choose a different due date, today or within the next 366 days'';END IF;
  task.due_date:=due;
 ELSIF p_action=''start'' THEN
  IF task.state<>''queued'' OR room.housekeeping<>''Dirty'' THEN RAISE EXCEPTION ''Start requires queued work and a Dirty room'';END IF;
  task.state:=''in_progress'';task.started_at:=recorded;task.started_by:=auth.uid();
 ELSIF p_action=''submit_cleaning'' THEN
  IF task.state<>''in_progress'' OR room.housekeeping<>''Dirty'' THEN RAISE EXCEPTION ''Submit cleaning only after starting work on a Dirty room'';END IF;
  SELECT jsonb_object_agg(x->>''key'',true) INTO required_checks FROM jsonb_array_elements(task.checklist) x;
  IF details->''checklist'' IS DISTINCT FROM required_checks THEN RAISE EXCEPTION ''Complete every item in the saved cleaning checklist without extra items'';END IF;
  UPDATE irp_pms.rooms SET housekeeping=''Inspect'' WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:=''awaiting_inspection'';task.submitted_at:=recorded;task.submitted_by:=auth.uid();task.submitted_room_version:=room.state_version;task.submission:=details;
 ELSIF p_action=''approve_inspection'' THEN
  IF task.state<>''awaiting_inspection'' OR room.housekeeping<>''Inspect'' THEN RAISE EXCEPTION ''Inspection requires submitted cleaning and an Inspect room'';END IF;
  IF task.submitted_room_version IS DISTINCT FROM room.state_version THEN RAISE EXCEPTION ''Room context changed after cleaning was submitted; return work for cleaning confirmation'';END IF;
  UPDATE irp_pms.rooms SET housekeeping=''Clean'' WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:=''completed'';task.inspected_at:=recorded;task.inspected_by:=auth.uid();task.closed_at:=recorded;task.closed_by:=auth.uid();
 ELSIF p_action=''return_for_cleaning'' THEN
  IF task.state NOT IN(''in_progress'',''awaiting_inspection'') THEN RAISE EXCEPTION ''Only started or submitted work can return for cleaning'';END IF;
  UPDATE irp_pms.rooms SET housekeeping=''Dirty'',state_version=state_version+1 WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:=''queued'';task.work_generation:=task.work_generation+1;task.started_at:=NULL;task.started_by:=NULL;task.submitted_at:=NULL;task.submitted_by:=NULL;task.submitted_room_version:=NULL;task.submission:=NULL;task.inspected_at:=NULL;task.inspected_by:=NULL;
 ELSE
  UPDATE irp_pms.rooms SET housekeeping=''Dirty'',state_version=state_version+1 WHERE tenant_id=p_tenant AND property_id=p_property AND id=room.id RETURNING * INTO room;
  task.state:=''cancelled'';task.closed_at:=recorded;task.closed_by:=auth.uid();task.close_reason:=reason;
 END IF;
 UPDATE irp_pms.turnover_tasks SET version=version+1,work_generation=task.work_generation,state=task.state,assignee_id=task.assignee_id,due_date=task.due_date,started_at=task.started_at,started_by=task.started_by,submitted_at=task.submitted_at,submitted_by=task.submitted_by,submitted_room_version=task.submitted_room_version,submission=task.submission,inspected_at=task.inspected_at,inspected_by=task.inspected_by,closed_at=task.closed_at,closed_by=task.closed_by,close_reason=task.close_reason
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_task RETURNING * INTO task;
 INSERT INTO irp_pms.turnover_events(tenant_id,property_id,task_id,request_id,action,actor_id,recorded_at,from_version,to_version,from_state,to_state,work_generation,room_version_before,room_version_after,details)
 VALUES(p_tenant,p_property,p_task,p_request,p_action,auth.uid(),recorded,previous.version,task.version,previous.state,task.state,task.work_generation,p_expected_room_version,room.state_version,details);
 result:=jsonb_build_object(''tenant_id'',p_tenant,''property_id'',p_property,''request_id'',p_request,''action'',p_action,''task'',irp_pms.turnover_task_json(p_tenant,p_property,p_task,business_date),''room'',jsonb_build_object(''id'',room.id,''state_version'',room.state_version,''housekeeping'',room.housekeeping),''business_date'',business_date,''room_state_changed'',room.state_version<>p_expected_room_version,''financial_changed'',false,''configured_capacity_changed'',false,''replayed'',false);
 INSERT INTO irp_pms.turnover_requests(tenant_id,property_id,request_id,task_id,actor_id,action,command,result) VALUES(p_tenant,p_property,p_request,p_task,auth.uid(),p_action,command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),''turnover_''||p_action,p_task,command||jsonb_build_object(''request_id'',p_request,''version'',task.version,''work_generation'',task.work_generation,''room_version_after'',room.state_version));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_update_turnover(uuid,uuid,uuid,uuid,bigint,bigint,date,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_update_turnover(uuid,uuid,uuid,uuid,bigint,bigint,date,text,jsonb) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_turnovers(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;prop irp_pms.properties;business_date date;generated timestamptz;task_ids uuid[];opened jsonb;closed jsonb;assignees jsonb;projected jsonb;demand jsonb;summary jsonb;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION ''Read turnover for 1 to 366 days with an exclusive end date'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 generated:=clock_timestamp();business_date:=(generated AT TIME ZONE prop.time_zone)::date;
 IF (SELECT count(*) FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN(''completed'',''cancelled''))>1000
 OR (SELECT count(*) FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state IN(''completed'',''cancelled'') AND (closed_at AT TIME ZONE prop.time_zone)::date>=p_start AND (closed_at AT TIME ZONE prop.time_zone)::date<p_end)>5000
 OR (SELECT count(*) FROM irp_pms.memberships WHERE tenant_id=p_tenant)>1000
 OR (SELECT count(*) FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND status IN(''Confirmed'',''In house'') AND (departure>=p_start AND departure<p_end OR status=''In house'' AND departure<business_date OR status=''Confirmed'' AND arrival>=p_start AND arrival<p_end))>10000
 THEN RAISE EXCEPTION ''Turnover queue is too large for this period or property; narrow the read scope'';END IF;
 SELECT coalesce(array_agg(id),''{}''::uuid[]) INTO task_ids FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND (state NOT IN(''completed'',''cancelled'') OR (closed_at AT TIME ZONE prop.time_zone)::date>=p_start AND (closed_at AT TIME ZONE prop.time_zone)::date<p_end);
 IF (SELECT count(*) FROM irp_pms.turnover_events WHERE tenant_id=p_tenant AND property_id=p_property AND task_id=ANY(task_ids))>50000 THEN RAISE EXCEPTION ''Turnover event history is too large; narrow the read scope'';END IF;
 SELECT coalesce(jsonb_agg(irp_pms.turnover_task_json(p_tenant,p_property,id,business_date) ORDER BY due_date,created_at,id),''[]''::jsonb) INTO opened FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=ANY(task_ids) AND state NOT IN(''completed'',''cancelled'');
 SELECT coalesce(jsonb_agg(irp_pms.turnover_task_json(p_tenant,p_property,id,business_date) ORDER BY closed_at DESC,id),''[]''::jsonb) INTO closed FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND id=ANY(task_ids) AND state IN(''completed'',''cancelled'');
 SELECT coalesce(jsonb_agg(jsonb_build_object(''user_id'',m.user_id,''label'',coalesce(u.email,m.user_id::text),''role'',m.role,''is_self'',m.user_id=auth.uid()) ORDER BY coalesce(u.email,m.user_id::text),m.user_id),''[]''::jsonb) INTO assignees FROM irp_pms.memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.tenant_id=p_tenant;
 SELECT coalesce(jsonb_agg(jsonb_build_object(''reservation_id'',r.id,''room_id'',r.physical_room_id,''room_label'',room.label,''room_type_id'',r.room_type_id,''room_type_name'',rt.name,''guest_name'',r.guest_name,''status'',r.status,''scheduled_departure'',r.departure,''checked_out_at'',NULL,''physically_occupied'',r.status=''In house'' AND r.physical_room_id IS NOT NULL,''projection_only'',true) ORDER BY r.departure,r.id),''[]''::jsonb) INTO projected
 FROM irp_pms.reservations r JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id LEFT JOIN irp_pms.rooms room ON room.tenant_id=r.tenant_id AND room.property_id=r.property_id AND room.id=r.physical_room_id
 WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status IN(''Confirmed'',''In house'') AND (r.departure>=p_start AND r.departure<p_end OR r.status=''In house'' AND r.departure<business_date);
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.stay_date,a.room_type_name,a.room_type_id),''[]''::jsonb) INTO demand FROM (
 SELECT r.arrival stay_date,r.room_type_id,rt.name room_type_name,count(*) confirmed_arrivals,count(*) FILTER(WHERE r.physical_room_id IS NOT NULL) assigned_arrivals
 FROM irp_pms.reservations r JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id
 WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status=''Confirmed'' AND r.arrival>=p_start AND r.arrival<p_end GROUP BY r.arrival,r.room_type_id,rt.name) a;
 IF jsonb_array_length(projected)+jsonb_array_length(demand)>10000 THEN RAISE EXCEPTION ''Turnover projection output is too large; narrow the read scope'';END IF;
 SELECT jsonb_build_object(''open'',count(*),''queued'',count(*) FILTER(WHERE x->>''state''=''queued''),''in_progress'',count(*) FILTER(WHERE x->>''state''=''in_progress''),''awaiting_inspection'',count(*) FILTER(WHERE x->>''state''=''awaiting_inspection''),
 ''due_today'',count(*) FILTER(WHERE (x->>''due_date'')::date=business_date),''overdue'',count(*) FILTER(WHERE (x->>''due_date'')::date<business_date),''blocked_occupied'',count(*) FILTER(WHERE x->''blocked_reasons'' ? ''occupied''),''blocked_maintenance'',count(*) FILTER(WHERE x->''blocked_reasons'' ? ''maintenance_active''),''invalid_assignee'',count(*) FILTER(WHERE x->''blocked_reasons'' ? ''assignee_removed''),
 ''completed_in_period'',(SELECT count(*) FROM jsonb_array_elements(closed) y WHERE y->>''state''=''completed''),''cancelled_in_period'',(SELECT count(*) FROM jsonb_array_elements(closed) y WHERE y->>''state''=''cancelled'')) INTO summary FROM jsonb_array_elements(opened) x;
 RETURN jsonb_build_object(''property_id'',p_property,''time_zone'',prop.time_zone,''business_date'',business_date,''role'',member_role,''can_manage'',member_role IN(''owner'',''manager''),''generated_at'',generated,''period'',jsonb_build_object(''start'',p_start,''end'',p_end,''end_exclusive'',true),''open_tasks'',opened,''closed_tasks'',closed,''eligible_assignees'',assignees,''projected_departures'',projected,''arrival_demand'',demand,''summary'',summary,
 ''definitions'',jsonb_build_object(''departure_projection'',''Scheduled departures are planning information. Turnover starts only after actual checkout, room move, or an explicit vacant-room request.'',''ready'',''A vacant room becomes Clean only after submitted cleaning and manager inspection. Maintenance and open turnover continue to block physical arrival.'',''automation'',''No scheduled dispatch, external cleaner notification, or message is sent.'',''financial'',''Cleaning tasks do not post cleaning fees, change reservation prices, or reduce configured nightly capacity.''));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_turnovers(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_turnovers(uuid,uuid,date,date) TO authenticated;
-- Frozen-source forward definitions follow.
-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_stay_action(p_tenant uuid,p_property uuid,p_reservation uuid,p_action text,p_room uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; res irp_pms.reservations; room irp_pms.rooms; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown reservation''; END IF;
 IF p_action=''check_in'' THEN
  IF res.status=''In house'' AND res.physical_room_id=p_room THEN RETURN to_jsonb(res); END IF;
  IF res.status<>''Confirmed'' OR business_date<res.arrival OR business_date>=res.departure THEN RAISE EXCEPTION ''Reservation cannot check in on this business date''; END IF;
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
  IF NOT FOUND OR room.room_type_id IS DISTINCT FROM res.room_type_id OR room.housekeeping<>''Clean'' THEN RAISE EXCEPTION ''A clean room of the booked type is required''; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_room AND state NOT IN(''completed'',''cancelled'')) THEN RAISE EXCEPTION ''Physical room has unfinished turnover work'';END IF;
  IF irp_pms.room_is_closed(p_tenant,p_property,p_room,business_date,res.departure) THEN RAISE EXCEPTION ''Physical room has a maintenance closure during the remaining stay''; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND id<>res.id AND status=''In house'') THEN RAISE EXCEPTION ''Physical room is occupied''; END IF;
  UPDATE irp_pms.reservations SET status=''In house'',physical_room_id=p_room,checked_in_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 ELSIF p_action=''check_out'' THEN
  IF res.status=''Checked out'' THEN RETURN to_jsonb(res); END IF;
  IF res.status<>''In house'' OR business_date<res.arrival THEN RAISE EXCEPTION ''Only an in-house reservation can check out''; END IF;
  UPDATE irp_pms.reservations SET status=''Checked out'',checked_out_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
  IF res.physical_room_id IS NOT NULL THEN
   PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,res.physical_room_id,''checkout'',res.id::text,res.id,res.source_version,auth.uid(),res.checked_out_at,''Actual guest checkout'');
  END IF;
 ELSIF p_action=''cancel'' THEN
  RAISE EXCEPTION ''Cancellation now requires review; use irp_pms_pilot_cancellation_preview and irp_pms_pilot_cancel_reservation'';
 ELSE RAISE EXCEPTION ''Unknown stay action'';
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),p_action,res.id);
 RETURN to_jsonb(res);
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_move_room(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_from_room uuid,p_expected_from_room_version bigint,p_to_room uuid,p_expected_to_room_version bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;res irp_pms.reservations;old_room irp_pms.rooms;new_room irp_pms.rooms;prior irp_pms.room_move_requests;command jsonb;result jsonb;business_date date;moved_at timestamptz;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_from_room IS NULL OR p_to_room IS NULL OR p_from_room=p_to_room OR p_expected_source_version IS NULL OR p_expected_source_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_from_room_version IS NULL OR p_expected_from_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_to_room_version IS NULL OR p_expected_to_room_version NOT BETWEEN 1 AND 9007199254740991 OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~''[[:cntrl:]]'' THEN RAISE EXCEPTION ''Provide distinct scoped rooms, expected stay and room versions, a request and a4 to500 character reason'';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object(''reservation_id'',p_reservation,''source_version'',p_expected_source_version,''from_room_id'',p_from_room,''from_room_version'',p_expected_from_room_version,''to_room_id'',p_to_room,''to_room_version'',p_expected_to_room_version,''reason'',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.room_move_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION ''Room move request identity already used'';END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 IF prop.operating_model<>''hotel'' THEN RAISE EXCEPTION ''Whole-home properties have one exclusive unit and cannot move rooms'';END IF;
 moved_at:=clock_timestamp();business_date:=(moved_at AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped reservation'';END IF;
 IF res.source_version<>p_expected_source_version OR res.physical_room_id IS DISTINCT FROM p_from_room THEN RAISE EXCEPTION ''Stay assignment or source version changed; refresh before moving'' USING ERRCODE=''PT409'';END IF;
 IF res.status<>''In house'' OR res.arrival>business_date THEN RAISE EXCEPTION ''Only a currently in-house stay can move rooms'';END IF;
 -- Same stable room ordering as156 occupancy revision. The property lock also
 -- serializes legacy check-in/out, housekeeping, bookings and all room moves.
 PERFORM 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id IN(p_from_room,p_to_room) ORDER BY id FOR UPDATE;
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped origin room'';END IF;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped destination room'';END IF;
 IF old_room.state_version<>p_expected_from_room_version OR new_room.state_version<>p_expected_to_room_version THEN RAISE EXCEPTION ''Room state changed; refresh before moving'' USING ERRCODE=''PT409'';END IF;
 IF old_room.room_type_id IS DISTINCT FROM res.room_type_id OR new_room.room_type_id IS DISTINCT FROM res.room_type_id THEN RAISE EXCEPTION ''Both rooms must match the booked room type'';END IF;
 IF new_room.housekeeping<>''Clean'' THEN RAISE EXCEPTION ''The destination room must be Clean'';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_to_room AND state NOT IN(''completed'',''cancelled'')) THEN RAISE EXCEPTION ''Destination room has unfinished turnover work'';END IF;
 IF irp_pms.room_is_closed(p_tenant,p_property,p_to_room,business_date,CASE WHEN res.departure<business_date THEN NULL ELSE greatest(res.departure,business_date+1) END) THEN RAISE EXCEPTION ''Destination room has a maintenance closure during the remaining stay'';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id IN(p_from_room,p_to_room) AND r.status=''In house'') THEN RAISE EXCEPTION ''A selected room is occupied by another in-house stay'';END IF;
 -- A due-out guest still physically occupies today''s room until checkout.
 -- An overdue stay has no resolved end, so all future assignments conflict.
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id=p_to_room AND r.status=''Confirmed'' AND r.departure>business_date AND (res.departure<business_date OR r.arrival<greatest(res.departure,business_date+1))) THEN RAISE EXCEPTION ''Destination room has an overlapping assigned reservation'';END IF;
 UPDATE irp_pms.reservations SET physical_room_id=p_to_room WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,p_from_room,''room_move'',p_request::text,res.id,res.source_version,auth.uid(),moved_at,trim(p_reason));
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 result:=jsonb_build_object(''request_id'',p_request,''reservation'',to_jsonb(res),''from_room'',to_jsonb(old_room),''to_room'',to_jsonb(new_room),''business_date'',business_date,''moved_at'',moved_at,''source_version_retained'',true,''pricing_changed'',false,''folio_changed'',false,''replayed'',false);
 INSERT INTO irp_pms.room_move_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),''room_moved'',p_reservation,command||jsonb_build_object(''request_id'',p_request,''from_room_version_after'',old_room.state_version,''to_room_version_after'',new_room.state_version,''business_date'',business_date,''moved_at'',moved_at));
 RETURN result;
END $$;

-- Forward from 202609070168_iratepilot_pms_operational_authorization.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_housekeeping(p_tenant uuid,p_property uuid,p_room uuid,p_request uuid,p_expected_version bigint,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;prior irp_pms.housekeeping_requests;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_room IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_status IS NULL OR p_status NOT IN(''Clean'',''Dirty'',''Inspect'') THEN RAISE EXCEPTION ''Room, request, expected state version and housekeeping status are required''; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 -- Recheck membership after a possible lock wait before applying a new action.
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.housekeeping_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.room_id IS DISTINCT FROM p_room OR prior.expected_version IS DISTINCT FROM p_expected_version OR prior.requested_status IS DISTINCT FROM p_status THEN RAISE EXCEPTION ''Housekeeping request identity already used''; END IF;
  RETURN prior.result||jsonb_build_object(''replayed'',true);
 END IF;
 IF p_status IN(''Clean'',''Inspect'') THEN RAISE EXCEPTION ''Use turnover cleaning and manager inspection to mark a room ready'';END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped physical room''; END IF;
 IF room.state_version<>p_expected_version THEN RAISE EXCEPTION ''Room state changed; refresh before updating housekeeping'' USING ERRCODE=''PT409''; END IF;
 IF p_status IN(''Clean'',''Inspect'') AND EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status=''In house'') THEN RAISE EXCEPTION ''Occupied room cannot be marked ready''; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status=''In house'') THEN
  UPDATE irp_pms.rooms SET housekeeping=p_status WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 ELSE
  PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,p_room,''readiness_dirty'',p_request::text,NULL,NULL,auth.uid(),clock_timestamp(),''Room explicitly marked Dirty'');
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room;
 END IF;
 result:=jsonb_build_object(''room'',to_jsonb(room),''request_id'',p_request,''replayed'',false);
 INSERT INTO irp_pms.housekeeping_requests(tenant_id,property_id,request_id,room_id,actor_id,expected_version,requested_status,result) VALUES(p_tenant,p_property,p_request,p_room,auth.uid(),p_expected_version,p_status,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),''housekeeping_updated'',p_room,jsonb_build_object(''status'',p_status,''previous_version'',p_expected_version,''state_version'',room.state_version,''request_id'',p_request));
 RETURN result;
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_workspace(p_tenant uuid,p_property uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 IF (SELECT count(*) FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND c.effective_end>business_date)>10000 THEN RAISE EXCEPTION ''Too many active or future maintenance intervals for this workspace''; END IF;
 RETURN jsonb_build_object(''property'',to_jsonb(prop),''role'',member_role,''business_date'',business_date,''overdue_policy'',''block_future_until_resolved'',
 ''room_types'',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM irp_pms.room_types r WHERE tenant_id=p_tenant AND property_id=p_property),''[]''::jsonb),
 ''rooms'',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(''open_turnover_task'',(SELECT jsonb_build_object(''id'',t.id,''version'',t.version,''state'',t.state) FROM irp_pms.turnover_tasks t WHERE t.tenant_id=r.tenant_id AND t.property_id=r.property_id AND t.room_id=r.id AND t.state NOT IN(''completed'',''cancelled'')),''maintenance_intervals'',coalesce((SELECT jsonb_agg(jsonb_build_object(''closure_id'',m.id,''start'',m.scheduled_start,''end'',m.effective_end,''end_exclusive'',true) ORDER BY m.scheduled_start,m.id) FROM irp_pms.room_closures m WHERE m.tenant_id=r.tenant_id AND m.property_id=r.property_id AND m.room_id=r.id AND m.effective_end>m.scheduled_start AND m.effective_end>business_date),''[]''::jsonb)) ORDER BY r.label) FROM irp_pms.rooms r WHERE tenant_id=p_tenant AND property_id=p_property),''[]''::jsonb),
 ''reservations'',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(''inventory_overdue'',r.status=''In house'' AND r.departure<business_date) ORDER BY r.arrival,r.id) FROM irp_pms.reservations r WHERE tenant_id=p_tenant AND property_id=p_property),''[]''::jsonb),
 ''capacity'',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object(''configured_units'',m.configured_units,''physical_units'',m.physical_units,''closed_units'',m.closed_units,''effective_units'',m.effective_units,''reserved_units'',u.used,''available_units'',CASE WHEN m.effective_units IS NULL THEN NULL ELSE greatest(0,m.effective_units-u.used) END,''shortfall_units'',CASE WHEN m.effective_units IS NULL THEN NULL ELSE greatest(0,u.used-m.effective_units) END,''overdue_units'',u.overdue) ORDER BY c.stay_date,c.room_type_id) FROM irp_pms.nightly_capacity c CROSS JOIN LATERAL irp_pms.maintenance_capacity(c.tenant_id,c.property_id,c.room_type_id,c.stay_date) m CROSS JOIN LATERAL (SELECT count(*)::integer used,count(*) FILTER(WHERE r.status=''In house'' AND r.departure<business_date)::integer overdue FROM irp_pms.reservations r WHERE r.tenant_id=c.tenant_id AND r.property_id=c.property_id AND r.room_type_id=c.room_type_id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,c.stay_date,business_date)) u WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.stay_date>=business_date),''[]''::jsonb),
 ''activity'',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id DESC) FROM (SELECT * FROM irp_pms.activity WHERE tenant_id=p_tenant AND property_id=p_property ORDER BY id DESC LIMIT 50) a),''[]''::jsonb));
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_configure_property(p_tenant uuid,p_property uuid,p_name text,p_time_zone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_time_zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone) THEN RAISE EXCEPTION ''Unknown property time zone''; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN(''completed'',''cancelled'')) THEN RAISE EXCEPTION ''Resolve open turnover work before changing property time zone'';END IF;
 IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND (c.effective_end>(clock_timestamp() AT TIME ZONE prop.time_zone)::date OR c.effective_end>(clock_timestamp() AT TIME ZONE p_time_zone)::date)) THEN RAISE EXCEPTION ''Resolve maintenance closures before changing a time zone that affects their current or future dates''; END IF;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 UPDATE irp_pms.properties SET name=trim(p_name),time_zone=p_time_zone WHERE tenant_id=p_tenant AND id=p_property RETURNING * INTO prop;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),''property_updated'',p_property);
 RETURN to_jsonb(prop);
END $$;

-- Forward from 202609070170_iratepilot_pms_room_maintenance.sql; turnover lifecycle enforcement.
CREATE OR REPLACE FUNCTION irp_pms.apply_operating_model(p_tenant uuid,p_property uuid,p_mode text,p_max_guests integer) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; unit_type uuid;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN(''hotel'',''whole_home'') OR (p_mode=''hotel'' AND p_max_guests IS NOT NULL) OR (p_mode=''whole_home'' AND (p_max_guests IS NULL OR p_max_guests NOT BETWEEN 1 AND 20)) THEN RAISE EXCEPTION ''Choose hotel with no unit guest limit, or whole_home with 1 to 20 guests''; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION ''Unknown scoped property''; END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN(''completed'',''cancelled'')) THEN RAISE EXCEPTION ''Resolve open turnover work before changing property operating model'';END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND c.effective_end>(clock_timestamp() AT TIME ZONE prop.time_zone)::date) THEN RAISE EXCEPTION ''Resolve current and future maintenance closures before changing the property operating model''; END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND status IN(''Confirmed'',''In house'')) THEN RAISE EXCEPTION ''Resolve active reservations before changing the property operating model''; END IF;
 IF p_mode=''whole_home'' THEN
  IF (SELECT count(*) FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property)>1 OR (SELECT count(*) FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property)>1 OR EXISTS(SELECT 1 FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND units>1) THEN RAISE EXCEPTION ''Whole-home conversion requires at most one existing room type, one physical unit and no capacity above one''; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND status IN(''Confirmed'',''In house'') AND guests>p_max_guests) THEN RAISE EXCEPTION ''Guest limit is below existing reservations''; END IF;
 END IF;
 IF prop.operating_model IS DISTINCT FROM p_mode OR prop.whole_home_max_guests IS DISTINCT FROM p_max_guests THEN
  UPDATE irp_pms.properties SET operating_model=p_mode,whole_home_max_guests=p_max_guests,operating_model_version=operating_model_version+1 WHERE tenant_id=p_tenant AND id=p_property;
 END IF;
 IF p_mode=''whole_home'' THEN
  SELECT id INTO unit_type FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property;
  IF NOT FOUND THEN
   INSERT INTO irp_pms.room_types(tenant_id,property_id,name,max_guests) VALUES(p_tenant,p_property,''Entire home'',p_max_guests) RETURNING id INTO unit_type;
  ELSE
   UPDATE irp_pms.room_types SET max_guests=p_max_guests WHERE tenant_id=p_tenant AND property_id=p_property AND id=unit_type;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property) THEN
   INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label) VALUES(p_tenant,p_property,unit_type,''HOME'');
  END IF;
 END IF;
END $$;
']);
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='202609070171';
