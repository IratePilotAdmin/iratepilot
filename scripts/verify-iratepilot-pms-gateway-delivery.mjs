import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const {sendGatewayEvent}=await import(pathToFileURL(process.env.PMS_BRIDGE_DIR+'/gateway-delivery.mjs'));
const db=new PGlite({extensions:{pgcrypto}});let server;let passed=0;let loseReply=false;
const q=(s,p=[])=>db.query(s,p),v=async(s,p=[])=>Object.values((await q(s,p)).rows[0])[0];
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 for(const name of ['202609070142_iratepilot_pms_tenant_foundation.sql','202609070143_iratepilot_pms_onboarding.sql','202609070144_iratepilot_pms_reservation_application.sql','202609070145_iratepilot_pms_inbound_events.sql','202609070146_iratepilot_pms_pilot_operations.sql','202609070147_iratepilot_pms_staff_management.sql','202609070149_iratepilot_pms_signed_gateway.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const owner=randomUUID();await q("INSERT INTO auth.users VALUES($1,'operator@example.test',now())",[owner]);
 await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('SET ROLE authenticated');
 const hotel=await v("SELECT public.irp_pms_pilot_bootstrap($1,'Gateway hotel group','Gateway hotel')",[randomUUID()]);
 const scope=[hotel.tenant_id,hotel.property_id];
 const roomType=await v("SELECT public.irp_pms_pilot_save_room_type($1,$2,NULL,'King',2)",scope);
 for(const label of ['101','102'])await v('SELECT public.irp_pms_pilot_save_room($1,$2,NULL,$3,$4)',[...scope,roomType.id,label]);
 const today=(await v('SELECT public.irp_pms_pilot_workspace($1,$2)',scope)).business_date;
 const end=await v('SELECT ($1::date+2)::text',[today]);
 await v('SELECT public.irp_pms_pilot_set_capacity($1,$2,$3,$4,$5,2)',[...scope,roomType.id,today,end]);
 const connection={id:'loopback-gateway',secret:'private-signing-key-for-tests-'.repeat(3)};
 await v('SELECT public.irp_pms_pilot_save_connection($1,$2,$3,$4,$5,$6::jsonb,$7)',[...scope,connection.id,'ota-property','iratepilot-pms',JSON.stringify({'ota-room':roomType.id}),connection.secret]);
 await v('SELECT public.irp_pms_pilot_enable_connection($1,$2,$3,true)',[...scope,connection.id]);
 await db.exec('RESET ROLE');await q("SELECT set_config('request.jwt.claim.sub','',false)");await db.exec('SET ROLE anon');
 const publishableKey='sb_publishable_'+'p'.repeat(32);
 // A real loopback HTTP interface models PostgREST's JSON RPC contract while
 // invoking the actual PostgreSQL gateway as anon. It does not emulate or claim
 // to test Supabase project-key validation; this fixture key check is explicit.
 server=createServer(async(req,res)=>{
  if(req.url!=='/rest/v1/rpc/irp_pms_ota_gateway'||req.method!=='POST'){res.writeHead(404);res.end();return}
  if(req.headers.apikey!==publishableKey){res.writeHead(401);res.end();return}
  try{
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>512*1024)throw Error('Oversize RPC request');chunks.push(chunk)}
   const args=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
   assert.equal(req.headers.authorization,undefined);
   const result=await v('SELECT public.irp_pms_ota_gateway($1,$2,$3,$4)',[args.p_raw_body,args.p_connection,args.p_timestamp,args.p_signature]);
   if(loseReply){loseReply=false;res.destroy();return}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
  }catch{res.writeHead(500);res.end()}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const port=server.address().port;
 const event=(id='gateway-booking',version=1,status='confirmed')=>({eventId:id+'-'+version,sourceVersion:version,booking:{id,property_id:'ota-property',room_id:'ota-room',confirmation_code:'CONF-'+id,customer_id:null,check_in:today,check_out:end,guests:2,subtotal:'100.00',taxes:'10.00',fees:'0.00',total:'110.00',status}});
 const send=(data=event(),extra={})=>sendGatewayEvent({endpoint:'https://project.supabase.co/rest/v1/rpc/irp_pms_ota_gateway',publishableKey,connection,event:data,fetcher:(_url,options)=>fetch(`http://127.0.0.1:${port}/rest/v1/rpc/irp_pms_ota_gateway`,options),...extra});
 await check('real HTTP wrapper and HMAC apply a PostgreSQL reservation',async()=>assert.deepEqual(await send(),{outcome:'acknowledged',receiverOutcome:'reservation-staged'}));
 await check('HTTP retry acknowledges duplicate without applying twice',async()=>assert.equal((await send()).receiverOutcome,'duplicate'));
 await check('lost HTTP acknowledgement recovers through the same PostgreSQL receipt',async()=>{loseReply=true;assert.equal((await send(event('lost-ack'))).outcome,'retry');assert.equal((await send(event('lost-ack'))).receiverOutcome,'duplicate')});
 await check('gateway signature rejection reaches source review',async()=>assert.deepEqual(await send(event('wrong-key'),{connection:{...connection,secret:'wrong-secret-'.repeat(5)}}),{outcome:'review-required',reason:'http_401'}));
 await check('mapping errors reach source review instead of acknowledgement',async()=>{const e=event('unmapped');e.booking.room_id='unknown';assert.deepEqual(await send(e),{outcome:'review-required',reason:'http_422'})});
 await check('capacity rejection is an acknowledged durable destination review',async()=>assert.equal((await send(event('sold-out'))).receiverOutcome,'review-required'));
 await check('pending receipt and stale version use normal sender acknowledgements',async()=>{assert.equal((await send(event('pending',3,'pending'))).receiverOutcome,'review-required');assert.equal((await send(event('pending',2))).receiverOutcome,'stale')});
 await check('sparse cancellation applies through the RPC transport',async()=>assert.equal((await send({eventId:'gateway-booking-2',sourceVersion:2,booking:{id:'gateway-booking',property_id:'ota-property',status:'cancelled'}})).receiverOutcome,'cancellation-staged'));
 await check('invalid project key is a transport authentication review',async()=>assert.equal((await send(event('project-key'),{publishableKey:'sb_publishable_'+'x'.repeat(32)})).reason,'http_401'));
 await db.exec('RESET ROLE');
 await check('database retains one cancelled stay and one duplicate-safe active stay',async()=>{assert.equal(await v("SELECT count(*)::int FROM irp_pms.reservations WHERE source_booking_id='lost-ack'"),1);assert.equal(await v("SELECT guest_total_minor::int FROM irp_pms.reservations WHERE source_booking_id='gateway-booking' AND status='Cancelled'"),11000);assert.equal(await v("SELECT count(*)::int FROM irp_pms.reservations WHERE source_booking_id IN('wrong-key','unmapped','sold-out','pending','project-key')"),0)});
 console.log(JSON.stringify({passed,failed:0,scope:'Node sender + real loopback HTTP RPC wrapper + PostgreSQL pgcrypto gateway; no live Supabase project key or remote mutation'}));
}finally{if(server)await new Promise(resolve=>server.close(resolve));await db.close()}
