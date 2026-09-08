// Independent contract-based draft. Loads frozen 170 plus TURNOVER_SQL locally;
// never contacts Supabase, edits migrations, or operates the browser.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST to an installed @electric-sql/pglite/dist directory');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const sourceFile=process.env.TURNOVER_SQL||new URL('../supabase/migrations/202609070171_iratepilot_pms_turnover_workflow.sql',import.meta.url);
const sourceBytes=await readFile(sourceFile);
const sourceHash=createHash('sha256').update(sourceBytes).digest('hex');
const db=new PGlite({extensions:{pgcrypto}}),checks=[];
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const val=async(sql,args=[]) => Object.values((await q(sql,args))[0])[0];
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name)};
const fails=async(fn,code,pattern)=>{let error;try{await fn()}catch(e){error=e}assert.ok(error,'Expected rejection');if(code)assert.equal(error.code,code,error.message);if(pattern)assert.match(error.message,pattern);return error};
const owner=randomUUID(),manager=randomUUID(),staff=randomUUID(),other=randomUUID(),tenant=randomUUID(),property=randomUUID(),otherProperty=randomUUID(),type=randomUUID(),rooms=[randomUUID(),randomUUID(),randomUUID()];
const legacyRequest=randomUUID();let day,end,task;
const admin=async()=>db.exec('RESET ROLE');
const as=async(id)=>{await admin();await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated')};
const room=async(id)=>{const workspace=await val('SELECT public.irp_pms_pilot_workspace($1,$2)',[tenant,property]);const result=workspace.rooms.find(row=>row.id===id);assert.ok(result,'Scoped physical room must be visible');return result};
const list=async()=>val('SELECT public.irp_pms_pilot_turnovers($1,$2,$3,$4)',[tenant,property,day,end]);
const getTask=async(id)=>{const data=await list();const result=[...data.open_tasks,...data.closed_tasks].find(row=>row.id===id);assert.ok(result,'Task must remain visible');return result};
const update=async(id,action,details,request=randomUUID(),review)=>{const current=review||await getTask(id);return val('SELECT public.irp_pms_pilot_update_turnover($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,property,id,request,current.version,current.room_state_version,day,action,details])};
const create=async(id,assignee=owner,request=randomUUID())=>{const current=await room(id);return val('SELECT public.irp_pms_pilot_create_turnover($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,property,id,request,current.state_version,day,day,assignee,'Independent manual preparation'])};
const markDirty=async(id,request=randomUUID())=>{const current=await room(id);return val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,$5,'Dirty')",[tenant,property,id,request,current.state_version])};
const booking=async(id,arrival=day,departure=end)=>val('SELECT public.irp_pms_pilot_create_reservation($1,$2,$3,$4,$5,$6,$7,1,10000,0)',[tenant,property,id,type,'Synthetic turnover guest',arrival,departure]);
const snapshot=async(filter)=>{await admin();const names=(await q("SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' ORDER BY tablename")).map(row=>row.tablename).filter(filter||(()=>true));const result={};for(const name of names)result[name]=await val('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) FROM irp_pms."'+name+'" t');return result};
const financialNames=name=>['properties','room_types','nightly_capacity','reservations','reservation_charge_snapshots'].includes(name)||/^(rate_|nightly_rate|folio_|service_)/.test(name);
const catalog=async()=>q("SELECT p.oid::integer oid,n.nspname schema,n.nspname||'.'||p.proname name,pg_get_function_identity_arguments(p.oid) arguments,p.proowner::integer owner,p.proacl::text acl,p.prosecdef definer,p.proconfig settings,md5(p.prosrc) body_hash,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR (n.nspname='public' AND p.proname LIKE 'irp_pms%') ORDER BY p.oid");
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 const root=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(root)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170)_iratepilot_pms_/.test(n)).sort())await db.exec(await readFile(new URL(f,root),'utf8'));
 for(const user of [owner,manager,staff,other])await q('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[user,user+'@example.invalid']);
 await q('INSERT INTO irp_pms.tenants(id,name) VALUES($1,$2)',[tenant,'Independent turnover fixtures']);
 for(const [user,role] of [[owner,'owner'],[manager,'manager'],[staff,'staff'],[other,'staff']])await q('INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,$3)',[tenant,user,role]);
 for(const id of [property,otherProperty])await q("INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES($1,$2,'Synthetic Hotel','USD','America/Chicago')",[tenant,id]);
 await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Synthetic King',4)",[tenant,property,type]);
 for(const [index,id] of rooms.entries())await q('INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,$5,$6)',[tenant,property,id,type,'TEST-'+(101+index),index===0?'Dirty':'Clean']);
 day=await val("SELECT (clock_timestamp() AT TIME ZONE 'America/Chicago')::date::text");end=await val('SELECT ($1::date+2)::text',[day]);
 await as(owner);await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,1,'Clean')",[tenant,property,rooms[0],legacyRequest]);
 await val('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,3)',[tenant,property,type,day,end]);
 const previous=await snapshot(),oldCatalog=await catalog();
 await check('171 installation preserves every preexisting PMS row and creates no automatic work',async()=>{
  await db.exec(sourceBytes.toString('utf8'));const after=await snapshot();for(const name of Object.keys(previous))assert.deepEqual(after[name],previous[name],name+' changed at installation');
  for(const name of ['turnover_tasks','turnover_origins','turnover_events','turnover_requests'])assert.deepEqual(after[name],[]);
 });
 await check('Only six intended old function bodies change and all existing OIDs owners ACLs and role grants remain',async()=>{
  const current=await catalog(),changed=[];
  for(const old of oldCatalog){const row=current.find(value=>value.oid===old.oid);assert.ok(row,old.name+' disappeared');const {body_hash:before,...beforeMetadata}=old,{body_hash:after,...afterMetadata}=row;assert.deepEqual(afterMetadata,beforeMetadata,old.name+' metadata changed');if(before!==after)changed.push(old.name)}
  assert.deepEqual(changed.sort(),['irp_pms.apply_operating_model','public.irp_pms_pilot_configure_property','public.irp_pms_pilot_move_room','public.irp_pms_pilot_set_housekeeping','public.irp_pms_pilot_stay_action','public.irp_pms_pilot_workspace'].sort());
  const added=current.filter(row=>!oldCatalog.some(old=>old.oid===row.oid));assert.equal(added.filter(row=>row.schema==='public').length,4);
  for(const row of added){assert.equal(row.anon,false);assert.equal(row.service,false);assert.equal(row.authenticated,row.schema==='public');assert.deepEqual(row.settings,['search_path=pg_catalog']);if(row.schema==='public')assert.equal(row.definer,true)}
 });
 await as(owner);
 await check('Fresh Clean and Inspect readiness calls are blocked before any work exists',async()=>{
  for(const status of ['Clean','Inspect'])await fails(()=>val('SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,2,$5)',[tenant,property,rooms[0],randomUUID(),status]),'P0001',/turnover/i);
 });
 await check('Vacant Dirty creates work and old exact Clean receipt cannot certify that work',async()=>{
  await markDirty(rooms[0]);const before=await room(rooms[0]);task=(await list()).open_tasks.find(row=>row.room_id===rooms[0]);assert.ok(task);assert.equal(task.state,'queued');
  const replay=await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,1,'Clean')",[tenant,property,rooms[0],legacyRequest]);assert.equal(replay.replayed,true);assert.deepEqual(await room(rooms[0]),before);assert.equal((await list()).open_tasks.length,1);
 });
 await check('Unversioned legacy readiness and direct authenticated turnover writes remain closed',async()=>{
  await fails(()=>val("SELECT public.irp_pms_pilot_housekeeping($1,$2,$3,'Clean')",[tenant,property,rooms[0]]),'42501');
  for(const table of ['turnover_tasks','turnover_origins','turnover_events','turnover_requests'])await fails(()=>db.exec('DELETE FROM irp_pms.'+table+' WHERE false'),'42501');
  await admin();await fails(()=>val("SELECT public.irp_pms_pilot_housekeeping($1,$2,$3,'Clean')",[tenant,property,rooms[0]]),'P0001',/disabled/i);await as(owner);
 });
 await check('Existing service denial remains and privileged direct configuration writes respect open tasks',async()=>{
  await admin();await q("SELECT set_config('request.jwt.claim.sub','',false)");await db.exec('SET ROLE service_role');
  await fails(()=>q("UPDATE irp_pms.properties SET time_zone='UTC' WHERE tenant_id=$1 AND id=$2",[tenant,property]),'42501',/normalize_cleaning_fee/);
  await admin();
  await fails(()=>q("UPDATE irp_pms.properties SET time_zone='UTC' WHERE tenant_id=$1 AND id=$2",[tenant,property]),'P0001',/turnover/i);
  await fails(()=>q("UPDATE irp_pms.properties SET operating_model='whole_home',whole_home_max_guests=4 WHERE tenant_id=$1 AND id=$2",[tenant,property]),'P0001',/turnover/i);await as(owner);
 });
 const finance=await snapshot(financialNames);await as(owner);
 await check('Fresh room version cannot approve stale submission after a rename; prior generation is retained',async()=>{
  await update(task.id,'start',{});let current=await getTask(task.id);const checklist=Object.fromEntries(current.checklist.map(item=>[item.key,true]));
  await update(task.id,'submit_cleaning',{checklist,note:'Synthetic attestation'});current=await getTask(task.id);const submitted=current.submitted_room_version;assert.equal(current.housekeeping,'Inspect');
  await val('SELECT public.irp_pms_pilot_save_room($1,$2,$3,$4,$5)',[tenant,property,rooms[0],type,'TEST-101 RENAMED']);current=await getTask(task.id);assert.notEqual(current.room_state_version,submitted);
  await fails(()=>update(task.id,'approve_inspection',{work_reviewed:true,room_ready:true}),undefined,/submission|review|context|changed/i);
  await update(task.id,'return_for_cleaning',{reason:'Recheck renamed room context'});current=await getTask(task.id);assert.equal(current.work_generation,2);assert.equal(current.state,'queued');assert.equal(current.housekeeping,'Dirty');assert.ok(current.events.some(event=>event.action==='submit_cleaning'));
  await update(task.id,'start',{});await update(task.id,'submit_cleaning',{checklist});await update(task.id,'approve_inspection',{work_reviewed:true,room_ready:true});current=await getTask(task.id);assert.equal(current.state,'completed');assert.equal(current.housekeeping,'Clean');
  await val('SELECT public.irp_pms_pilot_save_room($1,$2,$3,$4,$5)',[tenant,property,rooms[0],type,'TEST-101']);
 });
 await check('Standalone turnover operations preserve reservation financial and configured inventory rows',async()=>assert.deepEqual(await snapshot(financialNames),finance));
 await as(owner);
 await check('Manager creation replay remains member-authorized after downgrade and assignee removal',async()=>{
  await as(manager);const current=await room(rooms[0]),request=randomUUID(),args=[tenant,property,rooms[0],request,current.state_version,day,day,other,'Historical manager creation'];
  const result=await val('SELECT public.irp_pms_pilot_create_turnover($1,$2,$3,$4,$5,$6,$7,$8,$9)',args);task=result.task;
  await as(owner);await val('SELECT public.irp_pms_pilot_save_member($1,$2,$3,$4,$5)',[tenant,otherProperty,randomUUID(),manager+'@example.invalid','staff']);await val('SELECT public.irp_pms_pilot_remove_member($1,$2,$3,$4)',[tenant,otherProperty,randomUUID(),other]);
  await as(manager);const replay=await val('SELECT public.irp_pms_pilot_create_turnover($1,$2,$3,$4,$5,$6,$7,$8,$9)',args);assert.equal(replay.replayed,true);assert.equal(replay.task.id,task.id);
  await fails(()=>create(rooms[1],owner),'P0001',/assign/i);await as(owner);
 });
 await check('Never-started assigned cancellation changes no turnover task count',async()=>{
  const res=await booking(randomUUID()),before=(await list()).open_tasks.length;
  await admin();await q('UPDATE irp_pms.reservations SET physical_room_id=$1 WHERE tenant_id=$2 AND property_id=$3 AND id=$4',[rooms[1],tenant,property,res.id]);await as(owner);
  await val('SELECT public.irp_pms_pilot_cancel_reservation($1,$2,$3,$4,$5,$6,$7)',[tenant,property,res.id,randomUUID(),res.source_version,day,'Synthetic next arrival cancelled']);assert.equal((await list()).open_tasks.length,before);assert.equal((await list()).open_tasks.some(row=>row.room_id===rooms[1]),false);
 });
 await check('Actual move and checkout create work only for vacant origins and exact parents never duplicate it',async()=>{
  const res=await booking(randomUUID());await val("SELECT public.irp_pms_pilot_stay_action($1,$2,$3,'check_in',$4)",[tenant,property,res.id,rooms[1]]);
  const from=await room(rooms[1]),to=await room(rooms[2]),request=randomUUID(),args=[tenant,property,res.id,request,res.source_version,rooms[1],from.state_version,rooms[2],to.state_version,'Synthetic actual room move'];
  const moved=await val('SELECT public.irp_pms_pilot_move_room($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args);assert.equal(moved.source_version_retained,true);assert.equal(moved.pricing_changed,false);assert.equal(moved.folio_changed,false);
  let data=await list();assert.ok(data.open_tasks.find(row=>row.room_id===rooms[1]));assert.equal(data.open_tasks.some(row=>row.room_id===rooms[2]),false);const afterMove=await snapshot();await as(owner);
  const replay=await val('SELECT public.irp_pms_pilot_move_room($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args);assert.equal(replay.replayed,true);assert.deepEqual(await snapshot(),afterMove);await as(owner);
  await val("SELECT public.irp_pms_pilot_stay_action($1,$2,$3,'check_out',NULL)",[tenant,property,res.id]);data=await list();assert.ok(data.open_tasks.find(row=>row.room_id===rooms[2]));const afterCheckout=await snapshot();await as(owner);
  await val("SELECT public.irp_pms_pilot_stay_action($1,$2,$3,'check_out',NULL)",[tenant,property,res.id]);assert.deepEqual(await snapshot(),afterCheckout);await as(owner);
 });
 await check('Partially populated task submission and null cancellation reason fail SQL invariants',async()=>{
  await admin();const id=await val("SELECT id FROM irp_pms.turnover_tasks WHERE tenant_id=$1 AND property_id=$2 AND room_id=$3 AND state='queued'",[tenant,property,rooms[1]]);
  for(const [revision,submission] of [[null,{}],[1,null]])await fails(()=>q("UPDATE irp_pms.turnover_tasks SET version=version+1,state='awaiting_inspection',started_at=clock_timestamp(),started_by=$1,submitted_at=clock_timestamp(),submitted_by=$1,submitted_room_version=$2,submission=$3 WHERE tenant_id=$4 AND property_id=$5 AND id=$6",[owner,revision,submission,tenant,property,id]),'23514');
  await fails(()=>q("UPDATE irp_pms.turnover_tasks SET version=version+1,state='cancelled',closed_at=clock_timestamp(),closed_by=$1,close_reason=NULL WHERE tenant_id=$2 AND property_id=$3 AND id=$4",[owner,tenant,property,id]),'23514');await as(owner);
 });
 await check('Reservation origins require a non-null source version and event versions cannot pass as UNKNOWN',async()=>{
  await admin();const origin=await val("SELECT to_jsonb(o) FROM irp_pms.turnover_origins o WHERE tenant_id=$1 AND property_id=$2 AND origin_kind='checkout' LIMIT 1",[tenant,property]);assert.ok(origin);
  await fails(()=>q('INSERT INTO irp_pms.turnover_origins SELECT (jsonb_populate_record(NULL::irp_pms.turnover_origins,$1)).*',[{...origin,id:randomUUID(),origin_key:randomUUID(),source_version:null}]),'23514');
  const event=await val('SELECT to_jsonb(e) FROM irp_pms.turnover_events e WHERE tenant_id=$1 AND property_id=$2 ORDER BY recorded_at LIMIT 1',[tenant,property]);assert.ok(event);
  await fails(()=>q('INSERT INTO irp_pms.turnover_events SELECT (jsonb_populate_record(NULL::irp_pms.turnover_events,$1)).*',[{...event,id:randomUUID(),from_version:null,to_version:999}]),'23514');await as(owner);
 });
 await check('An event cannot reference a different task origin in the same property',async()=>{
  await admin();const event=await val('SELECT to_jsonb(e) FROM irp_pms.turnover_events e WHERE tenant_id=$1 AND property_id=$2 ORDER BY recorded_at LIMIT 1',[tenant,property]);
  const origin=await val('SELECT id FROM irp_pms.turnover_origins WHERE tenant_id=$1 AND property_id=$2 AND task_id<>$3 LIMIT 1',[tenant,property,event.task_id]);assert.ok(origin);
  await fails(()=>q('INSERT INTO irp_pms.turnover_events SELECT (jsonb_populate_record(NULL::irp_pms.turnover_events,$1)).*',[{...event,id:randomUUID(),from_version:998,to_version:999,origin_id:origin}]),'23503');await as(owner);
 });
 await check('A new task cannot retain a different physical room creation label',async()=>{
  await admin();const extraRoom=randomUUID();await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,'UNQUEUED SNAPSHOT FIXTURE','Dirty')",[tenant,property,extraRoom,type]);
  const queued=await val("SELECT to_jsonb(t) FROM irp_pms.turnover_tasks t WHERE tenant_id=$1 AND property_id=$2 AND state='queued' LIMIT 1",[tenant,property]);assert.ok(queued);
  await fails(()=>q('INSERT INTO irp_pms.turnover_tasks SELECT (jsonb_populate_record(NULL::irp_pms.turnover_tasks,$1)).*',[{...queued,id:randomUUID(),room_id:extraRoom,version:1,work_generation:1,created_room_label:'WRONG ORIGINAL LABEL'}]),'P0001',/snapshot|creation|context/i);await as(owner);
 });
 let maintenanceRoom,maintenanceType;
 await check('Maintenance-only property guards protect direct privileged model/timezone changes but allow name and released context',async()=>{
  await admin();maintenanceRoom=randomUUID();maintenanceType=randomUUID();
  await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Maintenance-only type',4)",[tenant,otherProperty,maintenanceType]);
  await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,'MAINTENANCE ONLY','Clean')",[tenant,otherProperty,maintenanceRoom,maintenanceType]);await as(owner);
  const future=await val('SELECT ($1::date+1)::text',[day]);
  const closure=await val('SELECT public.irp_pms_pilot_create_room_closure($1,$2,$3,$4,1,$5,$6,$7,$8)',[tenant,otherProperty,maintenanceRoom,randomUUID(),day,future,end,'Independent maintenance-only repair']);
  await admin();assert.equal(await val('SELECT count(*)::int FROM irp_pms.turnover_tasks WHERE tenant_id=$1 AND property_id=$2',[tenant,otherProperty]),0);
  await fails(()=>q("UPDATE irp_pms.properties SET time_zone='UTC' WHERE tenant_id=$1 AND id=$2",[tenant,otherProperty]),'P0001',/maintenance/i);
  await fails(()=>q("UPDATE irp_pms.properties SET operating_model='whole_home',whole_home_max_guests=4 WHERE tenant_id=$1 AND id=$2",[tenant,otherProperty]),'P0001',/maintenance/i);
  await q("UPDATE irp_pms.properties SET name='Renamed maintenance fixture' WHERE tenant_id=$1 AND id=$2",[tenant,otherProperty]);await as(owner);
  await val('SELECT public.irp_pms_pilot_release_room_closure($1,$2,$3,$4,2,$5,$6)',[tenant,otherProperty,closure.closure.id,randomUUID(),day,'Independent future release']);
  await admin();await q("UPDATE irp_pms.properties SET time_zone='UTC' WHERE tenant_id=$1 AND id=$2",[tenant,otherProperty]);await q("UPDATE irp_pms.properties SET time_zone='America/Chicago' WHERE tenant_id=$1 AND id=$2",[tenant,otherProperty]);await as(owner);
 });
 for(const [oldZone,newZone,label] of [['Pacific/Kiritimati','Etc/GMT+12','new timezone would resurrect elapsed maintenance'],['Etc/GMT+12','Pacific/Kiritimati','old timezone still has effective maintenance']])await check('Property reconfiguration rejects when '+label,async()=>{
  await admin();const oldDay=await val('SELECT (clock_timestamp() AT TIME ZONE $1)::date::text',[oldZone]),newDay=await val('SELECT (clock_timestamp() AT TIME ZONE $1)::date::text',[newZone]);
  const closureEnd=[oldDay,newDay].sort().at(-1),closureStart=await val('SELECT ($1::date-1)::text',[[oldDay,newDay].sort()[0]]);assert.notEqual(oldDay,newDay);
  await db.exec('BEGIN');await q('UPDATE irp_pms.properties SET time_zone=$1 WHERE tenant_id=$2 AND id=$3',[oldZone,tenant,otherProperty]);
  await q('INSERT INTO irp_pms.room_closures(tenant_id,property_id,room_id,room_type_id,scheduled_start,scheduled_end,effective_end,reason,created_at,created_by,created_time_zone,created_business_date) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$5::date::timestamp AT TIME ZONE $8,$9,$8,$5)',[tenant,otherProperty,maintenanceRoom,maintenanceType,closureStart,closureEnd,'Synthetic historic chronology fixture',oldZone,owner]);
  await fails(()=>q('UPDATE irp_pms.properties SET time_zone=$1 WHERE tenant_id=$2 AND id=$3',[newZone,tenant,otherProperty]),'P0001',/maintenance/i);await db.exec('ROLLBACK');await as(owner);
 });
 await check('Rejected assigned-date edits and allowed reservation amendments do not create or reset turnover work',async()=>{
  const tomorrow=await val('SELECT ($1::date+1)::text',[day]),res=await booking(randomUUID(),tomorrow,end);await admin();
  await q('UPDATE irp_pms.reservations SET physical_room_id=$1 WHERE tenant_id=$2 AND property_id=$3 AND id=$4',[rooms[0],tenant,property,res.id]);
  const before=await snapshot(name=>name.startsWith('turnover_'));await as(owner);
  await fails(()=>val('SELECT public.irp_pms_pilot_amend_reservation($1,$2,$3,$4,$5,$6,$7,$8,$9,1,10000,0)',[tenant,property,res.id,randomUUID(),res.source_version,'Synthetic amended arrival',type,day,end]),'P0001',/reassignment/i);
  await val('SELECT public.irp_pms_pilot_amend_reservation($1,$2,$3,$4,$5,$6,$7,$8,$9,1,10000,0)',[tenant,property,res.id,randomUUID(),res.source_version,'Synthetic renamed assigned guest',type,tomorrow,end]);
  const unassigned=await booking(randomUUID(),tomorrow,end);await val('SELECT public.irp_pms_pilot_amend_reservation($1,$2,$3,$4,$5,$6,$7,$8,$9,1,10000,0)',[tenant,property,unassigned.id,randomUUID(),unassigned.source_version,'Synthetic unassigned arrival change',type,day,end]);
  assert.deepEqual(await snapshot(name=>name.startsWith('turnover_')),before);await as(owner);
 });
 await check('Assigned never-started no-show creates no cleaning work or generation reset',async()=>{
  await admin();const res=randomUUID(),arrival=await val('SELECT ($1::date-2)::text',[day]),departure=await val('SELECT ($1::date-1)::text',[day]);
  await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name,physical_room_id) VALUES($1,$2,$3::uuid,'direct',$3::uuid::text,1,$4,'Confirmed',$5,$6,$7,1,10000,0,0,10000,'Synthetic elapsed no-show',$8)",[tenant,property,res,'c'.repeat(64),type,arrival,departure,rooms[0]]);
  const before=await snapshot(name=>name.startsWith('turnover_'));await as(owner);
  await val('SELECT public.irp_pms_pilot_mark_no_show($1,$2,$3,$4,1,$5,$6)',[tenant,property,res,randomUUID(),day,'Synthetic no-show reconciliation']);assert.deepEqual(await snapshot(name=>name.startsWith('turnover_')),before);await as(owner);
 });
 const result={passed:true,local_only:true,source:String(sourceFile),source_sha256:sourceHash,check_count:checks.length,checks};if(process.env.TURNOVER_INDEPENDENT_RESULT_PATH)await writeFile(process.env.TURNOVER_INDEPENDENT_RESULT_PATH,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({passed:false,message:error.message,code:error.code,where:error.where,checks}));process.exitCode=1}finally{await db.close()}
