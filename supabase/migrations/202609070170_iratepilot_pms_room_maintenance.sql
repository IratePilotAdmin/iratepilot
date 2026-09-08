BEGIN;
-- Dated room maintenance, immutable release history and effective capacity.
-- Static forward definitions retain all prior migration source bytes.
CREATE TABLE irp_pms.room_closures(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 room_id uuid NOT NULL,room_type_id uuid NOT NULL,
 scheduled_start date NOT NULL,scheduled_end date NOT NULL,effective_end date NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),
 created_time_zone text NOT NULL,created_business_date date NOT NULL,
 released_at timestamptz,released_by uuid REFERENCES auth.users(id),release_reason text,released_business_date date,
 PRIMARY KEY(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,room_id) REFERENCES irp_pms.rooms(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id),
 CHECK(isfinite(scheduled_start) AND isfinite(scheduled_end) AND isfinite(effective_end) AND isfinite(created_business_date)),
 CHECK(scheduled_end>scheduled_start AND scheduled_end-scheduled_start<=366),
 CHECK(scheduled_start>=created_business_date AND scheduled_end<=created_business_date+366),
 CHECK(effective_end BETWEEN scheduled_start AND scheduled_end),
 CHECK((released_at IS NULL AND released_by IS NULL AND release_reason IS NULL AND released_business_date IS NULL AND effective_end=scheduled_end)
 OR (released_at IS NOT NULL AND released_by IS NOT NULL AND release_reason IS NOT NULL AND released_business_date IS NOT NULL
 AND isfinite(released_business_date) AND released_at>=created_at AND length(trim(release_reason)) BETWEEN 4 AND 500 AND release_reason !~ '[[:cntrl:]]'
 AND effective_end=greatest(scheduled_start,least(scheduled_end,released_business_date))))
);
CREATE INDEX irp_pms_room_closures_intervals ON irp_pms.room_closures(tenant_id,property_id,room_type_id,scheduled_start,effective_end);
CREATE INDEX irp_pms_room_closures_room_intervals ON irp_pms.room_closures(tenant_id,property_id,room_id,scheduled_start,effective_end);
CREATE TABLE irp_pms.maintenance_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,closure_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL CHECK(action IN('create_room_closure','release_room_closure')),
 command jsonb NOT NULL CHECK(jsonb_typeof(command)='object'),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,closure_id) REFERENCES irp_pms.room_closures(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.room_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.maintenance_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.room_closures,irp_pms.maintenance_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.room_closures,irp_pms.maintenance_requests TO service_role;

CREATE FUNCTION irp_pms.maintenance_creation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms r WHERE r.tenant_id=NEW.tenant_id AND r.property_id=NEW.property_id AND r.id=NEW.room_id AND r.room_type_id=NEW.room_type_id)
 THEN RAISE EXCEPTION 'A closure must capture the scoped room type in effect when it is created';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_room_closure_creation BEFORE INSERT ON irp_pms.room_closures FOR EACH ROW EXECUTE FUNCTION irp_pms.maintenance_creation_guard();
CREATE FUNCTION irp_pms.maintenance_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='maintenance_requests' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Maintenance history and request receipts cannot be deleted or rewritten';END IF;
 IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL
 OR (to_jsonb(NEW)-ARRAY['effective_end','released_at','released_by','release_reason','released_business_date'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['effective_end','released_at','released_by','release_reason','released_business_date'])
 THEN RAISE EXCEPTION 'A closure permits one explicit early release; its original schedule and creation record are immutable';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER irp_pms_room_closure_history BEFORE UPDATE OR DELETE ON irp_pms.room_closures FOR EACH ROW EXECUTE FUNCTION irp_pms.maintenance_history_guard();
CREATE TRIGGER irp_pms_maintenance_receipt_history BEFORE UPDATE OR DELETE ON irp_pms.maintenance_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.maintenance_history_guard();

CREATE OR REPLACE FUNCTION irp_pms.room_state_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;

-- NULL end is deliberately unbounded for an unresolved overdue physical stay.
-- Zero-length released closures never block inventory or physical assignment.
CREATE FUNCTION irp_pms.room_is_closed(p_tenant uuid,p_property uuid,p_room uuid,p_start date,p_end date)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(p_start IS NOT NULL AND (p_end IS NULL OR p_end>p_start) AND EXISTS(
  SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.room_id=p_room
  AND c.effective_end>c.scheduled_start AND c.effective_end>p_start AND (p_end IS NULL OR c.scheduled_start<p_end)
 ),false)
$$;
CREATE FUNCTION irp_pms.maintenance_capacity(p_tenant uuid,p_property uuid,p_room_type uuid,p_day date)
RETURNS TABLE(configured_units integer,physical_units integer,closed_units integer,effective_units integer)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH counts AS(
  SELECT (SELECT n.units FROM irp_pms.nightly_capacity n WHERE n.tenant_id=p_tenant AND n.property_id=p_property AND n.room_type_id=p_room_type AND n.stay_date=p_day) AS configured,
   count(*)::integer AS physical,
   count(*) FILTER(WHERE EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=r.tenant_id AND c.property_id=r.property_id AND c.room_id=r.id AND c.room_type_id=r.room_type_id AND c.scheduled_start<=p_day AND c.effective_end>p_day))::integer AS closed
  FROM irp_pms.rooms r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=p_room_type
 ) SELECT configured,physical,closed,CASE WHEN configured IS NULL THEN NULL ELSE least(configured,physical-closed) END FROM counts
$$;
CREATE FUNCTION irp_pms.effective_capacity(p_tenant uuid,p_property uuid,p_room_type uuid,p_day date)
RETURNS integer LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT effective_units FROM irp_pms.maintenance_capacity(p_tenant,p_property,p_room_type,p_day)
$$;

CREATE FUNCTION irp_pms.maintenance_closure_json(p_tenant uuid,p_property uuid,p_closure uuid,p_business_date date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',c.id,'room_id',c.room_id,'room_type_id',c.room_type_id,'room_label',r.label,'room_state_version',r.state_version,
  'scheduled_start',c.scheduled_start,'scheduled_end',c.scheduled_end,'effective_end',c.effective_end,'reason',c.reason,
  'created_at',c.created_at,'created_by',c.created_by,'created_time_zone',c.created_time_zone,
  'released_at',c.released_at,'released_by',c.released_by,'release_reason',c.release_reason,
  'status',CASE WHEN c.released_at IS NOT NULL THEN 'released' WHEN c.effective_end<=p_business_date THEN 'ended' WHEN c.scheduled_start>p_business_date THEN 'scheduled' ELSE 'active' END,
  'occupied_reservation_id',o.id,
  'occupancy_conflict',coalesce(c.effective_end>greatest(c.scheduled_start,p_business_date) AND o.id IS NOT NULL
   AND (c.scheduled_start<=p_business_date OR o.departure<p_business_date OR o.arrival<c.effective_end AND o.departure>c.scheduled_start),false))
 FROM irp_pms.room_closures c JOIN irp_pms.rooms r ON r.tenant_id=c.tenant_id AND r.property_id=c.property_id AND r.id=c.room_id
 LEFT JOIN irp_pms.reservations o ON o.tenant_id=c.tenant_id AND o.property_id=c.property_id AND o.physical_room_id=c.room_id AND o.status='In house'
 WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.id=p_closure
$$;

