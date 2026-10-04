-- Metadata-only pricing dependency slice from the actual PMS, 2026-09-30.
-- Isolated test fixture: not a deployable full PMS schema or a data export.
SET check_function_bodies=off;
CREATE TABLE irp_pms."activity" (
 "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "actor_id" uuid NOT NULL,
 "action" text NOT NULL,
 "target_id" uuid,
 "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE irp_pms."memberships" (
 "tenant_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "role" text NOT NULL
);
CREATE TABLE irp_pms."nightly_capacity" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "room_type_id" uuid NOT NULL,
 "stay_date" date NOT NULL,
 "units" integer NOT NULL
);
CREATE TABLE irp_pms."nightly_rates" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "plan_id" uuid NOT NULL,
 "stay_date" date NOT NULL,
 "amount_minor" bigint NOT NULL
);
CREATE TABLE irp_pms."properties" (
 "tenant_id" uuid NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "currency" text NOT NULL,
 "time_zone" text DEFAULT 'America/Chicago'::text NOT NULL,
 "operating_model" text DEFAULT 'hotel'::text NOT NULL,
 "operating_model_version" bigint DEFAULT 1 NOT NULL,
 "whole_home_max_guests" integer,
 "cleaning_fee" jsonb DEFAULT '{"basis": "per_stay", "taxes": [], "enabled": false, "amount_minor": 0}'::jsonb NOT NULL,
 "property_fees_version" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE irp_pms."rate_actions" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "request_id" uuid NOT NULL,
 "actor_id" uuid NOT NULL,
 "payload" jsonb NOT NULL,
 "result" jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE irp_pms."rate_plans" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "room_type_id" uuid NOT NULL,
 "name" text NOT NULL,
 "tax_basis_points" integer NOT NULL,
 "active" boolean NOT NULL,
 "version" bigint DEFAULT 1 NOT NULL,
 "updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
 "charges" jsonb
);
CREATE TABLE irp_pms."reservation_charge_snapshots" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "reservation_id" uuid NOT NULL,
 "source_version" bigint NOT NULL,
 "charge_breakdown" jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE irp_pms."reservations" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "source" text NOT NULL,
 "source_booking_id" text NOT NULL,
 "source_version" bigint NOT NULL,
 "payload_hash" text NOT NULL,
 "status" text NOT NULL,
 "room_type_id" uuid,
 "arrival" date,
 "departure" date,
 "guests" integer,
 "accommodation_minor" bigint,
 "taxes_minor" bigint,
 "ota_fees_minor" bigint,
 "guest_total_minor" bigint,
 "guest_name" text,
 "physical_room_id" uuid,
 "checked_in_at" timestamp with time zone,
 "checked_out_at" timestamp with time zone,
 "migration_provider" text,
 "migration_source_id" text,
 "hotel_fees_minor" bigint DEFAULT 0 NOT NULL,
 "charge_breakdown" jsonb,
 "cancellation_disposition" text,
 "no_show_recorded_at" timestamp with time zone
);
CREATE TABLE irp_pms."room_closures" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "room_id" uuid NOT NULL,
 "room_type_id" uuid NOT NULL,
 "scheduled_start" date NOT NULL,
 "scheduled_end" date NOT NULL,
 "effective_end" date NOT NULL,
 "reason" text NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "created_by" uuid NOT NULL,
 "created_time_zone" text NOT NULL,
 "created_business_date" date NOT NULL,
 "released_at" timestamp with time zone,
 "released_by" uuid,
 "release_reason" text,
 "released_business_date" date
);
CREATE TABLE irp_pms."room_types" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "max_guests" integer DEFAULT 4 NOT NULL
);
CREATE TABLE irp_pms."rooms" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "room_type_id" uuid NOT NULL,
 "label" text NOT NULL,
 "housekeeping" text DEFAULT 'Dirty'::text NOT NULL,
 "state_version" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE irp_pms."service_books" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "first_service_date" date NOT NULL,
 "next_service_date" date NOT NULL,
 "time_zone" text NOT NULL,
 "version" bigint DEFAULT 1 NOT NULL,
 "opened_by" uuid NOT NULL,
 "opened_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE irp_pms."service_day_closes" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "service_date" date NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "request_id" uuid NOT NULL,
 "actor_id" uuid NOT NULL,
 "preview_hash" text NOT NULL,
 "snapshot" jsonb NOT NULL,
 "closed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE irp_pms."service_day_entries" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "service_date" date NOT NULL,
 "reservation_id" uuid NOT NULL,
 "source_version" bigint NOT NULL,
 "pricing_hash" text NOT NULL,
 "allocation_source" text NOT NULL,
 "room_type_id" uuid,
 "physical_room_id" uuid,
 "occupied_night" boolean NOT NULL,
 "accommodation_minor" bigint NOT NULL,
 "taxes_minor" bigint NOT NULL,
 "hotel_fees_minor" bigint NOT NULL,
 "ota_fees_minor" bigint NOT NULL,
 "other_revenue_minor" bigint NOT NULL,
 "total_minor" bigint NOT NULL,
 "details" jsonb NOT NULL
);
CREATE TABLE irp_pms."service_reconciliation" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "reservation_id" uuid NOT NULL,
 "changed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE irp_pms."tenants" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL
);
CREATE TABLE irp_pms."turnover_tasks" (
 "tenant_id" uuid NOT NULL,
 "property_id" uuid NOT NULL,
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "room_id" uuid NOT NULL,
 "version" bigint DEFAULT 1 NOT NULL,
 "work_generation" bigint DEFAULT 1 NOT NULL,
 "state" text DEFAULT 'queued'::text NOT NULL,
 "assignee_id" uuid,
 "due_date" date NOT NULL,
 "created_at" timestamp with time zone NOT NULL,
 "created_by" uuid NOT NULL,
 "created_time_zone" text NOT NULL,
 "creation_operating_model" text NOT NULL,
 "created_room_label" text NOT NULL,
 "created_room_type_id" uuid NOT NULL,
 "origin_kind" text NOT NULL,
 "checklist_version" integer DEFAULT 1 NOT NULL,
 "checklist" jsonb NOT NULL,
 "started_at" timestamp with time zone,
 "started_by" uuid,
 "submitted_at" timestamp with time zone,
 "submitted_by" uuid,
 "submitted_room_version" bigint,
 "submission" jsonb,
 "inspected_at" timestamp with time zone,
 "inspected_by" uuid,
 "closed_at" timestamp with time zone,
 "closed_by" uuid,
 "close_reason" text
);
CREATE OR REPLACE FUNCTION irp_pms.normalize_cleaning_fee(p_cleaning jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE taxes jsonb;amount numeric;
BEGIN
 IF p_cleaning IS NULL OR octet_length(p_cleaning::text)>2048 OR jsonb_typeof(p_cleaning) IS DISTINCT FROM 'object' OR
  (SELECT count(*) FROM jsonb_object_keys(p_cleaning))<>4 OR NOT(p_cleaning ?& ARRAY['enabled','amount_minor','basis','taxes']) OR
  jsonb_typeof(p_cleaning->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_cleaning->'amount_minor') IS DISTINCT FROM 'number' OR
  jsonb_typeof(p_cleaning->'basis') IS DISTINCT FROM 'string' OR p_cleaning->>'basis'<>'per_stay' OR jsonb_typeof(p_cleaning->'taxes') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Cleaning fee requires only enabled, USD amount_minor, per_stay basis and tax categories';END IF;
 amount:=(p_cleaning->>'amount_minor')::numeric;
 IF amount<>trunc(amount) OR amount NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Cleaning fee must use a supported nonnegative integer USD amount';END IF;
 IF jsonb_array_length(p_cleaning->'taxes')>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_cleaning->'taxes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('city','state','lodging')) OR
  (SELECT count(*) FROM jsonb_array_elements(p_cleaning->'taxes'))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(p_cleaning->'taxes') x)
 THEN RAISE EXCEPTION 'Cleaning tax categories must be unique City, State or Lodging categories';END IF;
 SELECT coalesce(jsonb_agg(code ORDER BY ord),'[]'::jsonb) INTO taxes FROM unnest(ARRAY['city','state','lodging']) WITH ORDINALITY AS t(code,ord) WHERE (p_cleaning->'taxes') ? code;
 RETURN jsonb_build_object('enabled',p_cleaning->'enabled','amount_minor',amount::bigint,'basis','per_stay','taxes',taxes);
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.turnover_checklist(p_model text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT '[{"key":"linen","label":"Linen prepared"},{"key":"bathroom","label":"Bathroom cleaned"},{"key":"surfaces","label":"Surfaces cleaned"},{"key":"waste","label":"Waste removed"},{"key":"supplies","label":"Guest supplies checked"}]'::jsonb
 ||CASE WHEN p_model='whole_home' THEN '[{"key":"kitchen","label":"Kitchen cleaned and checked"}]'::jsonb ELSE '[]'::jsonb END
$function$;
CREATE OR REPLACE FUNCTION irp_pms.room_state_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 -- Preserve the historical room-type snapshot without preventing a later
 -- administrative reassignment after every effective closure has ended.
 IF NEW.room_type_id IS DISTINCT FROM OLD.room_type_id AND EXISTS(
  SELECT 1 FROM irp_pms.room_closures c JOIN irp_pms.properties p ON p.tenant_id=c.tenant_id AND p.id=c.property_id
  WHERE c.tenant_id=OLD.tenant_id AND c.property_id=OLD.property_id AND c.room_id=OLD.id
  AND c.effective_end>greatest(c.scheduled_start,(clock_timestamp() AT TIME ZONE p.time_zone)::date)
 ) THEN RAISE EXCEPTION 'A room with a current or future effective maintenance closure cannot change room type';END IF;
 IF NEW.state_version IS DISTINCT FROM OLD.state_version AND NEW.state_version IS DISTINCT FROM OLD.state_version+1 THEN RAISE EXCEPTION 'Room state version must advance by one';END IF;
 IF NEW.housekeeping IS DISTINCT FROM OLD.housekeeping OR NEW.room_type_id IS DISTINCT FROM OLD.room_type_id OR NEW.label IS DISTINCT FROM OLD.label THEN NEW.state_version:=OLD.state_version+1;END IF;
 IF NEW.state_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Room state version limit reached';END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.room_occupancy_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE old_tenant uuid;old_property uuid;old_room uuid;new_tenant uuid;new_property uuid;new_room uuid;touched record;
BEGIN
 IF TG_OP='UPDATE' AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id AND OLD.physical_room_id IS NOT DISTINCT FROM NEW.physical_room_id AND OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.arrival IS NOT DISTINCT FROM NEW.arrival AND OLD.departure IS NOT DISTINCT FROM NEW.departure AND OLD.checked_in_at IS NOT DISTINCT FROM NEW.checked_in_at AND OLD.checked_out_at IS NOT DISTINCT FROM NEW.checked_out_at THEN RETURN NEW; END IF;
 IF TG_OP IN('UPDATE','DELETE') THEN old_tenant:=OLD.tenant_id;old_property:=OLD.property_id;old_room:=OLD.physical_room_id; END IF;
 IF TG_OP IN('INSERT','UPDATE') THEN new_tenant:=NEW.tenant_id;new_property:=NEW.property_id;new_room:=NEW.physical_room_id; END IF;
 FOR touched IN SELECT DISTINCT tenant_id,property_id,room_id FROM (VALUES(old_tenant,old_property,old_room),(new_tenant,new_property,new_room)) AS r(tenant_id,property_id,room_id) WHERE room_id IS NOT NULL ORDER BY tenant_id,property_id,room_id LOOP
  UPDATE irp_pms.rooms SET state_version=state_version+1 WHERE tenant_id=touched.tenant_id AND property_id=touched.property_id AND id=touched.room_id;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.reservation_adjust_charge_breakdown()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE retained_fees jsonb;
BEGIN
 IF OLD.charge_breakdown IS NOT NULL AND NEW.charge_breakdown IS NOT DISTINCT FROM OLD.charge_breakdown AND
 (NEW.arrival IS DISTINCT FROM OLD.arrival OR NEW.departure IS DISTINCT FROM OLD.departure OR NEW.room_type_id IS DISTINCT FROM OLD.room_type_id OR NEW.accommodation_minor IS DISTINCT FROM OLD.accommodation_minor OR NEW.taxes_minor IS DISTINCT FROM OLD.taxes_minor OR NEW.hotel_fees_minor IS DISTINCT FROM OLD.hotel_fees_minor OR NEW.ota_fees_minor IS DISTINCT FROM OLD.ota_fees_minor OR NEW.guest_total_minor IS DISTINCT FROM OLD.guest_total_minor) THEN
  SELECT coalesce(jsonb_agg(f||jsonb_build_object('retained',true)),'[]'::jsonb) INTO retained_fees FROM jsonb_array_elements(OLD.charge_breakdown->'fees') f;
  NEW.charge_breakdown:=jsonb_build_object('version',1,'mode','adjusted','currency','USD','arrival',NEW.arrival,'departure',NEW.departure,
   'accommodation_minor',NEW.accommodation_minor,'taxes_minor',NEW.taxes_minor,'hotel_fees_minor',NEW.hotel_fees_minor,'ota_fees_minor',NEW.ota_fees_minor,'total_minor',NEW.guest_total_minor,
   'taxes',jsonb_build_array(jsonb_build_object('code','adjusted_total','label','Adjusted tax total','basis_points',NULL,'taxable_base_minor',NULL,'amount_minor',NEW.taxes_minor)),
   'fees',retained_fees,'fees_retained',true,'requires_reconciliation',true,
   'fee_basis_arrival',coalesce(OLD.charge_breakdown->'fee_basis_arrival',OLD.charge_breakdown->'arrival'),'fee_basis_departure',coalesce(OLD.charge_breakdown->'fee_basis_departure',OLD.charge_breakdown->'departure'));
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.reservation_record_charge_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF NEW.charge_breakdown IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.charge_breakdown IS NOT DISTINCT FROM NEW.charge_breakdown AND OLD.source_version=NEW.source_version THEN RETURN NEW; END IF;
 INSERT INTO irp_pms.reservation_charge_snapshots(tenant_id,property_id,reservation_id,source_version,charge_breakdown) VALUES(NEW.tenant_id,NEW.property_id,NEW.id,NEW.source_version,NEW.charge_breakdown);
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.whole_home_unit_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE prop irp_pms.properties; t uuid; p uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.property_id IS DISTINCT FROM OLD.property_id) THEN RAISE EXCEPTION 'Inventory scope is immutable'; END IF;
 IF TG_OP='DELETE' THEN t:=OLD.tenant_id;p:=OLD.property_id;ELSE t:=NEW.tenant_id;p:=NEW.property_id;END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=t AND id=p FOR UPDATE;
 IF prop.operating_model='whole_home' THEN
  IF TG_TABLE_NAME='nightly_capacity' THEN
   IF TG_OP<>'DELETE' AND NEW.units>1 THEN RAISE EXCEPTION 'A whole-home property has at most one available unit'; END IF;
  ELSIF TG_TABLE_NAME='room_types' THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'The whole-home sellable unit cannot be removed'; END IF;
   IF EXISTS(SELECT 1 FROM irp_pms.room_types WHERE tenant_id=t AND property_id=p AND id<>NEW.id) THEN RAISE EXCEPTION 'A whole-home property has exactly one room type'; END IF;
   IF NEW.max_guests IS DISTINCT FROM prop.whole_home_max_guests THEN RAISE EXCEPTION 'Change whole-home guest limits through operating model settings'; END IF;
  ELSIF TG_TABLE_NAME='rooms' THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'The whole-home physical unit cannot be removed'; END IF;
   IF EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=t AND property_id=p AND id<>NEW.id) THEN RAISE EXCEPTION 'A whole-home property has exactly one physical unit'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.whole_home_property_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE prop irp_pms.properties;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 IF prop.operating_model='whole_home' AND (
  (SELECT count(*) FROM irp_pms.room_types WHERE tenant_id=prop.tenant_id AND property_id=prop.id)<>1 OR
  (SELECT count(*) FROM irp_pms.rooms WHERE tenant_id=prop.tenant_id AND property_id=prop.id)<>1 OR
  EXISTS(SELECT 1 FROM irp_pms.room_types WHERE tenant_id=prop.tenant_id AND property_id=prop.id AND max_guests IS DISTINCT FROM prop.whole_home_max_guests) OR
  EXISTS(SELECT 1 FROM irp_pms.nightly_capacity WHERE tenant_id=prop.tenant_id AND property_id=prop.id AND units>1)
 ) THEN RAISE EXCEPTION 'Whole-home properties require one room type, one physical unit, a matching guest limit and capacity at most one'; END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.service_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE reservation_uuid uuid;
