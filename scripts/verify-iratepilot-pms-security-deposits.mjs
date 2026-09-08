import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST to an installed @electric-sql/pglite/dist directory');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const db=new PGlite({extensions:{pgcrypto}}),checks=[];
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const val=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name)};
const fails=async(fn,code)=>{let caught;try{await fn()}catch(e){caught=e}assert.ok(caught,'Expected rejection');if(code)assert.equal(caught.code,code);return caught};
const owner=randomUUID(),manager=randomUUID(),staff=randomUUID(),other=randomUUID(),outsider=randomUUID(),tenant=randomUUID(),foreignTenant=randomUUID(),property=randomUUID(),otherProperty=randomUUID(),home=randomUUID(),foreignProperty=randomUUID(),type=randomUUID(),homeType=randomUUID(),room=randomUUID(),homeRoom=randomUUID();
let actor=manager,date,nextDate,hotelStay,homeStay,unknownStay;
const as=async(id)=>{actor=id;await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated')};
const admin=async()=>db.exec('RESET ROLE');
const inspect=async(fn)=>{const old=actor;await admin();try{return await fn()}finally{await as(old)}};
const fingerprint=async(names)=>Object.fromEntries(await Promise.all(names.map(async name=>[name,await val(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'|' ORDER BY to_jsonb(x)::text),'')) FROM irp_pms.${name} x`)])));
const catalog=()=>q("SELECT p.oid::text oid,n.nspname||'.'||p.proname name,p.proowner::text owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR n.nspname='public' AND p.proname LIKE 'irp_pms_%' ORDER BY p.oid");
const detail=(res=hotelStay,p=property)=>val('SELECT public.irp_pms_pilot_security_deposit($1,$2,$3)',[tenant,p,res]);
const register=(p=property)=>val('SELECT public.irp_pms_pilot_security_deposit_register($1,$2)',[tenant,p]);
const activity=(p=property,start=date,end=nextDate)=>val('SELECT public.irp_pms_pilot_security_deposit_activity($1,$2,$3,$4)',[tenant,p,start,end]);
const status=(request,p=property)=>val('SELECT public.irp_pms_pilot_security_deposit_request_status($1,$2,$3)',[tenant,p,request]);
const command=(d,kind='external_receipt',amount=10000,target=null,method='cash',opts={})=>({reservation_id:d.reservation.id,expected_version:d.version,expected_recording_time_zone:d.recording_time_zone,expected_recording_date:d.recording_date,kind,amount_minor:amount,method,reference:opts.reference??'TEST external evidence',reason:opts.reason??'Fictional deposit verification',target_event_id:target,confirmed:true,...opts});
const post=(c,request=randomUUID(),p=property)=>val('SELECT public.irp_pms_pilot_record_security_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[tenant,p,c.reservation_id,request,c.expected_version,c.expected_recording_time_zone,c.expected_recording_date,c.kind,c.amount_minor,c.method,c.reference,c.reason,c.target_event_id,c.confirmed]);
const retire=(c,request,p=property,reason='Stop this uncertain test request')=>val('SELECT public.irp_pms_pilot_retire_security_deposit_request($1,$2,$3,$4,$5,$6)',[tenant,p,c.reservation_id,request,c,reason]);
const save=async(name,value)=>{if(process.env[name])await writeFile(process.env[name],JSON.stringify(value,null,2)+'\n')};
const rejectWithin=async(fn,code='P0001')=>{await db.exec('SAVEPOINT expected_rejection');try{return await fails(fn,code)}finally{await db.exec('ROLLBACK TO SAVEPOINT expected_rejection;RELEASE SAVEPOINT expected_rejection')}};
const transaction=async(fn)=>{await admin();await db.exec('BEGIN');try{await fn()}finally{await db.exec('ROLLBACK');await as(manager)}};
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171)_iratepilot_pms_/.test(n)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 for(const u of [owner,manager,staff,other,outsider])await q('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[u,`${u}@example.invalid`]);
 for(const t of [tenant,foreignTenant])await q("INSERT INTO irp_pms.tenants(id,name) VALUES($1,'Security deposit test organization')",[t]);
 for(const [t,u,role] of [[tenant,owner,'owner'],[tenant,manager,'manager'],[tenant,staff,'staff'],[tenant,other,'staff'],[foreignTenant,outsider,'owner']])await q('INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,$3)',[t,u,role]);
 for(const [t,p] of [[tenant,property],[tenant,otherProperty],[tenant,home],[foreignTenant,foreignProperty]])await q("INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES($1,$2,'Deposit fixture','USD','America/Chicago')",[t,p]);
 for(const [p,t] of [[property,type],[home,homeType]])await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Test unit',4)",[tenant,p,t]);
 for(const [p,r,t,l] of [[property,room,type,'HOTEL'],[home,homeRoom,homeType,'HOME']])await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,$5,'Clean')",[tenant,p,r,t,l]);
 await val("SELECT irp_pms.apply_operating_model($1,$2,'whole_home',4)",[tenant,home]);
 date=await val("SELECT (clock_timestamp() AT TIME ZONE 'America/Chicago')::date::text");nextDate=await val('SELECT ($1::date+1)::text',[date]);
 await as(manager);
 for(const [p,t,n] of [[property,type,1],[home,homeType,1]])await val('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,$6)',[tenant,p,t,date,nextDate,n]);
 hotelStay=(await val('SELECT public.irp_pms_pilot_create_reservation($1,$2,$3,$4,$5,$6,$7,1,0,0)',[tenant,property,randomUUID(),type,'TEST Deposit Hotel',date,nextDate])).id;
 homeStay=(await val('SELECT public.irp_pms_pilot_create_reservation($1,$2,$3,$4,$5,$6,$7,1,0,0)',[tenant,home,randomUUID(),homeType,'TEST Deposit Home',date,nextDate])).id;
 await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'charge',100,'TEST prior charge','Existing unrelated fictional folio',null)",[tenant,property,hotelStay,randomUUID()]);
 await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'external_payment',50,'TEST prior payment','Existing unrelated external record',null)",[tenant,property,hotelStay,randomUUID()]);
 await admin();unknownStay=randomUUID();
 await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status) VALUES($1,$2,$3,'iratepilot-ota','unknown-cancelled',1,repeat('a',64),'Cancelled')",[tenant,property,unknownStay]);
 const oldTables=(await q("SELECT tablename FROM pg_tables WHERE schemaname='irp_pms' ORDER BY tablename")).map(x=>x.tablename),oldData=await fingerprint(oldTables),oldCatalog=await catalog();
 const migrationSQL=await readFile(process.env.DEPOSIT_SQL??new URL('202609070172_iratepilot_pms_security_deposits.sql',dir),'utf8');
 await check('Exact172 compiles with three empty tables and every existing row/function unchanged',async()=>{
  await db.exec(migrationSQL);assert.deepEqual(await fingerprint(oldTables),oldData);
  const after=new Map((await catalog()).map(x=>[x.oid,x]));for(const row of oldCatalog)assert.deepEqual(after.get(row.oid),row,row.name);
  for(const table of ['security_deposit_books','security_deposit_events','security_deposit_requests'])assert.equal(await val(`SELECT count(*)::int FROM irp_pms.${table}`),0);
 });
 await as(manager);
 await check('Absent book reads are pure, version zero and null totals including unknown reservation charges',async()=>{
  const before=await inspect(()=>fingerprint([...oldTables,'security_deposit_books','security_deposit_events','security_deposit_requests']));
  for(const [r,p] of [[hotelStay,property],[homeStay,home],[unknownStay,property]]){const d=await detail(r,p);assert.equal(d.version,0);assert.equal(d.book,null);assert.equal(d.totals,null);assert.deepEqual(d.events,[]);assert.deepEqual(d.refundable_receipts,[]);}
  assert.deepEqual((await register()).rows,[]);assert.equal((await activity()).totals.event_count,0);
  assert.deepEqual(await status(randomUUID()),{found:false});assert.deepEqual(await inspect(()=>fingerprint([...oldTables,'security_deposit_books','security_deposit_events','security_deposit_requests'])),before);
 });
 const firstCommand=command(await detail()),firstRequest=randomUUID();let first;
 await check('First external receipt explicitly creates one book/event/receipt with exact10000 held',async()=>{
  first=await post(firstCommand,firstRequest);assert.equal(first.outcome,'recorded');assert.equal(first.book.version,1);assert.deepEqual(first.book.totals,{received_minor:10000,refunded_minor:0,reduced_minor:0,held_minor:10000});assert.equal(first.event.from_version,0);assert.equal(first.event.to_version,1);assert.equal(first.event.recording_time_zone,'America/Chicago');assert.equal(first.folio_changed,false);assert.equal(first.revenue_changed,false);
 });
 const depositTables=['security_deposit_books','security_deposit_events','security_deposit_requests','activity'];
 let refunded,reduced,exhausted,newReceipt,retired;
 await check('Linked3000 external refund and1000 receipt reduction leave6000 held with different refund method',async()=>{
  refunded=await post(command(await detail(),'external_refund',3000,first.event.id,'bank_transfer'));
  reduced=await post(command(await detail(),'receipt_reduction',1000,first.event.id,null));
  assert.equal(refunded.event.recorded_method,'bank_transfer');assert.equal(reduced.event.recorded_method,null);
  assert.deepEqual(reduced.book.totals,{received_minor:10000,refunded_minor:3000,reduced_minor:1000,held_minor:6000});
  assert.deepEqual((await detail()).refundable_receipts,[{event_id:first.event.id,received_minor:10000,refunded_minor:3000,reduced_minor:1000,remaining_minor:6000}]);
 });
 await check('Over-refund or reduction rejects atomically without receipt event book or audit changes',async()=>{
  const before=await inspect(()=>fingerprint(depositTables)),request=randomUUID();
  await fails(async()=>post(command(await detail(),'external_refund',6001,first.event.id,'card'),request),'P0001');
  await fails(async()=>post(command(await detail(),'receipt_reduction',6001,first.event.id,null)),'P0001');
  assert.deepEqual(await status(request),{found:false});assert.deepEqual(await inspect(()=>fingerprint(depositTables)),before);
 });
 await check('Exhausted zero-held book stays explicit and a later new receipt advances without reopening flags',async()=>{
  exhausted=await post(command(await detail(),'external_refund',6000,first.event.id,'cash'));
  let d=await detail();assert.equal(d.book.version,4);assert.equal(d.totals.held_minor,0);assert.equal(d.refundable_receipts.length,1);assert.equal(d.refundable_receipts[0].remaining_minor,0);
  assert.equal((await register()).summary.zero_held_count,1);
  newReceipt=await post(command(d,'external_receipt',125,null,'other'));
  assert.equal(newReceipt.book.id,first.book.id);assert.equal(newReceipt.book.version,5);assert.equal(newReceipt.book.totals.held_minor,125);
 });
 await check('Exact original receipt is immutable after later changes and does not repeat its audit',async()=>{
  const before=await inspect(()=>fingerprint(depositTables));
  assert.deepEqual(await post(firstCommand,firstRequest),{...first,replayed:true});
  assert.deepEqual(await status(firstRequest),{found:true,action:'record_security_deposit',result:first});
  assert.deepEqual(await inspect(()=>fingerprint(depositTables)),before);
  assert.equal(first.book.totals.held_minor,10000);assert.equal((await detail()).totals.held_minor,125);
 });
 await check('Targets require the same book and original receipt; method and confirmation are explicit',async()=>{
  const homeFirst=await post(command(await detail(homeStay,home)),randomUUID(),home);
  for(const c of [
   command(await detail(),'external_refund',1,refunded.event.id,'cash'),
   command(await detail(),'external_refund',1,homeFirst.event.id,'cash'),
   command(await detail(),'external_receipt',1,first.event.id,'cash'),
   command(await detail(),'external_refund',1,newReceipt.event.id,null),
   command(await detail(),'receipt_reduction',1,newReceipt.event.id,'cash'),
   {...command(await detail()),confirmed:false},
   {...command(await detail()),method:'processor_hold'},
   {...command(await detail()),kind:'apply_to_folio'},
  ])await fails(()=>post(c),'P0001');
 });
 await check('Normalized references may repeat without claiming provider uniqueness',async()=>{
  const result=await post(command(await detail(),'external_receipt',100,null,'cash',{reference:'  TEST external evidence  ',reason:'  Fictional deposit verification  '}));
  assert.equal(result.event.reference,first.event.reference);assert.equal(result.event.reason,first.event.reason);assert.notEqual(result.event.id,first.event.id);
 });
 await check('Malformed amounts dates scope and retired JSON fail before any persistence',async()=>{
  const d=await detail(),before=await inspect(()=>fingerprint(depositTables));
  for(const c of [{...command(d),amount_minor:0},{...command(d),amount_minor:-1},{...command(d),amount_minor:1000000000000},{...command(d),expected_version:null},{...command(d),reference:'bad\nreference'},{...command(d),reason:'x'},{...command(d),expected_recording_date:null}])await fails(()=>post(c),'P0001');
  for(const c of [{...command(d),extra:true},{...command(d),confirmed:null},{...command(d),amount_minor:'100'},{...command(d),target_event_id:[]},{...command(d),reservation_id:homeStay}])await fails(()=>retire(c,randomUUID()));
  await fails(()=>detail(randomUUID()),'P0001');await fails(()=>detail(hotelStay,otherProperty),'P0001');
  assert.deepEqual(await inspect(()=>fingerprint(depositTables)),before);
 });
 await check('Stale revisions and recording context have distinct errors without losing request identity',async()=>{
  const d=await detail(),request=randomUUID(),oldDate=await inspect(()=>val('SELECT ($1::date-1)::text',[d.recording_date]));
  await fails(()=>post({...command(d),expected_version:0},request),'PT409');
  await fails(()=>post({...command(d),expected_recording_time_zone:'UTC'}),'PT409');
  const oldCommand={...command(d),expected_recording_date:oldDate};
  await fails(()=>post(oldCommand,request),'PT412');assert.deepEqual(await status(request),{found:false});
  const beforeBook=JSON.stringify(d.book);retired=await retire(oldCommand,request);assert.equal(retired.outcome,'retired');assert.equal(JSON.stringify((await detail()).book),beforeBook);
  assert.deepEqual(await post(oldCommand,request),{...retired,replayed:true});
 });
 await check('Retiring the first uncertain request creates no book and permanently fences delayed posting',async()=>{
  const c=command(await detail(unknownStay)),request=randomUUID(),before=await inspect(()=>fingerprint(['security_deposit_books','security_deposit_events']));
  const result=await retire(c,request);assert.equal(result.outcome,'retired');assert.equal(result.book_version_changed,false);assert.equal(result.financial_changed,false);assert.deepEqual(result.command,c);
  assert.deepEqual(await post(c,request),{...result,replayed:true});assert.deepEqual(await retire(c,request),{...result,replayed:true});
  assert.equal((await detail(unknownStay)).book,null);assert.deepEqual(await inspect(()=>fingerprint(['security_deposit_books','security_deposit_events'])),before);
  assert.deepEqual(await status(request),{found:true,action:'retire_security_deposit_request',result});
  await fails(()=>retire(c,request,property,'A changed retirement reason'),'P0001');
  await fails(()=>post({...c,amount_minor:101},request),'P0001');
 });
 await check('Retirement after successful posting returns the accepted receipt without a new fence or audit',async()=>{
  const before=await inspect(()=>fingerprint(depositTables));
  assert.deepEqual(await retire(firstCommand,firstRequest),{...first,replayed:true});
  assert.deepEqual(await inspect(()=>fingerprint(depositTables)),before);
 });
 await check('Actor and property identities cannot take over recorded or retired requests',async()=>{
  await as(owner);assert.deepEqual(await status(firstRequest),{found:false});await fails(()=>post(firstCommand,firstRequest),'P0001');await fails(()=>retire(firstCommand,firstRequest),'P0001');
  await as(manager);assert.deepEqual(await status(firstRequest,otherProperty),{found:false});
  await fails(()=>val('SELECT public.irp_pms_pilot_security_deposit($1,$2,$3)',[foreignTenant,property,hotelStay]),'42501');
 });
 await check('Staff can read and retire their own command but cannot post financial entries',async()=>{
  await as(staff);const c=command(await detail()),request=randomUUID();assert.equal((await detail()).can_manage,false);await register();await activity();
  await fails(()=>post(c,request),'42501');const result=await retire(c,request);assert.equal(result.retired_by,staff);assert.equal(result.outcome,'retired');
  await fails(()=>post(c,request),'42501');await as(manager);
 });
 await check('Downgrade and removal preserve current authority while retaining original actor recovery',async()=>{
  await inspect(()=>q("UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id=$1 AND user_id=$2",[tenant,manager]));
  assert.equal((await status(firstRequest)).result.event.id,first.event.id);assert.deepEqual(await retire(firstCommand,firstRequest),{...first,replayed:true});await fails(()=>post(firstCommand,firstRequest),'42501');
  await inspect(()=>q('DELETE FROM irp_pms.memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,manager]));
  await fails(()=>detail(),'42501');await fails(()=>status(firstRequest),'42501');await fails(()=>retire(firstCommand,firstRequest),'42501');
  await inspect(()=>q("INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,'manager')",[tenant,manager]));assert.equal((await status(firstRequest)).found,true);
 });
 await check('Every deposit-only operation preserves all preexisting financial and operational rows',async()=>{
  assert.deepEqual(await inspect(()=>fingerprint(oldTables.filter(x=>x!=='activity'))),Object.fromEntries(Object.entries(oldData).filter(([x])=>x!=='activity')));
 });
 await check('All new RPC storage and helper privileges are narrow while all older catalog identities remain',async()=>{
  await inspect(async()=>{
   const oldOids=new Set(oldCatalog.map(x=>x.oid)),current=await catalog(),added=current.filter(x=>!oldOids.has(x.oid));
   assert.equal(added.filter(x=>x.name.startsWith('public.')).length,6);
   for(const x of added){assert.equal(x.anon,false,x.name);assert.equal(x.service,false,x.name);assert.equal(x.authenticated,x.name.startsWith('public.'),x.name)}
   for(const table of depositTables.filter(x=>x!=='activity'))for(const role of ['anon','authenticated','service_role'])for(const privilege of ['INSERT','UPDATE','DELETE'])assert.equal(await val('SELECT has_table_privilege($1,$2,$3)',[role,'irp_pms.'+table,privilege]),false,table+' '+role+' '+privilege);
   const byOid=new Map(current.map(x=>[x.oid,x]));for(const x of oldCatalog)assert.deepEqual(byOid.get(x.oid),x);
  });
 });
 await check('Frozen recording zone survives property change while a new book reviews the new zone',async()=>{
  await inspect(()=>q("UPDATE irp_pms.properties SET time_zone='Pacific/Kiritimati' WHERE tenant_id=$1 AND id=$2",[tenant,property]));
  const d=await detail();assert.equal(d.recording_time_zone,'America/Chicago');assert.equal(d.property_time_zone,'Pacific/Kiritimati');
  const c=command(d,'external_receipt',1);await post(c);assert.deepEqual(await post(firstCommand,firstRequest),{...first,replayed:true});
  const u=await detail(unknownStay);assert.equal(u.recording_time_zone,'Pacific/Kiritimati');const result=await post(command(u),randomUUID());assert.equal(result.book.recording_time_zone,'Pacific/Kiritimati');assert.equal(result.book.creation_operating_model,'hotel');
  await inspect(()=>q("UPDATE irp_pms.properties SET time_zone='America/Chicago' WHERE tenant_id=$1 AND id=$2",[tenant,property]));
  assert.equal((await detail(unknownStay)).recording_time_zone,'Pacific/Kiritimati');
 });
 await check('Activity uses stored recording dates and current register flags ended held funds once',async()=>{
  const report=await activity(),u=await detail(unknownStay),r=await register();
  assert.equal(report.period.basis,'stored_recording_date');assert.ok(report.rows.every(x=>x.event.recording_date>=date&&x.event.recording_date<nextDate));
  assert.equal(r.rows.find(x=>x.reservation.id===unknownStay).financial_review_required,true);assert.equal(r.summary.ended_with_held_count,1);
  assert.equal(r.summary.ended_held_minor,u.totals.held_minor);assert.equal(r.totals.held_minor,r.rows.reduce((sum,x)=>sum+x.book.totals.held_minor,0));
  const amount=report.rows.reduce((s,x)=>s+x.held_effect_minor,0);assert.equal(report.totals.held_effect_minor,amount);
  for(const [start,end] of [[date,date],[nextDate,date],[date,await inspect(()=>val('SELECT ($1::date+367)::text',[date]))]])await fails(()=>activity(property,start,end),'P0001');
 });
 await check('Actual home check-in checkout and turnover do not resolve or modify its deposits',async()=>{
  const before=await inspect(()=>fingerprint(['security_deposit_books','security_deposit_events','security_deposit_requests']));
  await val("SELECT public.irp_pms_pilot_stay_action($1,$2,$3,'check_in',$4)",[tenant,home,homeStay,homeRoom]);
  await val("SELECT public.irp_pms_pilot_stay_action($1,$2,$3,'check_out',null)",[tenant,home,homeStay]);
  assert.deepEqual(await inspect(()=>fingerprint(['security_deposit_books','security_deposit_events','security_deposit_requests'])),before);
  const row=(await register(home)).rows[0];assert.equal(row.reservation.status,'Checked out');assert.equal(row.financial_review_required,true);assert.equal(row.book.totals.held_minor,10000);
  assert.equal(await inspect(()=>val('SELECT count(*)::int FROM irp_pms.turnover_tasks WHERE tenant_id=$1 AND property_id=$2',[tenant,home])),1);
 });
 await save('DEPOSIT_SQL_FIXTURE_PATH',{detail:await detail(),first,refunded,reduced,exhausted,newReceipt,retired,register:await register(),activity:await activity()});
 // These trusted synthetic seeds exist only in this disposable scratch DB.
 await inspect(async()=>db.exec(await readFile(new URL('../supabase/verification/202609070172_iratepilot_pms_security_deposits.local-fixtures.sql',import.meta.url),'utf8')));
 await check('Stored Chicago civil dates cover both DST repeated hours without relabeling old events',async()=>{
  await transaction(async()=>{
   const a=await val("SELECT pg_temp.deposit172_seed($1,$2,1,100,'2026-11-01T06:30:00Z',$3)",[tenant,otherProperty,manager]);
   const b=await val("SELECT pg_temp.deposit172_seed($1,$2,1,200,'2026-11-01T07:30:00Z',$3)",[tenant,otherProperty,manager]);
   await db.exec('SET CONSTRAINTS ALL IMMEDIATE');await as(manager);
   const report=await activity(otherProperty,'2026-11-01','2026-11-02');assert.equal(report.rows.length,2);assert.equal(report.totals.received_minor,300);
   assert.ok(report.rows.every(x=>x.event.recording_date==='2026-11-01'&&x.event.recording_time_zone==='America/Chicago'));
   await admin();await q("UPDATE irp_pms.properties SET time_zone='Pacific/Kiritimati' WHERE tenant_id=$1 AND id=$2",[tenant,otherProperty]);await as(manager);
   const after=await activity(otherProperty,'2026-11-01','2026-11-02');assert.deepEqual(after.rows,report.rows);assert.equal(after.property_time_zone,'Pacific/Kiritimati');
   assert.equal((await detail(a,otherProperty)).totals.held_minor,100);assert.equal((await detail(b,otherProperty)).totals.held_minor,200);
  });
 });
 await check('Book returns all1000 events and rejects1001 while exact first-event replay works',async()=>{
  await transaction(async()=>{
   const res=await val('SELECT pg_temp.deposit172_seed($1,$2,1,1,clock_timestamp(),$3)',[tenant,otherProperty,manager]);
   const original=(await q('SELECT command,request_id,result FROM irp_pms.security_deposit_requests WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3',[tenant,otherProperty,res]))[0];
   await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');await as(manager);let d=await detail(res,otherProperty),last;
   for(let i=1;i<1000;i++)last=await post({...command(d,'external_receipt',1),expected_version:i},randomUUID(),otherProperty);
   await db.exec('SET CONSTRAINTS ALL IMMEDIATE');d=await detail(res,otherProperty);assert.equal(d.events.length,1000);assert.equal(d.version,1000);assert.equal(d.refundable_receipts.length,1000);assert.equal(d.totals.held_minor,1000);
   await rejectWithin(()=>post(command(d,'external_receipt',1),randomUUID(),otherProperty));
   assert.deepEqual(await post(original.command,original.request_id,otherProperty),{...original.result,replayed:true});assert.equal(last.book.version,1000);
  });
 });
 await check('Register/activity accept exactly10000 rows and reject excess without truncation',async()=>{
  await transaction(async()=>{
   const res=await val('SELECT pg_temp.deposit172_seed($1,$2,10000,1,clock_timestamp(),$3)',[tenant,otherProperty,manager]);
   await db.exec('SET CONSTRAINTS ALL IMMEDIATE');await as(manager);
   const report=await register(otherProperty);assert.equal(report.rows.length,10000);assert.equal(report.totals.held_minor,10000);
   const events=await activity(otherProperty);assert.equal(events.rows.length,10000);assert.equal(events.totals.received_minor,10000);
   await db.exec('SET CONSTRAINTS ALL DEFERRED');await post(command(await detail(res,otherProperty),'external_receipt',1),randomUUID(),otherProperty);await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
   await rejectWithin(()=>activity(otherProperty));assert.equal((await register(otherProperty)).rows.length,10000);
   await admin();await val('SELECT pg_temp.deposit172_seed($1,$2,1,1,clock_timestamp(),$3)',[tenant,otherProperty,manager]);await db.exec('SET CONSTRAINTS ALL IMMEDIATE');await as(manager);
   await rejectWithin(()=>register(otherProperty));
  });
 });
 await check('Each report rejects gross safe-integer overflow before returning monetary JSON',async()=>{
  await transaction(async()=>{
   await val('SELECT pg_temp.deposit172_seed($1,$2,9008,999999999999,clock_timestamp(),$3)',[tenant,otherProperty,manager]);
   await db.exec('SET CONSTRAINTS ALL IMMEDIATE');await as(manager);
   const reg=await rejectWithin(()=>register(otherProperty));assert.match(reg.message,/integer range/);
   const act=await rejectWithin(()=>activity(otherProperty));assert.match(act.message,/integer range/);
  });
 });
 await check('Per-book gross limit prevents overflow even after its receipt was fully refunded',async()=>{
  await transaction(async()=>{
   const res=await val('SELECT pg_temp.deposit172_seed($1,$2,1,999999999999,clock_timestamp(),$3)',[tenant,otherProperty,manager]);
   await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');await as(manager);let d=await detail(res,otherProperty);
   await post(command(d,'external_refund',999999999999,d.events[0].id,'card'),randomUUID(),otherProperty);await db.exec('SET CONSTRAINTS ALL IMMEDIATE');d=await detail(res,otherProperty);assert.equal(d.totals.held_minor,0);
   const error=await rejectWithin(()=>post(command(d,'external_receipt',1),randomUUID(),otherProperty));assert.match(error.message,/integer range/);
  });
 });
 await check('Financial shutdown preserves reads and nonfinancial own-request retirement',async()=>{
  await admin();await db.exec(await readFile(new URL('../supabase/rollbacks/202609070172_iratepilot_pms_security_deposits.shutdown.sql',import.meta.url),'utf8'));await as(manager);
  const c=command(await detail()),request=randomUUID();await fails(()=>post(c,request),'42501');
  const stop=await retire(c,request);assert.equal(stop.outcome,'retired');assert.equal((await status(request)).result.outcome,'retired');await register();await activity();
  assert.equal((await status(firstRequest)).result.outcome,'recorded');
 });
 const result={status:'PASS',check_count:checks.length,checks,migration_sha256:createHash('sha256').update(migrationSQL).digest('hex'),scope:'Local PGlite with synthetic identities and recorded external evidence only; no processor, hosted transport or native multi-session contention.'};
 await save('DEPOSIT_RESULT_PATH',result);console.log(JSON.stringify(result,null,2));
}finally{await db.close()}
