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
 for(const f of (await readdir(dir)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171|172)_iratepilot_pms_/.test(n)).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
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

 const migrationSQL=await readFile(process.env.GUEST_DOCUMENT_SQL??new URL('202609070173_iratepilot_pms_guest_documents.sql',dir),'utf8');
 const document=(res=hotelStay,p=property)=>val('SELECT public.irp_pms_pilot_guest_documents($1,$2,$3)',[tenant,p,res]);
 const fixtures={};
 await check('Exact173 is additive with53 old tables and every existing row/function unchanged',async()=>{
  assert.equal(oldTables.length,53);await db.exec(migrationSQL);assert.deepEqual(await fingerprint(oldTables),oldData);
  const after=new Map((await catalog()).map(x=>[x.oid,x]));for(const row of oldCatalog)assert.deepEqual(after.get(row.oid),row,row.name);
  assert.equal((await q("SELECT count(*)::int n FROM pg_tables WHERE schemaname='irp_pms'"))[0].n,53);
 });await as(manager);
 await check('Known hotel frozen account and pure whole-home preview retain exact zero versus absent',async()=>{
  const before=await inspect(()=>fingerprint(oldTables));fixtures.hotel=await document();fixtures.home=await document(homeStay,home);
  assert.equal(fixtures.hotel.account.opening_mode,'frozen');assert.equal(fixtures.hotel.account.totals.balance_minor,50);assert.equal(fixtures.hotel.stay_guest.recorded,false);assert.equal(fixtures.hotel.stay_guest.contact,null);
  assert.equal(fixtures.home.account.opening_mode,'reservation_preview');assert.equal(fixtures.home.account.totals.balance_minor,0);assert.equal(fixtures.home.security_deposit.recorded,false);assert.equal(fixtures.home.security_deposit.totals,null);
  assert.deepEqual(await inspect(()=>fingerprint(oldTables)),before);
 });
 await check('Sparse unknown cancellation is complete with null account and no inferred guest/deposit',async()=>{
  fixtures.unknown=await document(unknownStay);assert.equal(fixtures.unknown.account.available,false);assert.equal(fixtures.unknown.account.totals,null);assert.equal(fixtures.unknown.account.opening,null);assert.equal(fixtures.unknown.reservation.current_charges.total_minor,null);assert.equal(fixtures.unknown.completeness.complete,true);assert.equal(fixtures.unknown.completeness.account_amounts_available,false);
 });
 await check('Saved stay contact stays independent from later profile change and bill-to is separate',async()=>{
  const profile=await val('SELECT public.irp_pms_pilot_save_guest_profile($1,$2,$3,NULL,NULL,$4)',[tenant,property,randomUUID(),{display_name:'TEST <Guest> =Contact',email:'stay@example.invalid',address_line1:'TEST original address'}]);
  await val('SELECT public.irp_pms_pilot_save_reservation_guest($1,$2,$3,$4,0,$5,$6,NULL,$7,false)',[tenant,property,hotelStay,randomUUID(),profile.guest_id,profile.version,{legal_name:'TEST Billing Party',company_name:'TEST Company',address_line1:'TEST billing address',email:'billing@example.invalid'}]);
  await val('SELECT public.irp_pms_pilot_save_guest_profile($1,$2,$3,$4,$5,$6)',[tenant,property,randomUUID(),profile.guest_id,profile.version,{display_name:'TEST current reusable name',email:'new@example.invalid'}]);
  fixtures.contact=await document();assert.equal(fixtures.contact.stay_guest.contact.email,'stay@example.invalid');assert.equal(fixtures.contact.stay_guest.billing_party.email,'billing@example.invalid');assert.equal(fixtures.contact.stay_guest.linked_profile_changed,true);assert.equal(fixtures.contact.stay_guest.copied_profile_version,1);assert.equal(fixtures.contact.stay_guest.linked_profile_current_version,2);
  assert.ok(!JSON.stringify(fixtures.contact).includes('new@example.invalid'));
 });
 await check('Every folio kind reconciles while internal references/reasons stay omitted',async()=>{
  await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'external_refund',10,'TEST internal refund reference','SECRET INTERNAL REASON',$5)",[tenant,property,hotelStay,randomUUID(),fixtures.hotel.account.entries.find(e=>e.kind==='external_payment').id]);
  await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'payment_correction',5,'TEST internal correction reference','SECRET INTERNAL REASON',$5)",[tenant,property,hotelStay,randomUUID(),fixtures.hotel.account.entries.find(e=>e.kind==='external_payment').id]);
  await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'charge_reversal',30,'TEST internal reversal reference','SECRET INTERNAL REASON',$5)",[tenant,property,hotelStay,randomUUID(),fixtures.hotel.account.entries.find(e=>e.kind==='charge').id]);
  fixtures.frozen=await document();assert.equal(fixtures.frozen.account.totals.balance_minor,35);assert.equal(fixtures.frozen.account.entries.length,5);assert.ok(fixtures.frozen.account.entries.every(e=>!('actor_id'in e)&&!('request_id'in e)&&!('reference'in e)&&!('reason'in e)));assert.ok(!JSON.stringify(fixtures.frozen).includes('SECRET INTERNAL REASON'));
 });
 await check('Separate positive then zero deposits never reduce the recorded guest account',async()=>{
  const c=command(await detail()),receipt=await post(c);let d=await document();assert.equal(d.security_deposit.totals.held_minor,10000);assert.equal(d.account.totals.balance_minor,35);fixtures.positive_deposit=d;
  await post(command(await detail(),'external_refund',10000,receipt.event.id,'card'));d=await document();assert.equal(d.security_deposit.recorded,true);assert.equal(d.security_deposit.totals.held_minor,0);assert.equal(d.security_deposit.version,2);assert.equal(d.account.totals.balance_minor,35);fixtures.zero_deposit=d;
 });
 await check('Current role access rejects anon/service/outsider and removed members without writes',async()=>{
  const before=await inspect(()=>fingerprint(oldTables));await as(staff);assert.equal((await document()).role,'staff');
  await as(outsider);await fails(()=>document(),'42501');await admin();
  for(const role of ['anon','service_role']){await db.exec('SET ROLE '+role);await fails(()=>document(),'42501');await admin();}
  await q('DELETE FROM irp_pms.memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,manager]);await as(manager);await fails(()=>document(),'42501');await admin();await q("INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,'manager')",[tenant,manager]);await as(manager);assert.deepEqual(await inspect(()=>fingerprint(oldTables)),before);
 });
 const taxConfig={taxes:{legacy:{enabled:false,basis_points:0},city:{enabled:true,basis_points:125},state:{enabled:true,basis_points:650},lodging:{enabled:true,basis_points:500}},fees:{resort:{enabled:true,amount_minor:2000,basis:'per_night',taxes:['city','state']},technology:{enabled:true,amount_minor:500,basis:'per_stay',taxes:[]}}};
 const quoted=async(p,rt,name,cleaning=false)=>{
  const start=await val('SELECT ($1::date+3)::text',[date]),end=await val('SELECT ($1::date+5)::text',[date]);
  if(cleaning){const fees=await val('SELECT public.irp_pms_pilot_property_fees($1,$2)',[tenant,p]);await val('SELECT public.irp_pms_pilot_save_property_fees($1,$2,$3,$4,$5)',[tenant,p,randomUUID(),fees.version,{enabled:true,amount_minor:1500,basis:'per_stay',taxes:['city','lodging']}]);}
  await val('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,1)',[tenant,p,rt,start,end]);
  const plan=await val('SELECT public.irp_pms_pilot_save_rate_plan_v2($1,$2,$3,NULL,NULL,$4,$5,$6,true)',[tenant,p,randomUUID(),rt,name,taxConfig]);
  await val('SELECT public.irp_pms_pilot_set_nightly_rate($1,$2,$3,$4,$5,$6,$7,10000)',[tenant,p,randomUUID(),plan.id,plan.version,start,end]);
  const quote=await val('SELECT public.irp_pms_pilot_quote_rate($1,$2,$3,$4,$5,$6,1)',[tenant,p,randomUUID(),plan.id,start,end]);
  const result=await val('SELECT public.irp_pms_pilot_book_quote($1,$2,$3,$4,$5)',[tenant,p,quote.id,randomUUID(),name]);return result.reservation??result;
 };
 let quotedHotel,quotedHome;
 await check('Actual configured hotel named taxes and fees reconcile without repricing',async()=>{
  quotedHotel=await quoted(property,type,'TEST Document quoted hotel');fixtures.hotel_configured=await document(quotedHotel.id);
  const item=fixtures.hotel_configured.account.opening.itemization;assert.equal(item.mode,'configured');assert.deepEqual(item.taxes.map(x=>x.code),['city','state','lodging']);assert.deepEqual(item.fees.map(x=>x.code),['resort','technology']);assert.equal(item.total_minor,quotedHotel.guest_total_minor);
 });
 await check('Actual whole-home Cleaning retains original dates on adjusted frozen and current pricing',async()=>{
  quotedHome=await quoted(home,homeType,'TEST Document quoted home',true);fixtures.home_cleaning=await document(quotedHome.id,home);
  assert.deepEqual(fixtures.home_cleaning.account.opening.itemization.fees.map(x=>x.code),['resort','technology','cleaning']);
  await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'external_payment',100,'TEST home freeze','TEST external evidence',null)",[tenant,home,quotedHome.id,randomUUID()]);
  const shorter=await val('SELECT ($1::date+1)::text',[quotedHome.arrival]);
  await val('SELECT public.irp_pms_pilot_amend_reservation($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11)',[tenant,home,quotedHome.id,randomUUID(),quotedHome.source_version,quotedHome.guest_name,homeType,quotedHome.arrival,shorter,quotedHome.accommodation_minor,quotedHome.taxes_minor]);
  fixtures.home_adjusted=await document(quotedHome.id,home);assert.equal(fixtures.home_adjusted.account.reservation_amounts_changed,true);assert.equal(fixtures.home_adjusted.account.current_pricing_reconciliation_required,true);assert.equal(fixtures.home_adjusted.account.opening_pricing_reconciliation_required,false);
  const item=fixtures.home_adjusted.reservation.current_charges.itemization;assert.equal(item.mode,'adjusted');assert.equal(item.fee_basis_departure,quotedHome.departure);assert.equal(item.fees.find(x=>x.code==='resort').quantity,2);assert.equal(item.taxes[0].basis_points,null);assert.equal(item.fees.every(x=>x.retained),true);
 });
 await check('Valid null-target opening reversals retain their independent original charge cap',async()=>{
  await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'charge_reversal',100,'TEST opening waiver','TEST original opening adjustment',null)",[tenant,property,quotedHotel.id,randomUUID()]);
  const d=await document(quotedHotel.id);assert.equal(d.account.entries[0].target_entry_id,null);assert.equal(d.account.totals.balance_minor,quotedHotel.guest_total_minor-100);fixtures.opening_waiver=d;
  await fails(()=>val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'charge_reversal',$5,'TEST excessive waiver','TEST original opening adjustment',null)",[tenant,property,quotedHotel.id,randomUUID(),quotedHotel.guest_total_minor-99]),'P0001');
 });
 await check('Unknown account with explicit deposit retains independent known financial evidence',async()=>{
  const receipt=await post(command(await detail(unknownStay),'external_receipt',2500));
  fixtures.unknown_with_deposit=await document(unknownStay);assert.equal(fixtures.unknown_with_deposit.account.available,false);assert.equal(fixtures.unknown_with_deposit.account.totals,null);assert.equal(fixtures.unknown_with_deposit.security_deposit.totals.held_minor,2500);assert.equal(fixtures.unknown_with_deposit.security_deposit.financial_review_required,true);assert.equal(receipt.book.version,1);
 });
 await check('A genuine overpayment remains a negative recorded credit without security netting',async()=>{
  await val("SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,'external_payment',100,'TEST additional external payment','TEST credit evidence',null)",[tenant,property,hotelStay,randomUUID()]);
  fixtures.credit=await document();assert.equal(fixtures.credit.account.totals.balance_minor,-65);assert.equal(fixtures.credit.security_deposit.totals.held_minor,0);
 });
 await check('Repeated prepared snapshots and all source views remain pure after full fixture setup',async()=>{
  const before=await inspect(()=>fingerprint(oldTables));for(const [r,p] of [[hotelStay,property],[unknownStay,property],[quotedHotel.id,property],[homeStay,home],[quotedHome.id,home]]){const a=await document(r,p),b=await document(r,p);assert.deepEqual(a.account,b.account);assert.deepEqual(a.stay_guest,b.stay_guest);assert.deepEqual(a.security_deposit,b.security_deposit);}
  assert.deepEqual(await inspect(()=>fingerprint(oldTables)),before);
 });
 if(process.env.GUEST_DOCUMENT_FIXTURE_PATH)await writeFile(process.env.GUEST_DOCUMENT_FIXTURE_PATH,JSON.stringify(fixtures,null,2)+'\n');
 await check('Exactly1000 complete folio rows are returned and1001 rejects without truncation or writes',async()=>{
  await transaction(async()=>{
   await q("INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,actor_id) SELECT $1,$2,$3,gen_random_uuid(),'charge',1,'TEST full document history','TEST bounded scratch history',$4 FROM generate_series(1,999)",[tenant,property,quotedHotel.id,manager]);await as(manager);
   const before=await inspect(()=>fingerprint(oldTables)),d=await document(quotedHotel.id);assert.equal(d.account.entries.length,1000);assert.equal(d.completeness.folio_entry_count,1000);assert.equal(d.account.totals.additional_minor,999);assert.deepEqual(await inspect(()=>fingerprint(oldTables)),before);
   await admin();await q("INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,actor_id) VALUES($1,$2,$3,gen_random_uuid(),'charge',1,'TEST excessive history','TEST bounded scratch history',$4)",[tenant,property,quotedHotel.id,manager]);await as(manager);await rejectWithin(()=>document(quotedHotel.id));
  });
 });
 const result={status:'PASS',check_count:checks.length,checks,migration_sha256:createHash('sha256').update(migrationSQL).digest('hex'),scope:'Local exact173 synthetic functional checks; no hosted or native concurrency claim.'};
 if(process.env.GUEST_DOCUMENT_RESULT_PATH)await writeFile(process.env.GUEST_DOCUMENT_RESULT_PATH,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message,error.code??'',error.where??'',error.internalQuery??'',error.position??'',error.internalPosition??'');process.exitCode=1}finally{await db.close()}
