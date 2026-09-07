BEGIN;
-- Independent PMS namespace; does not activate OTA delivery or migrate hotel data.
CREATE SCHEMA irp_pms;
REVOKE ALL ON SCHEMA irp_pms FROM PUBLIC;
GRANT USAGE ON SCHEMA irp_pms TO authenticated,service_role;
CREATE TABLE irp_pms.tenants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200));
CREATE TABLE irp_pms.memberships(tenant_id uuid NOT NULL REFERENCES irp_pms.tenants(id),user_id uuid NOT NULL REFERENCES auth.users(id),role text NOT NULL CHECK(role IN('owner','manager','staff')),PRIMARY KEY(tenant_id,user_id));
CREATE TABLE irp_pms.properties(tenant_id uuid NOT NULL REFERENCES irp_pms.tenants(id),id uuid NOT NULL DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),currency text NOT NULL CHECK(currency='USD'),PRIMARY KEY(tenant_id,id));
CREATE TABLE irp_pms.room_types(tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id));
CREATE TABLE irp_pms.reservations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 source text NOT NULL CHECK(source='iratepilot-ota'),source_booking_id text NOT NULL CHECK(length(source_booking_id) BETWEEN 1 AND 128),
 source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK(status IN('Confirmed','Cancelled','In house','Checked out')),
 room_type_id uuid,arrival date,departure date,guests integer,
 accommodation_minor bigint,taxes_minor bigint,ota_fees_minor bigint,guest_total_minor bigint,
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,source,source_booking_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id),
 FOREIGN KEY(tenant_id,property_id,room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id),
 CHECK(status='Cancelled' OR (room_type_id IS NOT NULL AND arrival IS NOT NULL AND departure IS NOT NULL AND guests IS NOT NULL AND accommodation_minor IS NOT NULL AND taxes_minor IS NOT NULL AND ota_fees_minor IS NOT NULL AND guest_total_minor IS NOT NULL)),
 CHECK(arrival IS NULL OR departure IS NULL OR (departure>arrival AND departure-arrival<=30)),
 CHECK(guests IS NULL OR guests>0),
 CHECK(accommodation_minor IS NULL OR accommodation_minor BETWEEN 0 AND 999999999999),
 CHECK(taxes_minor IS NULL OR taxes_minor BETWEEN 0 AND 999999999999),
 CHECK(ota_fees_minor IS NULL OR ota_fees_minor BETWEEN 0 AND 999999999999),
 CHECK(guest_total_minor IS NULL OR guest_total_minor BETWEEN 0 AND 999999999999),
 CHECK(guest_total_minor IS NULL OR accommodation_minor+taxes_minor+ota_fees_minor=guest_total_minor)
);
-- SECURITY DEFINER helper avoids recursive membership policies. Its owner must
-- remain a trusted migration/database role with access to the membership table.
CREATE FUNCTION irp_pms.is_member(p_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM irp_pms.memberships m WHERE m.tenant_id=p_tenant AND m.user_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION irp_pms.is_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION irp_pms.is_member(uuid) TO authenticated,service_role;
ALTER TABLE irp_pms.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_tenants ON irp_pms.tenants FOR SELECT TO authenticated USING(irp_pms.is_member(id));
CREATE POLICY own_membership ON irp_pms.memberships FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY member_properties ON irp_pms.properties FOR SELECT TO authenticated USING(irp_pms.is_member(tenant_id));
CREATE POLICY member_room_types ON irp_pms.room_types FOR SELECT TO authenticated USING(irp_pms.is_member(tenant_id));
CREATE POLICY member_reservations ON irp_pms.reservations FOR SELECT TO authenticated USING(irp_pms.is_member(tenant_id));
REVOKE ALL ON ALL TABLES IN SCHEMA irp_pms FROM PUBLIC,anon,authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA irp_pms TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA irp_pms TO service_role;
COMMIT;
