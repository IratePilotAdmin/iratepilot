import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {runPostgresPmsOutboxOnce} from '../services/hotel-suppliers/iratepilot-pms/outbox-worker.mjs';
if(!process.env.PGLITE_DIST||!process.env.PMS_BRIDGE_DIR)throw Error('Set PGLITE_DIST and PMS_BRIDGE_DIR to local dependency and bridge paths.');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {uuid_ossp}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/uuid_ossp.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const {InboxStore,createReceiver,sendEvent}=await import(pathToFileURL(process.env.PMS_BRIDGE_DIR+'/delivery.mjs'));
const {httpReceiver}=await import(pathToFileURL(process.env.PMS_BRIDGE_DIR+'/http-server.mjs'));
const root=new URL('../',import.meta.url),db=new PGlite({extensions:{uuid_ossp,pgcrypto}}),inbox=new InboxStore(':memory:');
let server,checks=0;
const q=(s,p=[])=>db.query(s,p),v=async(s,p=[])=>Object.values((await q(s,p)).rows[0])[0];
async function check(name,fn){await fn();checks++;console.log('PASS '+name)}
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;`);
 const schema=await readFile(new URL('supabase/schema.sql',root),'utf8');
 const boundary=schema.indexOf('create unique index one_open_booking_per_stay');assert.ok(boundary>0);
 // Historical active-property fixture is inserted before installation of publication guards.
 // Every schema statement is then applied unchanged; all behavioral tests run with guards enabled.
 await db.exec(schema.slice(0,boundary));
 const user=await v("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(gen_random_uuid(),'sandbox@example.test',now()) RETURNING id");
 await q("INSERT INTO profiles(id,role) VALUES($1,'partner') ON CONFLICT(id) DO NOTHING",[user]);
 const partner=await v("INSERT INTO partners(owner_id,business_name,status) VALUES($1,'Sandbox hotel','approved') RETURNING id",[user]);
 const property=await v("INSERT INTO properties(partner_id,name,slug,type,city,country,active) VALUES($1,'Sandbox','pms-sandbox','hotel','Austin','US',true) RETURNING id",[partner]);
 const room=await v("INSERT INTO rooms(property_id,name,base_rate) VALUES($1,'King',200) RETURNING id",[property]);
 const booking=await v("INSERT INTO bookings(confirmation_code,customer_id,property_id,room_id,check_in,check_out,guests,subtotal,total) VALUES('SANDBOX-001',$1,$2,$3,'2026-10-01','2026-10-03',2,400,400) RETURNING id",[user,property,room]);
 await check('complete consolidated schema and new outbox install together',async()=>{await db.exec(schema.slice(boundary));await db.exec(await readFile(new URL('supabase/migrations/202609070139_iratepilot_pms_transactional_outbox.sql',root),'utf8'))});
 await check('booking messaging and security correction install on consolidated baseline',async()=>{
  for(const file of ['202608020024_booking_messages.sql','202609120220_booking_message_authorization.sql'])await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
  await db.exec(await readFile(new URL('supabase/verify/20260912_guest_api_security.sql',root),'utf8'));
 });
 await check('authenticated guest messaging works and unrelated user is denied on real schema',async()=>{
  const outsider=await v("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(gen_random_uuid(),'outsider@example.test',now()) RETURNING id");
  await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.exec('SET ROLE authenticated');
  try {assert.equal(await v("SELECT (public.send_booking_message($1,'Schema rehearsal')).body",[booking]),'Schema rehearsal');}
  finally {await db.exec('RESET ROLE');}
  const count=await v('SELECT count(*)::int FROM booking_messages');
  await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[outsider]);
  await db.exec('SET ROLE authenticated');
  try {await assert.rejects(()=>q("SELECT public.send_booking_message($1,'Denied rehearsal')",[booking]),/Not authorized/);}
  finally {await db.exec('RESET ROLE');}
  assert.equal(await v('SELECT count(*)::int FROM booking_messages'),count);
  await q("SELECT set_config('request.jwt.claim.sub','',false)");
 });
 const connection={id:'sandbox',tenantId:'tenant-1',propertyId:'pms-1',otaPropertyId:property,currency:'USD',inventoryAuthority:'iratepilot-pms',roomTypes:{[room]:'king'},secret:randomBytes(32).toString('hex'),endpoint:'https://sandbox.example.test/v1/ota/events'};
 await q("INSERT INTO irp_pms_outbox_connections(property_id,connection_id,tenant_id,pms_property_id,enabled) VALUES($1,'sandbox','tenant-1','pms-1',true)",[property]);
 await q('UPDATE bookings SET subtotal=410,total=410 WHERE id=$1',[booking]);
 await check('historical pending booking change is captured with existing guards enabled',async()=>{assert.equal(await v('SELECT count(*)::int FROM irp_pms_outbox'),1)});
 await check('existing approval barrier remains enforced and produces no false event',async()=>{await assert.rejects(()=>q("UPDATE bookings SET status='confirmed' WHERE id=$1",[booking]),/approval is disabled/);assert.equal(await v('SELECT count(*)::int FROM irp_pms_outbox'),1)});
 server=httpReceiver(createReceiver({store:inbox,connections:[connection]}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const rpc=async(name,args)=>{try{await db.exec('SET ROLE service_role');const r=name==='irp_pms_claim_event'?await q('SELECT * FROM irp_pms_claim_event()'):await q('SELECT irp_pms_finish_event($1,$2,$3,$4) AS result',[args.p_event,args.p_lease,args.p_outcome,args.p_code]);return {data:name==='irp_pms_claim_event'?r.rows:r.rows[0].result,error:null}}catch(e){return {data:null,error:e.message}}finally{await db.exec('RESET ROLE')}};
 const send=args=>sendEvent({...args,fetcher:(_url,init)=>fetch(`http://127.0.0.1:${server.address().port}/v1/ota/events`,init)});
 const worker=()=>runPostgresPmsOutboxOnce({rpc,resolveConnection:async()=>connection,send});
 await check('PostgreSQL worker delivers signed pending event to actual local HTTP receiver',async()=>{const result=await worker();assert.equal(result.outcome,'acknowledged');assert.equal(result.receiverOutcome,'review-required');assert.equal(inbox.count(),1);assert.equal(await v('SELECT state FROM irp_pms_outbox'),'delivered')});
 await check('cancellation flows through existing triggers and worker',async()=>{await q("UPDATE bookings SET status='cancelled' WHERE id=$1",[booking]);assert.equal((await worker()).outcome,'acknowledged');assert.equal(inbox.inspect(connection,booking).status,'cancellation-staged');assert.equal(await v('SELECT count(*)::int FROM booking_status_history WHERE booking_id=$1',[booking]),1)});
 await check('drained queue returns idle',async()=>assert.equal((await worker()).outcome,'idle'));
 await check('worker rejects wrong configured tenant before sending',async()=>{await q("UPDATE bookings SET cancellation_reason='changed',total=410,fees=10 WHERE id=$1",[booking]);let sent=false;const r=await runPostgresPmsOutboxOnce({rpc,resolveConnection:async()=>({...connection,tenantId:'other'}),send:async()=>{sent=true;throw Error('should not send')}});assert.equal(r.outcome,'review-required');assert.equal(sent,false);assert.equal(await v('SELECT state FROM irp_pms_outbox ORDER BY source_version DESC LIMIT 1'),'review')});
 console.log(JSON.stringify({passed:checks,failed:0,baseline:'complete consolidated schema.sql + outbox migration',scope:'local PGlite and loopback HTTP; Supabase auth stubs; no live activation'}));
}catch(e){console.error(JSON.stringify({error:e.message,where:e.where}));process.exitCode=1;}finally{if(server)await new Promise(r=>server.close(r));inbox.close();await db.close()}