BEGIN
 IF TG_TABLE_NAME='reservations' THEN
  IF NEW.arrival IS NOT DISTINCT FROM OLD.arrival AND NEW.departure IS NOT DISTINCT FROM OLD.departure AND NEW.room_type_id IS NOT DISTINCT FROM OLD.room_type_id AND NEW.accommodation_minor IS NOT DISTINCT FROM OLD.accommodation_minor AND NEW.taxes_minor IS NOT DISTINCT FROM OLD.taxes_minor AND NEW.hotel_fees_minor IS NOT DISTINCT FROM OLD.hotel_fees_minor AND NEW.ota_fees_minor IS NOT DISTINCT FROM OLD.ota_fees_minor AND NEW.guest_total_minor IS NOT DISTINCT FROM OLD.guest_total_minor AND NEW.charge_breakdown IS NOT DISTINCT FROM OLD.charge_breakdown THEN RETURN NEW;END IF;
  reservation_uuid:=NEW.id;
 ELSE
  IF NEW.kind NOT IN('charge','charge_reversal') THEN RETURN NEW;END IF;
  reservation_uuid:=NEW.reservation_id;
 END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.service_day_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=reservation_uuid) THEN
  INSERT INTO irp_pms.service_reconciliation(tenant_id,property_id,reservation_id) VALUES(NEW.tenant_id,NEW.property_id,reservation_uuid) ON CONFLICT(tenant_id,property_id,reservation_id) DO UPDATE SET changed_at=clock_timestamp();
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.no_show_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF TG_TABLE_NAME='no_show_requests' THEN RAISE EXCEPTION 'No-show receipts are immutable';END IF;
 IF OLD.cancellation_disposition IS NOT NULL AND (NEW.cancellation_disposition IS DISTINCT FROM OLD.cancellation_disposition OR NEW.no_show_recorded_at IS DISTINCT FROM OLD.no_show_recorded_at) THEN RAISE EXCEPTION 'Recorded no-show disposition is immutable';END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.property_fee_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 NEW.cleaning_fee:=irp_pms.normalize_cleaning_fee(NEW.cleaning_fee);
 IF (NEW.cleaning_fee->>'enabled')::boolean AND NEW.operating_model<>'whole_home' THEN RAISE EXCEPTION 'Only whole-home properties can enable Cleaning; disable it before changing to hotel';END IF;
 IF TG_OP='INSERT' THEN NEW.property_fees_version:=1;
 ELSIF NEW.cleaning_fee IS DISTINCT FROM OLD.cleaning_fee OR NEW.operating_model IS DISTINCT FROM OLD.operating_model THEN
  IF OLD.property_fees_version>=9007199254740991 THEN RAISE EXCEPTION 'Property fee version limit reached';END IF;
  NEW.property_fees_version:=OLD.property_fees_version+1;
 ELSE NEW.property_fees_version:=OLD.property_fees_version;
 END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.maintenance_creation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms r WHERE r.tenant_id=NEW.tenant_id AND r.property_id=NEW.property_id AND r.id=NEW.room_id AND r.room_type_id=NEW.room_type_id)
 THEN RAISE EXCEPTION 'A closure must capture the scoped room type in effect when it is created';END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.maintenance_history_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF TG_TABLE_NAME='maintenance_requests' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Maintenance history and request receipts cannot be deleted or rewritten';END IF;
 IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL
 OR (to_jsonb(NEW)-ARRAY['effective_end','released_at','released_by','release_reason','released_business_date'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['effective_end','released_at','released_by','release_reason','released_business_date'])
 THEN RAISE EXCEPTION 'A closure permits one explicit early release; its original schedule and creation record are immutable';END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.turnover_history_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF TG_TABLE_NAME<>'turnover_tasks' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Turnover origins, events and request receipts are immutable; task history cannot be deleted';END IF;
 IF OLD.state IN('completed','cancelled') THEN RAISE EXCEPTION 'Completed and cancelled turnover tasks are immutable; create new work';END IF;
 IF NEW.version<>OLD.version+1 OR NEW.work_generation NOT IN(OLD.work_generation,OLD.work_generation+1) THEN RAISE EXCEPTION 'Turnover revisions must advance exactly once';END IF;
 IF NEW.work_generation<>OLD.work_generation AND NEW.state<>'queued' THEN RAISE EXCEPTION 'A new work generation must return to queued';END IF;
 IF (NEW.tenant_id,NEW.property_id,NEW.id,NEW.room_id,NEW.created_at,NEW.created_by,NEW.created_time_zone,NEW.creation_operating_model,NEW.created_room_label,NEW.created_room_type_id,NEW.origin_kind,NEW.checklist_version,NEW.checklist)
 IS DISTINCT FROM (OLD.tenant_id,OLD.property_id,OLD.id,OLD.room_id,OLD.created_at,OLD.created_by,OLD.created_time_zone,OLD.creation_operating_model,OLD.created_room_label,OLD.created_room_type_id,OLD.origin_kind,OLD.checklist_version,OLD.checklist)
 THEN RAISE EXCEPTION 'Turnover identity and creation context are immutable';END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.turnover_property_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.turnover_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE room irp_pms.rooms;prop irp_pms.properties;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.room_id;
 IF room.id IS NULL OR prop.id IS NULL OR NEW.version<>1 OR NEW.work_generation<>1 OR NEW.state<>'queued'
 OR (NEW.created_room_label,NEW.created_room_type_id,NEW.created_time_zone,NEW.creation_operating_model,NEW.checklist)
 IS DISTINCT FROM (room.label,room.room_type_id,prop.time_zone,prop.operating_model,irp_pms.turnover_checklist(prop.operating_model))
 THEN RAISE EXCEPTION 'Turnover creation snapshot must match the scoped room and property';END IF;
 RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION irp_pms.assigned_room_overlap_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE day date;
BEGIN
 IF NEW.physical_room_id IS NULL OR NEW.status NOT IN('Confirmed','In house') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.property_id,NEW.physical_room_id,NEW.status,NEW.arrival,NEW.departure) IS NOT DISTINCT FROM (OLD.tenant_id,OLD.property_id,OLD.physical_room_id,OLD.status,OLD.arrival,OLD.departure) THEN RETURN NEW;END IF;
 END IF;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO day FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=NEW.tenant_id AND r.property_id=NEW.property_id AND r.id<>NEW.id AND r.physical_room_id=NEW.physical_room_id AND r.status IN('Confirmed','In house') AND (
  r.arrival<NEW.departure AND r.departure>NEW.arrival
  OR r.status='In house' AND r.departure<=day AND NEW.departure>day
  OR NEW.status='In house' AND NEW.departure<=day AND r.departure>day
  OR NEW.status='In house' AND r.status='In house'
 )) THEN RAISE EXCEPTION 'Room is assigned to an overlapping or unresolved in-house stay' USING ERRCODE='23P01';END IF;
 RETURN NEW;