REVOKE ALL ON FUNCTION irp_pms.maintenance_creation_guard(),irp_pms.maintenance_history_guard(),irp_pms.room_state_revision(),irp_pms.room_is_closed(uuid,uuid,uuid,date,date),irp_pms.maintenance_capacity(uuid,uuid,uuid,date),irp_pms.effective_capacity(uuid,uuid,uuid,date),irp_pms.maintenance_closure_json(uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;

-- Historical mutation replay requires a current owner/manager role, matching
-- room moves. A downgraded staff member may still inspect their own receipt
-- through maintenance_request_status, but cannot run either manager command.
CREATE FUNCTION public.irp_pms_pilot_create_room_closure(p_tenant uuid,p_property uuid,p_room uuid,p_request uuid,p_expected_room_version bigint,p_expected_business_date date,p_start date,p_end date,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;room irp_pms.rooms;prior irp_pms.maintenance_requests;closure irp_pms.room_closures;
 command jsonb;result jsonb;changed_at timestamptz;business_date date;day date;cap record;used integer;proposed_effective integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_room IS NULL OR p_request IS NULL OR p_expected_room_version IS NULL OR p_expected_room_version NOT BETWEEN 1 AND 9007199254740991
 OR p_expected_business_date IS NULL OR NOT isfinite(p_expected_business_date) OR p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end)
 OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'A scoped room, request, reviewed room version and business date, finite closure dates and a 4 to 500 character reason are required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','create_room_closure','room_id',p_room,'expected_room_version',p_expected_room_version,'expected_business_date',p_expected_business_date,'start',p_start,'end',p_end,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.maintenance_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.action<>'create_room_closure' OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Maintenance request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped physical room';END IF;
 IF room.state_version<>p_expected_room_version THEN RAISE EXCEPTION 'Room state changed; refresh before creating a closure' USING ERRCODE='PT409';END IF;
 changed_at:=clock_timestamp();business_date:=(changed_at AT TIME ZONE prop.time_zone)::date;
 IF business_date<>p_expected_business_date THEN RAISE EXCEPTION 'Property business date changed; refresh before creating a closure' USING ERRCODE='PT412';END IF;
 IF p_start<business_date OR p_end<=p_start OR p_end-p_start>366 OR p_end>business_date+366 THEN RAISE EXCEPTION 'A closure must cover 1 to 366 current or future nights and end within 366 days of the property business date';END IF;
 IF irp_pms.room_is_closed(p_tenant,p_property,p_room,p_start,p_end) THEN RAISE EXCEPTION 'This room already has an overlapping effective maintenance closure';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.physical_room_id=p_room
  AND ((r.status='Confirmed' AND r.arrival<p_end AND r.departure>p_start)
   OR (r.status='In house' AND (r.arrival<p_end AND r.departure>p_start OR p_start=business_date OR r.departure<business_date))))
 THEN RAISE EXCEPTION 'An occupied, overdue or assigned stay conflicts with this room closure; resolve the stay assignment first';END IF;
 FOR day IN SELECT p_start+n FROM generate_series(0,p_end-p_start-1) n LOOP
  SELECT * INTO cap FROM irp_pms.maintenance_capacity(p_tenant,p_property,room.room_type_id,day);
  SELECT count(*)::integer INTO used FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=room.room_type_id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,day,business_date);
  -- The overlap check above guarantees this physical room is not already
  -- counted closed. Missing configured inventory remains missing; existing
  -- demand with no configured ceiling requires explicit reconciliation.
  proposed_effective:=CASE WHEN cap.configured_units IS NULL THEN NULL ELSE least(cap.configured_units,cap.physical_units-cap.closed_units-1) END;
  IF (proposed_effective IS NULL AND used>0) OR used>proposed_effective THEN RAISE EXCEPTION 'Existing reservations exceed the capacity available after this closure on %',day;END IF;
 END LOOP;
 INSERT INTO irp_pms.room_closures(tenant_id,property_id,room_id,room_type_id,scheduled_start,scheduled_end,effective_end,reason,created_at,created_by,created_time_zone,created_business_date)
 VALUES(p_tenant,p_property,p_room,room.room_type_id,p_start,p_end,p_end,trim(p_reason),changed_at,auth.uid(),prop.time_zone,business_date) RETURNING * INTO closure;
 UPDATE irp_pms.rooms SET state_version=state_version+1 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 result:=jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'action','create_room_closure',
  'closure',irp_pms.maintenance_closure_json(p_tenant,p_property,closure.id,business_date),'room_id',p_room,'room_state_version',room.state_version,
  'business_date',business_date,'housekeeping_changed',false,'financial_changed',false,'configured_capacity_changed',false,'replayed',false);
 INSERT INTO irp_pms.maintenance_requests(tenant_id,property_id,request_id,closure_id,actor_id,action,command,result,created_at)
 VALUES(p_tenant,p_property,p_request,closure.id,auth.uid(),'create_room_closure',command,result,changed_at);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'room_closure_created',closure.id,
  command||jsonb_build_object('request_id',p_request,'room_type_id',room.room_type_id,'room_state_version',room.state_version,'business_date',business_date,'created_at',changed_at));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_release_room_closure(p_tenant uuid,p_property uuid,p_closure uuid,p_request uuid,p_expected_room_version bigint,p_expected_business_date date,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;room irp_pms.rooms;prior irp_pms.maintenance_requests;closure irp_pms.room_closures;
 command jsonb;result jsonb;changed_at timestamptz;business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_closure IS NULL OR p_request IS NULL OR p_expected_room_version IS NULL OR p_expected_room_version NOT BETWEEN 1 AND 9007199254740991
 OR p_expected_business_date IS NULL OR NOT isfinite(p_expected_business_date) OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'A scoped closure, request, reviewed room version and business date, and a 4 to 500 character reason are required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','release_room_closure','closure_id',p_closure,'expected_room_version',p_expected_room_version,'expected_business_date',p_expected_business_date,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.maintenance_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.action<>'release_room_closure' OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Maintenance request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO closure FROM irp_pms.room_closures WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_closure FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped room closure';END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=closure.room_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped physical room';END IF;
 IF room.state_version<>p_expected_room_version THEN RAISE EXCEPTION 'Room state changed; refresh before releasing a closure' USING ERRCODE='PT409';END IF;
 changed_at:=clock_timestamp();business_date:=(changed_at AT TIME ZONE prop.time_zone)::date;
 IF business_date<>p_expected_business_date THEN RAISE EXCEPTION 'Property business date changed; refresh before releasing a closure' USING ERRCODE='PT412';END IF;
 IF closure.released_at IS NOT NULL THEN RAISE EXCEPTION 'This closure was already released';END IF;
 IF closure.effective_end<=business_date THEN RAISE EXCEPTION 'This closure has already ended automatically; its historical interval is retained';END IF;
 UPDATE irp_pms.room_closures SET effective_end=greatest(scheduled_start,least(scheduled_end,business_date)),released_at=changed_at,released_by=auth.uid(),release_reason=trim(p_reason),released_business_date=business_date
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_closure RETURNING * INTO closure;
 UPDATE irp_pms.rooms SET state_version=state_version+1 WHERE tenant_id=p_tenant AND property_id=p_property AND id=closure.room_id RETURNING * INTO room;
 result:=jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'action','release_room_closure',
  'closure',irp_pms.maintenance_closure_json(p_tenant,p_property,p_closure,business_date),'room_id',closure.room_id,'room_state_version',room.state_version,
  'business_date',business_date,'housekeeping_changed',false,'financial_changed',false,'configured_capacity_changed',false,'replayed',false);
 INSERT INTO irp_pms.maintenance_requests(tenant_id,property_id,request_id,closure_id,actor_id,action,command,result,created_at)
 VALUES(p_tenant,p_property,p_request,p_closure,auth.uid(),'release_room_closure',command,result,changed_at);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'room_closure_released',p_closure,
  command||jsonb_build_object('request_id',p_request,'room_id',closure.room_id,'room_state_version',room.state_version,'business_date',business_date,'effective_end',closure.effective_end,'released_at',changed_at));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_maintenance_request_status(p_tenant uuid,p_property uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.maintenance_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A request is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.maintenance_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action',prior.action,'result',prior.result);
END $$;

CREATE FUNCTION public.irp_pms_pilot_maintenance(p_tenant uuid,p_property uuid,p_start date,p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;member_role text;business_date date;generated_at timestamptz;closure_count bigint;inventory_count bigint;closures jsonb;inventory jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) THEN RAISE EXCEPTION 'Finite maintenance report dates are required';END IF;
 IF p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Maintenance report period must cover 1 to 366 nights, with an exclusive end';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 generated_at:=clock_timestamp();business_date:=(generated_at AT TIME ZONE prop.time_zone)::date;
 SELECT count(*) INTO closure_count FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.scheduled_start<p_end AND c.scheduled_end>p_start;
 IF closure_count>1000 THEN RAISE EXCEPTION 'This period contains more than 1000 closure records; select a smaller period';END IF;
 SELECT count(*)*(p_end-p_start) INTO inventory_count FROM irp_pms.room_types rt WHERE rt.tenant_id=p_tenant AND rt.property_id=p_property;
 IF inventory_count>10000 THEN RAISE EXCEPTION 'This period contains more than 10000 inventory rows; select a smaller period';END IF;
 SELECT coalesce(jsonb_agg(irp_pms.maintenance_closure_json(p_tenant,p_property,c.id,business_date) ORDER BY c.scheduled_start,c.created_at,c.id),'[]'::jsonb) INTO closures
 FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.scheduled_start<p_end AND c.scheduled_end>p_start;
 SELECT coalesce(jsonb_agg(jsonb_build_object('stay_date',d.day,'room_type_id',rt.id,'room_type_name',rt.name,
  'configured_units',cap.configured_units,'physical_units',cap.physical_units,'closed_units',cap.closed_units,'effective_units',cap.effective_units,'reserved_units',demand.used,
  'available_units',CASE WHEN cap.effective_units IS NULL THEN NULL ELSE greatest(cap.effective_units-demand.used,0) END,
  'shortfall_units',CASE WHEN cap.effective_units IS NULL THEN NULL ELSE greatest(demand.used-cap.effective_units,0) END) ORDER BY d.day,rt.name,rt.id),'[]'::jsonb) INTO inventory
 FROM irp_pms.room_types rt CROSS JOIN LATERAL(SELECT p_start+n AS day FROM generate_series(0,p_end-p_start-1) n) d
 CROSS JOIN LATERAL irp_pms.maintenance_capacity(p_tenant,p_property,rt.id,d.day) cap
 CROSS JOIN LATERAL(SELECT count(*)::integer AS used FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=rt.id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,d.day,business_date)) demand
 WHERE rt.tenant_id=p_tenant AND rt.property_id=p_property;
 RETURN jsonb_build_object('property_id',p_property,'time_zone',prop.time_zone,'business_date',business_date,'role',member_role,'can_manage',member_role IN('owner','manager'),'generated_at',generated_at,
  'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true),'closures',closures,'inventory',inventory,
  'definitions',jsonb_build_object('effective_capacity','The lesser of the configured selling ceiling and current physical units minus distinct dated closed units. Missing configured inventory remains unavailable.',
   'inventory_basis','Current room and selling-capacity configuration applied to each reported date; historical physical room assignments are not reconstructed.',
   'scheduled_intervals','Closure records are listed by their original scheduled dates, including future closures released before they began.',
   'expiry','A closure ends automatically on its scheduled end date. Availability can reopen without certifying physical repair or housekeeping readiness.',
   'release','An early release retains the original scheduled dates and past effective closed nights. It changes neither housekeeping nor configured selling ceilings.',
   'occupancy_conflict','A current physical occupant may conflict after closure approval, including an unresolved overstay. The system never evicts a stay; inventory shortfalls remain visible.',
   'recovery','Only current owners/managers can issue or replay closure mutations. Current staff can view their own prior command receipt.'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_create_room_closure(uuid,uuid,uuid,uuid,bigint,date,date,date,text),public.irp_pms_pilot_release_room_closure(uuid,uuid,uuid,uuid,bigint,date,text),public.irp_pms_pilot_maintenance_request_status(uuid,uuid,uuid),public.irp_pms_pilot_maintenance(uuid,uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_create_room_closure(uuid,uuid,uuid,uuid,bigint,date,date,date,text),public.irp_pms_pilot_release_room_closure(uuid,uuid,uuid,uuid,bigint,date,text),public.irp_pms_pilot_maintenance_request_status(uuid,uuid,uuid),public.irp_pms_pilot_maintenance(uuid,uuid,date,date) TO authenticated;


-- Forward from 202609070169_iratepilot_pms_staff_write_authorization.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_create_reservation(p_tenant uuid,p_property uuid,p_request uuid,p_room_type uuid,p_guest_name text,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; request_payload jsonb; prior irp_pms.direct_requests; res irp_pms.reservations; day date; available integer; used integer; guest_limit integer; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request identity is required'; END IF;
 request_payload:=jsonb_build_object('room_type',p_room_type,'guest_name',trim(p_guest_name),'arrival',p_arrival,'departure',p_departure,'guests',p_guests,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor);
 SELECT * INTO prior FROM irp_pms.direct_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'Reservation request identity already used'; END IF;
  SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=prior.reservation_id;
  RETURN to_jsonb(res);
 END IF;
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest or stay dates'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Invalid room type or guest count'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  available:=irp_pms.effective_capacity(p_tenant,p_property,p_room_type,day);
  IF available IS NULL THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
 END LOOP;
 INSERT INTO irp_pms.reservations(tenant_id,property_id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name)
 VALUES(p_tenant,p_property,'direct',p_request::text,1,repeat('0',64),'Confirmed',p_room_type,p_arrival,p_departure,p_guests,p_accommodation_minor,p_taxes_minor,0,p_accommodation_minor+p_taxes_minor,trim(p_guest_name)) RETURNING * INTO res;
 INSERT INTO irp_pms.direct_requests(tenant_id,property_id,request_id,payload,reservation_id,created_by) VALUES(p_tenant,p_property,p_request,request_payload,res.id,auth.uid());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'reservation_created',res.id);
 RETURN to_jsonb(res);
END $$;

-- Forward from 202609070155_iratepilot_pms_overdue_inventory.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION irp_pms.apply_reservation(p_tenant uuid,p_property uuid,p_data jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE incoming irp_pms.reservations; previous irp_pms.reservations; day date; available integer; used integer; property_data jsonb; type_data jsonb; business_date date;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) AS k WHERE k NOT IN('source_booking_id','source_version','payload_hash','status','room_type_id','arrival','departure','guests','accommodation_minor','taxes_minor','ota_fees_minor','guest_total_minor')) THEN RAISE EXCEPTION 'Unexpected reservation field'; END IF;
 incoming:=jsonb_populate_record(NULL::irp_pms.reservations,p_data);
 IF incoming.source_booking_id IS NULL OR length(incoming.source_booking_id) NOT BETWEEN 1 AND 128 OR incoming.source_version IS NULL OR incoming.source_version NOT BETWEEN 1 AND 9007199254740991 OR incoming.payload_hash IS NULL OR incoming.payload_hash !~ '^[a-f0-9]{64}$' OR incoming.status IS NULL OR incoming.status NOT IN('Confirmed','Cancelled') THEN RAISE EXCEPTION 'Invalid source identity or status'; END IF;
 -- Serialize all admissions for a property, including first booking creation.
 SELECT to_jsonb(p) INTO property_data FROM irp_pms.properties p WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 business_date:=(clock_timestamp() AT TIME ZONE (property_data->>'time_zone'))::date;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND source='iratepilot-ota' AND source_booking_id=incoming.source_booking_id FOR UPDATE;
 IF FOUND THEN
  IF incoming.source_version<previous.source_version THEN RETURN 'stale'; END IF;
  IF incoming.source_version=previous.source_version THEN
   IF incoming.payload_hash=previous.payload_hash THEN RETURN 'duplicate'; END IF;
   RETURN 'review:version_conflict';
  END IF;
  IF previous.status IN('In house','Checked out') THEN RETURN 'review:stay_started'; END IF;
  IF previous.status='Cancelled' AND incoming.status='Confirmed' THEN RETURN 'review:reinstatement'; END IF;
  IF incoming.status='Confirmed' AND to_jsonb(previous)->>'physical_room_id' IS NOT NULL AND
    (previous.room_type_id IS DISTINCT FROM incoming.room_type_id OR previous.arrival IS DISTINCT FROM incoming.arrival OR previous.departure IS DISTINCT FROM incoming.departure) THEN RETURN 'review:assigned_room_change'; END IF;
  -- A cancellation changes lifecycle state; retain the original stay and money
  -- for reconciliation, while its Cancelled status releases capacity.
  IF incoming.status='Cancelled' THEN
   incoming.room_type_id:=previous.room_type_id;incoming.arrival:=previous.arrival;incoming.departure:=previous.departure;incoming.guests:=previous.guests;
   incoming.accommodation_minor:=previous.accommodation_minor;incoming.taxes_minor:=previous.taxes_minor;incoming.ota_fees_minor:=previous.ota_fees_minor;incoming.guest_total_minor:=previous.guest_total_minor;
  END IF;
 END IF;
 IF incoming.status='Confirmed' THEN
  IF incoming.room_type_id IS NULL OR incoming.arrival IS NULL OR incoming.departure IS NULL OR incoming.departure<=incoming.arrival OR incoming.departure-incoming.arrival>30 THEN RAISE EXCEPTION 'Invalid stay'; END IF;
  -- Later pilot migrations add these operational limits. Older installations
  -- remain compatible; configured hotels enforce their actual limits.
  SELECT to_jsonb(t) INTO type_data FROM irp_pms.room_types t WHERE tenant_id=p_tenant AND property_id=p_property AND id=incoming.room_type_id;
  IF type_data->>'max_guests' IS NOT NULL AND incoming.guests>(type_data->>'max_guests')::integer THEN RETURN 'review:guest_limit'; END IF;
  IF property_data->>'time_zone' IS NOT NULL AND incoming.arrival<business_date THEN RETURN 'review:past_arrival'; END IF;
  -- Existing sold_out review also covers a retained physical assignment that is unavailable for maintenance; exact replay/cancellation remain above.
  IF previous.physical_room_id IS NOT NULL AND irp_pms.room_is_closed(p_tenant,p_property,previous.physical_room_id,incoming.arrival,incoming.departure) THEN RETURN 'review:sold_out'; END IF;
  FOR day IN SELECT generate_series(incoming.arrival,incoming.departure-1,interval '1 day')::date LOOP
   available:=irp_pms.effective_capacity(p_tenant,p_property,incoming.room_type_id,day);
   IF available IS NULL THEN RETURN 'review:capacity_missing'; END IF;
   SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=incoming.room_type_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date) AND (source<>'iratepilot-ota' OR source_booking_id<>incoming.source_booking_id);
   IF used>=available THEN RETURN 'review:sold_out'; END IF;
  END LOOP;
 END IF;
 INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor)
 VALUES(p_tenant,p_property,coalesce(previous.id,gen_random_uuid()),'iratepilot-ota',incoming.source_booking_id,incoming.source_version,incoming.payload_hash,incoming.status,incoming.room_type_id,incoming.arrival,incoming.departure,incoming.guests,incoming.accommodation_minor,incoming.taxes_minor,incoming.ota_fees_minor,incoming.guest_total_minor)
 ON CONFLICT(tenant_id,property_id,source,source_booking_id) DO UPDATE SET source_version=excluded.source_version,payload_hash=excluded.payload_hash,status=excluded.status,room_type_id=excluded.room_type_id,arrival=excluded.arrival,departure=excluded.departure,guests=excluded.guests,accommodation_minor=excluded.accommodation_minor,taxes_minor=excluded.taxes_minor,ota_fees_minor=excluded.ota_fees_minor,guest_total_minor=excluded.guest_total_minor;
 RETURN 'applied';
