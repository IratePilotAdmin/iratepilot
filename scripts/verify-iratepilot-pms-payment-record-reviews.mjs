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
 if(process.env.PAYMENT_REVIEW_FIXTURE_PATH)await writeFile(process.env.PAYMENT_REVIEW_FIXTURE_PATH,JSON.stringify(fixtures,null,2)+'\n');
 const result={passed:true,check_count:checks.length,checks,migration_sha256:createHash('sha256').update(migrationSQL).digest('hex'),scope:'Exact local174 public metadata/recovery/report checks with fictional source records. No hosted/native concurrency claim. Separate bounds runner verifies history, row, byte and precision limits.'};
 if(process.env.PAYMENT_REVIEW_RESULT_PATH)await writeFile(process.env.PAYMENT_REVIEW_RESULT_PATH,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message,e.code??'',e.where??'',e.internalQuery??'',e.position??'');process.exitCode=1}finally{await db.close()}
