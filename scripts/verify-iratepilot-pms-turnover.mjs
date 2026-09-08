import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST to an installed @electric-sql/pglite/dist directory');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const db=new PGlite({extensions:{pgcrypto}}),checks=[];
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const val=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name)};
const fails=async(fn,code)=>{let caught;try{await fn()}catch(e){caught=e}assert.ok(caught,'Expected rejection');if(code)assert.equal(caught.code,code);return caught};
const owner=randomUUID(),manager=randomUUID(),staff=randomUUID(),other=randomUUID(),tenant=randomUUID(),property=randomUUID(),foreignProperty=randomUUID(),home=randomUUID(),type=randomUUID(),homeType=randomUUID(),rooms=Array.from({length:12},randomUUID),homeRoom=randomUUID();
let actor=manager,date,day1,day2,day3,oldDate;
const as=async(id)=>{actor=id;await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated')};
const admin=async()=>db.exec('RESET ROLE');
const inspect=async(fn)=>{const old=actor;await admin();try{return await fn()}finally{await as(old)}};
const revision=async(room)=>inspect(()=>val('SELECT state_version FROM irp_pms.rooms WHERE tenant_id=$1 AND id=$2',[tenant,room]));
const create=async(room,opts={})=>val('SELECT public.irp_pms_pilot_create_turnover($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,opts.property??property,room,opts.request??randomUUID(),opts.version??await revision(room),opts.date??date,opts.due??date,Object.hasOwn(opts,'assignee')?opts.assignee:staff,opts.reason??'Prepare test accommodation']);
const update=async(task,action,details={},opts={})=>val('SELECT public.irp_pms_pilot_update_turnover($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,opts.property??property,task.id,opts.request??randomUUID(),opts.taskVersion??task.version,opts.roomVersion??await revision(task.room_id),opts.date??date,action,details]);
const list=async(p=property,start=date,end=day3)=>val('SELECT public.irp_pms_pilot_turnovers($1,$2,$3,$4)',[tenant,p,start,end]);
const status=async(request,p=property)=>val('SELECT public.irp_pms_pilot_turnover_request_status($1,$2,$3)',[tenant,p,request]);
const checklist=task=>Object.fromEntries(task.checklist.map(x=>[x.key,true]));
const finish=async(task,p=property)=>{
 const started=await update(task,'start',{}, {property:p});
 const submitted=await update(started.task,'submit_cleaning',{checklist:checklist(task)}, {property:p});
 return update(submitted.task,'approve_inspection',{work_reviewed:true,room_ready:true}, {property:p});
};
const stay=async(res,action,room=null,p=property)=>val('SELECT public.irp_pms_pilot_stay_action($1,$2,$3,$4,$5)',[tenant,p,res.id,action,room]);
const book=async(name,start=date,end=day2,p=property,t=type)=>val('SELECT public.irp_pms_pilot_create_reservation($1,$2,$3,$4,$5,$6,$7,1,10000,0)',[tenant,p,randomUUID(),t,name,start,end]);
const fingerprint=async(names)=>Object.fromEntries(await Promise.all(names.map(async name=>[name,await val(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'|' ORDER BY to_jsonb(x)::text),'')) FROM irp_pms.${name} x`)])));
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170)_iratepilot_pms_/.test(n)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 for(const u of [owner,manager,staff,other])await q('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[u,`${u}@example.invalid`]);
 await q("INSERT INTO irp_pms.tenants(id,name) VALUES($1,'Turnover test organization')",[tenant]);
 for(const [u,role] of [[owner,'owner'],[manager,'manager'],[staff,'staff'],[other,'staff']])await q('INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,$3)',[tenant,u,role]);
 for(const p of [property,foreignProperty,home])await q("INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES($1,$2,'Turnover fixture','USD','UTC')",[tenant,p]);
 for(const [p,t] of [[property,type],[home,homeType]])await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Test accommodation',4)",[tenant,p,t]);
 for(let i=0;i<rooms.length;i++)await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,$5,'Clean')",[tenant,property,rooms[i],type,`T${i+1}`]);
 await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,'HOME','Clean')",[tenant,home,homeRoom,homeType]);
 await val("SELECT irp_pms.apply_operating_model($1,$2,'whole_home',4)",[tenant,home]);
 date=await val("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text");
 const day=async(n)=>val('SELECT ($1::date+$2::integer)::text',[date,n]);[oldDate,day1,day2,day3]=await Promise.all([-1,1,2,3].map(day));
 await as(manager);
 const legacyRequest=randomUUID(),legacyClean=await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,1,'Clean')",[tenant,property,rooms[11],legacyRequest]);
 const legacyInspectRequest=randomUUID(),legacyInspect=await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,1,'Inspect')",[tenant,property,rooms[11],legacyInspectRequest]);
 await admin();
 const baselineTables=(await q("SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' ORDER BY tablename")).map(x=>x.tablename);
 const beforeData=await fingerprint(baselineTables);
 const beforeFunctions=await q("SELECT n.nspname||'.'||p.proname name,p.oid::text oid,p.proowner::text owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR n.nspname='public' AND p.proname LIKE 'irp_pms_%' ORDER BY name,oid");
 const migrationSQL=await readFile(new URL('202609070171_iratepilot_pms_turnover_workflow.sql',dir),'utf8');
 await check('Exact171 migration compiles and does not backfill or alter existing rows',async()=>{
  await db.exec(migrationSQL);
  assert.deepEqual(await fingerprint(baselineTables),beforeData);
  assert.equal(await val('SELECT count(*)::int FROM irp_pms.turnover_tasks'),0);
 });
 await check('Only six reviewed existing function bodies change and all old owner/ACL/OIDs remain',async()=>{
  const after=await q("SELECT n.nspname||'.'||p.proname name,p.oid::text oid,p.proowner::text owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR n.nspname='public' AND p.proname LIKE 'irp_pms_%' ORDER BY name,oid"),byOid=new Map(after.map(x=>[x.oid,x])),changed=[];
  for(const old of beforeFunctions){const current=byOid.get(old.oid);assert.ok(current,old.name);assert.equal(current.owner,old.owner);assert.equal(current.acl,old.acl);if(current.definition!==old.definition)changed.push(old.name);}
  assert.deepEqual(changed.sort(),['irp_pms.apply_operating_model','public.irp_pms_pilot_configure_property','public.irp_pms_pilot_move_room','public.irp_pms_pilot_set_housekeeping','public.irp_pms_pilot_stay_action','public.irp_pms_pilot_workspace']);
 });
 await as(manager);
 await val('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,10)',[tenant,property,type,date,day3]);
 await val('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,1)',[tenant,home,homeType,date,day3]);
 await check('Legacy Clean and Inspect exact receipts remain immutable recoverable without new tasks',async()=>{
  assert.deepEqual(await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,1,'Clean')",[tenant,property,rooms[11],legacyRequest]),{...legacyClean,replayed:true});
  assert.deepEqual(await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,1,'Inspect')",[tenant,property,rooms[11],legacyInspectRequest]),{...legacyInspect,replayed:true});assert.equal((await list()).open_tasks.length,0);
 });
 await check('New direct Clean and Inspect commands reject without side effects',async()=>{
  const before=await inspect(()=>fingerprint(['rooms','housekeeping_requests','turnover_tasks','activity']));
  for(const state of ['Clean','Inspect'])await fails(()=>val('SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,1,$5)',[tenant,property,rooms[0],randomUUID(),state]),'P0001');
  assert.deepEqual(await inspect(()=>fingerprint(['rooms','housekeeping_requests','turnover_tasks','activity'])),before);
 });
 let made,started,submitted,completed;const createRequest=randomUUID();
 await check('Manual task snapshots hotel context and explicitly dirties room once',async()=>{
  made=await create(rooms[0],{request:createRequest});assert.equal(made.task.version,1);assert.equal(made.task.work_generation,1);assert.equal(made.task.state,'queued');assert.equal(made.task.creation_operating_model,'hotel');assert.equal(made.task.checklist.length,5);assert.equal(made.room.state_version,2);assert.equal(made.room.housekeeping,'Dirty');assert.equal(made.task.events.length,1);assert.equal(made.financial_changed,false);
 });
 await check('Task read and workspace expose current task, actor labels and bounded review context',async()=>{
  const report=await list(),workspace=await val('SELECT public.irp_pms_pilot_workspace($1,$2)',[tenant,property]);assert.equal(report.open_tasks[0].id,made.task.id);assert.equal(report.summary.queued,1);assert.equal(report.eligible_assignees.length,4);assert.deepEqual(workspace.rooms.find(x=>x.id===rooms[0]).open_turnover_task,{id:made.task.id,version:1,state:'queued'});assert.ok(report.eligible_assignees.every(x=>Object.keys(x).length===4));
 });
 await check('Duplicate open work, stale versions and civil date checks reject correctly',async()=>{
  await fails(()=>create(rooms[0]),'P0001');await fails(()=>create(rooms[1],{version:2,date:oldDate}),'PT409');await fails(()=>create(rooms[1],{date:oldDate}),'PT412');await fails(()=>update(made.task,'start',{}, {taskVersion:2,date:oldDate}),'PT409');await fails(()=>update(made.task,'start',{}, {date:oldDate}),'PT412');
 });
 await check('Staff can create self/unassigned work but cannot assign another or work on others tasks',async()=>{
  await as(other);await fails(()=>create(rooms[1]),'P0001');await fails(()=>update(made.task,'start'),'P0001');const own=await create(rooms[1],{assignee:other});assert.equal(own.task.assignee_id,other);await fails(()=>update(own.task,'assign',{assignee_id:staff,reason:'Change cleaner'}),'42501');await as(manager);await update(own.task,'cancel',{reason:'Finish isolated staff fixture'});
 });
 await check('Assigned staff start retains room version and advances only task revision',async()=>{
  await as(staff);started=await update(made.task,'start');assert.equal(started.task.version,2);assert.equal(started.task.state,'in_progress');assert.equal(started.room.state_version,2);assert.equal(started.room_state_changed,false);
 });
 await check('Incomplete/extra checklist and invalid action detail shapes reject atomically',async()=>{
  const before=await inspect(()=>fingerprint(['rooms','turnover_tasks','turnover_events','turnover_requests']));
  await fails(()=>update(started.task,'submit_cleaning',{checklist:{linen:true}}),'P0001');await fails(()=>update(started.task,'submit_cleaning',{checklist:{...checklist(started.task),unreviewed:true}}),'P0001');await fails(()=>update(started.task,'submit_cleaning',{checklist:checklist(started.task),extra:true}),'P0001');await fails(()=>update(started.task,'start',{extra:true}),'P0001');
  assert.deepEqual(await inspect(()=>fingerprint(['rooms','turnover_tasks','turnover_events','turnover_requests'])),before);
 });
 const submitRequest=randomUUID();
 await check('Complete cleaning submission records checklist and Inspect revision; staff cannot approve',async()=>{
  submitted=await update(started.task,'submit_cleaning',{checklist:checklist(started.task),note:'Test cleaning complete'},{request:submitRequest});assert.equal(submitted.task.state,'awaiting_inspection');assert.equal(submitted.room.housekeeping,'Inspect');assert.equal(submitted.task.submitted_room_version,3);assert.equal(submitted.task.submission.note,'Test cleaning complete');await fails(()=>update(submitted.task,'approve_inspection',{work_reviewed:true,room_ready:true}),'42501');
 });
 const approveRequest=randomUUID();
 await check('Manager inspection makes room Clean and closes immutable task',async()=>{
  await as(manager);completed=await update(submitted.task,'approve_inspection',{work_reviewed:true,room_ready:true},{request:approveRequest});assert.equal(completed.task.state,'completed');assert.equal(completed.room.housekeeping,'Clean');assert.equal(completed.room.state_version,4);assert.equal(completed.task.events.length,4);assert.equal((await list()).closed_tasks.some(x=>x.id===made.task.id),true);
 });
 await check('Create and submission retries return original receipts after task completion',async()=>{
  assert.deepEqual(await create(rooms[0],{request:createRequest,version:1}),{...made,replayed:true});await as(staff);assert.deepEqual(await update(started.task,'submit_cleaning',{checklist:checklist(started.task),note:'Test cleaning complete'},{request:submitRequest,roomVersion:2}),{...submitted,replayed:true});await as(manager);
 });
 await check('Original actor request namespace and tenant/property fences reject takeover',async()=>{
  assert.equal((await status(createRequest)).found,true);await as(owner);assert.deepEqual(await status(createRequest),{found:false});await fails(()=>create(rooms[0],{request:createRequest,version:1}),'P0001');await as(manager);await fails(()=>update(completed.task,'cancel',{reason:'Identity collision'},{request:createRequest}),'P0001');assert.deepEqual(await status(createRequest,foreignProperty),{found:false});await fails(()=>val('SELECT public.irp_pms_pilot_turnover_request_status($1,$2,$3)',[randomUUID(),property,createRequest]),'42501');await fails(()=>create(rooms[0],{property:foreignProperty}),'P0001');
 });
 await check('Downgraded manager may recover create/read own approval, but cannot replay approval',async()=>{
  await inspect(()=>q("UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=$1 AND user_id=$2",[tenant,manager]));assert.deepEqual(await create(rooms[0],{request:createRequest,version:1}),{...made,replayed:true});assert.equal((await status(approveRequest)).found,true);await fails(()=>update(submitted.task,'approve_inspection',{work_reviewed:true,room_ready:true},{request:approveRequest,roomVersion:3}),'42501');await inspect(()=>q("UPDATE irp_pms.memberships SET role='manager' WHERE tenant_id=$1 AND user_id=$2",[tenant,manager]));
 });
 await check('Removed member cannot inspect or replay; restoration recovers original receipt',async()=>{
  await inspect(()=>q('DELETE FROM irp_pms.memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,manager]));await fails(()=>status(createRequest),'42501');await fails(()=>create(rooms[0],{request:createRequest,version:1}),'42501');await inspect(()=>q("INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,'manager')",[tenant,manager]));assert.equal((await status(createRequest)).found,true);
 });
 await check('Closed history and original event/request payloads cannot be rewritten or deleted',async()=>{
  await inspect(async()=>{await fails(()=>q('UPDATE irp_pms.turnover_tasks SET version=version+1 WHERE id=$1',[made.task.id]),'P0001');await fails(()=>q('DELETE FROM irp_pms.turnover_tasks WHERE id=$1',[made.task.id]),'P0001');for(const table of ['turnover_events','turnover_requests','turnover_origins'])await fails(()=>q(`DELETE FROM irp_pms.${table} WHERE task_id=$1`,[made.task.id]),'P0001');});
 });
 let reset;
 await check('Returned work advances generation and keeps submitted answers in immutable events',async()=>{
  const fresh=await create(rooms[2]);const s=await update(fresh.task,'start');const sub=await update(s.task,'submit_cleaning',{checklist:checklist(s.task)});reset=await update(sub.task,'return_for_cleaning',{reason:'Recheck test bathroom'});assert.equal(reset.task.work_generation,2);assert.equal(reset.task.state,'queued');assert.equal(reset.task.submission,null);assert.equal(reset.room.housekeeping,'Dirty');assert.equal(reset.task.events.find(e=>e.action==='submit_cleaning').details.checklist.linen,true);
 });
 await check('Explicit vacant Dirty resets queued work once; exact legacy retry does not dispatch twice',async()=>{
  const req=randomUUID(),v=await revision(rooms[2]),before=reset.task.version;const dirty=await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,$5,'Dirty')",[tenant,property,rooms[2],req,v]);assert.equal(dirty.room.state_version,v+1);const task=(await list()).open_tasks.find(t=>t.id===reset.task.id);assert.equal(task.work_generation,3);assert.equal(task.version,before+1);assert.deepEqual(await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,$5,'Dirty')",[tenant,property,rooms[2],req,v]),{...dirty,replayed:true});assert.equal((await list()).open_tasks.find(t=>t.id===task.id).version,task.version);reset={...reset,task};
 });
 await check('Assignment/due changes retain room version, reject no-ops, and increment task once',async()=>{
  const v=await revision(rooms[2]);const assigned=await update(reset.task,'assign',{assignee_id:other,reason:'Assign available cleaner'});assert.equal(assigned.room.state_version,v);await fails(()=>update(assigned.task,'assign',{assignee_id:other,reason:'Assign available cleaner'}),'P0001');const due=await update(assigned.task,'set_due_date',{due_date:day1,reason:'Schedule tomorrow preparation'});assert.equal(due.task.due_date,day1);assert.equal(due.room.state_version,v);await fails(()=>update(due.task,'set_due_date',{due_date:oldDate,reason:'Invalid old due date'}),'P0001');reset=due;
 });
 await check('Cancellation records reason and leaves Dirty; cancelled work never makes a room ready',async()=>{
  const v=await revision(rooms[2]),cancelled=await update(reset.task,'cancel',{reason:'Test work no longer required'});assert.equal(cancelled.task.state,'cancelled');assert.equal(cancelled.room.housekeeping,'Dirty');assert.equal(cancelled.room.state_version,v+1);await fails(()=>update(cancelled.task,'start'),'P0001');
 });
 await check('Whole-home task snapshots six-item checklist and inspection readiness',async()=>{
  const task=await create(homeRoom,{property:home});assert.equal(task.task.creation_operating_model,'whole_home');assert.equal(task.task.checklist.length,6);assert.equal(task.task.checklist.at(-1).key,'kitchen');const done=await finish(task.task,home);assert.equal(done.room.housekeeping,'Clean');assert.equal(done.task.state,'completed');
 });
 let reservation;
 await check('Existing Clean room without a task remains available for actual check-in',async()=>{
  reservation=await book('Actual departure fixture');reservation=await stay(reservation,'check_in',rooms[3]);assert.equal(reservation.status,'In house');assert.equal((await list()).open_tasks.some(t=>t.room_id===rooms[3]),false);
 });
 await check('Occupied manual turnover rejects and occupied Dirty does not dispatch vacancy work',async()=>{
  await fails(()=>create(rooms[3]),'P0001');const v=await revision(rooms[3]);await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,$4,$5,'Dirty')",[tenant,property,rooms[3],randomUUID(),v]);assert.equal((await list()).open_tasks.some(t=>t.room_id===rooms[3]),false);
 });
 await check('Actual checkout enqueues atomically with final room revision and replay creates no duplicate',async()=>{
  const before=await revision(rooms[3]);reservation=await stay(reservation,'check_out');const task=(await list()).open_tasks.find(t=>t.room_id===rooms[3]);assert.equal(task.origin_kind,'checkout');assert.equal(task.room_state_version,before+1);assert.equal(task.events[0].room_version_after,before+1);assert.equal(task.events[0].details.reservation_id,reservation.id);await stay(reservation,'check_out');assert.equal((await list()).open_tasks.filter(t=>t.room_id===rooms[3]).length,1);assert.equal((await list()).open_tasks.find(t=>t.room_id===rooms[3]).version,1);
 });
 await check('Checkout of a Clean occupied room adds occupancy and Dirty changes before task snapshot',async()=>{
  let res=await book('Clean checkout fixture');res=await stay(res,'check_in',rooms[4]);const before=await revision(rooms[4]);await stay(res,'check_out');const task=(await list()).open_tasks.find(t=>t.room_id===rooms[4]);assert.equal(task.room_state_version,before+2);assert.equal(task.events[0].room_version_after,before+2);
 });
 await check('Future departure and unassigned arrival projections never dispatch tasks',async()=>{
  await book('Projected departure only',day1,day2);const report=await list();const projected=report.projected_departures.find(r=>r.guest_name==='Projected departure only');assert.equal(projected.room_id,null);assert.equal(projected.physically_occupied,false);assert.equal(projected.projection_only,true);assert.equal(report.arrival_demand.find(r=>r.stay_date===day1).assigned_arrivals,0);assert.equal(report.open_tasks.length,2);
 });
 let moving,moveReceipt;const moveRequest=randomUUID();
 await check('Room move dispatches only actual origin and parent exact replay is unchanged',async()=>{
  moving=await book('Room move fixture');moving=await stay(moving,'check_in',rooms[5]);const from=await revision(rooms[5]),to=await revision(rooms[6]);const args=[tenant,property,moving.id,moveRequest,moving.source_version,rooms[5],from,rooms[6],to,'Guest requested test room move'];const sql='SELECT public.irp_pms_pilot_move_room($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';moveReceipt=await val(sql,args);assert.equal(moveReceipt.from_room.housekeeping,'Dirty');assert.equal((await list()).open_tasks.find(t=>t.room_id===rooms[5]).origin_kind,'room_move');assert.equal((await list()).open_tasks.some(t=>t.room_id===rooms[6]),false);assert.deepEqual(await val(sql,args),{...moveReceipt,replayed:true});
 });
 await check('Open task blocks check-in and room-move target even under inconsistent Clean readiness',async()=>{
  const queued=await create(rooms[7]);await inspect(()=>q("UPDATE irp_pms.rooms SET housekeeping='Clean' WHERE id=$1",[rooms[7]]));const guest=await book('Guarded arrival fixture');await fails(()=>stay(guest,'check_in',rooms[7]),'P0001');await fails(async()=>val('SELECT public.irp_pms_pilot_move_room($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[tenant,property,moving.id,randomUUID(),moving.source_version,rooms[6],await revision(rooms[6]),rooms[7],await revision(rooms[7]),'Try unfinished target']),'P0001');await update(queued.task,'cancel',{reason:'Close inconsistent fixture'});
 });
 await check('Current maintenance blocks work and release invalidates submitted attestation',async()=>{
  const queued=await create(rooms[8]);const closure=await val('SELECT public.irp_pms_pilot_create_room_closure($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,property,rooms[8],randomUUID(),await revision(rooms[8]),date,date,day1,'Test maintenance during turnover']);assert.ok((await list()).open_tasks.find(t=>t.id===queued.task.id).blocked_reasons.includes('maintenance_active'));await fails(()=>update(queued.task,'start'),'P0001');await val('SELECT public.irp_pms_pilot_release_room_closure($1,$2,$3,$4,$5,$6,$7)',[tenant,property,closure.closure.id,randomUUID(),await revision(rooms[8]),date,'Maintenance repair complete']);const s=await update(queued.task,'start');const sub=await update(s.task,'submit_cleaning',{checklist:checklist(s.task)});await val('SELECT public.irp_pms_pilot_save_room($1,$2,$3,$4,$5)',[tenant,property,rooms[8],type,'Renamed after cleaning']);assert.ok((await list()).open_tasks.find(t=>t.id===queued.task.id).blocked_reasons.includes('submission_context_changed'));await fails(()=>update(sub.task,'approve_inspection',{work_reviewed:true,room_ready:true}),'P0001');const returned=await update(sub.task,'return_for_cleaning',{reason:'Confirm changed room context'});await finish(returned.task);
 });
 await check('Open tasks guard RPC and trusted UPDATE while existing service helper denial remains',async()=>{
  await fails(()=>val('SELECT public.irp_pms_pilot_configure_property($1,$2,$3,$4)',[tenant,property,'Changed label','Pacific/Honolulu']),'P0001');await inspect(async()=>{await fails(()=>q("UPDATE irp_pms.properties SET time_zone='Pacific/Honolulu' WHERE tenant_id=$1 AND id=$2",[tenant,property]),'P0001');await fails(()=>q("UPDATE irp_pms.properties SET operating_model='whole_home',whole_home_max_guests=4 WHERE tenant_id=$1 AND id=$2",[tenant,property]),'P0001');await db.exec('SET ROLE service_role');await fails(()=>q("UPDATE irp_pms.properties SET time_zone='Pacific/Honolulu' WHERE tenant_id=$1 AND id=$2",[tenant,property]),'42501');await db.exec('RESET ROLE');});await val('SELECT public.irp_pms_pilot_configure_property($1,$2,$3,$4)',[tenant,property,'Allowed display name','UTC']);
 });
 await check('New tables/helpers deny application writes and all four RPCs deny anon/service execution',async()=>{
  await inspect(async()=>{for(const name of ['turnover_tasks','turnover_origins','turnover_events','turnover_requests']){for(const role of ['anon','authenticated','service_role'])assert.equal(await val('SELECT has_table_privilege($1,$2,\'INSERT,UPDATE,DELETE\')',[role,`irp_pms.${name}`]),false);assert.equal(await val("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",[`irp_pms.${name}`]),true);}
   const funcs=await q("SELECT n.nspname,p.proname,p.oid::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' AND p.proname LIKE '%turnover%' OR n.nspname='public' AND p.proname IN('irp_pms_pilot_create_turnover','irp_pms_pilot_update_turnover','irp_pms_pilot_turnovers','irp_pms_pilot_turnover_request_status')");
   for(const f of funcs)for(const role of ['anon','authenticated','service_role'])assert.equal(await val('SELECT has_function_privilege($1,$2::oid,\'EXECUTE\')',[role,f.oid]),f.nspname==='public'&&role==='authenticated',`${role}:${f.proname}`);
  });await fails(()=>q('SELECT * FROM irp_pms.turnover_tasks'),'42501');
 });
 await check('Reads reject invalid civil ranges and include no silent mutation',async()=>{
  const before=await inspect(()=>fingerprint(['rooms','turnover_tasks','turnover_events','turnover_requests']));await fails(()=>list(property,date,date),'P0001');await fails(()=>list(property,'infinity','infinity'),'P0001');await list();assert.deepEqual(await inspect(()=>fingerprint(['rooms','turnover_tasks','turnover_events','turnover_requests'])),before);
 });
 if(process.env.TURNOVER_FIXTURE_PATH)await writeFile(process.env.TURNOVER_FIXTURE_PATH,JSON.stringify({actors:{owner,manager,staff,other},scope:{tenant_id:tenant,property_id:property,business_date:date},create:made,start:started,submit:submitted,approve:completed,list:await list()},null,2));
 await check('Nested event history and task mutation responses fail explicitly at documented bound',async()=>{
  await admin();await db.exec('BEGIN');
  try{
   const open=(await q("SELECT * FROM irp_pms.turnover_tasks WHERE tenant_id=$1 AND property_id=$2 AND state='queued' LIMIT 1",[tenant,property]))[0];
   await q("INSERT INTO irp_pms.turnover_events(tenant_id,property_id,task_id,action,actor_id,recorded_at,from_version,to_version,from_state,to_state,work_generation,room_version_before,room_version_after,details) SELECT $1,$2,$3,'bound_fixture',$4,now(),n,n+1,'queued','queued',1,1,1,'{}' FROM generate_series(1,50000) n",[tenant,property,open.id,owner]);
   await as(manager);await db.exec('SAVEPOINT expected_read_rejection');await fails(()=>list(),'P0001');await db.exec('ROLLBACK TO SAVEPOINT expected_read_rejection');await fails(()=>update(open,'start'),'P0001');
  }finally{await db.exec('ROLLBACK');await as(manager);}
 });
 await check('Open task count bound rejects before emitting a partial list',async()=>{
  await admin();await db.exec('BEGIN');
  try{
   await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label) SELECT $1,$2,$3,'BOUND-'||n FROM generate_series(1,1001) n",[tenant,property,type]);
   await q("INSERT INTO irp_pms.turnover_tasks(tenant_id,property_id,room_id,due_date,created_at,created_by,created_time_zone,creation_operating_model,created_room_label,created_room_type_id,origin_kind,checklist) SELECT tenant_id,property_id,id,$1,now(),$2,'UTC','hotel',label,room_type_id,'manual',irp_pms.turnover_checklist('hotel') FROM irp_pms.rooms WHERE tenant_id=$3 AND property_id=$4 AND label LIKE 'BOUND-%'",[date,owner,tenant,property]);
   await as(manager);await fails(()=>list(),'P0001');
  }finally{await db.exec('ROLLBACK');await as(manager);}
 });
 await check('Closed task count bound rejects without silently discarding history',async()=>{
  await admin();await db.exec('BEGIN');
  try{
   await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,room_type_id,label) SELECT $1,$2,$3,'HISTORY-'||n FROM generate_series(1,5001) n",[tenant,property,type]);
   await q("INSERT INTO irp_pms.turnover_tasks(tenant_id,property_id,room_id,due_date,created_at,created_by,created_time_zone,creation_operating_model,created_room_label,created_room_type_id,origin_kind,checklist) SELECT tenant_id,property_id,id,$1,now(),$2,'UTC','hotel',label,room_type_id,'manual',irp_pms.turnover_checklist('hotel') FROM irp_pms.rooms WHERE tenant_id=$3 AND property_id=$4 AND label LIKE 'HISTORY-%'",[date,owner,tenant,property]);
   await q("UPDATE irp_pms.turnover_tasks SET version=2,state='cancelled',closed_at=now(),closed_by=$1,close_reason='Bounded history fixture' WHERE tenant_id=$2 AND property_id=$3 AND created_room_label LIKE 'HISTORY-%'",[owner,tenant,property]);
   await as(manager);await fails(()=>list(),'P0001');
  }finally{await db.exec('ROLLBACK');await as(manager);}
 });
 await check('Assignee and projection count bounds fail explicitly',async()=>{
  await admin();await db.exec('BEGIN');
  try{
   await q("WITH users AS (INSERT INTO auth.users(id,email,email_confirmed_at) SELECT gen_random_uuid(),'bounded-cleaner-'||n||'@example.invalid',now() FROM generate_series(1,1001) n RETURNING id) INSERT INTO irp_pms.memberships(tenant_id,user_id,role) SELECT $1,id,'staff' FROM users",[tenant]);
   await as(manager);await fails(()=>list(),'P0001');
  }finally{await db.exec('ROLLBACK');await as(manager);}
  await admin();await db.exec('BEGIN');
  try{
   await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name) SELECT $1,$2,'direct','projection-bound-'||n,1,repeat('0',64),'Confirmed',$3,$4,$5,1,10000,0,0,10000,'Projection bound fixture' FROM generate_series(1,10001) n",[tenant,property,type,date,day2]);
   await as(manager);await fails(()=>list(),'P0001');
  }finally{await db.exec('ROLLBACK');await as(manager);}
 });
 await check('Deferred constraints pass and operational work has no folio entries or receipts',async()=>{
  await admin();await db.exec('BEGIN;SET CONSTRAINTS ALL IMMEDIATE;COMMIT;');assert.equal(await val('SELECT count(*)::int FROM irp_pms.folio_entries'),0);assert.equal(await val('SELECT count(*)::int FROM irp_pms.folio_openings'),0);assert.equal(await val('SELECT units FROM irp_pms.nightly_capacity WHERE tenant_id=$1 AND property_id=$2 AND room_type_id=$3 AND stay_date=$4',[tenant,property,type,date]),10);
 });
 await check('Combined departure and grouped-arrival output shares the10000-record bound',async()=>{
  await admin();await db.exec('BEGIN');
  try{
   const foreignType=randomUUID();await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Combined projection type',4)",[tenant,foreignProperty,foreignType]);
   await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name) SELECT $1,$2,'direct','combined-bound-'||n,1,repeat('0',64),'Confirmed',$3,$4,$5,1,10000,0,0,10000,'Combined projection fixture' FROM generate_series(1,10000) n",[tenant,foreignProperty,foreignType,date,day2]);
   await as(manager);const error=await fails(()=>list(foreignProperty),'P0001');assert.match(error.message,/projection output/);
  }finally{await db.exec('ROLLBACK');await as(manager);}
 });
 const result={status:'PASS',checks,check_count:checks.length,migration_sha256:createHash('sha256').update(migrationSQL).digest('hex'),scope:'Exact171 SQL in single-session PGlite against installed142–170. Synthetic hotel/home data only; no native multi-session concurrency, live SQL, payments, notifications, or external providers.'};
 if(process.env.TURNOVER_RESULT_PATH)await writeFile(process.env.TURNOVER_RESULT_PATH,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{await db.close();}