END $$;

-- Forward from 202609070169_iratepilot_pms_staff_write_authorization.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_amend_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest_name text,p_room_type uuid,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.reservation_amendments; opening irp_pms.folio_openings;
 command jsonb; result jsonb; day date; available integer; used integer; guest_limit integer; has_opening boolean; needs_reconciliation boolean; total bigint; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_version',p_expected_version,'guest_name',trim(p_guest_name),'room_type_id',p_room_type,'arrival',p_arrival,'departure',p_departure,'guests',p_guests,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor);
 SELECT * INTO prior FROM irp_pms.reservation_amendments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Amendment request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 IF previous.source NOT IN('direct','migration') THEN RAISE EXCEPTION 'Amend an OTA reservation at its source'; END IF;
 IF previous.status<>'Confirmed' THEN RAISE EXCEPTION 'Only confirmed unstarted reservations can be amended'; END IF;
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before amending' USING ERRCODE='PT409'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest name or future stay dates'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Invalid scoped room type or guest count'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 has_opening:=FOUND;
 IF has_opening AND member_role NOT IN('owner','manager') AND (p_accommodation_minor IS DISTINCT FROM previous.accommodation_minor OR p_taxes_minor IS DISTINCT FROM previous.taxes_minor) THEN RAISE EXCEPTION 'Owner or manager required to amend amounts after the folio opens' USING ERRCODE='42501'; END IF;
 IF previous.physical_room_id IS NOT NULL THEN
  IF previous.room_type_id IS DISTINCT FROM p_room_type OR previous.arrival IS DISTINCT FROM p_arrival OR previous.departure IS DISTINCT FROM p_departure THEN RAISE EXCEPTION 'Assigned-room date or room-type changes require separate room reassignment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=previous.physical_room_id AND room_type_id=p_room_type) THEN RAISE EXCEPTION 'Assigned physical room does not match this room type'; END IF;
  IF irp_pms.room_is_closed(p_tenant,p_property,previous.physical_room_id,p_arrival,p_departure) THEN RAISE EXCEPTION 'Assigned physical room has a maintenance closure during the stay'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND physical_room_id=previous.physical_room_id AND (status IN('Confirmed','In house') AND arrival<p_departure AND departure>p_arrival OR status='In house' AND departure<business_date AND p_departure>business_date)) THEN RAISE EXCEPTION 'Assigned physical room overlaps another active stay'; END IF;
 END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  available:=irp_pms.effective_capacity(p_tenant,p_property,p_room_type,day);
  IF available IS NULL THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND room_type_id=p_room_type AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
 END LOOP;
 UPDATE irp_pms.reservations SET guest_name=trim(p_guest_name),room_type_id=p_room_type,arrival=p_arrival,departure=p_departure,guests=p_guests,
 accommodation_minor=p_accommodation_minor,taxes_minor=p_taxes_minor,guest_total_minor=total,source_version=source_version+1,
 payload_hash=encode(sha256(convert_to(command::text,'UTF8')),'hex')
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO changed;
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor OR opening.hotel_fees_minor IS DISTINCT FROM changed.hotel_fees_minor OR opening.charge_breakdown IS DISTINCT FROM changed.charge_breakdown);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false));
 INSERT INTO irp_pms.reservation_amendments(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result)
 VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_amended',p_reservation,
 jsonb_build_object('previous_version',previous.source_version,'source_version',changed.source_version,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false)));
 RETURN result;
