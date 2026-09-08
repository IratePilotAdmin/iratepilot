// Independent migration170 catalog and legacy receipt regression audit.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST to the installed @electric-sql/pglite/dist directory');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const originalNow=Date.now;let now=Date.UTC(2027,0,10,12);Date.now=()=>now;
const db=new PGlite({extensions:{pgcrypto}}),checks=[];
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const val=async(sql,args=[]) => Object.values((await q(sql,args))[0])[0];
const rpc=(name,args=[])=>val(`SELECT public.irp_pms_pilot_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name)};
const owner=randomUUID();
const asOwner=async()=>{await db.exec('RESET ROLE');await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('SET ROLE authenticated')};
const catalog=()=>q("SELECT p.oid::text,n.nspname||'.'||p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args,p.prosrc,p.prosecdef,p.provolatile,p.proconfig,p.proacl::text,p.prorettype::text,p.proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR n.nspname='public' AND p.proname LIKE 'irp_pms_pilot_%' ORDER BY p.oid");
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 const root=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(root)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9])_iratepilot_pms_/.test(n)).sort())await db.exec(await readFile(new URL(f,root),'utf8'));
 // Snapshot a populated169 property, booking, frozen folio and pricing receipt
 // before applying170, not merely an empty schema. All IDs are local fixtures.
 const seedActor=randomUUID();await q("INSERT INTO auth.users VALUES($1,'pre170-snapshot@example.invalid',now())",[seedActor]);await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[seedActor]);await db.exec('SET ROLE authenticated');
 const seedBoot=await rpc('bootstrap',[randomUUID(),'Existing169 organization','Existing169 hotel']),seedScope=[seedBoot.tenant_id,seedBoot.property_id];await rpc('configure_property',[...seedScope,'Existing169 hotel','UTC']);const seedType=await rpc('save_room_type',[...seedScope,null,'Existing type',2]),seedRoom=await rpc('save_room',[...seedScope,null,seedType.id,'EXISTING']);await rpc('set_capacity',[...seedScope,seedType.id,'2027-01-10','2027-01-13',1]);const seedStay=await rpc('create_reservation',[...seedScope,randomUUID(),seedType.id,'Existing fictional guest','2027-01-10','2027-01-12',1,20000,0]);await rpc('post_folio',[...seedScope,seedStay.id,randomUUID(),'charge',1,'PRE170-SNAPSHOT','Existing synthetic charge to freeze opening',null]);await rpc('save_rate_plan',[...seedScope,randomUUID(),null,null,seedType.id,'Existing pricing',0,true]);assert.ok(seedRoom.id);
 await db.exec('RESET ROLE');const oldTables=(await q("SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' ORDER BY tablename")).map(r=>r.tablename);
 const snapshot=async()=>{const out={};for(const table of oldTables){assert.match(table,/^[a-z_]+$/);out[table]=await val(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM irp_pms.${table} x`)}return out};
 const beforeData=await snapshot(),before=await catalog(),migration=await readFile(new URL('202609070170_iratepilot_pms_room_maintenance.sql',root),'utf8');
 await db.exec(migration);const after=await catalog(),byId=new Map(after.map(r=>[r.oid,r])),changed=before.filter(r=>byId.get(r.oid)?.prosrc!==r.prosrc).map(r=>r.name).sort(),added=after.filter(r=>!before.some(b=>b.oid===r.oid)).map(r=>r.name).sort();
 await check('Migration preserves every existing table row and changes exactly13 bodies plus10 named functions',async()=>{
  assert.deepEqual(await snapshot(),beforeData);assert.equal(await val('SELECT count(*)::integer FROM irp_pms.room_closures'),0);assert.equal(await val('SELECT count(*)::integer FROM irp_pms.maintenance_requests'),0);
  assert.deepEqual(changed,['irp_pms.room_state_revision','irp_pms.apply_reservation','irp_pms.validate_import','irp_pms.apply_operating_model',...['create_reservation','amend_reservation','extend_stay','set_capacity','stay_action','move_room','configure_property','workspace','operational_report'].map(n=>'public.irp_pms_pilot_'+n)].sort());
  assert.deepEqual(added,['maintenance_creation_guard','maintenance_history_guard','room_is_closed','maintenance_capacity','effective_capacity','maintenance_closure_json'].map(n=>'irp_pms.'+n).concat(['create_room_closure','release_room_closure','maintenance_request_status','maintenance'].map(n=>'public.irp_pms_pilot_'+n)).sort());
 });
 await check('Every existing OID signature return type ACL security and search path stays unchanged',async()=>{
  for(const row of before){const next=byId.get(row.oid);assert.ok(next,row.name);assert.deepEqual({...next,prosrc:null},{...row,prosrc:null},row.name)}
 });
 await check('Forward definitions retain169 authorization locks and168 deliberate conflict codes',async()=>{
  const names=['create_reservation','amend_reservation','extend_stay','set_capacity','stay_action','move_room','configure_property'];
  for(const name of names){const body=after.find(r=>r.name==='public.irp_pms_pilot_'+name).prosrc;const tenant=body.indexOf('FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE'),property=body.indexOf('FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE');assert(tenant>=0&&property>tenant,name+' lock order');assert(body.slice(property).includes('irp_pms.pilot_require(p_tenant,p_property'),name+' role recheck')}
  for(const name of ['amend_reservation','extend_stay','move_room']){const body=after.find(r=>r.name==='public.irp_pms_pilot_'+name).prosrc;assert(body.includes("ERRCODE='PT409'"));assert(!body.includes("ERRCODE='40001'"))}
 });
 await check('Private helpers and new storage stay closed; authenticated gets only four scoped public RPCs',async()=>{
  for(const row of after.filter(r=>added.includes(r.name))){const signature=`${row.name}(${row.args.replace(/\b(?:p_[a-z_]+)\s+/g,'')})`;for(const role of ['anon','service_role'])assert.equal(await val('SELECT has_function_privilege($1,$2,$3)',[role,signature,'EXECUTE']),false,signature+' '+role);assert.equal(await val('SELECT has_function_privilege($1,$2,$3)',['authenticated',signature,'EXECUTE']),row.name.startsWith('public.'),signature)}
  for(const name of ['room_closures','maintenance_requests']){assert.equal(await val("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",['irp_pms.'+name]),true);assert.equal(await val('SELECT has_table_privilege($1,$2,$3)',['authenticated','irp_pms.'+name,'SELECT,INSERT,UPDATE,DELETE']),false);assert.equal(await val('SELECT has_table_privilege($1,$2,$3)',['service_role','irp_pms.'+name,'INSERT,UPDATE,DELETE']),false)}
 });
 await q("INSERT INTO auth.users VALUES($1,'independent-maintenance@example.invalid',now())",[owner]);await asOwner();const boot=await rpc('bootstrap',[randomUUID(),'Independent170','Replay hotel']);const scope=[boot.tenant_id,boot.property_id];await rpc('configure_property',[...scope,'Replay hotel','UTC']);const type=await rpc('save_room_type',[...scope,null,'Replay type',2]);const rooms=[];for(let i=0;i<5;i++)rooms.push(await rpc('save_room',[...scope,null,type.id,'R'+i]));await rpc('set_capacity',[...scope,type.id,'2027-01-10','2027-02-10',5]);
 const create=(request,name,start,end)=>rpc('create_reservation',[...scope,request,type.id,name,start,end,1,10000,0]);
 const seed=async(room,start,end)=>{await db.exec('RESET ROLE');await q("INSERT INTO irp_pms.room_closures(tenant_id,property_id,room_id,room_type_id,scheduled_start,scheduled_end,effective_end,reason,created_at,created_by,created_time_zone,created_business_date) VALUES($1,$2,$3,$4,$5,$6,$6,'Independent synthetic overstay case',clock_timestamp(),$7,'UTC','2027-01-10')",[...scope,room,type.id,start,end,owner]);await asOwner()};
 const directReq=randomUUID(),direct=await create(directReq,'Direct replay','2027-01-15','2027-01-16');
 let plan=await rpc('save_rate_plan',[...scope,randomUUID(),null,null,type.id,'Replay plan',0,true]);await rpc('set_nightly_rate',[...scope,randomUUID(),plan.id,plan.version,'2027-01-10','2027-02-10',10000]);const quote=await rpc('quote_rate',[...scope,randomUUID(),plan.id,'2027-01-15','2027-01-16',1]),quoteCommand=[...scope,quote.id,randomUUID(),'Quote replay'];const booked=await rpc('book_quote',quoteCommand);
 const amendBase=await create(randomUUID(),'Before amendment','2027-01-17','2027-01-18'),amendCommand=[...scope,amendBase.id,randomUUID(),1,'After amendment',type.id,'2027-01-15','2027-01-16',1,12000,0],amended=await rpc('amend_reservation',amendCommand);
 for(const room of rooms)await seed(room.id,'2027-01-15','2027-01-16');
 await check('Direct quote and amendment exact receipts survive later capacity closures',async()=>{
  assert.equal((await create(directReq,'Direct replay','2027-01-15','2027-01-16')).id,direct.id);assert.deepEqual(await rpc('book_quote',quoteCommand),{...booked,replayed:true});assert.deepEqual(await rpc('amend_reservation',amendCommand),{...amended,replayed:true});await assert.rejects(()=>create(randomUUID(),'New sold out','2027-01-15','2027-01-16'),/No availability/)
 });
 const stay=await create(randomUUID(),'Physical replay','2027-01-10','2027-01-11');for(const room of rooms)await rpc('set_housekeeping',[...scope,room.id,randomUUID(),room.state_version,'Clean']);await rpc('stay_action',[...scope,stay.id,'check_in',rooms[0].id]);const extCommand=[...scope,stay.id,randomUUID(),1,'2027-01-12',20000,0,'Original approved extension'],extended=await rpc('extend_stay',extCommand);
 let workspace=await rpc('workspace',scope);const from=workspace.rooms.find(r=>r.id===rooms[0].id),to=workspace.rooms.find(r=>r.id===rooms[1].id),moveCommand=[...scope,stay.id,randomUUID(),2,from.id,from.state_version,to.id,to.state_version,'Original approved physical move'],moved=await rpc('move_room',moveCommand);
 await seed(rooms[1].id,'2027-01-11','2027-01-12');
 await check('Extension and room move historical receipts replay before new maintenance physical gates',async()=>{
  assert.deepEqual(await rpc('extend_stay',extCommand),{...extended,replayed:true});assert.deepEqual(await rpc('move_room',moveCommand),{...moved,replayed:true});assert.equal((await rpc('stay_action',[...scope,stay.id,'check_in',rooms[1].id])).id,stay.id);
 });
 await check('Consumed quote receipt survives expiry and civil-date advance without new booking',async()=>{
  now=Date.UTC(2027,0,16,12);assert.deepEqual(await rpc('book_quote',quoteCommand),{...booked,replayed:true});await db.exec('RESET ROLE');assert.equal(await val('SELECT count(*)::integer FROM irp_pms.quote_bookings WHERE request_id=$1',[quoteCommand[3]]),1);await asOwner();
 });
 await check('Natural expiry removes physical closures without changing housekeeping or configured capacity',async()=>{
  const w=await rpc('workspace',scope);assert(w.rooms.every(r=>r.maintenance_intervals.length===0));assert.equal(w.rooms.find(r=>r.id===rooms[0].id).housekeeping,'Dirty');assert.equal(w.capacity.find(r=>r.stay_date==='2027-01-16').units,5);assert.equal(w.capacity.find(r=>r.stay_date==='2027-01-16').effective_units,5);
 });
 await db.exec('RESET ROLE');await db.exec('BEGIN;SET CONSTRAINTS ALL IMMEDIATE;COMMIT');
 const evidence={passed:true,check_count:checks.length,checks,changed,added,migration_sha256:createHash('sha256').update(migration).digest('hex'),scope:'Independent local serialized PGlite catalog and legacy replay audit. No native concurrency or live deployment claim.'};console.log(JSON.stringify(evidence));
}catch(e){console.error(e.message,e.code??'',e.where??'',e.internalQuery??'');process.exitCode=1}finally{Date.now=originalNow;await db.close()}
