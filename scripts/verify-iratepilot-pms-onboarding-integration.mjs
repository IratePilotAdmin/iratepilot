import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {createOnboardingHandler} from '../services/hotel-suppliers/iratepilot-pms/onboarding-handler.mjs';
import {supabaseOnboardingAdapters} from '../services/hotel-suppliers/iratepilot-pms/supabase-onboarding.mjs';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const db=new PGlite();let passed=0;
const q=(sql,args=[])=>db.query(sql,args);async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const name of ['202609070142_iratepilot_pms_tenant_foundation.sql','202609070143_iratepilot_pms_onboarding.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const user='11111111-1111-1111-1111-111111111111',id='22222222-2222-2222-2222-222222222222';await q('INSERT INTO auth.users VALUES($1)',[user]);
 let authError=null,limited=false,seenToken;
 const authClient={auth:{getUser:async token=>{seenToken=token;return authError?{error:authError}:{data:{user:{id:user,email_confirmed_at:'2026-09-07T00:00:00Z'}}}}}};
 const adminClient={schema:schema=>{assert.equal(schema,'irp_pms');return {rpc:async(name,args)=>{assert.equal(name,'onboard_hotel');try{await db.exec('SET ROLE service_role');const result=await q('SELECT * FROM irp_pms.onboard_hotel($1,$2,$3,$4)',[args.p_request,args.p_owner,args.p_tenant_name,args.p_property_name]);return {data:result.rows,error:null}}catch(e){return {data:null,error:{code:e.code}}}finally{await db.exec('RESET ROLE')}}}}};
 const allowlist=[user];const adapters=supabaseOnboardingAdapters({authClient,adminClient,eligibleUserIds:allowlist,checkRateLimit:async()=>!limited});
 const handler=createOnboardingHandler(adapters);
 const req=(name='Pilot Group')=>new Request('https://pms.test/onboarding',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer integration-test-token'},body:JSON.stringify({requestId:id,organizationName:name,propertyName:'Pilot Hotel'})});
 let created;
 await check('handler creates actual PostgreSQL tenant with verified owner',async()=>{const r=await handler(req());assert.equal(r.status,200);created=await r.json();assert.equal(seenToken,'integration-test-token');assert.equal((await q('SELECT role FROM irp_pms.memberships WHERE tenant_id=$1 AND user_id=$2',[created.organizationId,user])).rows[0].role,'owner')});
 await check('HTTP retry returns same organization and property',async()=>{assert.deepEqual(await (await handler(req())).json(),created);assert.equal((await q('SELECT count(*)::int AS n FROM irp_pms.tenants')).rows[0].n,1)});
 await check('changed replay becomes HTTP conflict',async()=>assert.equal((await handler(req('Other Group'))).status,409));
 await check('identity rejection prevents database call',async()=>{authError={status:401};assert.equal((await handler(req())).status,401);authError=null});
 await check('identity outage becomes retryable unavailable',async()=>{authError={status:503};assert.equal((await handler(req())).status,503);authError=null});
 await check('rate limit denial prevents setup',async()=>{limited=true;assert.equal((await handler(req())).status,403);limited=false});
 await check('empty pilot allowlist denies setup',async()=>{const h=createOnboardingHandler(supabaseOnboardingAdapters({authClient,adminClient,eligibleUserIds:[],checkRateLimit:async()=>true}));assert.equal((await h(req())).status,403)});
 await check('client cannot mutate retained allowlist',async()=>{allowlist.length=0;assert.equal(await adapters.authorizeOnboarding(user),true)});
 console.log(JSON.stringify({passed,failed:0,scope:'Real local PostgreSQL onboarding; mocked Supabase Auth and SDK transport'}));
}finally{await db.close()}