END $$;

-- Forward from 202609070169_iratepilot_pms_staff_write_authorization.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_extend_stay(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_departure date,p_accommodation_minor bigint,p_taxes_minor bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.stay_extensions; opening irp_pms.folio_openings;
 command jsonb; result jsonb; business_date date; day date; available integer; used integer; has_opening boolean; needs_reconciliation boolean; total bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_version',p_expected_version,'departure',p_departure,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.stay_extensions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Extension request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 IF previous.source NOT IN('direct','migration') THEN RAISE EXCEPTION 'Extend an OTA reservation through its source; local source-owned stay changes require review'; END IF;
 IF previous.status<>'In house' THEN RAISE EXCEPTION 'Only an in-house reservation can be extended'; END IF;
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before extending' USING ERRCODE='PT409'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_departure IS NULL OR p_departure<=previous.departure OR p_departure<=business_date OR p_departure-previous.arrival>30 THEN RAISE EXCEPTION 'Extension must depart after today and the existing departure, within 30 total nights'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Provide an extension reason of 4 to 500 characters'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=previous.physical_room_id AND room_type_id=previous.room_type_id) THEN RAISE EXCEPTION 'In-house physical room does not match the booked room type'; END IF;
 IF irp_pms.room_is_closed(p_tenant,p_property,previous.physical_room_id,business_date,p_departure) THEN RAISE EXCEPTION 'In-house physical room has a maintenance closure during the extended stay'; END IF;
 -- Validate all remaining nights with the same scope and predicate as every
 -- other admission. Exclude only this reservation, never a source booking ID.
 FOR day IN SELECT generate_series(business_date,p_departure-1,interval '1 day')::date LOOP
  available:=irp_pms.effective_capacity(p_tenant,p_property,previous.room_type_id,day);
  IF available IS NULL THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND room_type_id=previous.room_type_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND physical_room_id=previous.physical_room_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date)) THEN RAISE EXCEPTION 'Physical room overlaps another active stay on %',day; END IF;
 END LOOP;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 has_opening:=FOUND;
 UPDATE irp_pms.reservations SET departure=p_departure,accommodation_minor=p_accommodation_minor,taxes_minor=p_taxes_minor,guest_total_minor=total,source_version=source_version+1,
 payload_hash=encode(sha256(convert_to(command::text,'UTF8')),'hex')
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO changed;
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor OR opening.hotel_fees_minor IS DISTINCT FROM changed.hotel_fees_minor OR opening.charge_breakdown IS DISTINCT FROM changed.charge_breakdown);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'previous_departure',previous.departure,'business_date',business_date,'overdue_resolved',previous.departure<business_date,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false));
 INSERT INTO irp_pms.stay_extensions(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result) VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'stay_extended',p_reservation,
 jsonb_build_object('previous_departure',previous.departure,'departure',changed.departure,'previous_version',previous.source_version,'source_version',changed.source_version,'reason',trim(p_reason),'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false)));
 RETURN result;
END $$;

-- Forward from 202609070155_iratepilot_pms_overdue_inventory.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION irp_pms.validate_import(p_tenant uuid,p_property uuid,p_provider text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; raw jsonb; errors jsonb; rows jsonb:='[]'::jsonb; normalized jsonb; source_id text; guest_name text; type_id uuid;
 arrival date; departure date; guest_count integer; max_guests integer; accommodation bigint; taxes bigint; business_date date; valid_count integer;
BEGIN
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR octet_length(p_rows::text)>1048576 THEN RAISE EXCEPTION 'Provide 1 to 500 reservation rows within 1 MiB'; END IF;
 -- Reject unsupported/sensitive fields and nested payloads before any caller
 -- persists source_rows, previews, actions or activity. Invalid scalar values
 -- still receive the normal row-specific preview errors below.
 FOR raw IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(raw)='array' THEN RAISE EXCEPTION 'Import rows cannot contain nested arrays or objects'; END IF;
  IF jsonb_typeof(raw)='object' THEN
   IF EXISTS(SELECT 1 FROM jsonb_each(raw) f WHERE f.key NOT IN('source_id','guest_name','room_type_id','arrival','departure','guests','currency','accommodation_minor','taxes_minor') OR jsonb_typeof(f.value) IN('object','array')) THEN
    RAISE EXCEPTION 'Import payload contains unsupported fields or nested values; no payment, deposit or identity-document data is accepted';
   END IF;
  END IF;
 END LOOP;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 FOR item IN SELECT value,ordinality::integer AS row_number FROM jsonb_array_elements(p_rows) WITH ORDINALITY LOOP
  raw:=item.value;errors:='[]'::jsonb;normalized:=NULL;source_id:=NULL;guest_name:=NULL;type_id:=NULL;arrival:=NULL;departure:=NULL;guest_count:=NULL;max_guests:=NULL;accommodation:=NULL;taxes:=NULL;
  IF jsonb_typeof(raw) IS DISTINCT FROM 'object' THEN errors:=errors||jsonb_build_array('invalid_row_object');
  ELSE
   IF jsonb_typeof(raw->'source_id') IS DISTINCT FROM 'string' OR length(trim(raw->>'source_id')) NOT BETWEEN 1 AND 128 THEN errors:=errors||jsonb_build_array('invalid_source_id');
   ELSE
    source_id:=trim(raw->>'source_id');
    IF (SELECT count(*) FROM jsonb_array_elements(p_rows) r WHERE jsonb_typeof(r)='object' AND jsonb_typeof(r->'source_id')='string' AND trim(r->>'source_id')=source_id)>1 THEN errors:=errors||jsonb_build_array('duplicate_source_id_in_batch'); END IF;
    IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND source='migration' AND migration_provider=p_provider AND migration_source_id=source_id) THEN errors:=errors||jsonb_build_array('source_id_already_imported'); END IF;
   END IF;
   IF jsonb_typeof(raw->'guest_name') IS DISTINCT FROM 'string' OR length(trim(raw->>'guest_name')) NOT BETWEEN 1 AND 200 THEN errors:=errors||jsonb_build_array('invalid_guest_name'); ELSE guest_name:=trim(raw->>'guest_name'); END IF;
   BEGIN
    IF jsonb_typeof(raw->'room_type_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid type'; END IF;
    type_id:=(raw->>'room_type_id')::uuid;
    SELECT t.max_guests INTO max_guests FROM irp_pms.room_types t WHERE tenant_id=p_tenant AND property_id=p_property AND id=type_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped type'; END IF;
   EXCEPTION WHEN OTHERS THEN type_id:=NULL;errors:=errors||jsonb_build_array('invalid_scoped_room_type'); END;
   BEGIN
    IF jsonb_typeof(raw->'arrival') IS DISTINCT FROM 'string' OR jsonb_typeof(raw->'departure') IS DISTINCT FROM 'string' OR (raw->>'arrival') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (raw->>'departure') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid dates'; END IF;
    arrival:=(raw->>'arrival')::date;departure:=(raw->>'departure')::date;
    IF arrival<business_date OR departure<=arrival OR departure-arrival>30 THEN RAISE EXCEPTION 'Invalid stay'; END IF;
   EXCEPTION WHEN OTHERS THEN arrival:=NULL;departure:=NULL;errors:=errors||jsonb_build_array('invalid_future_stay_1_to_30_nights'); END;
   BEGIN
    IF jsonb_typeof(raw->'guests') IS DISTINCT FROM 'number' OR (raw->>'guests')::numeric NOT BETWEEN 1 AND 20 OR trunc((raw->>'guests')::numeric)<>(raw->>'guests')::numeric THEN RAISE EXCEPTION 'Invalid guests'; END IF;
    guest_count:=(raw->>'guests')::integer;
    IF max_guests IS NOT NULL AND guest_count>max_guests THEN RAISE EXCEPTION 'Guest limit exceeded'; END IF;
   EXCEPTION WHEN OTHERS THEN guest_count:=NULL;errors:=errors||jsonb_build_array('invalid_guest_count'); END;
   IF raw->>'currency' IS DISTINCT FROM 'USD' OR jsonb_typeof(raw->'currency') IS DISTINCT FROM 'string' THEN errors:=errors||jsonb_build_array('currency_must_be_USD'); END IF;
   BEGIN
    IF jsonb_typeof(raw->'accommodation_minor') IS DISTINCT FROM 'number' OR jsonb_typeof(raw->'taxes_minor') IS DISTINCT FROM 'number' OR (raw->>'accommodation_minor')::numeric NOT BETWEEN 0 AND 999999999999 OR (raw->>'taxes_minor')::numeric NOT BETWEEN 0 AND 999999999999 OR trunc((raw->>'accommodation_minor')::numeric)<>(raw->>'accommodation_minor')::numeric OR trunc((raw->>'taxes_minor')::numeric)<>(raw->>'taxes_minor')::numeric THEN RAISE EXCEPTION 'Invalid minor units'; END IF;
    accommodation:=(raw->>'accommodation_minor')::bigint;taxes:=(raw->>'taxes_minor')::bigint;
    IF accommodation+taxes>999999999999 THEN RAISE EXCEPTION 'Total amount exceeds supported range'; END IF;
   EXCEPTION WHEN OTHERS THEN accommodation:=NULL;taxes:=NULL;errors:=errors||jsonb_build_array('invalid_integer_minor_unit_amounts'); END;
   IF errors='[]'::jsonb THEN normalized:=jsonb_build_object('source_id',source_id,'guest_name',guest_name,'room_type_id',type_id,'arrival',arrival,'departure',departure,'guests',guest_count,'currency','USD','accommodation_minor',accommodation,'taxes_minor',taxes,'ota_fees_minor',0,'guest_total_minor',accommodation+taxes,'status','Confirmed'); END IF;
  END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('row_number',item.row_number,'source_id',source_id,'valid',errors='[]'::jsonb,'errors',errors,'normalized',normalized));
 END LOOP;
 -- Evaluate aggregate batch demand, not each row in isolation, against the same
 -- existing inventory snapshot protected by the caller's property lock.
 WITH ready AS (
  SELECT (r->>'row_number')::integer row_number,r->'normalized' n FROM jsonb_array_elements(rows) r WHERE r->>'valid'='true'
 ), demand AS (
  SELECT (n->>'room_type_id')::uuid type_id,d::date stay_date,count(*)::integer units
  FROM ready CROSS JOIN LATERAL generate_series((n->>'arrival')::date,(n->>'departure')::date-1,interval '1 day') d GROUP BY 1,2
 ), availability AS (
  SELECT d.*,irp_pms.effective_capacity(p_tenant,p_property,d.type_id,d.stay_date) capacity,(SELECT count(*) FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=d.type_id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,d.stay_date,business_date)) used
  FROM demand d LEFT JOIN irp_pms.nightly_capacity c ON c.tenant_id=p_tenant AND c.property_id=p_property AND c.room_type_id=d.type_id AND c.stay_date=d.stay_date
 ), invalid_nights AS (
  SELECT ready.row_number,jsonb_agg((CASE WHEN a.capacity IS NULL THEN 'capacity_missing:' ELSE 'insufficient_capacity:' END)||a.stay_date::text ORDER BY a.stay_date) errors
  FROM ready JOIN availability a ON a.type_id=(n->>'room_type_id')::uuid AND a.stay_date>=(n->>'arrival')::date AND a.stay_date<(n->>'departure')::date
  WHERE a.capacity IS NULL OR a.used+a.units>a.capacity GROUP BY ready.row_number
 )
 SELECT coalesce(jsonb_agg(CASE WHEN i.row_number IS NULL THEN r ELSE r||jsonb_build_object('valid',false,'errors',(r->'errors')||i.errors) END ORDER BY (r->>'row_number')::integer),'[]'::jsonb)
 INTO rows FROM jsonb_array_elements(rows) r LEFT JOIN invalid_nights i ON i.row_number=(r->>'row_number')::integer;
 SELECT count(*) INTO valid_count FROM jsonb_array_elements(rows) r WHERE r->>'valid'='true';
 RETURN jsonb_build_object('row_count',jsonb_array_length(p_rows),'valid_count',valid_count,'error_count',jsonb_array_length(p_rows)-valid_count,'rows',rows,'currency','USD','payment_state','not_recorded');
