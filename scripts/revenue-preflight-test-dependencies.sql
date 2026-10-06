CREATE OR REPLACE FUNCTION irp_pms.inventory_occupies(p_status text, p_arrival date, p_departure date, p_day date, p_business_date date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT coalesce((p_status IN('Confirmed','In house') AND p_arrival<=p_day AND p_departure>p_day)
 OR (p_status='In house' AND p_departure<p_business_date AND p_day>=p_business_date),false)
$function$;

CREATE OR REPLACE FUNCTION irp_pms.maintenance_capacity(p_tenant uuid, p_property uuid, p_room_type uuid, p_day date)
 RETURNS TABLE(configured_units integer, physical_units integer, closed_units integer, effective_units integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
 WITH counts AS(
  SELECT (SELECT n.units FROM irp_pms.nightly_capacity n WHERE n.tenant_id=p_tenant AND n.property_id=p_property AND n.room_type_id=p_room_type AND n.stay_date=p_day) AS configured,
   count(*)::integer AS physical,
   count(*) FILTER(WHERE EXISTS(SELECT 1 FROM irp_pms.room_closures c WHERE c.tenant_id=r.tenant_id AND c.property_id=r.property_id AND c.room_id=r.id AND c.room_type_id=r.room_type_id AND c.scheduled_start<=p_day AND c.effective_end>p_day))::integer AS closed
  FROM irp_pms.rooms r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=p_room_type
 ) SELECT configured,physical,closed,CASE WHEN configured IS NULL THEN NULL ELSE least(configured,physical-closed) END FROM counts
$function$;

CREATE OR REPLACE FUNCTION irp_pms.pilot_require(p_tenant uuid, p_property uuid, p_manager boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE member_role text;
BEGIN
 SELECT m.role INTO member_role FROM irp_pms.memberships m JOIN irp_pms.properties p ON p.tenant_id=m.tenant_id
 WHERE m.tenant_id=p_tenant AND m.user_id=auth.uid() AND p.id=p_property;
 IF member_role IS NULL OR (p_manager AND member_role NOT IN('owner','manager')) THEN RAISE EXCEPTION 'Property access denied' USING ERRCODE='42501'; END IF;
 RETURN member_role;
END $function$;
