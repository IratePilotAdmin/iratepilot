BEGIN;
-- Forward-only repair: a delayed readiness request must not cross an occupancy
-- cycle and mark a newly dirty room ready. Existing API definitions stay frozen
-- on disk; the unversioned database entry point is explicitly closed below.
ALTER TABLE irp_pms.rooms ADD COLUMN state_version bigint NOT NULL DEFAULT 1 CHECK(state_version BETWEEN 1 AND 9007199254740991);

CREATE FUNCTION irp_pms.room_state_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.state_version IS DISTINCT FROM OLD.state_version AND NEW.state_version IS DISTINCT FROM OLD.state_version+1 THEN RAISE EXCEPTION 'Room state version must advance by one'; END IF;
 IF NEW.housekeeping IS DISTINCT FROM OLD.housekeeping OR NEW.room_type_id IS DISTINCT FROM OLD.room_type_id THEN NEW.state_version:=OLD.state_version+1; END IF;
 IF NEW.state_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Room state version limit reached'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.room_state_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_room_state_revision BEFORE UPDATE ON irp_pms.rooms FOR EACH ROW EXECUTE FUNCTION irp_pms.room_state_revision();

CREATE FUNCTION irp_pms.room_occupancy_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
REVOKE ALL ON FUNCTION irp_pms.room_occupancy_revision() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_room_occupancy_revision AFTER INSERT OR UPDATE OR DELETE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.room_occupancy_revision();

CREATE TABLE irp_pms.housekeeping_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,room_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),expected_version bigint NOT NULL CHECK(expected_version BETWEEN 1 AND 9007199254740991),
 requested_status text NOT NULL CHECK(requested_status IN('Clean','Dirty','Inspect')),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,room_id) REFERENCES irp_pms.rooms(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.housekeeping_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.housekeeping_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.housekeeping_requests TO service_role;

CREATE FUNCTION public.irp_pms_pilot_set_housekeeping(p_tenant uuid,p_property uuid,p_room uuid,p_request uuid,p_expected_version bigint,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE room irp_pms.rooms;prior irp_pms.housekeeping_requests;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_room IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_status IS NULL OR p_status NOT IN('Clean','Dirty','Inspect') THEN RAISE EXCEPTION 'Room, request, expected state version and housekeeping status are required'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 -- Recheck membership after a possible lock wait before applying a new action.
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.housekeeping_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.room_id IS DISTINCT FROM p_room OR prior.expected_version IS DISTINCT FROM p_expected_version OR prior.requested_status IS DISTINCT FROM p_status THEN RAISE EXCEPTION 'Housekeeping request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped physical room'; END IF;
 IF room.state_version<>p_expected_version THEN RAISE EXCEPTION 'Room state changed; refresh before updating housekeeping' USING ERRCODE='40001'; END IF;
 IF p_status IN('Clean','Inspect') AND EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status='In house') THEN RAISE EXCEPTION 'Occupied room cannot be marked ready'; END IF;
 UPDATE irp_pms.rooms SET housekeeping=p_status WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;
 result:=jsonb_build_object('room',to_jsonb(room),'request_id',p_request,'replayed',false);
 INSERT INTO irp_pms.housekeeping_requests(tenant_id,property_id,request_id,room_id,actor_id,expected_version,requested_status,result) VALUES(p_tenant,p_property,p_request,p_room,auth.uid(),p_expected_version,p_status,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'housekeeping_updated',p_room,jsonb_build_object('status',p_status,'previous_version',p_expected_version,'state_version',room.state_version,'request_id',p_request));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_set_housekeeping(uuid,uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_set_housekeeping(uuid,uuid,uuid,uuid,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_housekeeping(p_tenant uuid,p_property uuid,p_room uuid,p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'Unversioned housekeeping is disabled; refresh the PMS and use a versioned housekeeping request';
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_housekeeping(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