END $$;

-- Forward from 202609070169_iratepilot_pms_staff_write_authorization.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_set_capacity(p_tenant uuid,p_property uuid,p_room_type uuid,p_start date,p_end date,p_units integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE physical_count integer; day date; used integer; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 OR p_units IS NULL OR p_units<0 THEN RAISE EXCEPTION 'Invalid capacity dates or units'; END IF;
 PERFORM 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown room type'; END IF;
 SELECT count(*) INTO physical_count FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type;
 IF p_units>physical_count THEN RAISE EXCEPTION 'Capacity exceeds configured physical rooms'; END IF;
 FOR day IN SELECT generate_series(p_start,p_end-1,interval '1 day')::date LOOP
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF least(p_units,physical_count-(SELECT m.closed_units FROM irp_pms.maintenance_capacity(p_tenant,p_property,p_room_type,day) m))<used THEN RAISE EXCEPTION 'Effective capacity after maintenance is below existing reservations on %',day; END IF;
  INSERT INTO irp_pms.nightly_capacity(tenant_id,property_id,room_type_id,stay_date,units) VALUES(p_tenant,p_property,p_room_type,day,p_units)
  ON CONFLICT(tenant_id,property_id,room_type_id,stay_date) DO UPDATE SET units=excluded.units;
 END LOOP;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'capacity_updated',p_room_type,jsonb_build_object('start',p_start,'end',p_end,'units',p_units));
 RETURN jsonb_build_object('nights',p_end-p_start,'units',p_units);
