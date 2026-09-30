import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,test} from 'vitest';

test('capacity-locked preflight detects changed facts in an isolated database',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth; CREATE SCHEMA irp_pms;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE irp_pms.tenants(id uuid PRIMARY KEY,name text);
   CREATE TABLE irp_pms.properties(tenant_id uuid,id uuid,name text,currency text,time_zone text DEFAULT 'America/Chicago',PRIMARY KEY(tenant_id,id));
   CREATE TABLE irp_pms.memberships(tenant_id uuid,user_id uuid,role text,PRIMARY KEY(tenant_id,user_id));
   CREATE TABLE irp_pms.room_types(tenant_id uuid,property_id uuid,id uuid,name text);
   CREATE TABLE irp_pms.rooms(tenant_id uuid,property_id uuid,id uuid DEFAULT gen_random_uuid(),room_type_id uuid,label text,housekeeping text);
   CREATE TABLE irp_pms.room_closures(tenant_id uuid,property_id uuid,room_id uuid,room_type_id uuid,scheduled_start date,effective_end date);
   CREATE TABLE irp_pms.rate_plans(tenant_id uuid,property_id uuid,id uuid,room_type_id uuid,name text,tax_basis_points integer,active boolean,version bigint DEFAULT 1);
   CREATE TABLE irp_pms.nightly_capacity(tenant_id uuid,property_id uuid,room_type_id uuid,stay_date date,units integer,PRIMARY KEY(tenant_id,property_id,room_type_id,stay_date));
   CREATE TABLE irp_pms.nightly_rates(tenant_id uuid,property_id uuid,plan_id uuid,stay_date date,amount_minor bigint);
   CREATE TABLE irp_pms.reservations(tenant_id uuid,property_id uuid,source text,source_booking_id text,source_version bigint,payload_hash text,status text,room_type_id uuid,arrival date,departure date,guests integer,accommodation_minor bigint,taxes_minor bigint,ota_fees_minor bigint,guest_total_minor bigint);
   CREATE TABLE irp_pms.rate_actions(tenant_id uuid);
   INSERT INTO irp_pms.memberships VALUES('faa76112-c793-43db-92bd-f9faecd8d93a',gen_random_uuid(),'owner');`);
  await db.exec(readFileSync(new URL('../scripts/revenue-preflight-test-dependencies.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../pms-migrations/20260930183205_revenue_capacity_preflight_lock.sql',import.meta.url),'utf8'));
  const results=await db.exec(readFileSync(new URL('../scripts/qualify-revenue-facts-preflight.sql',import.meta.url),'utf8'));
  const summary=results.at(-1)?.rows[0] as {result:Record<string,unknown>};
  expect(summary.result).toEqual({matching_facts:'passed',price_drift:'detected',capacity_drift:'detected',booking_drift:'detected',cancellation:'reflected',plan_drift:'detected',missing_facts:'detected',null_input:'denied',past_night:'denied',unknown_plan:'denied',staff:'denied',rate_actions:0});
  const remaining=await db.query<{count:number}>("SELECT count(*)::integer count FROM irp_pms.tenants WHERE name='Temporary revenue preflight qualification'");
  expect(remaining.rows[0].count).toBe(0);
 }finally{await db.close();}
},20000);
