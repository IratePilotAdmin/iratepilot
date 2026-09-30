import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,test} from 'vitest';

test('audited approval recomputes prices, rejects stale facts, replays and rolls back failed audits',async()=>{
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
  await db.exec(`ALTER TABLE irp_pms.rate_plans ADD updated_at timestamptz DEFAULT clock_timestamp();
   ALTER TABLE irp_pms.nightly_rates ADD PRIMARY KEY(tenant_id,property_id,plan_id,stay_date);
   ALTER TABLE irp_pms.rate_actions ADD property_id uuid,ADD request_id uuid,ADD actor_id uuid,ADD payload jsonb,ADD result jsonb;
   CREATE TABLE irp_pms.activity(tenant_id uuid,property_id uuid,actor_id uuid,action text,target_id uuid,details jsonb);`);
  for(const file of ['scripts/revenue-preflight-test-dependencies.sql','scripts/revenue-atomic-test-nightly-rpc.sql','pms-migrations/20260930183205_revenue_capacity_preflight_lock.sql','pms-candidates/20260930184425_revenue_atomic_approval_candidate.sql'])await db.exec(readFileSync(file,'utf8'));
  const t='00000000-0000-4000-8000-000000000001',p='00000000-0000-4000-8000-000000000002',rt='00000000-0000-4000-8000-000000000003',plan='00000000-0000-4000-8000-000000000004',user='00000000-0000-4000-8000-000000000005';
  await db.exec(`INSERT INTO irp_pms.tenants VALUES('${t}','Local atomic fixture');
   INSERT INTO irp_pms.properties(tenant_id,id,name,currency) VALUES('${t}','${p}','Local property','USD');
   INSERT INTO irp_pms.memberships VALUES('${t}','${user}','owner');
   INSERT INTO irp_pms.room_types VALUES('${t}','${p}','${rt}','Test');
   INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label,housekeeping) SELECT '${t}','${p}','${rt}',n::text,'Clean' FROM generate_series(1,10) n;
   INSERT INTO irp_pms.rate_plans(tenant_id,property_id,id,room_type_id,name,tax_basis_points,active) VALUES('${t}','${p}','${plan}','${rt}','Test',0,true);
   INSERT INTO irp_pms.nightly_capacity SELECT '${t}','${p}','${rt}',(clock_timestamp() AT TIME ZONE 'America/Chicago')::date+1,10;
   INSERT INTO irp_pms.nightly_rates SELECT '${t}','${p}','${plan}',stay_date,14000 FROM irp_pms.nightly_capacity;
   INSERT INTO irp_pms.reservations(tenant_id,property_id,room_type_id,status,arrival,departure) SELECT '${t}','${p}','${rt}','Confirmed',stay_date,stay_date+1 FROM irp_pms.nightly_capacity CROSS JOIN generate_series(1,8);
   SELECT set_config('request.jwt.claim.sub','${user}',false);`);
  const day=(await db.query<{stay_day:string}>('SELECT stay_date::text AS stay_day FROM irp_pms.nightly_rates')).rows[0].stay_day;
  const request='00000000-0000-4000-8000-000000000006';
  const args:(string|number|null|string[])[]=[t,p,request,plan,1,day,14000,16100,7000,21000,null,0,10,8,800,1500,'none',JSON.stringify(['Reviewed inputs'])];
  const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');
  const apply=(values=args)=>db.query<{receipt:{replayed:boolean;recommended_rate_minor:number}}>(`SELECT public.irp_pms_pilot_apply_revenue_decision(${placeholders}) receipt`,values);
  const changed=(index:number,value:string|number|null)=>args.map((x,i)=>i===index?value:x);
  await expect(apply(changed(7,16200))).rejects.toMatchObject({code:'22023'});
  await expect(apply(changed(7,null))).rejects.toMatchObject({code:'22023'});
  await db.exec('UPDATE irp_pms.nightly_rates SET amount_minor=14100');
  await expect(apply()).rejects.toMatchObject({code:'40001'});
  await db.exec('UPDATE irp_pms.nightly_rates SET amount_minor=14000;UPDATE irp_pms.nightly_capacity SET units=9');
  await expect(apply()).rejects.toMatchObject({code:'40001'});
  await db.exec(`UPDATE irp_pms.nightly_capacity SET units=10;
   INSERT INTO irp_pms.reservations(tenant_id,property_id,room_type_id,status,arrival,departure) SELECT '${t}','${p}','${rt}','Confirmed',stay_date,stay_date+1 FROM irp_pms.nightly_capacity;`);
  await expect(apply()).rejects.toMatchObject({code:'40001'});
  await db.exec("UPDATE irp_pms.reservations SET status='Cancelled' WHERE ctid=(SELECT ctid FROM irp_pms.reservations ORDER BY ctid DESC LIMIT 1)");
  await db.exec('UPDATE irp_pms.rate_plans SET active=false,version=2');
  await expect(apply()).rejects.toMatchObject({code:'40001'});
  await db.exec('UPDATE irp_pms.rate_plans SET active=true,version=1');
  await expect(apply(changed(1,'00000000-0000-4000-8000-000000000099'))).rejects.toMatchObject({code:'42501'});
  await db.exec(`UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='${t}'`);
  await expect(apply()).rejects.toMatchObject({code:'42501'});
  await db.exec(`UPDATE irp_pms.memberships SET role='owner' WHERE tenant_id='${t}';
   INSERT INTO irp_pms.properties(tenant_id,id,name,currency) VALUES('${t}','7d9add80-216e-435c-86e9-58e17cdcbb6d','Shadow fixture','USD');`);
  await expect(apply(changed(1,'7d9add80-216e-435c-86e9-58e17cdcbb6d'))).rejects.toMatchObject({code:'42501'});
  const first=(await apply()).rows[0].receipt;
  expect(first).toMatchObject({replayed:false,recommended_rate_minor:16100});
  await db.exec(`UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='${t}'`);
  await expect(apply()).rejects.toMatchObject({code:'42501'});
  await db.exec(`UPDATE irp_pms.memberships SET role='owner' WHERE tenant_id='${t}'`);
  expect((await apply()).rows[0].receipt).toMatchObject({replayed:true,recommended_rate_minor:16100});
  await expect(apply(changed(17,JSON.stringify(['Different review'])))).rejects.toMatchObject({code:'23505'});
  const counts=(await db.query<{audits:number;actions:number;rate:number;version:number}>('SELECT (SELECT count(*)::integer FROM irp_pms.revenue_rate_decisions) audits,(SELECT count(*)::integer FROM irp_pms.rate_actions) actions,(SELECT amount_minor::integer FROM irp_pms.nightly_rates) rate,(SELECT version::integer FROM irp_pms.rate_plans) version')).rows[0];
  expect(counts).toEqual({audits:1,actions:1,rate:16100,version:2});
  await db.exec(`CREATE FUNCTION irp_pms.reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Isolated audit failure';END $$;
   CREATE TRIGGER reject_test_audit BEFORE INSERT ON irp_pms.revenue_rate_decisions FOR EACH ROW EXECUTE FUNCTION irp_pms.reject_test_audit();`);
  const second=[...args];second[2]='00000000-0000-4000-8000-000000000007';second[4]=2;second[6]=16100;second[7]=18515;
  await expect(apply(second)).rejects.toMatchObject({code:'P0001'});
  const after=(await db.query<{rate:number;version:number}>('SELECT amount_minor::integer rate,(SELECT version::integer FROM irp_pms.rate_plans) version FROM irp_pms.nightly_rates')).rows[0];
  expect(after).toEqual({rate:16100,version:2});
  expect((await db.query<{count:number}>('SELECT count(*)::integer count FROM irp_pms.rate_actions')).rows[0].count).toBe(1);
  expect((await db.query<{count:number}>('SELECT count(*)::integer count FROM irp_pms.activity')).rows[0].count).toBe(2);
  const tie=(await db.query<{result:{adjustment_basis_points:number}}>('SELECT irp_pms.calculate_reviewed_revenue_rate(10000,1,100000000,9999,0,10,5) result')).rows[0].result;
  expect(tie.adjustment_basis_points).toBe(0);
  const cases=[
   [10,2,1000,50000,0,9000,-1000,200,'none'],
   [10,3,1000,50000,0,10000,0,300,'none'],
   [10,6,1000,50000,0,10800,800,600,'none'],
   [10,8,1000,50000,0,11500,1500,800,'none'],
   [100,95,1000,50000,0,12500,2500,950,'none'],
   [10,2,9500,50000,0,9500,-1000,200,'minimum'],
   [10,8,1000,11000,0,11000,1500,800,'maximum'],
   [100,95,1000,50000,5000,15000,5000,950,'none'],
  ];
  for(const [capacity,reserved,minimum,maximum,event,recommended,adjustment,occupancy,guardrail] of cases){
   const actual=(await db.query<{result:unknown}>('SELECT irp_pms.calculate_reviewed_revenue_rate(10000,$1,$2,NULL,$3,$4,$5) result',[minimum,maximum,event,capacity,reserved])).rows[0].result;
   expect(actual).toEqual({recommended_rate_minor:recommended,adjustment_basis_points:adjustment,occupancy_tenths_percent:occupancy,guardrail});
  }
 }finally{await db.close();}
},20000);