END $function$;
ALTER TABLE irp_pms."activity" ADD CONSTRAINT "activity_pkey" PRIMARY KEY (id);
ALTER TABLE irp_pms."memberships" ADD CONSTRAINT "memberships_pkey" PRIMARY KEY (tenant_id, user_id);
ALTER TABLE irp_pms."nightly_capacity" ADD CONSTRAINT "nightly_capacity_pkey" PRIMARY KEY (tenant_id, property_id, room_type_id, stay_date);
ALTER TABLE irp_pms."nightly_rates" ADD CONSTRAINT "nightly_rates_pkey" PRIMARY KEY (tenant_id, property_id, plan_id, stay_date);
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "properties_pkey" PRIMARY KEY (tenant_id, id);
ALTER TABLE irp_pms."rate_actions" ADD CONSTRAINT "rate_actions_pkey" PRIMARY KEY (tenant_id, property_id, request_id);
ALTER TABLE irp_pms."rate_plans" ADD CONSTRAINT "rate_plans_pkey" PRIMARY KEY (tenant_id, property_id, id);
ALTER TABLE irp_pms."reservation_charge_snapshots" ADD CONSTRAINT "reservation_charge_snapshots_pkey" PRIMARY KEY (tenant_id, property_id, reservation_id, source_version);
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_pkey" PRIMARY KEY (tenant_id, property_id, id);
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_pkey" PRIMARY KEY (tenant_id, property_id, id);
ALTER TABLE irp_pms."room_types" ADD CONSTRAINT "room_types_pkey" PRIMARY KEY (tenant_id, property_id, id);
ALTER TABLE irp_pms."rooms" ADD CONSTRAINT "rooms_pkey" PRIMARY KEY (tenant_id, property_id, id);
ALTER TABLE irp_pms."service_books" ADD CONSTRAINT "service_books_pkey" PRIMARY KEY (tenant_id, property_id);
ALTER TABLE irp_pms."service_day_closes" ADD CONSTRAINT "service_day_closes_pkey" PRIMARY KEY (tenant_id, property_id, service_date);
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_pkey" PRIMARY KEY (tenant_id, property_id, service_date, reservation_id);
ALTER TABLE irp_pms."service_reconciliation" ADD CONSTRAINT "service_reconciliation_pkey" PRIMARY KEY (tenant_id, property_id, reservation_id);
ALTER TABLE irp_pms."tenants" ADD CONSTRAINT "tenants_pkey" PRIMARY KEY (id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_pkey" PRIMARY KEY (tenant_id, property_id, id);
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_tenant_id_property_id_source_source_booking_id_key" UNIQUE (tenant_id, property_id, source, source_booking_id);
ALTER TABLE irp_pms."rooms" ADD CONSTRAINT "rooms_tenant_id_property_id_label_key" UNIQUE (tenant_id, property_id, label);
ALTER TABLE irp_pms."service_day_closes" ADD CONSTRAINT "service_day_closes_tenant_id_property_id_id_key" UNIQUE (tenant_id, property_id, id);
ALTER TABLE irp_pms."memberships" ADD CONSTRAINT "memberships_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text])));
ALTER TABLE irp_pms."nightly_capacity" ADD CONSTRAINT "nightly_capacity_units_check" CHECK ((units >= 0));
ALTER TABLE irp_pms."nightly_rates" ADD CONSTRAINT "nightly_rates_amount_minor_check" CHECK (((amount_minor >= 0) AND (amount_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "properties_currency_check" CHECK ((currency = 'USD'::text));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "properties_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 200)));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "properties_operating_model_check" CHECK ((operating_model = ANY (ARRAY['hotel'::text, 'whole_home'::text])));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "properties_operating_model_version_check" CHECK (((operating_model_version >= 1) AND (operating_model_version <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "properties_property_fees_version_check" CHECK (((property_fees_version >= 1) AND (property_fees_version <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "property_cleaning_fee_canonical" CHECK ((cleaning_fee = irp_pms.normalize_cleaning_fee(cleaning_fee)));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "property_cleaning_whole_home" CHECK (((operating_model = 'whole_home'::text) OR (NOT ((cleaning_fee ->> 'enabled'::text))::boolean)));
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "property_operating_model_guests" CHECK ((((operating_model = 'hotel'::text) AND (whole_home_max_guests IS NULL)) OR ((operating_model = 'whole_home'::text) AND ((whole_home_max_guests >= 1) AND (whole_home_max_guests <= 20)) AND (whole_home_max_guests IS NOT NULL))));
ALTER TABLE irp_pms."rate_plans" ADD CONSTRAINT "rate_plans_charges_check" CHECK (((charges IS NULL) OR (jsonb_typeof(charges) = 'object'::text)));
ALTER TABLE irp_pms."rate_plans" ADD CONSTRAINT "rate_plans_name_check" CHECK ((((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 100)) AND (name = TRIM(BOTH FROM name))));
ALTER TABLE irp_pms."rate_plans" ADD CONSTRAINT "rate_plans_tax_basis_points_check" CHECK (((tax_basis_points >= 0) AND (tax_basis_points <= 10000)));
ALTER TABLE irp_pms."rate_plans" ADD CONSTRAINT "rate_plans_version_check" CHECK (((version >= 1) AND (version <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservation_component_total" CHECK (((guest_total_minor IS NULL) OR ((((accommodation_minor + taxes_minor) + ota_fees_minor) + hotel_fees_minor) = guest_total_minor)));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservation_migration_identity" CHECK ((((source = 'migration'::text) AND (migration_provider IS NOT NULL) AND (migration_provider ~ '^[a-z0-9][a-z0-9_-]{0,79}$'::text) AND (migration_source_id IS NOT NULL) AND ((length(TRIM(BOTH FROM migration_source_id)) >= 1) AND (length(TRIM(BOTH FROM migration_source_id)) <= 128))) OR ((source <> 'migration'::text) AND (migration_provider IS NULL) AND (migration_source_id IS NULL))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservation_no_show_disposition" CHECK ((((cancellation_disposition IS NULL) AND (no_show_recorded_at IS NULL)) OR ((cancellation_disposition IS NOT NULL) AND (cancellation_disposition = 'no_show'::text) AND (no_show_recorded_at IS NOT NULL) AND (status = 'Cancelled'::text) AND (source = ANY (ARRAY['direct'::text, 'migration'::text])) AND (checked_in_at IS NULL) AND (checked_out_at IS NULL))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_accommodation_minor_check" CHECK (((accommodation_minor IS NULL) OR ((accommodation_minor >= 0) AND (accommodation_minor <= '999999999999'::bigint))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_check" CHECK (((status = 'Cancelled'::text) OR ((room_type_id IS NOT NULL) AND (arrival IS NOT NULL) AND (departure IS NOT NULL) AND (guests IS NOT NULL) AND (accommodation_minor IS NOT NULL) AND (taxes_minor IS NOT NULL) AND (ota_fees_minor IS NOT NULL) AND (guest_total_minor IS NOT NULL))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_check1" CHECK (((arrival IS NULL) OR (departure IS NULL) OR ((departure > arrival) AND ((departure - arrival) <= 30))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_guest_name_check" CHECK (((guest_name IS NULL) OR ((length(TRIM(BOTH FROM guest_name)) >= 1) AND (length(TRIM(BOTH FROM guest_name)) <= 200))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_guest_total_minor_check" CHECK (((guest_total_minor IS NULL) OR ((guest_total_minor >= 0) AND (guest_total_minor <= '999999999999'::bigint))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_guests_check" CHECK (((guests IS NULL) OR (guests > 0)));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_hotel_fees_minor_check" CHECK (((hotel_fees_minor >= 0) AND (hotel_fees_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_ota_fees_minor_check" CHECK (((ota_fees_minor IS NULL) OR ((ota_fees_minor >= 0) AND (ota_fees_minor <= '999999999999'::bigint))));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_payload_hash_check" CHECK ((payload_hash ~ '^[a-f0-9]{64}$'::text));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_source_booking_id_check" CHECK (((length(source_booking_id) >= 1) AND (length(source_booking_id) <= 128)));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_source_check" CHECK ((source = ANY (ARRAY['iratepilot-ota'::text, 'booking_com'::text, 'expedia'::text, 'agoda'::text, 'airbnb'::text, 'google_hotel'::text, 'direct'::text, 'migration'::text])));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_source_version_check" CHECK (((source_version >= 1) AND (source_version <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_status_check" CHECK ((status = ANY (ARRAY['Confirmed'::text, 'Cancelled'::text, 'In house'::text, 'Checked out'::text])));
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_taxes_minor_check" CHECK (((taxes_minor IS NULL) OR ((taxes_minor >= 0) AND (taxes_minor <= '999999999999'::bigint))));
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_check" CHECK ((isfinite(scheduled_start) AND isfinite(scheduled_end) AND isfinite(effective_end) AND isfinite(created_business_date)));
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_check1" CHECK (((scheduled_end > scheduled_start) AND ((scheduled_end - scheduled_start) <= 366)));
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_check2" CHECK (((scheduled_start >= created_business_date) AND (scheduled_end <= (created_business_date + 366))));
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_check3" CHECK (((effective_end >= scheduled_start) AND (effective_end <= scheduled_end)));
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_check4" CHECK ((((released_at IS NULL) AND (released_by IS NULL) AND (release_reason IS NULL) AND (released_business_date IS NULL) AND (effective_end = scheduled_end)) OR ((released_at IS NOT NULL) AND (released_by IS NOT NULL) AND (release_reason IS NOT NULL) AND (released_business_date IS NOT NULL) AND isfinite(released_business_date) AND (released_at >= created_at) AND ((length(TRIM(BOTH FROM release_reason)) >= 4) AND (length(TRIM(BOTH FROM release_reason)) <= 500)) AND (release_reason !~ '[[:cntrl:]]'::text) AND (effective_end = GREATEST(scheduled_start, LEAST(scheduled_end, released_business_date))))));
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_reason_check" CHECK ((((length(TRIM(BOTH FROM reason)) >= 4) AND (length(TRIM(BOTH FROM reason)) <= 500)) AND (reason !~ '[[:cntrl:]]'::text)));
ALTER TABLE irp_pms."room_types" ADD CONSTRAINT "room_types_max_guests_check" CHECK (((max_guests >= 1) AND (max_guests <= 20)));
ALTER TABLE irp_pms."room_types" ADD CONSTRAINT "room_types_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 200)));
ALTER TABLE irp_pms."rooms" ADD CONSTRAINT "rooms_housekeeping_check" CHECK ((housekeeping = ANY (ARRAY['Clean'::text, 'Dirty'::text, 'Inspect'::text])));
ALTER TABLE irp_pms."rooms" ADD CONSTRAINT "rooms_label_check" CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 40)));
ALTER TABLE irp_pms."rooms" ADD CONSTRAINT "rooms_state_version_check" CHECK (((state_version >= 1) AND (state_version <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."service_books" ADD CONSTRAINT "service_books_check" CHECK ((next_service_date >= first_service_date));
ALTER TABLE irp_pms."service_books" ADD CONSTRAINT "service_books_version_check" CHECK (((version >= 1) AND (version <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_accommodation_minor_check" CHECK (((accommodation_minor >= 0) AND (accommodation_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_allocation_source_check" CHECK ((allocation_source = ANY (ARRAY['quote'::text, 'manager_approved'::text])));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_check" CHECK ((((((accommodation_minor + taxes_minor) + hotel_fees_minor) + ota_fees_minor) + other_revenue_minor) = total_minor));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_hotel_fees_minor_check" CHECK (((hotel_fees_minor >= 0) AND (hotel_fees_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_ota_fees_minor_check" CHECK (((ota_fees_minor >= 0) AND (ota_fees_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_other_revenue_minor_check" CHECK (((other_revenue_minor >= 0) AND (other_revenue_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_taxes_minor_check" CHECK (((taxes_minor >= 0) AND (taxes_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_total_minor_check" CHECK (((total_minor >= 0) AND (total_minor <= '999999999999'::bigint)));
ALTER TABLE irp_pms."tenants" ADD CONSTRAINT "tenants_name_check" CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 200)));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check" CHECK (((started_at IS NULL) = (started_by IS NULL)));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check1" CHECK ((((submitted_at IS NULL) AND (submitted_by IS NULL) AND (submitted_room_version IS NULL) AND (submission IS NULL)) OR ((submitted_at IS NOT NULL) AND (submitted_by IS NOT NULL) AND (submitted_room_version IS NOT NULL) AND ((submitted_room_version >= 1) AND (submitted_room_version <= '9007199254740991'::bigint)) AND (submission IS NOT NULL) AND (jsonb_typeof(submission) = 'object'::text))));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check2" CHECK (((inspected_at IS NULL) = (inspected_by IS NULL)));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check3" CHECK ((((state = ANY (ARRAY['completed'::text, 'cancelled'::text])) AND (closed_at IS NOT NULL) AND (closed_by IS NOT NULL)) OR ((state <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND (closed_at IS NULL) AND (closed_by IS NULL) AND (close_reason IS NULL))));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check4" CHECK (((state <> 'queued'::text) OR ((started_at IS NULL) AND (submitted_at IS NULL) AND (inspected_at IS NULL))));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check5" CHECK (((state <> ALL (ARRAY['in_progress'::text, 'awaiting_inspection'::text, 'completed'::text])) OR (started_at IS NOT NULL)));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check6" CHECK (((state <> ALL (ARRAY['awaiting_inspection'::text, 'completed'::text])) OR (submitted_at IS NOT NULL)));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check7" CHECK (((state <> 'completed'::text) OR (inspected_at IS NOT NULL)));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_check8" CHECK (((state <> 'cancelled'::text) OR ((close_reason IS NOT NULL) AND ((length(TRIM(BOTH FROM close_reason)) >= 4) AND (length(TRIM(BOTH FROM close_reason)) <= 500)) AND (close_reason !~ '[[:cntrl:]]'::text))));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_checklist_check" CHECK (((jsonb_typeof(checklist) = 'array'::text) AND ((jsonb_array_length(checklist) >= 5) AND (jsonb_array_length(checklist) <= 6))));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_checklist_version_check" CHECK ((checklist_version = 1));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_creation_operating_model_check" CHECK ((creation_operating_model = ANY (ARRAY['hotel'::text, 'whole_home'::text])));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_due_date_check" CHECK (isfinite(due_date));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_origin_kind_check" CHECK ((origin_kind = ANY (ARRAY['checkout'::text, 'room_move'::text, 'manual'::text, 'readiness_dirty'::text])));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_state_check" CHECK ((state = ANY (ARRAY['queued'::text, 'in_progress'::text, 'awaiting_inspection'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_version_check" CHECK (((version >= 1) AND (version <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_work_generation_check" CHECK (((work_generation >= 1) AND (work_generation <= '9007199254740991'::bigint)));
ALTER TABLE irp_pms."activity" ADD CONSTRAINT "activity_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE irp_pms."activity" ADD CONSTRAINT "activity_tenant_id_property_id_fkey" FOREIGN KEY (tenant_id, property_id) REFERENCES irp_pms.properties(tenant_id, id);
ALTER TABLE irp_pms."memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES irp_pms.tenants(id);
ALTER TABLE irp_pms."memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE irp_pms."nightly_capacity" ADD CONSTRAINT "nightly_capacity_tenant_id_property_id_room_type_id_fkey" FOREIGN KEY (tenant_id, property_id, room_type_id) REFERENCES irp_pms.room_types(tenant_id, property_id, id);
ALTER TABLE irp_pms."nightly_rates" ADD CONSTRAINT "nightly_rates_tenant_id_property_id_plan_id_fkey" FOREIGN KEY (tenant_id, property_id, plan_id) REFERENCES irp_pms.rate_plans(tenant_id, property_id, id);
ALTER TABLE irp_pms."properties" ADD CONSTRAINT "properties_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES irp_pms.tenants(id);
ALTER TABLE irp_pms."rate_actions" ADD CONSTRAINT "rate_actions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE irp_pms."rate_actions" ADD CONSTRAINT "rate_actions_tenant_id_property_id_fkey" FOREIGN KEY (tenant_id, property_id) REFERENCES irp_pms.properties(tenant_id, id);
ALTER TABLE irp_pms."rate_plans" ADD CONSTRAINT "rate_plans_tenant_id_property_id_room_type_id_fkey" FOREIGN KEY (tenant_id, property_id, room_type_id) REFERENCES irp_pms.room_types(tenant_id, property_id, id);
ALTER TABLE irp_pms."reservation_charge_snapshots" ADD CONSTRAINT "reservation_charge_snapshots_tenant_id_property_id_reserva_fkey" FOREIGN KEY (tenant_id, property_id, reservation_id) REFERENCES irp_pms.reservations(tenant_id, property_id, id);
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_tenant_id_property_id_fkey" FOREIGN KEY (tenant_id, property_id) REFERENCES irp_pms.properties(tenant_id, id);
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_tenant_id_property_id_physical_room_id_fkey" FOREIGN KEY (tenant_id, property_id, physical_room_id) REFERENCES irp_pms.rooms(tenant_id, property_id, id);
ALTER TABLE irp_pms."reservations" ADD CONSTRAINT "reservations_tenant_id_property_id_room_type_id_fkey" FOREIGN KEY (tenant_id, property_id, room_type_id) REFERENCES irp_pms.room_types(tenant_id, property_id, id);
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_released_by_fkey" FOREIGN KEY (released_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_tenant_id_property_id_room_id_fkey" FOREIGN KEY (tenant_id, property_id, room_id) REFERENCES irp_pms.rooms(tenant_id, property_id, id);
ALTER TABLE irp_pms."room_closures" ADD CONSTRAINT "room_closures_tenant_id_property_id_room_type_id_fkey" FOREIGN KEY (tenant_id, property_id, room_type_id) REFERENCES irp_pms.room_types(tenant_id, property_id, id);
ALTER TABLE irp_pms."room_types" ADD CONSTRAINT "room_types_tenant_id_property_id_fkey" FOREIGN KEY (tenant_id, property_id) REFERENCES irp_pms.properties(tenant_id, id);
ALTER TABLE irp_pms."rooms" ADD CONSTRAINT "rooms_tenant_id_property_id_room_type_id_fkey" FOREIGN KEY (tenant_id, property_id, room_type_id) REFERENCES irp_pms.room_types(tenant_id, property_id, id);
ALTER TABLE irp_pms."service_books" ADD CONSTRAINT "service_books_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."service_books" ADD CONSTRAINT "service_books_tenant_id_property_id_fkey" FOREIGN KEY (tenant_id, property_id) REFERENCES irp_pms.properties(tenant_id, id);
ALTER TABLE irp_pms."service_day_closes" ADD CONSTRAINT "service_day_closes_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE irp_pms."service_day_closes" ADD CONSTRAINT "service_day_closes_tenant_id_property_id_fkey" FOREIGN KEY (tenant_id, property_id) REFERENCES irp_pms.service_books(tenant_id, property_id);
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_tenant_id_property_id_reservation_id_fkey" FOREIGN KEY (tenant_id, property_id, reservation_id) REFERENCES irp_pms.reservations(tenant_id, property_id, id);
ALTER TABLE irp_pms."service_day_entries" ADD CONSTRAINT "service_day_entries_tenant_id_property_id_service_date_fkey" FOREIGN KEY (tenant_id, property_id, service_date) REFERENCES irp_pms.service_day_closes(tenant_id, property_id, service_date);
ALTER TABLE irp_pms."service_reconciliation" ADD CONSTRAINT "service_reconciliation_tenant_id_property_id_reservation_i_fkey" FOREIGN KEY (tenant_id, property_id, reservation_id) REFERENCES irp_pms.reservations(tenant_id, property_id, id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_assignee_id_fkey" FOREIGN KEY (assignee_id) REFERENCES auth.users(id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_inspected_by_fkey" FOREIGN KEY (inspected_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_started_by_fkey" FOREIGN KEY (started_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_tenant_id_property_id_created_room_type_id_fkey" FOREIGN KEY (tenant_id, property_id, created_room_type_id) REFERENCES irp_pms.room_types(tenant_id, property_id, id);
ALTER TABLE irp_pms."turnover_tasks" ADD CONSTRAINT "turnover_tasks_tenant_id_property_id_room_id_fkey" FOREIGN KEY (tenant_id, property_id, room_id) REFERENCES irp_pms.rooms(tenant_id, property_id, id);
CREATE TRIGGER whole_home_capacity_guard BEFORE INSERT OR DELETE OR UPDATE ON irp_pms.nightly_capacity FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_unit_guard();
CREATE TRIGGER irp_pms_property_fee_guard BEFORE INSERT OR UPDATE ON irp_pms.properties FOR EACH ROW EXECUTE FUNCTION irp_pms.property_fee_guard();
CREATE TRIGGER irp_pms_turnover_property_guard BEFORE UPDATE ON irp_pms.properties FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_property_guard();
CREATE CONSTRAINT TRIGGER whole_home_property_consistency AFTER INSERT OR UPDATE ON irp_pms.properties DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_property_consistency();
CREATE TRIGGER irp_pms_adjust_charge_breakdown BEFORE UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.reservation_adjust_charge_breakdown();
CREATE TRIGGER irp_pms_assigned_room_overlap BEFORE INSERT OR UPDATE OF physical_room_id, status, arrival, departure, tenant_id, property_id ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.assigned_room_overlap_guard();
CREATE TRIGGER irp_pms_no_show_disposition_immutable BEFORE UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.no_show_immutable();
CREATE TRIGGER irp_pms_record_charge_snapshot AFTER INSERT OR UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.reservation_record_charge_snapshot();
CREATE TRIGGER irp_pms_room_occupancy_revision AFTER INSERT OR DELETE OR UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.room_occupancy_revision();
CREATE TRIGGER irp_pms_service_reservation_changed AFTER UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.service_changed();
CREATE TRIGGER irp_pms_room_closure_creation BEFORE INSERT ON irp_pms.room_closures FOR EACH ROW EXECUTE FUNCTION irp_pms.maintenance_creation_guard();
CREATE TRIGGER irp_pms_room_closure_history BEFORE DELETE OR UPDATE ON irp_pms.room_closures FOR EACH ROW EXECUTE FUNCTION irp_pms.maintenance_history_guard();
CREATE TRIGGER whole_home_room_type_guard BEFORE INSERT OR DELETE OR UPDATE ON irp_pms.room_types FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_unit_guard();
CREATE TRIGGER irp_pms_room_state_revision BEFORE UPDATE ON irp_pms.rooms FOR EACH ROW EXECUTE FUNCTION irp_pms.room_state_revision();
CREATE TRIGGER whole_home_room_guard BEFORE INSERT OR DELETE OR UPDATE ON irp_pms.rooms FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_unit_guard();
CREATE TRIGGER irp_pms_turnover_snapshot_guard BEFORE INSERT ON irp_pms.turnover_tasks FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_snapshot_guard();
CREATE TRIGGER irp_pms_turnover_task_history BEFORE DELETE OR UPDATE ON irp_pms.turnover_tasks FOR EACH ROW EXECUTE FUNCTION irp_pms.turnover_history_guard();
CREATE UNIQUE INDEX irp_pms_one_inhouse_room ON irp_pms.reservations USING btree (tenant_id, property_id, physical_room_id) WHERE (status = 'In house'::text);
CREATE UNIQUE INDEX irp_pms_one_open_turnover ON irp_pms.turnover_tasks USING btree (tenant_id, property_id, room_id) WHERE (state <> ALL (ARRAY['completed'::text, 'cancelled'::text]));
CREATE INDEX irp_pms_room_closures_intervals ON irp_pms.room_closures USING btree (tenant_id, property_id, room_type_id, scheduled_start, effective_end);
CREATE INDEX irp_pms_room_closures_room_intervals ON irp_pms.room_closures USING btree (tenant_id, property_id, room_id, scheduled_start, effective_end);
CREATE UNIQUE INDEX irp_pms_room_type_name_unique ON irp_pms.room_types USING btree (tenant_id, property_id, lower(TRIM(BOTH FROM name)));
CREATE INDEX irp_pms_turnover_queue ON irp_pms.turnover_tasks USING btree (tenant_id, property_id, state, due_date);
CREATE UNIQUE INDEX migration_source_identity ON irp_pms.reservations USING btree (tenant_id, property_id, migration_provider, migration_source_id) WHERE (source = 'migration'::text);
CREATE UNIQUE INDEX rate_plan_room_name ON irp_pms.rate_plans USING btree (tenant_id, property_id, room_type_id, lower(name));
SET check_function_bodies=on;