END $$;

-- Forward from 202609070168_iratepilot_pms_operational_authorization.sql; maintenance enforcement.
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
  IF irp_pms.room_is_closed(p_tenant,p_property,p_room,business_date,res.departure) THEN RAISE EXCEPTION 'Physical room has a maintenance closure during the remaining stay'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND id<>res.id AND status='In house') THEN RAISE EXCEPTION 'Physical room is occupied'; END IF;
  UPDATE irp_pms.reservations SET status='In house',physical_room_id=p_room,checked_in_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 ELSIF p_action='check_out' THEN
  IF res.status='Checked out' THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'In house' OR business_date<res.arrival THEN RAISE EXCEPTION 'Only an in-house reservation can check out'; END IF;
  UPDATE irp_pms.reservations SET status='Checked out',checked_out_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
  UPDATE irp_pms.rooms SET housekeeping='Dirty' WHERE tenant_id=p_tenant AND property_id=p_property AND id=res.physical_room_id;
 ELSIF p_action='cancel' THEN
  RAISE EXCEPTION 'Cancellation now requires review; use irp_pms_pilot_cancellation_preview and irp_pms_pilot_cancel_reservation';
 ELSE RAISE EXCEPTION 'Unknown stay action';
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),p_action,res.id);
 RETURN to_jsonb(res);
