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
 for(const f of (await readdir(dir)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171|172|173)_iratepilot_pms_/.test(n)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
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

 const migrationSQL=await readFile(process.env.PAYMENT_REVIEW_SQL??new URL('202609070174_iratepilot_pms_payment_record_reviews.sql',dir),'utf8');
 const fixtures={};let originalEntry;
 const reviewDetail=(entry=originalEntry,res=hotelStay,p=property)=>val('SELECT public.irp_pms_pilot_payment_record_review($1,$2,$3,$4)',[tenant,p,res,entry]);
 const reviewCommand=(d,extra={})=>({reservation_id:d.reservation_id,entry_id:d.entry_id,expected_version:d.version,method:'cash',method_detail:null,evidence_basis:'external_record_reviewed',evidence_reference:'TEST checked payment register',reason:'TEST method review from external record',confirmed:true,...extra});
 const reviewSave=(c,request=randomUUID(),p=property)=>val('SELECT public.irp_pms_pilot_save_payment_record_review($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[tenant,p,c.reservation_id,c.entry_id,request,c.expected_version,c.method,c.method_detail,c.evidence_basis,c.evidence_reference,c.reason,c.confirmed]);
 const reviewStatus=(request,p=property)=>val('SELECT public.irp_pms_pilot_payment_record_review_request_status($1,$2,$3)',[tenant,p,request]);
 const reviewRetire=(c,request,p=property,reason='TEST stop retrying this exact request')=>val('SELECT public.irp_pms_pilot_retire_payment_record_review_request($1,$2,$3,$4,$5,$6,$7)',[tenant,p,c.reservation_id,c.entry_id,request,c,reason]);
 const report=(p=property,start=date,end=nextDate)=>val('SELECT public.irp_pms_pilot_cashier_activity_report($1,$2,$3,$4)',[tenant,p,start,end]);
 const folioPost=(kind,amount,reference,target=null,res=hotelStay,p=property)=>val('SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,p,res,randomUUID(),kind,amount,reference,'TEST original financial evidence',target]);
 const document=()=>val('SELECT public.irp_pms_pilot_guest_documents($1,$2,$3)',[tenant,property,hotelStay]);
 const stableDocument=d=>{const copy=structuredClone(d);delete copy.generated_at;return copy};
 const metadataTables=['payment_record_review_heads','payment_record_reviews','payment_record_review_requests'];
 await check('Exact174 adds three empty metadata tables while all53 source rows/functions stay unchanged',async()=>{
  assert.equal(oldTables.length,53);assert.ok(migrationSQL.endsWith('COMMIT;\n'));await db.exec(migrationSQL);assert.deepEqual(await fingerprint(oldTables),oldData);
  const after=new Map((await catalog()).map(x=>[x.oid,x]));for(const row of oldCatalog)assert.deepEqual(after.get(row.oid),row,row.name);
  for(const table of metadataTables)assert.equal(await val('SELECT count(*)::int FROM irp_pms.'+table),0);
 });await as(manager);
 originalEntry=(await val('SELECT public.irp_pms_pilot_folio($1,$2,$3)',[tenant,property,hotelStay])).entries.find(e=>e.kind==='external_payment').id;
 await check('Absent review and report are complete pure reads with actual actor and explicit unreviewed method',async()=>{
  const before=await inspect(()=>fingerprint([...oldTables,...metadataTables]));fixtures.absent=await reviewDetail();fixtures.unreviewed_report=await report();
  assert.equal(fixtures.absent.actor_id,manager);assert.equal(fixtures.absent.recorded,false);assert.equal(fixtures.absent.version,0);assert.equal(fixtures.absent.head,null);assert.equal(fixtures.absent.current_review,null);assert.deepEqual(fixtures.absent.reviews,[]);
  assert.equal(fixtures.unreviewed_report.summary.row_count,1);assert.equal(fixtures.unreviewed_report.rows[0].classification.state,'unreviewed');assert.equal(fixtures.unreviewed_report.rows[0].classification.method,'unknown');assert.equal(fixtures.unreviewed_report.totals.guest_folio.unknown_method_record_count,1);
  assert.deepEqual(await reviewStatus(randomUUID()),{found:false});assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);
 });
 let firstCommand,firstRequest,firstResult;
 await check('Accepted method review stores exact source and receipt while all financial and173 summary fields remain unchanged',async()=>{
  const before=await inspect(()=>fingerprint(oldTables.filter(x=>x!=='activity'))),doc=stableDocument(await document());firstCommand=reviewCommand(await reviewDetail());firstRequest=randomUUID();
  firstResult=await reviewSave(firstCommand,firstRequest);fixtures.reviewed_result=firstResult;fixtures.reviewed=await reviewDetail();fixtures.reviewed_status=await reviewStatus(firstRequest);
  assert.equal(firstResult.outcome,'reviewed');assert.deepEqual(firstResult.command,firstCommand);assert.equal(firstResult.version,1);assert.equal(firstResult.review.source.id,originalEntry);assert.equal(firstResult.review.source.amount_minor,50);assert.equal(firstResult.review.method,'cash');assert.equal(firstResult.replayed,false);
  assert.deepEqual(fixtures.reviewed.current_review,firstResult.review);assert.deepEqual(fixtures.reviewed_status,{found:true,action:'save_payment_record_review',result:firstResult});assert.deepEqual(await inspect(()=>fingerprint(oldTables.filter(x=>x!=='activity'))),before);assert.deepEqual(stableDocument(await document()),doc);
 });
 await check('Explicit reviewed unknown supersedes known method and exact first replay returns historical revision',async()=>{
  const second=await reviewSave(reviewCommand(await reviewDetail(),{method:'unknown',evidence_basis:'insufficient_evidence',evidence_reference:null,reason:'TEST source evidence is insufficient'}));fixtures.unknown_result=second;fixtures.unknown=await reviewDetail();
  assert.equal(second.version,2);assert.equal(fixtures.unknown.current_review.method,'unknown');assert.equal(fixtures.unknown.recorded,true);assert.equal(fixtures.unknown.reviews.length,2);
  const before=await inspect(()=>fingerprint([...metadataTables,'activity']));const replay=await reviewSave(firstCommand,firstRequest);fixtures.historical_replay=replay;assert.deepEqual(replay,{...firstResult,replayed:true});assert.deepEqual(await inspect(()=>fingerprint([...metadataTables,'activity'])),before);
  fixtures.unknown_report=await report();assert.equal(fixtures.unknown_report.rows[0].classification.state,'reviewed');assert.equal(fixtures.unknown_report.totals.guest_folio.classification_counts.reviewed_insufficient_evidence,1);
 });
 await check('Invalid enum/null/source/version commands reject without any metadata or financial effect',async()=>{
  const before=await inspect(()=>fingerprint([...oldTables,...metadataTables])),c=reviewCommand(await reviewDetail());
  for(const change of [{method:'other',method_detail:null},{method:'unknown'},{evidence_basis:'insufficient_evidence'},{evidence_reference:null},{method_detail:'forbidden extra detail'},{confirmed:false},{reason:'bad\ncontrols'},{expected_version:1}])await fails(()=>reviewSave({...c,...change}));
  const charge=(await val('SELECT public.irp_pms_pilot_folio($1,$2,$3)',[tenant,property,hotelStay])).entries.find(e=>e.kind==='charge');await fails(()=>reviewDetail(charge.id));await fails(()=>reviewSave({...c,entry_id:charge.id}));assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);
 });
 await check('Durable retirement has no review version effect and fences delayed save with exact immutable recovery',async()=>{
  const c=reviewCommand(await reviewDetail()),request=randomUUID(),before=await inspect(()=>fingerprint([...oldTables.filter(x=>x!=='activity'),'payment_record_review_heads','payment_record_reviews']));
  fixtures.retired_result=await reviewRetire(c,request);fixtures.retired_status=await reviewStatus(request);
  assert.equal(fixtures.retired_result.outcome,'retired');assert.equal(fixtures.retired_result.review_version_changed,false);assert.equal(fixtures.retired_result.review,undefined);assert.deepEqual(fixtures.retired_result.command,c);
  assert.deepEqual(await reviewSave(c,request),{...fixtures.retired_result,replayed:true});assert.deepEqual(await reviewRetire(c,request),{...fixtures.retired_result,replayed:true});assert.deepEqual(await inspect(()=>fingerprint([...oldTables.filter(x=>x!=='activity'),'payment_record_review_heads','payment_record_reviews'])),before);
  await fails(()=>reviewRetire(c,request,property,'TEST changed attempted reason'));await fails(()=>reviewSave({...c,reason:'TEST changed canonical payload'},request));
  assert.deepEqual(await reviewRetire(firstCommand,firstRequest),{...firstResult,replayed:true});
 });
 let newPayment,newRefund;
 await check('Refund classification is independent and corrections never become tender or external outflows',async()=>{
  newPayment=await folioPost('external_payment',10000,'TEST hotel payment100');newRefund=await folioPost('external_refund',2000,'TEST hotel refund20',newPayment.entry_id);await folioPost('payment_correction',3000,'TEST hotel correction30',newPayment.entry_id);
  const paymentResult=await reviewSave(reviewCommand(await reviewDetail(newPayment.entry_id),{method:'card',evidence_reference:'TEST reviewed card record'}));
  const refundResult=await reviewSave(reviewCommand(await reviewDetail(newRefund.entry_id),{method:'bank_transfer',evidence_basis:'operator_report_only',evidence_reference:null,reason:'TEST refund method was reported separately'}));fixtures.refund=await reviewDetail(newRefund.entry_id);
  assert.equal(paymentResult.review.method,'card');assert.equal(refundResult.review.method,'bank_transfer');const r=await report();assert.equal(r.totals.guest_folio.received_minor,10050);assert.equal(r.totals.guest_folio.refunded_minor,2000);assert.equal(r.totals.guest_folio.reduced_minor,3000);assert.equal(r.totals.guest_folio.external_record_effect_minor,8050);assert.equal(r.totals.guest_folio.record_balance_effect_minor,5050);
  const correction=r.rows.find(x=>x.record.kind==='payment_correction');assert.equal(correction.classification.state,'not_money_movement');assert.equal(correction.classification.method,null);assert.equal(correction.effects.external_record_effect_minor,0);assert.equal(correction.effects.record_balance_effect_minor,-3000);
 });
 await check('Mixed-purpose report preserves original deposit methods and separate receipt/refund/reduction arithmetic',async()=>{
  const received=await post(command(await detail(),'external_receipt',20000,null,'cash'));await post(command(await detail(),'external_refund',4000,received.event.id,'other'));await post(command(await detail(),'receipt_reduction',1000,received.event.id,null));
  const before=await inspect(()=>fingerprint([...oldTables,...metadataTables]));fixtures.mixed_report=await report();const r=fixtures.mixed_report;assert.equal(r.summary.row_count,7);assert.equal(r.summary.folio_row_count,4);assert.equal(r.summary.security_deposit_row_count,3);
  assert.deepEqual([r.totals.refundable_security.received_minor,r.totals.refundable_security.refunded_minor,r.totals.refundable_security.reduced_minor,r.totals.refundable_security.external_record_effect_minor,r.totals.refundable_security.record_balance_effect_minor],[20000,4000,1000,16000,15000]);assert.deepEqual(Object.keys(r.totals).sort(),['guest_folio','refundable_security']);
  assert.equal(r.rows.find(x=>x.ledger==='security_deposit'&&x.record.kind==='external_refund').classification.evidence_basis,null);assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);
 });
 await check('Whole-home source and empty-period read preserve absence and never fabricate financial zero books',async()=>{
  const p=await folioPost('external_payment',1000,'TEST home payment',null,homeStay,home);fixtures.home_absent=await reviewDetail(p.entry_id,homeStay,home);fixtures.home_reviewed_result=await reviewSave(reviewCommand(fixtures.home_absent,{method:'other',method_detail:'TEST cash-equivalent record',evidence_basis:'operator_report_only',evidence_reference:null}),randomUUID(),home);fixtures.home_report=await report(home);
  assert.equal(fixtures.home_report.property.operating_model,'whole_home');assert.equal(fixtures.home_report.totals.refundable_security.record_count,0);assert.equal((await detail(homeStay,home)).book,null);const after=await val('SELECT ($1::date+2)::text',[date]),end=await val('SELECT ($1::date+3)::text',[date]);fixtures.empty_report=await report(home,after,end);assert.equal(fixtures.empty_report.summary.row_count,0);assert.deepEqual(fixtures.empty_report.rows,[]);
 });
 await check('Current property-zone change never rewrites stored source/deposit recording context',async()=>{
  const depositBefore=await activity(),before=await inspect(()=>fingerprint(['folio_openings','folio_entries','security_deposit_books','security_deposit_events','security_deposit_requests',...metadataTables]));
  await val('SELECT public.irp_pms_pilot_configure_property($1,$2,$3,$4)',[tenant,property,'TEST changed report zone','Pacific/Kiritimati']);fixtures.changed_zone_report=await report(property,date,await val('SELECT ($1::date+3)::text',[date]));assert.equal(fixtures.changed_zone_report.property.time_zone,'Pacific/Kiritimati');assert.equal(fixtures.changed_zone_report.rows.find(x=>x.ledger==='security_deposit').record.recording_time_zone,'America/Chicago');assert.deepEqual((await activity()).rows,depositBefore.rows);assert.deepEqual(await inspect(()=>fingerprint(['folio_openings','folio_entries','security_deposit_books','security_deposit_events','security_deposit_requests',...metadataTables])),before);
  await val('SELECT public.irp_pms_pilot_configure_property($1,$2,$3,$4)',[tenant,property,'Deposit fixture','America/Chicago']);
 });
 await check('Recording intervals use independent DST boundaries and strict exclusive period limits',async()=>{
  const spring=await report(property,'2026-03-08','2026-03-09'),autumn=await report(property,'2026-11-01','2026-11-02');assert.equal((Date.parse(spring.period.end_at)-Date.parse(spring.period.start_at))/3600000,23);assert.equal((Date.parse(autumn.period.end_at)-Date.parse(autumn.period.start_at))/3600000,25);
  await fails(()=>report(property,date,date));await fails(()=>report(property,'infinity','infinity'));await fails(()=>report(property,'2026-01-01','2028-01-01'));
 });
 await check('Public APIs enforce current actor and role while source read exposure excludes guest/contact data',async()=>{
  await as(staff);const d=await reviewDetail();assert.equal(d.actor_id,staff);assert.equal(d.can_manage,false);const r=await report();assert.equal(r.actor_id,staff);assert.equal(r.role,'staff');assert.equal(r.can_manage,false);for(const row of r.rows){assert.equal(row.reservation.guest_name,undefined);assert.equal(row.reservation.contact,undefined);assert.equal(row.reservation.billing_party,undefined)}await fails(()=>reviewSave(reviewCommand(d)),'42501');assert.deepEqual(await reviewStatus(firstRequest),{found:false});
  await as(outsider);await fails(()=>reviewDetail(),'42501');await fails(()=>report(),'42501');await as(manager);
 });

 const boundsStart=checks.length,boundsEvidence={};
 // Trusted local paired fixtures, always rolled back. No integrity trigger is
 // disabled. Public save/reads are still the actual unmodified174 functions.
 await admin();await db.exec(`CREATE FUNCTION pg_temp.review174_seed(p_tenant uuid,p_property uuid,p_reservation uuid,p_entry uuid,p_actor uuid,p_count integer,p_reason text,p_evidence text) RETURNS integer LANGUAGE plpgsql AS $$
 DECLARE source irp_pms.folio_entries;event irp_pms.payment_record_reviews;request irp_pms.payment_record_review_requests;i integer;head irp_pms.payment_record_review_heads;
 BEGIN
 SELECT * INTO source FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_entry;
 SELECT * INTO head FROM irp_pms.payment_record_review_heads WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry;
 FOR i IN coalesce(head.version,0)+1..p_count LOOP
  event.tenant_id:=p_tenant;event.property_id:=p_property;event.reservation_id:=p_reservation;event.entry_id:=p_entry;event.id:=gen_random_uuid();event.request_id:=gen_random_uuid();event.actor_id:=p_actor;event.reviewed_at:=clock_timestamp();event.from_version:=i-1;event.to_version:=i;event.method:='card';event.evidence_basis:='external_record_reviewed';event.evidence_reference:=p_evidence;event.reason:=p_reason;event.source_snapshot:=irp_pms.payment_review_source(source);
  IF i=1 THEN INSERT INTO irp_pms.payment_record_review_heads VALUES(p_tenant,p_property,p_reservation,p_entry,1,event.id,p_actor,event.reviewed_at,event.reviewed_at);
  ELSE UPDATE irp_pms.payment_record_review_heads SET version=i,current_review_id=event.id,updated_at=event.reviewed_at WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND entry_id=p_entry;END IF;
  INSERT INTO irp_pms.payment_record_reviews SELECT event.*;
  request.tenant_id:=p_tenant;request.property_id:=p_property;request.reservation_id:=p_reservation;request.entry_id:=p_entry;request.request_id:=event.request_id;request.actor_id:=p_actor;request.outcome:='reviewed';request.review_id:=event.id;request.command:=irp_pms.payment_review_command(event);request.result:=irp_pms.payment_review_result(event);request.recorded_at:=event.reviewed_at;
  INSERT INTO irp_pms.payment_record_review_requests SELECT request.*;
 END LOOP;RETURN p_count;
 END $$;`);await as(manager);
 const seed=(entry,count,reason='TEST compact valid paired history',evidence='TEST paired evidence')=>val('SELECT pg_temp.review174_seed($1,$2,$3,$4,$5,$6,$7,$8)',[tenant,property,hotelStay,entry,manager,count,reason,evidence]);
 const historyBytes=entry=>val("SELECT octet_length(coalesce(jsonb_agg(irp_pms.payment_review_json(e) ORDER BY to_version),'[]'::jsonb)::text) FROM irp_pms.payment_record_reviews e WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3 AND entry_id=$4",[tenant,property,hotelStay,entry]);
 if(process.env.PAYMENT_REVIEW_BOUNDS_SECTION!=='report')await check('Prospective3MiB history gate rejects the next valid append while history receipt and retirement remain usable',async()=>{
  await transaction(async()=>{
   await as(manager);const payment=await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'external_payment',1,$5,$6,null)",[tenant,property,hotelStay,randomUUID(),'界'.repeat(200),'界'.repeat(500)]),entry=payment.entry_id;
   const longReason='界'.repeat(500),longEvidence='界'.repeat(200);await admin();await seed(entry,1,longReason,longEvidence);
   const one=await historyBytes(entry),n=Math.floor((3145728-500)/(one+6));assert.ok(n>100&&n<1000);await seed(entry,n,longReason,longEvidence);
   let bytes=await historyBytes(entry),version=n;
   while(bytes+one+16<3145728){await seed(entry,++version,longReason,longEvidence);bytes=await historyBytes(entry)}
   console.log('BOUND history seeded',version,bytes);await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');
   await as(manager);let d=await reviewDetail(entry),c=reviewCommand(d,{method:'card',evidence_reference:longEvidence,reason:longReason});assert.equal(d.version,version);assert.equal(d.reviews.length,version);
   // If the varying decimal revision widths leave one more valid slot, accept
   // that real public append before asserting the actual first rejection.
   const request=randomUUID();let rejected;
   await db.exec('SAVEPOINT near_boundary');try{await reviewSave(c,request);await db.exec('RELEASE SAVEPOINT near_boundary');d=await reviewDetail(entry);c=reviewCommand(d,{method:'card',evidence_reference:longEvidence,reason:longReason});}catch(e){rejected=e;await db.exec('ROLLBACK TO SAVEPOINT near_boundary;RELEASE SAVEPOINT near_boundary')}
   const before=await inspect(()=>fingerprint([...oldTables,...metadataTables]));if(rejected){assert.equal(rejected.code,'P0001');assert.match(rejected.message,/3MiB/)}else{const e=await rejectWithin(()=>reviewSave(c));assert.match(e.message,/3MiB/)}
   assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);const final=await reviewDetail(entry);assert.ok(Buffer.byteLength(JSON.stringify(final))<4194304);
   const first=await inspect(()=>val('SELECT result FROM irp_pms.payment_record_review_requests WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3 AND entry_id=$4 ORDER BY recorded_at LIMIT 1',[tenant,property,hotelStay,entry]));
   assert.deepEqual(await reviewStatus(first.request_id),{found:true,action:'save_payment_record_review',result:first});assert.deepEqual(await reviewSave(first.command,first.request_id),{...first,replayed:true});
   const stopped=await reviewRetire(c,randomUUID());assert.equal(stopped.outcome,'retired');assert.equal((await reviewDetail(entry)).version,final.version);
   await val('SELECT public.irp_pms_pilot_configure_property($1,$2,$3,$4)',[tenant,property,'界'.repeat(200),'America/Chicago']);assert.equal((await reviewDetail(entry)).property.name.length,200);
   boundsEvidence.history={accepted_versions:final.version,history_bytes:await inspect(()=>historyBytes(entry)),next_append_rejected:true,read_and_recovery_available:true};
   await admin();await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  });
 });
 if(process.env.PAYMENT_REVIEW_BOUNDS_SECTION!=='report')await check('Exactly1000 compact immutable reviews remain readable and replayable while new reviews reject at the version cap',async()=>{
  await transaction(async()=>{await as(manager);const p=await folioPost('external_payment',1,'TEST thousand review source');await admin();await seed(p.entry_id,1000);console.log('BOUND compact1000 seeded');await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');await as(manager);
   const d=await reviewDetail(p.entry_id);assert.equal(d.version,1000);assert.equal(d.reviews.length,1000);const before=await inspect(()=>fingerprint([...oldTables,...metadataTables]));const e=await rejectWithin(()=>reviewSave(reviewCommand(d)));assert.match(e.message,/1000 reviews/);assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);
   const r=await inspect(()=>val('SELECT result FROM irp_pms.payment_record_review_requests WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3 AND entry_id=$4 ORDER BY recorded_at LIMIT 1',[tenant,property,hotelStay,p.entry_id]));assert.deepEqual(await reviewSave(r.command,r.request_id),{...r,replayed:true});assert.equal((await reviewRetire(reviewCommand(d),randomUUID())).outcome,'retired');boundsEvidence.version_limit={accepted:1000,history_bytes:await inspect(()=>historyBytes(p.entry_id))};await admin();await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
  });
 });
 if(process.env.PAYMENT_REVIEW_BOUNDS_SECTION!=='history')await check('Exactly10000 combined folio/deposit records return completely while10001 rejects with no financial changes',async()=>{
  await transaction(async()=>{
   const existing=await report();const added=10000-existing.summary.row_count;assert.equal(existing.summary.security_deposit_row_count,3);
   const seedStarted=performance.now();await admin();await q("INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,actor_id) SELECT $1,$2,$3,gen_random_uuid(),'external_payment',1,'TEST174 row boundary '||i,'TEST rollback-only complete report rows',$4 FROM generate_series(1,$5::integer) i",[tenant,property,hotelStay,manager,added]);await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');await as(manager);const seedElapsed=performance.now()-seedStarted;
   console.log('BOUND report10000 seeded');const before=await inspect(()=>fingerprint([...oldTables,...metadataTables])),readStarted=performance.now(),r=await report(),readElapsed=performance.now()-readStarted;assert.equal(r.summary.row_count,10000);assert.equal(r.rows.length,10000);assert.equal(r.summary.security_deposit_row_count,3);assert.equal(r.summary.folio_row_count,9997);assert.equal(r.rows_truncated,false);assert.equal(r.totals.guest_folio.received_minor,existing.totals.guest_folio.received_minor+added);assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);
   await folioPost('external_payment',1,'TEST174 extra10001');const tooManyBefore=await inspect(()=>fingerprint([...oldTables,...metadataTables])),e=await rejectWithin(()=>report());assert.match(e.message,/10000 combined/);assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),tooManyBefore);boundsEvidence.combined_rows={accepted:10000,rejected:10001,client_json_bytes:Buffer.byteLength(JSON.stringify(r)),deposit_rows:3,fixture_build_and_constraints_ms:Math.round(seedElapsed),public_report_ms:Math.round(readElapsed),timing_scope:'Single local PGlite run, not hosted or production-load performance'};
  });
 });
 if(process.env.PAYMENT_REVIEW_BOUNDS_SECTION!=='history')await check('Report byte ceiling rejects a complete sub10000-row result that exceeds32MiB',async()=>{
  await transaction(async()=>{
   const seedStarted=performance.now();await q("INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,actor_id) SELECT $1,$2,$3,gen_random_uuid(),'external_payment',1,repeat('界',190)||lpad(i::text,10,'0'),repeat('界',500),$4 FROM generate_series(1,9000) i",[tenant,property,hotelStay,manager]);await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');await as(manager);const seedElapsed=performance.now()-seedStarted;
   console.log('BOUND below-byte-limit9007 seeded');const readStarted=performance.now(),positive=await val("WITH result AS MATERIALIZED(SELECT public.irp_pms_pilot_cashier_activity_report($1,$2,$3,$4) value) SELECT jsonb_build_object('bytes',octet_length(value::text),'rows',value->'summary'->'row_count') FROM result",[tenant,property,date,nextDate]),readElapsed=performance.now()-readStarted;assert.equal(positive.rows,9007);assert.ok(positive.bytes<33554432);assert.ok(positive.bytes+690*9000-16>33554432,'Enlarged fixture must provably cross the exact byte ceiling');
   await admin();await q("UPDATE irp_pms.folio_entries SET reference=replace(reference,'界','🧪'),reason=replace(reason,'界','🧪') WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3 AND reason=repeat('界',500)",[tenant,property,hotelStay]);await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');await as(manager);const before=await inspect(()=>fingerprint([...oldTables,...metadataTables]));console.log('BOUND above-byte-limit9007 seeded');const e=await rejectWithin(()=>report());assert.match(e.message,/32MiB/);assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);boundsEvidence.report_byte_limit={source_rows:9007,positive_sql_jsonb_bytes:positive.bytes,negative_minimum_expected_bytes:positive.bytes+690*9000-16,rejected_for:'32MiB',all_rows_unchanged:true,fixture_build_and_constraints_ms:Math.round(seedElapsed),positive_public_report_ms:Math.round(readElapsed),timing_scope:'Single local PGlite run, not hosted or production-load performance'};
  });
 });
 if(process.env.PAYMENT_REVIEW_BOUNDS_SECTION!=='history')await check('Report gross totals reject unsafe JSON integers even when opposing refunds leave a safe net',async()=>{
  await transaction(async()=>{
   // Trusted local numeric boundary fixture: individual valid record amounts,
   // deliberately beyond the ordinary per-folio public posting aggregate cap.
   await q("INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,actor_id) SELECT $1,$2,$3,gen_random_uuid(),'external_payment',999999999999,'TEST174 large receipt '||i,'TEST rollback-only gross overflow fixture',$4 FROM generate_series(1,9500) i",[tenant,property,hotelStay,manager]);
   await q("INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,target_entry_id,actor_id) SELECT tenant_id,property_id,reservation_id,gen_random_uuid(),'external_refund',amount_minor,'TEST174 opposing refund '||row_number() OVER(ORDER BY id),'TEST rollback-only offset does not conceal gross overflow',id,$4 FROM irp_pms.folio_entries WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3 AND reference LIKE 'TEST174 large receipt %' ORDER BY id LIMIT 493",[tenant,property,hotelStay,manager]);
   await db.exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED');const sums=(await q("SELECT sum(CASE WHEN kind='external_payment' THEN amount_minor ELSE 0 END)::text gross,sum(CASE WHEN kind='external_payment' THEN amount_minor ELSE -amount_minor END)::text net FROM irp_pms.folio_entries WHERE tenant_id=$1 AND property_id=$2 AND reservation_id=$3 AND (reference LIKE 'TEST174 large receipt %' OR reference LIKE 'TEST174 opposing refund %')",[tenant,property,hotelStay]))[0];assert.ok(BigInt(sums.gross)>9007199254740991n);assert.ok(BigInt(sums.net)<9007199254740991n);await as(manager);const before=await inspect(()=>fingerprint([...oldTables,...metadataTables]));console.log('BOUND unsafe gross10000 seeded');const e=await rejectWithin(()=>report());assert.match(e.message,/safe|exact|integer/i);assert.deepEqual(await inspect(()=>fingerprint([...oldTables,...metadataTables])),before);boundsEvidence.precision={...sums,source_rows:10000,rejected:true};
  });
 });
 if(process.env.PAYMENT_REVIEW_FIXTURE_PATH)await writeFile(process.env.PAYMENT_REVIEW_FIXTURE_PATH,JSON.stringify(fixtures,null,2)+'\n');
 const result={passed:true,check_count:checks.length,core_count:boundsStart,bounds_count:checks.length-boundsStart,checks,bounds:boundsEvidence,migration_sha256:createHash('sha256').update(migrationSQL).digest('hex'),scope:'Exact local174 public APIs plus rollback-only large valid paired storage fixtures with all deferred constraints forced. No hosted/native concurrency claim.'};
 if(process.env.PAYMENT_REVIEW_BOUNDS_RESULT_PATH)await writeFile(process.env.PAYMENT_REVIEW_BOUNDS_RESULT_PATH,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message,e.code??'',e.where??'',e.internalQuery??'',e.stack);process.exitCode=1}finally{await db.close()}
