// Independent contract-driven guest-document checks. Local PGlite only.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST to local @electric-sql/pglite/dist');
const {PGlite}=await import(pathToFileURL(resolve(process.env.PGLITE_DIST,'index.js')));
const {pgcrypto}=await import(pathToFileURL(resolve(process.env.PGLITE_DIST,'contrib/pgcrypto.js')));
const baseline=resolve(process.env.GUEST_DOCUMENT_BASELINE_DIR||resolve(import.meta.dirname,'../supabase/migrations'));
const source=await readFile(process.env.GUEST_DOCUMENT_SQL||resolve(baseline,'202609070173_iratepilot_pms_guest_documents.sql'),'utf8');
const db=new PGlite({extensions:{pgcrypto}}),checks=[];
const q=async(s,a=[])=>(await db.query(s,a)).rows;
const val=async(s,a=[])=>Object.values((await q(s,a))[0])[0];
const check=async(n,f)=>{await f();checks.push(n);console.log('PASS',n)};
const fails=async(f,code='P0001')=>{let e;try{await f()}catch(x){e=x}assert.ok(e,'Expected rejection');if(code)assert.equal(e.code,code,e.message);return e};
let actor=null;
const admin=async()=>{await db.exec('RESET ROLE');actor=null};
const as=async(id)=>{await admin();await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('SET ROLE authenticated');actor=id};
const inspect=async(f)=>{const prior=actor;await admin();try{return await f()}finally{if(prior)await as(prior)}};
const snapshot=()=>inspect(async()=>{const result={};for(const r of await q("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('irp_pms','auth','supabase_migrations') ORDER BY schemaname,tablename"))result[r.schemaname+'.'+r.tablename]=await val(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM ${r.schemaname}."${r.tablename}" x`);return result});
const catalog=()=>q("SELECT p.oid::integer oid,n.nspname schema,n.nspname||'.'||p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proowner::integer owner,p.proacl::text acl,p.prosecdef definer,p.provolatile volatility,p.proconfig settings,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR (n.nspname='public' AND p.proname LIKE 'irp_pms%') ORDER BY p.oid");
const relations=()=>q("SELECT c.oid::integer oid,c.relname name,c.relowner::integer owner,c.relacl::text acl,c.relrowsecurity rls,c.relforcerowsecurity forced_rls,(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) FROM pg_policies p WHERE p.schemaname='irp_pms' AND p.tablename=c.relname) policies FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='irp_pms' AND c.relkind='r' ORDER BY c.oid");
const owner=randomUUID(),manager=randomUUID(),staff=randomUUID(),outsider=randomUUID(),tenant=randomUUID(),otherTenant=randomUUID(),property=randomUUID(),otherProperty=randomUUID(),type=randomUUID(),room=randomUUID(),stay=randomUUID(),unknown=randomUUID();
const document=(r=stay,p=property,t=tenant)=>val('SELECT public.irp_pms_pilot_guest_documents($1,$2,$3)',[t,p,r]);
const folio=(kind,amount,target=null)=>val('SELECT public.irp_pms_pilot_post_folio($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,property,stay,randomUUID(),kind,amount,'PRIVATE REFERENCE 173','PRIVATE REASON 173',target]);
const captureQuery=source.split('-- DOCUMENT173_CAPTURE_BEGIN')[1]?.split('-- DOCUMENT173_CAPTURE_END')[0]?.replace(/^[^\n]*\n/,'').replace(/\bINTO captured\b/,'').replace(/\bp_tenant\b/g,'$1').replace(/\bp_property\b/g,'$2').replace(/\bp_reservation\b/g,'$3');
const capture=(r=stay)=>inspect(()=>val(captureQuery,[tenant,property,r]));
const project=(c)=>inspect(()=>val('SELECT irp_pms.guest_document_projection($1,$2,$3,$4)',[c,owner,'owner','2026-09-08T04:30:00Z']));
const copy=structuredClone;
const keys=(v,w)=>assert.deepEqual(Object.keys(v).sort(),w.split(' ').sort());
const rejectCapture=async(base,mutate)=>{const c=copy(base);mutate(c);const before=await snapshot();await fails(()=>project(c),undefined);assert.deepEqual(await snapshot(),before)};
let day,end,baseCapture,unknownCapture,payment,charge;
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);");
 const installed=(await readdir(baseline)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171|172)_iratepilot_pms_/.test(n)).sort();assert.equal(installed.length,29);
 for(const f of installed){await db.exec(await readFile(resolve(baseline,f),'utf8'));await q('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2,ARRAY[]::text[])',[f.slice(0,12),f.slice(13,-4)])}
 for(const u of [owner,manager,staff,outsider])await q('INSERT INTO auth.users VALUES($1,$2,now())',[u,u+'@example.invalid']);
 for(const t of [tenant,otherTenant])await q("INSERT INTO irp_pms.tenants(id,name) VALUES($1,'Independent document fixtures')",[t]);
 for(const [t,u,r] of [[tenant,owner,'owner'],[tenant,manager,'manager'],[tenant,staff,'staff'],[otherTenant,outsider,'owner']])await q('INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,$3)',[t,u,r]);
 for(const [t,p] of [[tenant,property],[otherTenant,otherProperty]])await q("INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES($1,$2,'Fictional Guest Document Property','USD','America/Chicago')",[t,p]);
 await q("INSERT INTO irp_pms.room_types(tenant_id,property_id,id,name,max_guests) VALUES($1,$2,$3,'Fictional type',4)",[tenant,property,type]);
 await q("INSERT INTO irp_pms.rooms(tenant_id,property_id,id,room_type_id,label,housekeeping) VALUES($1,$2,$3,$4,'TEST 173','Clean')",[tenant,property,room,type]);
 day=await val("SELECT (clock_timestamp() AT TIME ZONE 'America/Chicago')::date::text");end=await val('SELECT ($1::date+2)::text',[day]);
 await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,hotel_fees_minor,ota_fees_minor,guest_total_minor,guest_name) VALUES($1,$2,$3,'direct','TEST-173',1,repeat('a',64),'Confirmed',$4,$5,$6,1,10000,1000,500,200,11700,'<Guest> =literal')",[tenant,property,stay,type,day,end]);
 await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status) VALUES($1,$2,$3,'iratepilot-ota','TEST-UNKNOWN-173',1,repeat('b',64),'Cancelled')",[tenant,property,unknown]);
 await check('Exact173 leaves all53 PMS tables plus auth and29 receipts unchanged and preserves every old catalog identity',async()=>{
  const rows=await snapshot(),old=await catalog(),rels=await relations();assert.equal(Object.keys(rows).filter(k=>k.startsWith('irp_pms.')).length,53);await db.exec(source);assert.deepEqual(await snapshot(),rows);assert.deepEqual(await relations(),rels);
  const current=await catalog();for(const r of old)assert.deepEqual(current.find(c=>c.oid===r.oid),r,r.name);
  const added=current.filter(c=>!old.some(r=>r.oid===c.oid));assert.equal(added.length,5);assert.equal(added.filter(c=>c.schema==='public').length,1);
  for(const r of added){assert.equal(r.anon,false);assert.equal(r.service,false);assert.equal(r.authenticated,r.schema==='public');assert.deepEqual(r.settings,['search_path=pg_catalog']);if(r.schema==='public')assert.equal(r.definer,true)}
 });await as(owner);
 await check('All current member roles read exact scope and unauthorized null removed foreign callers leave no rows',async()=>{
  const before=await snapshot();for(const [u,r] of [[owner,'owner'],[manager,'manager'],[staff,'staff']]){await as(u);const d=await document();assert.equal(d.role,r);assert.equal(d.actor_id,u);assert.equal(d.tenant_id,tenant);assert.equal(d.property_id,property);assert.equal(d.reservation_id,stay)}
  await as(outsider);await fails(()=>document(),'42501');await as(null);await fails(()=>document(),'42501');await as(owner);await fails(()=>document(null));await fails(()=>document(randomUUID()));await fails(()=>document(stay,otherProperty),'42501');await fails(()=>document(stay,property,otherTenant),'42501');
  await admin();for(const r of ['anon','service_role']){await db.exec('SET ROLE '+r);await fails(()=>document(),'42501');await admin()}
  await q('DELETE FROM irp_pms.memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,staff]);await as(staff);await fails(()=>document(),'42501');await admin();await q("INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES($1,$2,'staff')",[tenant,staff]);await as(owner);assert.deepEqual(await snapshot(),before);
 });
 await check('Known preview and sparse cancellation preserve absent contact account and deposit evidence without opening storage',async()=>{
  const before=await snapshot(),d=await document(),u=await document(unknown);assert.equal(d.account.opening_mode,'reservation_preview');assert.equal(d.account.opening.opened_at,null);assert.equal(d.account.opening.ota_fees_minor,200);assert.equal(d.account.opening.hotel_fees_minor,500);assert.equal(d.account.totals.balance_minor,11700);
  assert.equal(d.stay_guest.recorded,false);assert.equal(d.stay_guest.contact,null);assert.equal(d.security_deposit.recorded,false);assert.equal(d.security_deposit.totals,null);
  assert.equal(u.account.available,false);assert.equal(u.account.opening,null);assert.equal(u.account.totals,null);assert.deepEqual(u.account.entries,[]);assert.equal(u.reservation.current_charges.total_minor,null);assert.equal(u.reservation.arrival,null);assert.equal(u.reservation.nights,null);assert.equal(u.completeness.complete,true);assert.deepEqual(await snapshot(),before);
  baseCapture=await capture();unknownCapture=await capture(unknown);
 });
 await check('Saved contacts remain canonical and linked profile changes contribute only version metadata',async()=>{
  const profile=await val('SELECT public.irp_pms_pilot_save_guest_profile($1,$2,$3,NULL,NULL,$4)',[tenant,property,randomUUID(),{display_name:'<saved> =literal',email:'saved173@example.invalid',phone:'TEST 173 phone'}]);
  await val('SELECT public.irp_pms_pilot_save_reservation_guest($1,$2,$3,$4,0,$5,$6,NULL,$7,false)',[tenant,property,stay,randomUUID(),profile.guest_id,profile.version,{legal_name:'<billing> =literal',email:'billing173@example.invalid'}]);
  await val('SELECT public.irp_pms_pilot_save_guest_profile($1,$2,$3,$4,$5,$6)',[tenant,property,randomUUID(),profile.guest_id,profile.version,{display_name:'PRIVATE CURRENT PROFILE 173',email:'privatecurrent173@example.invalid'}]);
  const before=await snapshot(),d=await document();assert.equal(d.stay_guest.contact.display_name,'<saved> =literal');assert.equal(d.stay_guest.contact.email,'saved173@example.invalid');assert.equal(d.stay_guest.billing_party.email,'billing173@example.invalid');assert.equal(d.stay_guest.linked_profile_changed,true);assert.equal(d.stay_guest.copied_profile_version,1);assert.equal(d.stay_guest.linked_profile_current_version,2);assert.doesNotMatch(JSON.stringify(d),/PRIVATE CURRENT PROFILE|privatecurrent173/);
  keys(d.stay_guest.contact,'display_name legal_name email phone company_name address_line1 address_line2 city region postal_code country_code');keys(d.stay_guest.billing_party,'legal_name email phone company_name address_line1 address_line2 city region postal_code country_code');assert.deepEqual(await snapshot(),before);
 });
 await check('Every recorded folio kind uses fixed minimal labels signed effects and combined refund-correction arithmetic',async()=>{
  await folio('charge',1000);let d=await document();charge=d.account.entries.find(e=>e.kind==='charge').id;
  await folio('external_payment',13000);d=await document();payment=d.account.entries.find(e=>e.kind==='external_payment').id;
  await folio('external_refund',100,payment);await folio('payment_correction',100,payment);await folio('charge_reversal',200,charge);await folio('charge_reversal',300,null);
  d=await document();assert.equal(d.account.totals.charges_minor,12200);assert.equal(d.account.totals.paid_minor,12800);assert.equal(d.account.totals.balance_minor,-600);assert.equal(d.account.entries.length,6);assert.equal(d.account.opening_mode,'frozen');assert.equal(d.account.adjustments_itemized,false);
  for(const e of d.account.entries){keys(e,'id kind label amount_minor currency target_entry_id recorded_at charge_effect_minor payment_effect_minor balance_effect_minor');assert.equal(e.balance_effect_minor,e.charge_effect_minor-e.payment_effect_minor)}
  assert.doesNotMatch(JSON.stringify(d),/PRIVATE REFERENCE|PRIVATE REASON/);baseCapture=await capture();
 });
 await check('Frozen account survives independently unknown current scalars with explicit null-safe drift',async()=>{
  const c=copy(baseCapture);c.reservation.guest_total_minor=null;c.reservation.taxes_minor=null;let d=await project(c);assert.equal(d.reservation.current_charges.known,false);assert.equal(d.reservation.current_charges.total_minor,null);assert.equal(d.account.available,true);assert.equal(d.account.opening.total_minor,11700);assert.equal(d.account.totals.balance_minor,-600);assert.equal(d.account.reservation_amounts_changed,true);assert.equal(d.account.pricing_reconciliation_required,true);
  c.opening=null;c.entries=[];d=await project(c);assert.equal(d.account.available,false);assert.equal(d.account.totals,null);assert.equal(d.account.reservation_amounts_changed,false);
 });
 await check('Null-target opening waivers and noncausal timestamp ordering stay valid while target caps remain strict',async()=>{
  const c=copy(baseCapture);c.entries.reverse();const d=await project(c);assert.equal(d.account.totals.balance_minor,-600);assert.equal(d.account.entries[0].target_entry_id,null);
  await rejectCapture(baseCapture,x=>{x.entries.find(e=>e.kind==='charge_reversal'&&e.target_entry_id===null).amount_minor=11701});
  await rejectCapture(baseCapture,x=>{x.entries.find(e=>e.kind==='charge_reversal'&&e.target_entry_id).amount_minor=1001});
  await rejectCapture(baseCapture,x=>{x.entries.find(e=>e.kind==='external_refund').amount_minor=12901});
  await rejectCapture(baseCapture,x=>{x.entries.find(e=>e.kind==='external_refund').target_entry_id=randomUUID()});
  await rejectCapture(baseCapture,x=>{x.entries.find(e=>e.kind==='external_refund').target_entry_id=charge});
  await rejectCapture(baseCapture,x=>{x.entries.find(e=>e.kind==='charge').target_entry_id=payment});
  await rejectCapture(baseCapture,x=>{x.entries.push(copy(x.entries[0]))});
 });
 const item={version:1,mode:'configured',currency:'USD',arrival:day,departure:end,accommodation_minor:10000,taxes_minor:1000,hotel_fees_minor:500,ota_fees_minor:200,total_minor:11700,taxes:[{code:'state',label:'State tax',basis_points:1000,taxable_base_minor:10000,amount_minor:1000}],fees:[{code:'technology',label:'Technology fee',basis:'per_stay',unit_amount_minor:500,quantity:1,amount_minor:500,taxes:[]}],property_fees_version:1,operating_model_version:1};
 await check('Complete configured itemization respects optional166 metadata and never fills independently unknown scalar values',async()=>{
  const c=copy(baseCapture);c.reservation.charge_breakdown=copy(item);c.reservation.taxes_minor=null;c.reservation.guest_total_minor=null;const d=await project(c);assert.equal(d.reservation.current_charges.known,false);assert.equal(d.reservation.current_charges.taxes_minor,null);assert.equal(d.reservation.current_charges.itemization.taxes_minor,1000);assert.equal(d.account.reservation_amounts_changed,true);
  assert.equal('property_fees_version' in d.reservation.current_charges.itemization,false);assert.equal('operating_model_version' in d.reservation.current_charges.itemization,false);
  keys(d.reservation.current_charges.itemization,'schema_version mode currency arrival departure accommodation_minor taxes_minor hotel_fees_minor ota_fees_minor total_minor taxes fees fees_retained requires_reconciliation fee_basis_arrival fee_basis_departure');
 });
 await check('Malformed nonnull itemization fails wholly across missing money dates references fees and inconsistent tax bases',async()=>{
  const c=copy(baseCapture);c.reservation.charge_breakdown=copy(item);
  for(const mutate of [x=>delete x.reservation.charge_breakdown.total_minor,x=>x.reservation.charge_breakdown.total_minor=null,x=>x.reservation.charge_breakdown.arrival=null,x=>x.reservation.charge_breakdown.departure='infinity',x=>x.reservation.charge_breakdown.property_fees_version=0,x=>x.reservation.charge_breakdown.secret_guest_email='private',x=>x.reservation.charge_breakdown.fees[0].quantity=2,x=>x.reservation.charge_breakdown.fees[0].taxes=['bogus'],x=>x.reservation.charge_breakdown.taxes[0].taxable_base_minor=10500,x=>x.reservation.charge_breakdown.taxes[0].amount_minor=1001,x=>x.reservation.charge_breakdown.fees.push(copy(x.reservation.charge_breakdown.fees[0])),x=>x.reservation.charge_breakdown.taxes.push(copy(x.reservation.charge_breakdown.taxes[0]))])await rejectCapture(c,mutate);
 });
 await check('Adjusted fee evidence retains original quantity dates and aggregate taxes without inventing classification',async()=>{
  const c=copy(baseCapture),a=copy(item);a.mode='adjusted';a.fees_retained=true;a.requires_reconciliation=true;a.fee_basis_arrival=day;a.fee_basis_departure=end;a.fees[0].retained=true;a.taxes=[{code:'adjusted_total',label:'Adjusted tax total',basis_points:null,taxable_base_minor:null,amount_minor:1000}];c.reservation.charge_breakdown=a;
  const d=await project(c);assert.equal(d.account.opening_pricing_reconciliation_required,false);assert.equal(d.account.current_pricing_reconciliation_required,true);assert.equal(d.account.pricing_reconciliation_required,true);assert.equal(d.reservation.current_charges.itemization.taxes[0].basis_points,null);assert.equal(d.reservation.current_charges.itemization.fee_basis_departure,end);
  await rejectCapture(c,x=>x.reservation.charge_breakdown.taxes[0].basis_points=1000);await rejectCapture(c,x=>delete x.reservation.charge_breakdown.fees[0].retained);await rejectCapture(c,x=>x.reservation.charge_breakdown.fee_basis_departure=null);
 });
 await check('Malformed core amounts entries and saved parties reject instead of rendering partial or fabricated records',async()=>{
  for(const mutate of [x=>x.reservation.accommodation_minor=1.5,x=>x.reservation.accommodation_minor='10000',x=>x.reservation.guest_total_minor=1,x=>x.opening.total_minor=null,x=>x.entries=null,x=>x.opening=null,x=>x.entries[0].amount_minor=0,x=>x.entries[0].amount_minor=1000000000000,x=>x.entries[0].currency='EUR',x=>x.entries[0].created_at=null,x=>x.party.contact.private_note='secret',x=>x.party.guest_profile_version=null])await rejectCapture(baseCapture,mutate);
 });
 await check('Recorded room wording follows current occupancy only and legacy display controls normalize without mutating identities',async()=>{
  const c=copy(baseCapture);c.reservation.physical_room_id=room;c.room={id:room,label:'TEST 173'};c.reservation.source_booking_id='TEST\n173';c.reservation.guest_name='<Guest>\t=literal';c.reservation.status='Checked out';let d=await project(c);assert.equal(d.reservation.recorded_room.current_occupancy,false);assert.equal(d.reservation.text_normalized,true);assert.equal(d.reservation.booked_name,'<Guest> =literal');assert.equal(d.reservation.source_booking_id,'TEST 173');
  c.reservation.status='In house';d=await project(c);assert.equal(d.reservation.recorded_room.current_occupancy,true);await rejectCapture(c,x=>x.room.label='TEST\n173');await rejectCapture(c,x=>x.property.name='TEST\n173');await rejectCapture(c,x=>x.room=null);
 });
 await check('Security summary preserves frozen zone and independent held funds while account credit remains unchanged',async()=>{
  const review=await val('SELECT public.irp_pms_pilot_security_deposit($1,$2,$3)',[tenant,property,stay]);await val('SELECT public.irp_pms_pilot_record_security_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[tenant,property,stay,randomUUID(),review.version,review.recording_time_zone,review.recording_date,'external_receipt',2500,'cash','PRIVATE DEPOSIT REFERENCE','PRIVATE DEPOSIT REASON',null,true]);
  const d=await document();assert.equal(d.security_deposit.totals.held_minor,2500);assert.equal(d.account.totals.balance_minor,-600);assert.equal(d.security_deposit.applied_to_account,false);assert.doesNotMatch(JSON.stringify(d),/PRIVATE DEPOSIT/);
  const c=await capture();c.property.time_zone='Pacific/Honolulu';c.reservation.status='Cancelled';c.reservation.cancellation_disposition='no_show';const changed=await project(c);assert.equal(changed.property.time_zone,'Pacific/Honolulu');assert.equal(changed.security_deposit.recording_time_zone,'America/Chicago');assert.equal(changed.reservation.cancellation_kind,'no_show');assert.equal(changed.security_deposit.financial_review_required,true);assert.equal(changed.account.totals.balance_minor,-600);
  for(const mutate of [x=>x.deposit_book.held_minor=null,x=>x.deposit_book.held_minor=2499,x=>x.deposit_book.version=2,x=>x.deposit_events=[],x=>x.deposit_book=null,x=>x.deposit_events[0].currency='EUR',x=>x.deposit_events[0].amount_minor=0])await rejectCapture(c,mutate);
 });
 await check('Supported scalar safety and required full histories reject overlimit evidence without truncation',async()=>{
  for(const mutate of [x=>x.reservation.source_version=9007199254740992,x=>x.reservation.guests=0,x=>x.reservation.arrival='infinity',x=>x.reservation.checked_in_at='infinity',x=>x.entries=Array.from({length:1001},(_,i)=>({...x.entries[0],id:randomUUID()}))])await rejectCapture(baseCapture,mutate);
 });
 await check('Source has one post-lock relational capture and no persistent reads or writes after projection begins',async()=>{
  const pub=source.slice(source.indexOf('CREATE FUNCTION public.irp_pms_pilot_guest_documents'));
  assert.equal(pub.split('DOCUMENT173_CAPTURE_BEGIN').length,2);assert.equal(pub.split('DOCUMENT173_CAPTURE_END').length,2);
  const before=pub.split('-- DOCUMENT173_CAPTURE_BEGIN')[0];assert.match(before,/tenants WHERE id=p_tenant FOR SHARE;[\s\S]*properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;[\s\S]*member_role:=irp_pms\.pilot_require/);assert.match(before,/generated:=clock_timestamp\(\);\s*$/);
  assert.equal((captureQuery.match(/;/g)||[]).length,1);assert.equal((captureQuery.match(/SELECT jsonb_build_object\('property'/g)||[]).length,1);assert.doesNotMatch(captureQuery,/public\.irp_pms_pilot_/);
  const after=pub.split('-- DOCUMENT173_CAPTURE_END')[1].split('END $$;')[0];assert.doesNotMatch(after,/\b(?:FROM|JOIN|UPDATE|INSERT|DELETE)\s+irp_pms\./i);assert.match(after,/RETURN irp_pms\.guest_document_projection\(captured,auth\.uid\(\),member_role,generated\)/);
  const projection=source.split('CREATE FUNCTION irp_pms.guest_document_projection')[1].split('CREATE FUNCTION public.')[0];assert.doesNotMatch(projection,/\b(?:FROM|JOIN|UPDATE|INSERT|DELETE)\s+irp_pms\./i);assert.doesNotMatch(source,/\b(?:INSERT\s+INTO|UPDATE\s+irp_pms|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i);
 });
 await check('Final repeated owner manager staff public documents preserve every PMS auth and migration row',async()=>{
  const before=await snapshot();for(const a of [owner,manager,staff]){await as(a);for(const r of [stay,unknown]){const d=await document(r);assert.equal(d.completeness.complete,true);for(const [k,v]of Object.entries(d.semantics))if(k!=='document_mode')assert.equal(v,false,k)}}assert.deepEqual(await snapshot(),before);
 });
 const result={passed:true,check_count:checks.length,checks,migration_sha256:createHash('sha256').update(source).digest('hex'),baseline_migrations:29,preserved_pms_tables:53,scope:'Independent exact-source local PGlite and trusted captured-value fault injection; no hosted or native concurrency claim.'};
 if(process.env.GUEST_DOCUMENT_INDEPENDENT_RESULT)await writeFile(process.env.GUEST_DOCUMENT_INDEPENDENT_RESULT,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message,e.code??'',e.where??'',e.stack);process.exitCode=1}finally{await db.close()}
