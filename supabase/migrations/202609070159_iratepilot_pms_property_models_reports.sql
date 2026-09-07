BEGIN;
-- Operating models share the existing reservation, rate, inventory and folio
-- system. A whole-home property exposes exactly one exclusive sellable unit.
ALTER TABLE irp_pms.properties ADD COLUMN operating_model text NOT NULL DEFAULT 'hotel' CHECK(operating_model IN('hotel','whole_home')),
 ADD COLUMN operating_model_version bigint NOT NULL DEFAULT 1 CHECK(operating_model_version BETWEEN 1 AND 9007199254740991),
 ADD COLUMN whole_home_max_guests integer,
 ADD CONSTRAINT property_operating_model_guests CHECK((operating_model='hotel' AND whole_home_max_guests IS NULL) OR (operating_model='whole_home' AND whole_home_max_guests BETWEEN 1 AND 20 AND whole_home_max_guests IS NOT NULL));
CREATE TABLE irp_pms.operating_model_requests(
 tenant_id uuid NOT NULL,request_id uuid NOT NULL,property_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,request_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.operating_model_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.operating_model_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.operating_model_requests TO service_role;

-- These guards also cover the existing room/type/capacity editors; a caller
-- cannot bypass whole-home exclusivity by using an older operating RPC.
CREATE FUNCTION irp_pms.whole_home_unit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
CREATE TRIGGER whole_home_room_type_guard BEFORE INSERT OR UPDATE OR DELETE ON irp_pms.room_types FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_unit_guard();
CREATE TRIGGER whole_home_room_guard BEFORE INSERT OR UPDATE OR DELETE ON irp_pms.rooms FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_unit_guard();
CREATE TRIGGER whole_home_capacity_guard BEFORE INSERT OR UPDATE OR DELETE ON irp_pms.nightly_capacity FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_unit_guard();

CREATE FUNCTION irp_pms.whole_home_property_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
CREATE CONSTRAINT TRIGGER whole_home_property_consistency AFTER INSERT OR UPDATE ON irp_pms.properties DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.whole_home_property_consistency();

CREATE FUNCTION irp_pms.operating_profile(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('tenant_id',p.tenant_id,'property_id',p.id,'property',to_jsonb(p),'mode',p.operating_model,'version',p.operating_model_version,'max_guests',p.whole_home_max_guests,
 'room_type_id',CASE WHEN p.operating_model='whole_home' THEN (SELECT r.id FROM irp_pms.room_types r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.id) ELSE NULL END,
 'room_id',CASE WHEN p.operating_model='whole_home' THEN (SELECT r.id FROM irp_pms.rooms r WHERE r.tenant_id=p.tenant_id AND r.property_id=p.id) ELSE NULL END)
 FROM irp_pms.properties p WHERE p.tenant_id=p_tenant AND p.id=p_property
$$;

CREATE FUNCTION irp_pms.apply_operating_model(p_tenant uuid,p_property uuid,p_mode text,p_max_guests integer) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; unit_type uuid;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN('hotel','whole_home') OR (p_mode='hotel' AND p_max_guests IS NOT NULL) OR (p_mode='whole_home' AND (p_max_guests IS NULL OR p_max_guests NOT BETWEEN 1 AND 20)) THEN RAISE EXCEPTION 'Choose hotel with no unit guest limit, or whole_home with 1 to 20 guests'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
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
REVOKE ALL ON FUNCTION irp_pms.whole_home_unit_guard(),irp_pms.whole_home_property_consistency(),irp_pms.operating_profile(uuid,uuid),irp_pms.apply_operating_model(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_operating_profile(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN irp_pms.operating_profile(p_tenant,p_property);
END $$;

CREATE FUNCTION public.irp_pms_pilot_configure_operating_model(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_mode text,p_max_guests integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; prior irp_pms.operating_model_requests; command jsonb; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Request and current operating model version are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','configure','property_id',p_property,'expected_version',p_expected_version,'mode',p_mode,'max_guests',p_max_guests);
 SELECT * INTO prior FROM irp_pms.operating_model_requests WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Operating model request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF prop.operating_model_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Operating model changed; refresh before saving' USING ERRCODE='40001'; END IF;
 PERFORM irp_pms.apply_operating_model(p_tenant,p_property,p_mode,p_max_guests);
 result:=irp_pms.operating_profile(p_tenant,p_property)||jsonb_build_object('replayed',false);
 INSERT INTO irp_pms.operating_model_requests(tenant_id,property_id,request_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 IF prop.operating_model IS DISTINCT FROM p_mode OR prop.whole_home_max_guests IS DISTINCT FROM p_max_guests THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'operating_model_configured',p_property,jsonb_build_object('previous_model',prop.operating_model,'mode',p_mode,'max_guests',p_max_guests,'version',result->'version'));
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_create_property(p_tenant uuid,p_request uuid,p_name text,p_time_zone text,p_mode text,p_max_guests integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE property_id uuid; prior irp_pms.operating_model_requests; command jsonb; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=auth.uid() AND role='owner') THEN RAISE EXCEPTION 'Organization owner access required' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 200 OR p_time_zone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_time_zone) THEN RAISE EXCEPTION 'Provide a request, property name and supported property time zone'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=auth.uid() AND role='owner') THEN RAISE EXCEPTION 'Organization owner access required' USING ERRCODE='42501'; END IF;
 command:=jsonb_build_object('action','create','name',trim(p_name),'time_zone',p_time_zone,'mode',p_mode,'max_guests',p_max_guests);
 SELECT * INTO prior FROM irp_pms.operating_model_requests WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Operating model request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF (SELECT count(*) FROM irp_pms.properties WHERE tenant_id=p_tenant)>=100 THEN RAISE EXCEPTION 'This operating surface supports at most 100 properties per organization'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND lower(trim(name))=lower(trim(p_name))) THEN RAISE EXCEPTION 'A property with this name already exists in the organization'; END IF;
 INSERT INTO irp_pms.properties(tenant_id,name,currency,time_zone) VALUES(p_tenant,trim(p_name),'USD',p_time_zone) RETURNING id INTO property_id;
 PERFORM irp_pms.apply_operating_model(p_tenant,property_id,p_mode,p_max_guests);
 result:=irp_pms.operating_profile(p_tenant,property_id)||jsonb_build_object('replayed',false);
 INSERT INTO irp_pms.operating_model_requests(tenant_id,property_id,request_id,actor_id,command,result) VALUES(p_tenant,property_id,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,property_id,auth.uid(),'property_created',property_id,jsonb_build_object('mode',p_mode));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_operational_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
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
  SELECT d::date stay_date,t.id room_type_id,c.units,
   (SELECT count(*) FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=t.id AND irp_pms.inventory_occupies(r.status,r.arrival,r.departure,d::date,business_date)) reserved,
   (SELECT count(*) FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=t.id AND r.status='In house' AND r.departure<business_date AND d::date>=business_date) overdue
  FROM generate_series(p_start,p_end-1,interval '1 day') d CROSS JOIN irp_pms.room_types t LEFT JOIN irp_pms.nightly_capacity c ON c.tenant_id=t.tenant_id AND c.property_id=t.property_id AND c.room_type_id=t.id AND c.stay_date=d::date
  WHERE t.tenant_id=p_tenant AND t.property_id=p_property
 ), totals AS (
  SELECT stay_date,sum(coalesce(units,0))::bigint capacity_units,sum(reserved)::bigint reserved_units,sum(greatest(0,coalesce(units,0)-reserved))::bigint available_units,sum(overdue)::bigint overdue_units,count(*) FILTER(WHERE units IS NULL)::integer unconfigured_room_types FROM grid GROUP BY stay_date
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('stay_date',d::date,'capacity_units',coalesce(t.capacity_units,0),'reserved_units',coalesce(t.reserved_units,0),'available_units',coalesce(t.available_units,0),'overdue_units',coalesce(t.overdue_units,0),'unconfigured_room_types',coalesce(t.unconfigured_room_types,0),'occupancy_percent',CASE WHEN coalesce(t.capacity_units,0)>0 AND t.unconfigured_room_types=0 THEN round(t.reserved_units*100.0/t.capacity_units,2) ELSE NULL END) ORDER BY d),'[]'::jsonb) INTO daily
 FROM generate_series(p_start,p_end-1,interval '1 day') d LEFT JOIN totals t ON t.stay_date=d::date;
 SELECT jsonb_build_object('basis','active_stays_arriving_in_period_full_stay','currency','USD','rows',coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('inventory_overdue',r.status='In house' AND r.departure<business_date) ORDER BY r.arrival,r.id),'[]'::jsonb),
  'accommodation_minor',coalesce(sum(r.accommodation_minor),0),'taxes_minor',coalesce(sum(r.taxes_minor),0),'hotel_fees_minor',coalesce(sum(r.hotel_fees_minor),0),'ota_fees_minor',coalesce(sum(r.ota_fees_minor),0),'total_minor',coalesce(sum(r.guest_total_minor),0),'unknown_amount_reservations',count(*) FILTER(WHERE r.guest_total_minor IS NULL)) INTO forecast
 FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.status IN('Confirmed','In house') AND r.arrival>=p_start AND r.arrival<p_end;
 IF (forecast->>'total_minor')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Report booked value exceeds the exact display range; narrow the period'; END IF;
 summary:=jsonb_build_object('arrivals',jsonb_array_length(arrivals),'departures',jsonb_array_length(departures),'in_house',jsonb_array_length(in_house),'cancelled_arrivals',jsonb_array_length(cancellations),'undated_cancellations',undated,
 'clean_units',(SELECT count(*) FROM jsonb_array_elements(housekeeping) x WHERE x->>'housekeeping'='Clean'),'dirty_units',(SELECT count(*) FROM jsonb_array_elements(housekeeping) x WHERE x->>'housekeeping'='Dirty'),'inspect_units',(SELECT count(*) FROM jsonb_array_elements(housekeeping) x WHERE x->>'housekeeping'='Inspect'),
 'capacity_unit_nights',(SELECT coalesce(sum((x->>'capacity_units')::bigint),0) FROM jsonb_array_elements(daily) x),'reserved_unit_nights',(SELECT coalesce(sum((x->>'reserved_units')::bigint),0) FROM jsonb_array_elements(daily) x),'available_unit_nights',(SELECT coalesce(sum((x->>'available_units')::bigint),0) FROM jsonb_array_elements(daily) x),'overdue_unit_nights',(SELECT coalesce(sum((x->>'overdue_units')::bigint),0) FROM jsonb_array_elements(daily) x),'unconfigured_type_nights',(SELECT coalesce(sum((x->>'unconfigured_room_types')::bigint),0) FROM jsonb_array_elements(daily) x),
 'booked_value_minor',forecast->'total_minor','booked_value_unknown_reservations',forecast->'unknown_amount_reservations');
 RETURN jsonb_build_object('property',to_jsonb(prop),'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true),'business_date',business_date,'generated_at',generated,'summary',summary,'arrivals',arrivals,'departures',departures,'in_house',in_house,'cancellations',cancellations,'housekeeping',housekeeping,'daily_occupancy',daily,'booked_value_forecast',forecast,
 'definitions',jsonb_build_object('arrivals_departures','Noncancelled reservations by their scheduled arrival/departure in the selected period.','in_house_housekeeping','Current operational state at report generation, regardless of the selected period.','cancellations','Currently cancelled reservations by scheduled arrival in the selected period; undated cancellations are a separate all-time count. This is not a cancellation-event-date report.','occupancy','Current Confirmed/In house inventory commitments using scheduled nights and unresolved overdue blocking. Not historical actual occupancy. Missing configured capacity is reported separately.','booked_value','Full current stay charges for Confirmed/In house reservations arriving in the selected period; not prorated, earned revenue, payment settlement or a financial close. Excludes cancelled and checked-out reservations.'));
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_operating_profile(uuid,uuid),public.irp_pms_pilot_configure_operating_model(uuid,uuid,uuid,bigint,text,integer),public.irp_pms_pilot_create_property(uuid,uuid,text,text,text,integer),public.irp_pms_pilot_operational_report(uuid,uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_operating_profile(uuid,uuid),public.irp_pms_pilot_configure_operating_model(uuid,uuid,uuid,bigint,text,integer),public.irp_pms_pilot_create_property(uuid,uuid,text,text,text,integer),public.irp_pms_pilot_operational_report(uuid,uuid,date,date) TO authenticated;
COMMIT;