END $$;

-- Forward from 202609070168_iratepilot_pms_operational_authorization.sql; maintenance enforcement.
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
 IF irp_pms.room_is_closed(p_tenant,p_property,p_to_room,business_date,CASE WHEN res.departure<business_date THEN NULL ELSE greatest(res.departure,business_date+1) END) THEN RAISE EXCEPTION 'Destination room has a maintenance closure during the remaining stay';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id IN(p_from_room,p_to_room) AND r.status='In house') THEN RAISE EXCEPTION 'A selected room is occupied by another in-house stay';END IF;
 -- A due-out guest still physically occupies today's room until checkout.
 -- An overdue stay has no resolved end, so all future assignments conflict.
 IF EXISTS(SELECT 1 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id<>p_reservation AND r.physical_room_id=p_to_room AND r.status='Confirmed' AND r.departure>business_date AND (res.departure<business_date OR r.arrival<greatest(res.departure,business_date+1))) THEN RAISE EXCEPTION 'Destination room has an overlapping assigned reservation';END IF;
 UPDATE irp_pms.reservations SET physical_room_id=p_to_room WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 UPDATE irp_pms.rooms SET housekeeping='Dirty' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 SELECT * INTO old_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;
 SELECT * INTO new_room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_to_room;
 result:=jsonb_build_object('request_id',p_request,'reservation',to_jsonb(res),'from_room',to_jsonb(old_room),'to_room',to_jsonb(new_room),'business_date',business_date,'moved_at',moved_at,'source_version_retained',true,'pricing_changed',false,'folio_changed',false,'replayed',false);
 INSERT INTO irp_pms.room_move_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'room_moved',p_reservation,command||jsonb_build_object('request_id',p_request,'from_room_version_after',old_room.state_version,'to_room_version_after',new_room.state_version,'business_date',business_date,'moved_at',moved_at));
 RETURN result;
END $$;

-- Forward from 202609070159_iratepilot_pms_property_models_reports.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION irp_pms.apply_operating_model(p_tenant uuid,p_property uuid,p_mode text,p_max_guests integer) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; unit_type uuid;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN('hotel','whole_home') OR (p_mode='hotel' AND p_max_guests IS NOT NULL) OR (p_mode='whole_home' AND (p_max_guests IS NULL OR p_max_guests NOT BETWEEN 1 AND 20)) THEN RAISE EXCEPTION 'Choose hotel with no unit guest limit, or whole_home with 1 to 20 guests'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
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

-- Forward from 202609070169_iratepilot_pms_staff_write_authorization.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_configure_property(p_tenant uuid,p_property uuid,p_name text,p_time_zone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_time_zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone) THEN RAISE EXCEPTION 'Unknown property time zone'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND (c.effective_end>(clock_timestamp() AT TIME ZONE prop.time_zone)::date OR c.effective_end>(clock_timestamp() AT TIME ZONE p_time_zone)::date)) THEN RAISE EXCEPTION 'Resolve maintenance closures before changing a time zone that affects their current or future dates'; END IF;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 UPDATE irp_pms.properties SET name=trim(p_name),time_zone=p_time_zone WHERE tenant_id=p_tenant AND id=p_property RETURNING * INTO prop;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'property_updated',p_property);
 RETURN to_jsonb(prop);
END $$;

-- Forward from 202609070155_iratepilot_pms_overdue_inventory.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_workspace(p_tenant uuid,p_property uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 IF (SELECT count(*) FROM irp_pms.room_closures c WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.effective_end>c.scheduled_start AND c.effective_end>business_date)>10000 THEN RAISE EXCEPTION 'Too many active or future maintenance intervals for this workspace'; END IF;
 RETURN jsonb_build_object('property',to_jsonb(prop),'role',member_role,'business_date',business_date,'overdue_policy','block_future_until_resolved',
 'room_types',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM irp_pms.room_types r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'rooms',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('maintenance_intervals',coalesce((SELECT jsonb_agg(jsonb_build_object('closure_id',m.id,'start',m.scheduled_start,'end',m.effective_end,'end_exclusive',true) ORDER BY m.scheduled_start,m.id) FROM irp_pms.room_closures m WHERE m.tenant_id=r.tenant_id AND m.property_id=r.property_id AND m.room_id=r.id AND m.effective_end>m.scheduled_start AND m.effective_end>business_date),'[]'::jsonb)) ORDER BY r.label) FROM irp_pms.rooms r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.status='In house' AND r.departure<business_date) ORDER BY r.arrival,r.id) FROM irp_pms.reservations r WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'capacity',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('configured_units',m.configured_units,'physical_units',m.physical_units,'closed_units',m.closed_units,'effective_units',m.effective_units,'reserved_units',u.used,'available_units',CASE WHEN m.effective_units IS NULL THEN NULL ELSE greatest(0,m.effective_units-u.used) END,'shortfall_units',CASE WHEN m.effective_units IS NULL THEN NULL ELSE greatest(0,u.used-m.effective_units) END,'overdue_units',u.overdue) ORDER BY c.stay_date,c.room_type_id) FROM irp_pms.nightly_capacity c CROSS JOIN LATERAL irp_pms.maintenance_capacity(c.tenant_id,c.property_id,c.room_type_id,c.stay_date) m CROSS JOIN LATERAL (SELECT count(*)::integer used,count(*) FILTER(WHERE r.status='In house' AND r.departure<business_date)::integer overdue FROM irp_pms.reservations r WHERE r.tenant_id=c.tenant_id AND r.property_id=c.property_id AND r.room_type_id=c.room_type_id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,c.stay_date,business_date)) u WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.stay_date>=business_date),'[]'::jsonb),
 'activity',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id DESC) FROM (SELECT * FROM irp_pms.activity WHERE tenant_id=p_tenant AND property_id=p_property ORDER BY id DESC LIMIT 50) a),'[]'::jsonb));
END $$;

