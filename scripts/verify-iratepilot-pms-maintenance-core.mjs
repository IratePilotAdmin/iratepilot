import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST to the installed @electric-sql/pglite/dist directory');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const db=new PGlite({extensions:{pgcrypto}}),checks=[];
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const val=async(sql,args=[]) => Object.values((await q(sql,args))[0])[0];
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name)};
const fails=async(fn,code)=>{let caught;try{await fn()}catch(e){caught=e}assert.ok(caught,'Expected rejection');if(code)assert.equal(caught.code,code);return caught};
const owner=randomUUID(),actor=randomUUID(),other=randomUUID(),tenant=randomUUID(),property=randomUUID(),foreignProperty=randomUUID(),type=randomUUID(),rooms=[randomUUID(),randomUUID(),randomUUID()];
const create=async(room,request,version,date,start,end,reason='Test physical repair')=>val('SELECT public.irp_pms_pilot_create_room_closure($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,property,room,request,version,date,start,end,reason]);
const release=async(id,request,version,date,reason='Test repair release')=>val('SELECT public.irp_pms_pilot_release_room_closure($1,$2,$3,$4,$5,$6,$7)',[tenant,property,id,request,version,date,reason]);
const status=async(request)=>val('SELECT public.irp_pms_pilot_maintenance_request_status($1,$2,$3)',[tenant,property,request]);
const as=async(id)=>{await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated')};
const admin=async()=>db.exec('RESET ROLE');
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 const root=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(root)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9])_iratepilot_pms_/.test(n)).sort())await db.exec(await readFile(new URL(f,root),'utf8'));
 await check('Final170 migration compiles against installed through169',async()=>db.exec(await readFile(new URL('202609070170_iratepilot_pms_room_maintenance.sql',root),'utf8')));
 await check('Installed direct-admission delegate uses the effective maintenance capacity',async()=>assert.match(await val("SELECT prosrc FROM pg_proc WHERE oid='public.irp_pms_pilot_create_reservation(uuid,uuid,uuid,uuid,text,date,date,integer,bigint,bigint)'::regprocedure"),/irp_pms.effective_capacity/));
 for(const u of [owner,actor,other])await q('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[u,`${u}@example.invalid`]);
 await q('INSERT INTO irp_pms.tenants(id,name) VALUES($1,$2)',[tenant,'Maintenance core fixture']);
 for(const [u,role] of [[owner,'owner'],[actor,'manager'],[other,'staff']])await q('INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,$3)',[tenant,u,role]);
 for(const p of [property,foreignProperty])await q("INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES($1,$2,'Fixture hotel','USD','UTC')",[tenant,p]);
 await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Fixture type',4)",[tenant,property,type]);
 for(let i=0;i<rooms.length;i++)await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,$5,'Clean')",[tenant,property,rooms[i],type,`T${i+1}`]);
 const date=await val("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text"),day=async(n)=>val('SELECT ($1::date+$2::integer)::text',[date,n]);
 const d1=await day(1),d2=await day(2),d3=await day(3),d4=await day(4),d11=await day(11),d12=await day(12),oldDate=await day(-1);
 await as(actor);
 await val('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,2)',[tenant,property,type,date,await day(10)]);
 const booking=await val('SELECT public.irp_pms_pilot_create_reservation($1,$2,$3,$4,$5,$6,$7,1,10000,0)',[tenant,property,randomUUID(),type,'Existing test demand',d1,d2]);
 let first,second,released;const req=randomUUID(),relreq=randomUUID();
 await check('Create preserves configured ceiling, housekeeping and advances reviewed room revision once',async()=>{
  first=await create(rooms[0],req,1,date,d1,d3);assert.equal(first.room_state_version,2);assert.equal(first.closure.room_state_version,2);assert.equal(first.closure.room_label,'T1');assert.equal(first.closure.status,'scheduled');assert.equal(first.housekeeping_changed,false);assert.equal(first.financial_changed,false);assert.equal(first.configured_capacity_changed,false);
  await admin();const cap=(await q('SELECT * FROM irp_pms.maintenance_capacity($1,$2,$3,$4)',[tenant,property,type,d1]))[0];assert.deepEqual(cap,{configured_units:2,physical_units:3,closed_units:1,effective_units:2});assert.equal(await val('SELECT housekeeping FROM irp_pms.rooms WHERE id=$1',[rooms[0]]),'Clean');await as(actor);
 });
 await check('Distinct closed rooms reduce effective capacity without subtracting twice from selling ceiling',async()=>{
  second=await create(rooms[1],randomUUID(),1,date,d1,d3);await admin();assert.equal(await val('SELECT irp_pms.effective_capacity($1,$2,$3,$4)',[tenant,property,type,d1]),1);await as(actor);
 });
 await check('Overlapping effective closure rejects without advancing room version',async()=>{await fails(()=>create(rooms[0],randomUUID(),2,date,d2,d4));await admin();assert.equal(await val('SELECT state_version FROM irp_pms.rooms WHERE id=$1',[rooms[0]]),2);await as(actor)});
 await check('Closure rejects capacity below existing demand',async()=>{await fails(()=>create(rooms[2],randomUUID(),1,date,d1,d3));});
 await check('Stale room review returns PT409 before current date gate',async()=>{await fails(()=>create(rooms[0],randomUUID(),1,oldDate,d1,d3),'PT409')});
 await check('Civil date mismatch returns PT412 with current room revision',async()=>{await fails(()=>create(rooms[0],randomUUID(),2,oldDate,d3,d4),'PT412')});
 await check('Future release produces zero effective nights while keeping original interval and housekeeping',async()=>{
  released=await release(first.closure.id,relreq,2,date);assert.equal(released.room_state_version,3);assert.equal(released.closure.effective_end,d1);assert.equal(released.closure.scheduled_start,d1);assert.equal(released.closure.scheduled_end,d3);assert.equal(released.closure.status,'released');
  await admin();assert.equal(await val('SELECT irp_pms.room_is_closed($1,$2,$3,$4,$5)',[tenant,property,rooms[0],date,d4]),false);assert.equal(await val('SELECT irp_pms.effective_capacity($1,$2,$3,$4)',[tenant,property,type,d1]),2);await as(actor);
 });
 await check('Create replay returns immutable original receipt after release with stale original revision',async()=>{const replay=await create(rooms[0],req,1,date,d1,d3);assert.equal(replay.replayed,true);assert.deepEqual({...replay,replayed:false},first)});
 await check('Release exact replay is idempotent',async()=>{const replay=await release(first.closure.id,relreq,2,date);assert.equal(replay.replayed,true);assert.deepEqual({...replay,replayed:false},released)});
 await check('Create and release share request identity namespace',async()=>{await fails(()=>release(second.closure.id,req,2,date));await fails(()=>create(rooms[0],relreq,3,date,d3,d4))});
 await check('Read lists a zero-night released future closure by original scheduled interval',async()=>{
  const report=await val('SELECT public.irp_pms_pilot_maintenance($1,$2,$3,$4)',[tenant,property,d1,d3]);assert.equal(report.can_manage,true);assert.equal(report.closures.length,2);assert.equal(report.closures.find(c=>c.id===first.closure.id).status,'released');assert.deepEqual(report.inventory.map(x=>[x.configured_units,x.closed_units,x.effective_units,x.reserved_units,x.available_units,x.shortfall_units]),[[2,1,2,1,1,0],[2,1,2,0,2,0]]);
 });
 await check('Missing configuration remains NULL despite a closure',async()=>{
  await create(rooms[2],randomUUID(),1,date,d11,d12);const report=await val('SELECT public.irp_pms_pilot_maintenance($1,$2,$3,$4)',[tenant,property,d11,d12]);assert.equal(report.inventory[0].configured_units,null);assert.equal(report.inventory[0].effective_units,null);assert.equal(report.inventory[0].available_units,null);assert.equal(report.inventory[0].shortfall_units,null);assert.equal(report.inventory[0].closed_units,1);
 });
 await check('Receipt inspection is original-actor only',async()=>{assert.equal((await status(req)).found,true);await as(other);assert.deepEqual(await status(req),{found:false});await as(actor)});
 await check('Downgraded manager may inspect own receipt but cannot mutate or replay',async()=>{
  await admin();await q("UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=$1 AND user_id=$2",[tenant,actor]);await as(actor);assert.equal((await status(req)).found,true);assert.equal((await val('SELECT public.irp_pms_pilot_maintenance($1,$2,$3,$4)',[tenant,property,d1,d3])).can_manage,false);await fails(()=>create(rooms[0],req,1,date,d1,d3),'42501');await fails(()=>release(first.closure.id,relreq,2,date),'42501');await admin();await q("UPDATE irp_pms.memberships SET role='manager' WHERE tenant_id=$1 AND user_id=$2",[tenant,actor]);await as(actor);
 });
 await check('Room label change advances review revision without housekeeping change',async()=>{
  await val('SELECT public.irp_pms_pilot_save_room($1,$2,$3,$4,$5)',[tenant,property,rooms[0],type,'Renamed T1']);await fails(()=>create(rooms[0],randomUUID(),3,date,d3,d4),'PT409');await admin();assert.equal(await val('SELECT state_version FROM irp_pms.rooms WHERE id=$1',[rooms[0]]),4);assert.equal(await val('SELECT housekeeping FROM irp_pms.rooms WHERE id=$1',[rooms[0]]),'Clean');await as(actor);
 });
 await check('Scope validation rejects another property room',async()=>{await fails(()=>val('SELECT public.irp_pms_pilot_create_room_closure($1,$2,$3,$4,4,$5,$6,$7,$8)',[tenant,foreignProperty,rooms[0],randomUUID(),date,d3,d4,'Wrong scoped room']))});
 await check('Private helpers and tables are not exposed to authenticated or service-role writes',async()=>{
  await fails(()=>q('SELECT * FROM irp_pms.room_closures'),'42501');await fails(()=>q('SELECT irp_pms.effective_capacity($1,$2,$3,$4)',[tenant,property,type,d1]),'42501');await admin();assert.equal(await val("SELECT has_table_privilege('service_role','irp_pms.room_closures','INSERT,UPDATE,DELETE')"),false);assert.equal(await val("SELECT has_function_privilege('anon','public.irp_pms_pilot_maintenance(uuid,uuid,date,date)','EXECUTE')"),false);await as(actor);
 });
 await check('History and receipts reject administrative rewriting and deletion',async()=>{
  await admin();await fails(()=>q("UPDATE irp_pms.room_closures SET reason='Changed original reason' WHERE id=$1",[second.closure.id]));await fails(()=>q('DELETE FROM irp_pms.room_closures WHERE id=$1',[second.closure.id]));await fails(()=>q("UPDATE irp_pms.maintenance_requests SET result='{}' WHERE request_id=$1",[req]));await fails(()=>q('DELETE FROM irp_pms.maintenance_requests WHERE request_id=$1',[req]));await as(actor);
 });
 await check('Current occupant due out today blocks a closure starting today',async()=>{
  await admin();const id=randomUUID();await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,physical_room_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name,checked_in_at) VALUES($1,$2,$3::uuid,'direct',$3::text,1,repeat('0',64),'In house',$4,$5,$6,$7,1,10000,0,0,10000,'Due out fixture',now())",[tenant,property,id,type,rooms[0],oldDate,date]);const version=await val('SELECT state_version FROM irp_pms.rooms WHERE id=$1',[rooms[0]]);await as(actor);await fails(()=>create(rooms[0],randomUUID(),version,date,date,d1));
 });
 await check('Current or future closures guard type reassignment while released history keeps its old type snapshot',async()=>{
  await admin();const newType=randomUUID();await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Later room type',4)",[tenant,property,newType]);
  await fails(()=>q('UPDATE irp_pms.rooms SET room_type_id=$1 WHERE id=$2',[newType,rooms[1]]));
  await q('UPDATE irp_pms.rooms SET room_type_id=$1 WHERE id=$2',[newType,rooms[0]]);assert.equal(await val('SELECT room_type_id FROM irp_pms.room_closures WHERE id=$1',[first.closure.id]),type);
  await fails(()=>q("INSERT INTO irp_pms.room_closures(tenant_id,property_id,room_id,room_type_id,scheduled_start,scheduled_end,effective_end,reason,created_at,created_by,created_time_zone,created_business_date) VALUES($1,$2,$3,$4,$5,$6,$6,'Wrong creation snapshot',now(),$7,'UTC',$8)",[tenant,property,rooms[1],newType,d3,d4,actor,date]));
  await as(actor);
 });
 await check('Partial release preserves past closed nights and a later configured ceiling edit',async()=>{
  await admin();const room=randomUUID(),id=randomUUID(),start=await day(-2);await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,'Partial release room','Dirty')",[tenant,property,room,type]);
  await q("INSERT INTO irp_pms.room_closures(tenant_id,property_id,id,room_id,room_type_id,scheduled_start,scheduled_end,effective_end,reason,created_at,created_by,created_time_zone,created_business_date) VALUES($1,$2,$3,$4,$5,$6,$7,$7,'Earlier dated repair',$6::date::timestamptz,$8,'UTC',$6)",[tenant,property,id,room,type,start,d3,actor]);
  await as(actor);await val('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,1)',[tenant,property,type,date,d3]);const res=await release(id,randomUUID(),1,date);assert.equal(res.closure.effective_end,date);assert.equal(res.closure.scheduled_start,start);assert.equal(res.closure.scheduled_end,d3);
  await admin();assert.equal(await val('SELECT irp_pms.room_is_closed($1,$2,$3,$4,$5)',[tenant,property,room,start,date]),true);assert.equal(await val('SELECT irp_pms.room_is_closed($1,$2,$3,$4,NULL)',[tenant,property,room,date]),false);assert.equal(await val('SELECT units FROM irp_pms.nightly_capacity WHERE tenant_id=$1 AND property_id=$2 AND room_type_id=$3 AND stay_date=$4',[tenant,property,type,date]),1);assert.equal(await val('SELECT housekeeping FROM irp_pms.rooms WHERE id=$1',[room]),'Dirty');await as(actor);
 });
 await check('Report limits fail explicitly without silently dropping rows',async()=>{
  await admin();await db.exec('BEGIN');
  await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) SELECT $1,$2,gen_random_uuid(),'Extra type '||n,4 FROM generate_series(1,30) n",[tenant,property]);
  await as(actor);const end=await day(365);await fails(()=>val('SELECT public.irp_pms_pilot_maintenance($1,$2,$3,$4)',[tenant,property,date,end]));await db.exec('ROLLBACK');await admin();
  await db.exec('BEGIN');await q("INSERT INTO irp_pms.room_closures(tenant_id,property_id,room_id,room_type_id,scheduled_start,scheduled_end,effective_end,reason,created_at,created_by,created_time_zone,created_business_date) SELECT $1,$2,$3,$4,$5,$6,$6,'Bounded history fixture',now(),$7,'UTC',$8 FROM generate_series(1,1001)",[tenant,property,rooms[1],type,d3,d4,actor,date]);
  await as(actor);await fails(()=>val('SELECT public.irp_pms_pilot_maintenance($1,$2,$3,$4)',[tenant,property,d3,d4]));await db.exec('ROLLBACK');await admin();await as(actor);
 });
 await check('Invalid dates and report range fail explicitly',async()=>{const farDate=await day(367);await fails(()=>val("SELECT public.irp_pms_pilot_maintenance($1,$2,'infinity','infinity')",[tenant,property]));await fails(()=>val('SELECT public.irp_pms_pilot_maintenance($1,$2,$3,$4)',[tenant,property,date,farDate]));await fails(()=>create(rooms[1],randomUUID(),2,date,oldDate,d1));await fails(()=>create(rooms[1],randomUUID(),2,date,d3,d3))});
 await check('Deferred constraints pass and financial rows remain untouched',async()=>{
  await admin();await db.exec('BEGIN;SET CONSTRAINTS ALL IMMEDIATE;COMMIT;');const counts=(await q('SELECT (SELECT count(*)::int FROM irp_pms.folio_openings) openings,(SELECT count(*)::int FROM irp_pms.folio_entries) entries'))[0];assert.deepEqual(counts,{openings:0,entries:0});assert.ok(booking);
 });

 await check('Removed membership blocks both commands and own historical receipt inspection',async()=>{
  await admin();await q('DELETE FROM irp_pms.memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,actor]);await as(actor);
  await fails(()=>status(req),'42501');await fails(()=>create(rooms[0],req,1,date,d1,d3),'42501');await fails(()=>release(first.closure.id,relreq,2,date),'42501');
  await admin();await q("INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,'manager')",[tenant,actor]);await as(actor);assert.equal((await status(req)).found,true);
 });
 await check('A second manager cannot adopt another actors existing request',async()=>{
  await as(owner);assert.deepEqual(await status(req),{found:false});await fails(()=>create(rooms[0],req,1,date,d1,d3));await fails(()=>release(first.closure.id,relreq,2,date));await as(actor);
 });
 await check('Receipt lookup cannot cross property or tenant scope',async()=>{
  assert.deepEqual(await val('SELECT public.irp_pms_pilot_maintenance_request_status($1,$2,$3)',[tenant,foreignProperty,req]),{found:false});
  await fails(()=>val('SELECT public.irp_pms_pilot_maintenance_request_status($1,$2,$3)',[randomUUID(),property,req]),'42501');
 });
 await check('Every new public RPC excludes anonymous and service roles; every helper excludes application roles',async()=>{
  await admin();
  const signatures=[
   'public.irp_pms_pilot_create_room_closure(uuid,uuid,uuid,uuid,bigint,date,date,date,text)',
   'public.irp_pms_pilot_release_room_closure(uuid,uuid,uuid,uuid,bigint,date,text)',
   'public.irp_pms_pilot_maintenance_request_status(uuid,uuid,uuid)',
   'public.irp_pms_pilot_maintenance(uuid,uuid,date,date)'];
  for(const sig of signatures){for(const role of ['anon','service_role'])assert.equal(await val('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,sig]),false,sig);assert.equal(await val('SELECT has_function_privilege(\'authenticated\',$1,\'EXECUTE\')',[sig]),true)}
  const helpers=(await q("SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' AND (p.proname LIKE 'maintenance_%' OR p.proname IN('room_is_closed','effective_capacity','room_state_revision'))")).map(x=>x.signature);
  for(const sig of helpers)for(const role of ['anon','authenticated','service_role'])assert.equal(await val('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,sig]),false,sig);
  await as(actor);
 });
 await check('An elapsed schedule automatically restores effective capacity without changing housekeeping or allowing history release',async()=>{
  await admin();const p=randomUUID(),t=randomUUID(),room=randomUUID(),id=randomUUID(),start=await day(-2),finish=await day(-1);
  await q("INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES($1,$2,'Expired closure fixture','USD','UTC')",[tenant,p]);
  await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Expired unit',2)",[tenant,p,t]);
  await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,'Expired room','Dirty')",[tenant,p,room,t]);
  await q("INSERT INTO irp_pms.nightly_capacity(tenant_id,property_id,room_type_id,stay_date,units) VALUES($1,$2,$3,$4,1),($1,$2,$3,$5,1)",[tenant,p,t,start,date]);
  await q("INSERT INTO irp_pms.room_closures(tenant_id,property_id,id,room_id,room_type_id,scheduled_start,scheduled_end,effective_end,reason,created_at,created_by,created_time_zone,created_business_date) VALUES($1,$2,$3,$4,$5,$6,$7,$7,'Expired bounded schedule',$6::date::timestamptz,$8,'UTC',$6)",[tenant,p,id,room,t,start,finish,actor]);
  assert.equal(await val('SELECT irp_pms.effective_capacity($1,$2,$3,$4)',[tenant,p,t,start]),0);assert.equal(await val('SELECT irp_pms.effective_capacity($1,$2,$3,$4)',[tenant,p,t,date]),1);
  await as(actor);const history=await val('SELECT public.irp_pms_pilot_maintenance($1,$2,$3,$4)',[tenant,p,start,date]);assert.equal(history.closures[0].status,'ended');
  const rejection=await fails(()=>val('SELECT public.irp_pms_pilot_release_room_closure($1,$2,$3,$4,1,$5,$6)',[tenant,p,id,randomUUID(),date,'Cannot release elapsed record']));assert.match(rejection.message,/already ended/);
  const w=await val('SELECT public.irp_pms_pilot_workspace($1,$2)',[tenant,p]);assert.equal(w.rooms[0].housekeeping,'Dirty');assert.equal(w.rooms[0].state_version,1);assert.deepEqual(w.rooms[0].maintenance_intervals,[]);
 });

 const evidence={passed:true,check_count:checks.length,checks,scope:'Core public-RPC suite against final170, including additional identity, permission and expiry probes. Serialized PGlite; no native multi-session or live proof.'};console.log(JSON.stringify(evidence));
}catch(error){console.error(error.message,error.code??'',error.where??'',error.internalQuery??'');process.exitCode=1}finally{await db.close()}
