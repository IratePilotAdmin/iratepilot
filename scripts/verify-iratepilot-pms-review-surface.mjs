import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const db=new PGlite();let passed=0;
const q=(s,p=[])=>db.query(s,p),v=async(s,p=[])=>Object.values((await q(s,p)).rows[0])[0];
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
async function as(user,role='authenticated'){await db.exec('RESET ROLE');await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('SET ROLE '+role)}
const rpc=(name,args=[])=>v('SELECT public.irp_pms_pilot_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);
const denied=(fn,pattern)=>assert.rejects(fn,pattern);
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 for(const name of ['202609070142_iratepilot_pms_tenant_foundation.sql','202609070143_iratepilot_pms_onboarding.sql','202609070144_iratepilot_pms_reservation_application.sql','202609070145_iratepilot_pms_inbound_events.sql','202609070146_iratepilot_pms_pilot_operations.sql','202609070147_iratepilot_pms_staff_management.sql','202609070150_iratepilot_pms_review_surface.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const owner=randomUUID(),other=randomUUID(),staff=randomUUID(),manager=randomUUID();
 await q("INSERT INTO auth.users VALUES($1,'owner@example.test',now()),($2,'other@example.test',now()),($3,'staff@example.test',now()),($4,'manager@example.test',now())",[owner,other,staff,manager]);
 await as(owner);const a=await rpc('bootstrap',[randomUUID(),'A organization','A hotel']),scope=[a.tenant_id,a.property_id];
 await rpc('save_member',[...scope,randomUUID(),'staff@example.test','staff']);await rpc('save_member',[...scope,randomUUID(),'manager@example.test','manager']);
 await rpc('configure_property',[...scope,'A hotel','Pacific/Kiritimati']);
 const type=await rpc('save_room_type',[...scope,null,'King',2]);
 await rpc('save_room',[...scope,null,type.id,'101']);await rpc('save_room',[...scope,null,type.id,'102']);
 await as(other);const b=await rpc('bootstrap',[randomUUID(),'B organization','B hotel']),scopeB=[b.tenant_id,b.property_id];
 await check('room type normalized name may repeat in another property',async()=>assert.equal((await rpc('save_room_type',[...scopeB,null,' king ',2])).name,'king'));
 await as(owner);
 await check('case and surrounding spaces cannot create a duplicate room type',async()=>{await denied(()=>rpc('save_room_type',[...scope,null,' KING ',2]),/unique constraint/);assert.equal((await rpc('workspace',scope)).room_types.length,1)});
 const queen=await rpc('save_room_type',[...scope,null,'Queen',2]);
 await check('renaming to another room type name is rejected atomically',async()=>{await denied(()=>rpc('save_room_type',[...scope,queen.id,'king',2]),/unique constraint/);assert.equal((await rpc('workspace',scope)).room_types.find(x=>x.id===queen.id).name,'Queen')});
 await check('saving an existing room type unchanged remains valid',async()=>assert.equal((await rpc('save_room_type',[...scope,type.id,'King',2])).id,type.id));
 const today=(await rpc('workspace',scope)).business_date;
 const dates=await v("SELECT jsonb_build_object('tomorrow',($1::date+1)::text,'yesterday',($1::date-1)::text)",[today]);
 const review=()=>rpc('review_events',scope);
 const reprocess=(event,request=randomUUID(),reference='Capacity checked and corrected')=>rpc('reprocess',[...scope,event,request,reference]);
 await check('empty review response carries the property business date',async()=>assert.deepEqual(await review(),{business_date:today,time_zone:'Pacific/Kiritimati',events:[]}));
 await as(null,'anon');await check('anonymous cannot list reviews or reprocess',async()=>{await denied(review,/permission denied/);await denied(()=>reprocess('anything'),/permission denied/)});
 await as(null,'service_role');await check('service role cannot use authenticated review wrappers',async()=>{await denied(review,/permission denied/);await denied(()=>reprocess('anything'),/permission denied/)});
 await as(staff);await check('ordinary member cannot list reviews or reprocess',async()=>{await denied(review,/Manager membership required/);await denied(()=>reprocess('anything'),/Manager membership required/)});
 await as(other);await check('owner of another organization cannot access reviews',async()=>{await denied(review,/Manager membership required/);await denied(()=>reprocess('anything'),/Manager membership required/)});
 await check('cross-tenant property pair is rejected',()=>denied(()=>rpc('review_events',[b.tenant_id,a.property_id]),/Property access denied/));
 const record=(booking,version=1,hash='a',arrival=today,departure=dates.tomorrow)=>({source_booking_id:booking,source_version:version,payload_hash:hash.repeat(64),status:'Confirmed',room_type_id:type.id,arrival,departure,guests:2,accommodation_minor:10000,taxes_minor:500,ota_fees_minor:0,guest_total_minor:10500});
 const receive=async(event,booking,version=1,hash='a',data=record(booking,version,hash))=>{await as(null,'service_role');const r=await v('SELECT irp_pms.receive_reservation($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[...scope,event,booking,version,hash.repeat(64),data===null?null:JSON.stringify(data),data===null?'Awaiting OTA approval':null]);await as(manager);return r};
 await receive('capacity-1','capacity');await receive('capacity-copy','capacity');
 await check('manager reads current capacity reviews and retained source fields',async()=>{const rows=(await review()).events;assert.equal(rows.length,2);for(const e of rows){assert.equal(e.is_current,true);assert.equal(e.can_reprocess,true);assert.equal(e.effective_outcome,'review:capacity_missing');assert.equal(e.normalized_record.guest_total_minor,10500);assert.equal(e.source_version,1);assert.equal(e.application_outcome,'review:capacity_missing');assert.equal(e.resolution_outcome,null)}});
 await receive('capacity-conflict','capacity',1,'b');
 await check('version conflicts cannot replace the current non-conflicting head',async()=>{const rows=(await review()).events;const e=rows.find(x=>x.event_id==='capacity-conflict');assert.equal(e.effective_outcome,'review:version_conflict');assert.equal(e.is_current,false);assert.equal(e.can_reprocess,false);assert.equal(rows.find(x=>x.event_id==='capacity-1').is_current,true)});
 await rpc('set_capacity',[...scope,type.id,today,dates.tomorrow,2]);
 const request=randomUUID();
 await check('manager wrapper applies a reviewed booking with business date',async()=>assert.deepEqual(await reprocess('capacity-1',request),{eventId:'capacity-1',requestId:request,applicationOutcome:'applied',business_date:today}));
 await check('effective outcomes resolve duplicate receipts without erasing history',async()=>{const rows=(await review()).events.filter(x=>x.event_id!=='capacity-conflict');for(const e of rows){assert.equal(e.application_outcome,'review:capacity_missing');assert.equal(e.resolution_outcome,'applied');assert.equal(e.effective_outcome,'applied');assert.ok(e.resolved_at);assert.equal(e.can_reprocess,false)}});
 await check('same request returns the original action without duplication',async()=>{assert.equal((await reprocess('capacity-1',request)).applicationOutcome,'applied');assert.equal(await v('SELECT count(*)::int FROM irp_pms.review_actions'),1)});
 await check('review request cannot mutate its reference',()=>denied(()=>reprocess('capacity-1',request,'A different corrected capacity'),/identity already used/));
 await as(owner);await check('another manager or owner cannot reuse an actors review receipt',()=>denied(()=>reprocess('capacity-1',request),/identity already used/));
 await receive('occupant','occupant');await receive('sold-out','sold-out');
 await check('current sold-out reviews remain actionable after the capacity is corrected',async()=>{const e=(await review()).events.find(x=>x.event_id==='sold-out');assert.equal(e.effective_outcome,'review:sold_out');assert.equal(e.is_current,true);assert.equal(e.can_reprocess,true)});
 await receive('stale-capacity','stale-capacity');await receive('newer-upstream','stale-capacity',2,'b',null);
 await check('newer source version makes earlier capacity receipt historical',async()=>{const rows=(await review()).events;assert.equal(rows.find(x=>x.event_id==='stale-capacity').is_current,false);assert.equal(rows.find(x=>x.event_id==='stale-capacity').can_reprocess,false);assert.equal(rows.find(x=>x.event_id==='newer-upstream').is_current,true);assert.equal(rows.find(x=>x.event_id==='newer-upstream').can_reprocess,false)});
 const staleRequest=randomUUID();
 await check('stale receipt cannot apply an obsolete reservation',async()=>{assert.equal((await reprocess('stale-capacity',staleRequest)).applicationOutcome,'stale');assert.equal((await rpc('workspace',scope)).reservations.some(x=>x.source_booking_id==='stale-capacity'),false);assert.equal((await review()).events.find(x=>x.event_id==='stale-capacity').effective_outcome,'stale')});
 await check('stale action retry preserves its original receipt',async()=>assert.equal((await reprocess('stale-capacity',staleRequest)).applicationOutcome,'stale'));
 await check('upstream review cannot be forced through capacity reprocessing',()=>denied(()=>reprocess('newer-upstream'),/new corrected source event/));
 await check('unknown event cannot create a review action',()=>denied(()=>reprocess('missing-event'),/Review event required/));
 await db.exec('RESET ROLE');
 // This historical capacity review represents a previously admitted source
 // receipt whose arrival date has passed before an operator resolves it.
 const pastRecord=record('past-review',1,'d',dates.yesterday,today);
 await q("INSERT INTO irp_pms.inbound_events(tenant_id,property_id,event_id,booking_id,source_version,payload_hash,application_outcome,normalized_record) VALUES($1,$2,'past-review','past-review',1,repeat('d',64),'review:capacity_missing',$3::jsonb)",[...scope,JSON.stringify(pastRecord)]);
 await as(manager);
 await check('past arrivals are disabled in the business-date-aware review surface',async()=>{const result=await review();assert.equal(result.business_date,today);assert.equal(result.events.find(x=>x.event_id==='past-review').can_reprocess,false)});
 await check('direct wrapper retry still enforces property-date admission',async()=>{assert.equal((await reprocess('past-review')).applicationOutcome,'review:past_arrival');assert.equal((await rpc('workspace',scope)).reservations.some(x=>x.source_booking_id==='past-review'),false)});
 await db.exec('RESET ROLE');
 // Head falls outside the newest100 receipts, proving classification is done
 // against the entire scoped history before applying the response bound.
 await q("INSERT INTO irp_pms.inbound_events(tenant_id,property_id,event_id,booking_id,source_version,payload_hash,application_outcome,received_at) VALUES($1,$2,'old-head','bounded-booking',9,repeat('f',64),'applied','2000-01-01')",scopeB);
 await q("INSERT INTO irp_pms.inbound_events(tenant_id,property_id,event_id,booking_id,source_version,payload_hash,application_outcome,received_at) SELECT $1,$2,'late-'||n,'bounded-booking',1,repeat('a',64),'stale','2001-01-01'::timestamptz+n*interval '1 second' FROM generate_series(1,101) n",scopeB);
 await as(other);
 await check('history is bounded100 with deterministic newest-first ordering',async()=>{const result=await rpc('review_events',scopeB);assert.equal(result.events.length,100);assert.equal(result.events[0].event_id,'late-101');assert.equal(result.events[99].event_id,'late-2')});
 await check('a source head outside the response limit still makes receipts stale',async()=>assert.ok((await rpc('review_events',scopeB)).events.every(x=>!x.is_current&&!x.can_reprocess)));
 await as(manager);
 await check('review list never leaks another propertys receipt rows',async()=>assert.equal((await review()).events.some(x=>x.booking_id==='bounded-booking'),false));
 await db.exec('RESET ROLE');await q('DELETE FROM irp_pms.memberships WHERE tenant_id=$1 AND user_id=$2',[a.tenant_id,manager]);await as(manager);
 await check('membership revocation immediately blocks listing and receipt replay',async()=>{await denied(review,/Manager membership required/);await denied(()=>reprocess('capacity-1',request),/Manager membership required/)});
 await db.exec('RESET ROLE');await db.exec('REVOKE EXECUTE ON FUNCTION irp_pms.reprocess_reservation(uuid,uuid,text,uuid,text) FROM authenticated');await as(owner);
 await check('private workflow shutdown cannot be bypassed through the public wrapper',()=>denied(()=>reprocess('sold-out'),/permission denied for function reprocess_reservation/));
 await db.exec('RESET ROLE');await db.exec(await readFile(new URL('../supabase/rollbacks/202609070150_iratepilot_pms_review_surface.rollback.sql',import.meta.url),'utf8'));await as(owner);
 await check('public surface shutdown blocks both wrappers and retains receipts',async()=>{await denied(review,/permission denied/);await denied(()=>reprocess('sold-out'),/permission denied/);assert.ok(await v('SELECT count(*)::int FROM irp_pms.inbound_events')>0)});
 await db.exec('RESET ROLE');await check('migration150 has no source or gateway migration dependency',async()=>{assert.equal(await v("SELECT to_regclass('public.irp_pms_outbox')::text"),null);assert.equal(await v("SELECT to_regclass('irp_pms.gateway_connections')::text"),null)});
 console.log(JSON.stringify({passed,failed:0,scope:'Local PostgreSQL review RPCs with auth stubs; no remote writes or production concurrency claim'}));
}finally{await db.close()}