-- Forward from 202609070159_iratepilot_pms_property_models_reports.sql; maintenance enforcement.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_operational_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; generated timestamptz; business_date date; arrivals jsonb; departures jsonb; in_house jsonb; cancellations jsonb; housekeeping jsonb; daily jsonb; forecast jsonb; summary jsonb; undated bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Report 1 to 366 days using an exclusive end date'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 generated:=clock_timestamp();business_date:=(generated AT TIME ZONE prop.time_zone)::date;
 IF (SELECT count(*) FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND (arrival>=p_start AND arrival<p_end OR departure>=p_start AND departure<p_end OR status='In house'))>10000 OR (SELECT count(*) FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property)>1000 THEN RAISE EXCEPTION 'Report is too large; narrow the period or use a smaller property scope'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.status='In house' AND r.departure<business_date) ORDER BY r.arrival,r.id),'[]'::jsonb) INTO arrivals FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status<>'Cancelled' AND r.arrival>=p_start AND r.arrival<p_end;
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.status='In house' AND r.departure<business_date) ORDER BY r.departure,r.id),'[]'::jsonb) INTO departures FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status<>'Cancelled' AND r.departure>=p_start AND r.departure<p_end;
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.departure<business_date) ORDER BY r.departure,r.id),'[]'::jsonb) INTO in_house FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status='In house';
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',false) ORDER BY r.arrival,r.id),'[]'::jsonb) INTO cancellations FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status='Cancelled' AND r.arrival>=p_start AND r.arrival<p_end;
 SELECT count(*) INTO undated FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND status='Cancelled' AND arrival IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('room_type_name',t.name,'current_reservation_id',(SELECT b.id FROM irp_pms.reservations b WHERE b.tenant_id=r.tenant_id AND b.property_id=r.property_id AND b.physical_room_id=r.id AND b.status='In house')) ORDER BY r.label,r.id),'[]'::jsonb) INTO housekeeping FROM irp_pms.rooms r JOIN irp_pms.room_types t ON t.tenant_id=r.tenant_id AND t.property_id=r.property_id AND t.id=r.room_type_id WHERE r.tenant_id=p_tenant AND r.property_id=p_property;
 WITH grid AS (
  SELECT d::date stay_date,t.id room_type_id,m.configured_units,m.physical_units,m.closed_units,m.effective_units units,
   (SELECT count(*) FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=t.id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,d::date,business_date)) reserved,
   (SELECT count(*) FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=t.id AND r.status='In house' AND r.departure<business_date AND d::date>=business_date) overdue
  FROM generate_series(p_start,p_end-1,interval '1 day') d CROSS JOIN irp_pms.room_types t CROSS JOIN LATERAL irp_pms.maintenance_capacity(t.tenant_id,t.property_id,t.id,d::date) m
  WHERE t.tenant_id=p_tenant AND t.property_id=p_property
 ), totals AS (
  SELECT stay_date,sum(coalesce(units,0))::bigint capacity_units,sum(coalesce(configured_units,0))::bigint configured_units,sum(physical_units)::bigint physical_units,sum(closed_units)::bigint closed_units,sum(CASE WHEN units IS NULL THEN 0 ELSE greatest(0,reserved-units) END)::bigint shortfall_units,sum(reserved)::bigint reserved_units,sum(greatest(0,coalesce(units,0)-reserved))::bigint available_units,sum(overdue)::bigint overdue_units,count(*) FILTER(WHERE units IS NULL)::integer unconfigured_room_types FROM grid GROUP BY stay_date
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('stay_date',d::date,'capacity_units',coalesce(t.capacity_units,0),'configured_units',coalesce(t.configured_units,0),'physical_units',coalesce(t.physical_units,0),'closed_units',coalesce(t.closed_units,0),'shortfall_units',coalesce(t.shortfall_units,0),'reserved_units',coalesce(t.reserved_units,0),'available_units',coalesce(t.available_units,0),'overdue_units',coalesce(t.overdue_units,0),'unconfigured_room_types',coalesce(t.unconfigured_room_types,0),'occupancy_percent',CASE WHEN coalesce(t.capacity_units,0)>0 AND t.unconfigured_room_types=0 THEN round(t.reserved_units*100.0/t.capacity_units,2) ELSE NULL END) ORDER BY d),'[]'::jsonb) INTO daily
 FROM generate_series(p_start,p_end-1,interval '1 day') d LEFT JOIN totals t ON t.stay_date=d::date;
 SELECT jsonb_build_object('basis','active_stays_arriving_in_period_full_stay','currency','USD','rows',coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.status='In house' AND r.departure<business_date) ORDER BY r.arrival,r.id),'[]'::jsonb),
  'accommodation_minor',coalesce(sum(r.accommodation_minor),0),'taxes_minor',coalesce(sum(r.taxes_minor),0),'hotel_fees_minor',coalesce(sum(r.hotel_fees_minor),0),'ota_fees_minor',coalesce(sum(r.ota_fees_minor),0),'total_minor',coalesce(sum(r.guest_total_minor),0),'unknown_amount_reservations',count(*) FILTER(WHERE r.guest_total_minor IS NULL)) INTO forecast
 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status IN('Confirmed','In house') AND r.arrival>=p_start AND r.arrival<p_end;
 IF (forecast->>'total_minor')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Report booked value exceeds the exact display range; narrow the period'; END IF;
 summary:=jsonb_build_object('arrivals',jsonb_array_length(arrivals),'departures',jsonb_array_length(departures),'in_house',jsonb_array_length(in_house),'cancelled_arrivals',jsonb_array_length(cancellations),'undated_cancellations',undated,
 'clean_units',(SELECT count(*) FROM jsonb_array_elements(housekeeping) x WHERE x->>'housekeeping'='Clean'),'dirty_units',(SELECT count(*) FROM jsonb_array_elements(housekeeping) x WHERE x->>'housekeeping'='Dirty'),'inspect_units',(SELECT count(*) FROM jsonb_array_elements(housekeeping) x WHERE x->>'housekeeping'='Inspect'),
 'capacity_unit_nights',(SELECT coalesce(sum((x->>'capacity_units')::bigint),0) FROM jsonb_array_elements(daily) x),'configured_unit_nights',(SELECT coalesce(sum((x->>'configured_units')::bigint),0) FROM jsonb_array_elements(daily) x),'physical_unit_nights',(SELECT coalesce(sum((x->>'physical_units')::bigint),0) FROM jsonb_array_elements(daily) x),'closed_unit_nights',(SELECT coalesce(sum((x->>'closed_units')::bigint),0) FROM jsonb_array_elements(daily) x),'shortfall_unit_nights',(SELECT coalesce(sum((x->>'shortfall_units')::bigint),0) FROM jsonb_array_elements(daily) x),'reserved_unit_nights',(SELECT coalesce(sum((x->>'reserved_units')::bigint),0) FROM jsonb_array_elements(daily) x),'available_unit_nights',(SELECT coalesce(sum((x->>'available_units')::bigint),0) FROM jsonb_array_elements(daily) x),'overdue_unit_nights',(SELECT coalesce(sum((x->>'overdue_units')::bigint),0) FROM jsonb_array_elements(daily) x),'unconfigured_type_nights',(SELECT coalesce(sum((x->>'unconfigured_room_types')::bigint),0) FROM jsonb_array_elements(daily) x),
 'booked_value_minor',forecast->'total_minor','booked_value_unknown_reservations',forecast->'unknown_amount_reservations');
 RETURN jsonb_build_object('property',to_jsonb(prop),'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true),'business_date',business_date,'generated_at',generated,'summary',summary,'arrivals',arrivals,'departures',departures,'in_house',in_house,'cancellations',cancellations,'housekeeping',housekeeping,'daily_occupancy',daily,'booked_value_forecast',forecast,
 'definitions',jsonb_build_object('arrivals_departures','Noncancelled reservations by their scheduled arrival/departure in the selected period.','in_house_housekeeping','Current operational state at report generation, regardless of the selected period.','cancellations','Currently cancelled reservations by scheduled arrival in the selected period; undated cancellations are a separate all-time count. This is not a cancellation-event-date report.','occupancy','Current Confirmed/In house commitments using scheduled nights and unresolved overdue blocking. Effective capacity is the lesser of the configured selling ceiling and current physical rooms minus distinct dated maintenance closures. Configured, physical, closed and shortfall unit nights are separate; missing configured capacity remains incomplete. Current room inventory and maintenance records are used for the selected dates; this is not reconstructed historical physical-room assignment or actual occupancy.','booked_value','Full current stay charges for Confirmed/In house reservations arriving in the selected period; not prorated, earned revenue, payment settlement or a financial close. Excludes cancelled and checked-out reservations.'));
END $$;

COMMIT;
