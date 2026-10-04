import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

export async function createRevenueQualificationDatabase(){
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth; CREATE SCHEMA irp_pms;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);`);
  for(const path of ['tests/fixtures/revenue-pms-pricing-schema.sql',
   'scripts/revenue-preflight-test-dependencies.sql','scripts/revenue-atomic-test-nightly-rpc.sql',
   'pms-migrations/20260930183205_revenue_capacity_preflight_lock.sql',
   'pms-candidates/20260930184425_revenue_atomic_approval_candidate.sql'])await db.exec(readFileSync(path,'utf8'));
  await db.exec(`INSERT INTO auth.users VALUES('7e3ac7b8-3286-4fcb-aaa9-a850390d787c'),('fe6502af-b9a2-478d-abad-bfbec8539df6'),('451c631e-2e3f-4293-b78c-e1bb92087f20');
   INSERT INTO irp_pms.tenants VALUES('00000000-0000-4000-8000-000000000001','Synthetic HTTP tenant');
   INSERT INTO irp_pms.properties(tenant_id,id,name,currency) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Synthetic HTTP property','USD');
   INSERT INTO irp_pms.memberships VALUES('00000000-0000-4000-8000-000000000001','7e3ac7b8-3286-4fcb-aaa9-a850390d787c','owner'),('00000000-0000-4000-8000-000000000001','fe6502af-b9a2-478d-abad-bfbec8539df6','manager'),('00000000-0000-4000-8000-000000000001','451c631e-2e3f-4293-b78c-e1bb92087f20','staff');
   INSERT INTO irp_pms.room_types VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','Synthetic room type');
   INSERT INTO irp_pms.rate_plans(tenant_id,property_id,id,room_type_id,name,tax_basis_points,active) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','Synthetic rate plan',0,true);
   INSERT INTO irp_pms.revenue_rate_decisions(request_id,tenant_id,property_id,actor_id,plan_id,reviewed_plan_version,stay_date,current_rate_minor,recommended_rate_minor,minimum_rate_minor,maximum_rate_minor,event_uplift_basis_points,effective_units,reserved_units,occupancy_tenths_percent,adjustment_basis_points,guardrail,explanations)
   VALUES('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','7e3ac7b8-3286-4fcb-aaa9-a850390d787c','00000000-0000-4000-8000-000000000004',1,'2026-10-01',14000,16100,7000,21000,0,10,8,800,1500,'none','["Synthetic read-only HTTP receipt fixture"]');`);
  // Match the isolated branch's disabled write endpoint; the rehearsal must
  // leave these ACLs unchanged rather than enabling authenticated API writes.
  await db.exec(`REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb) FROM authenticated;`);

  return db;
 }catch(error){await db.close();throw error;}
}

