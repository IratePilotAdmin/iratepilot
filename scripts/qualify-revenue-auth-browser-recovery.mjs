import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {prepareManifest,requireCredentials} from './revenue-http-qualification-preflight.mjs';

const root=resolve(import.meta.dirname,'..');
const require=createRequire(resolve(import.meta.dirname,'revenue-browser-tools/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const built=await build({entryPoints:[resolve(import.meta.dirname,'revenue-auth-browser-recovery.fixture.ts')],bundle:true,write:false,platform:'browser',format:'iife'});
// Build-only checks never read credentials, open a browser or contact a database.
if(process.argv[2]==='--build-only'){console.log('Authenticated browser qualification bundle built');process.exit(0);}
if(process.env.IRP_RUN_AUTH_BROWSER_RECOVERY!=='1')throw Error('Explicit authenticated browser qualification opt-in required');
requireCredentials(process.env);
if(!process.env.IRP_HTTP_QUALIFICATION_CONFIG)throw Error('Protected isolated manifest required');
const config=prepareManifest(await readFile(process.env.IRP_HTTP_QUALIFICATION_CONFIG,'utf8'));
if(config.branch.project_ref!=='ybehrayzwzyufxbxcysq'||config.branch.name!=='revenue-auth-20261001')throw Error('Pinned isolated branch required');
const credentials=Object.fromEntries(['owner','manager','staff'].map(role=>[role,{email:process.env[`IRP_HTTP_TEST_${role.toUpperCase()}_EMAIL`],password:process.env[`IRP_HTTP_TEST_${role.toUpperCase()}_PASSWORD`]}]));
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const part=type=>Number(parts.find(value=>value.type===type)?.value);
const day=new Date(Date.UTC(part('year'),part('month')-1,part('day')+1)).toISOString().slice(0,10);
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><title>Isolated authenticated recovery qualification</title></head><body><h1>Candidate recovery controller</h1><p>Isolated synthetic property only. This is not the deployed PMS interface.</p><script src="/fixture.js"></script></body></html>');return;}
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text);return;}
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,api=`https://${config.branch.project_ref}.supabase.co`;
let browser,context,applyRequests=0;const cases=[],blocked=[],pages=[];
async function check(name,work){await work();cases.push(name);console.log(`PASS ${name}`);}
async function run(page,method,...args){return page.evaluate(async({method,args})=>{
 try{return {ok:true,value:await window.qualification[method](...args)};}catch{return {ok:false};}
},{method,args});}
async function initialize(page){await page.waitForSelector('body[data-ready="true"]');assert.equal((await run(page,'initialize',config,day,credentials)).ok,true,'Browser authentication failed');}
try{
 browser=await chromium.launch({headless:true});context=await browser.newContext();
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(url.origin===origin&&method==='GET'&&['/','/fixture.js','/favicon.ico'].includes(url.pathname))return route.continue();
  const auth=url.origin===api&&((url.pathname==='/auth/v1/token'&&url.search==='?grant_type=password'&&method==='POST')
   ||(url.pathname==='/auth/v1/user'&&method==='GET')||(url.pathname==='/auth/v1/logout'&&url.search==='?scope=local'&&method==='POST'));
  const rpc=url.origin===api&&method==='POST'&&['/rest/v1/rpc/irp_pms_pilot_apply_revenue_decision','/rest/v1/rpc/irp_pms_pilot_revenue_decision_status'].includes(url.pathname);
  // Preflights are browser-generated; actual requests still pass the method/path checks above.
  if(url.origin===api&&method==='OPTIONS'&&['/auth/v1/token','/auth/v1/user','/auth/v1/logout','/rest/v1/rpc/irp_pms_pilot_apply_revenue_decision','/rest/v1/rpc/irp_pms_pilot_revenue_decision_status'].includes(url.pathname))return route.continue();
  if(auth)return route.continue();
  if(rpc){
   let body;try{body=request.postDataJSON();}catch{blocked.push('invalid RPC');return route.abort();}
   if(body.p_tenant!==config.tenantId||body.p_property!=='00000000-0000-4000-8000-000000000030'||body.p_request!=='00000000-0000-4000-8000-000000000020'){blocked.push('out-of-scope RPC');return route.abort();}
   if(url.pathname.endsWith('apply_revenue_decision'))applyRequests++;
   return route.continue();
  }
  blocked.push('unapproved network request');return route.abort();
 });
 const page=await context.newPage();pages.push(page);await page.goto(origin);
 await check('native secure context and Web Locks',async()=>assert.deepEqual((await run(page,'secure')).value,{secure:true,locks:true}));
 await check('three browser Auth-issued identities match the manifest',async()=>initialize(page));
 await check('fresh fixture has no owner receipt',async()=>assert.equal((await run(page,'fresh')).value,true));
 await check('staff is denied before owner save',async()=>assert.equal((await run(page,'staffDenied')).value,true));
 let savedAt;
 await check('actual owner commit survives a deliberately discarded reply',async()=>{
  assert.equal((await run(page,'stage')).ok,true);assert.equal((await run(page,'submit')).ok,false);
  const receipt=(await run(page,'committed')).value;assert.ok(receipt);savedAt=receipt.saved_at;
  assert.equal((await run(page,'read')).value.phase,'awaiting');assert.equal(applyRequests,2);
 });
 await check('reload with newly authenticated sessions retains the exact pending request',async()=>{
  assert.equal((await run(page,'signOut')).ok,true);await page.reload();await initialize(page);
  const record=(await run(page,'read')).value;assert.equal(record.phase,'awaiting');assert.equal(record.command.p_request,'00000000-0000-4000-8000-000000000020');
 });
 await check('pending replacement and direct retry never send another apply',async()=>{assert.equal((await run(page,'competing')).ok,false);assert.equal((await run(page,'submit')).ok,false);assert.equal(applyRequests,2);});
 await check('offline status retains uncertainty',async()=>{
  await context.setOffline(true);try{assert.equal((await run(page,'recover')).ok,false);assert.equal((await run(page,'read')).value.phase,'awaiting');}finally{await context.setOffline(false);}
 });
 await check('manager cannot see the owner receipt or journal',async()=>{assert.equal((await run(page,'managerHidden')).value,true);assert.equal((await run(page,'otherActor')).value,null);assert.equal((await run(page,'otherProperty')).value,null);});
 await check('authenticated status recovers the original saved timestamp',async()=>{const result=await run(page,'recover');assert.equal(result.ok,true);assert.equal(result.value.phase,'saved');assert.equal(result.value.receipt.saved_at,savedAt);assert.equal(applyRequests,2);});
 await check('saved submit sends no second owner rate change',async()=>{assert.equal((await run(page,'submit')).value.phase,'saved');assert.equal(applyRequests,2);});
 await check('two authenticated tabs serialize access to the saved journal',async()=>{
  const second=await context.newPage();pages.push(second);await second.goto(origin);await initialize(second);
  await page.evaluate(()=>{window.qualification.hold();});await page.waitForSelector('body[data-lock="held"]');
  let done=false;const pending=run(second,'stage').then(result=>{done=true;return result;});
  await second.waitForFunction(async()=>{const locks=await navigator.locks.query();return locks.pending.length===1;});assert.equal(done,false);
  await run(page,'release');const result=await pending;assert.equal(result.ok,true);assert.equal(result.value.phase,'saved');assert.equal(applyRequests,2);
 });
 assert.deepEqual(blocked,[]);
 for(const page of pages)assert.equal((await run(page,'signOut')).ok,true,'Isolated browser session cleanup failed');
 console.log(JSON.stringify({gate:'Auth-issued Chromium candidate recovery on isolated synthetic property',passed:cases.length,cases,
  source_sha256:createHash('sha256').update(await readFile(resolve(root,'lib/revenue-approval-recovery.ts'))).digest('hex'),browser:browser.version(),
  apply_requests:applyRequests,expected_committed_owner_changes:1,blocked_network_requests:blocked.length,authenticated_pms_ui_qualified:false,live_writeback_enabled:false}));
}finally{
 if(context){await context.setOffline(false);for(const page of pages){if(!page.isClosed()&&(await run(page,'signOut')).ok!==true)console.error('Isolated browser session cleanup requires review');}await context.close();}
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
}
