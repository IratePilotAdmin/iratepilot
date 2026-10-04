import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

// Real Chromium/storage/Web Locks; synthetic HTTP only. No hotel/Auth credentials.
const root=resolve(import.meta.dirname,'..');
const require=createRequire(resolve(import.meta.dirname,'revenue-browser-tools/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright');
const source=await readFile(resolve(root,'lib/revenue-approval-recovery.ts'));
const built=await build({entryPoints:[resolve(import.meta.dirname,'revenue-browser-recovery.fixture.ts')],bundle:true,write:false,platform:'browser',format:'iife'});
const bundle=built.outputFiles[0].text;
let writes=0,receipt=null;
const server=createServer(async(req,res)=>{
 try{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><title>Isolated revenue recovery test</title></head><body><h1>Synthetic recovery qualification</h1><p>No live hotel connection.</p><script src="/fixture.js"></script></body></html>');return;}
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
  if(req.method!=='POST'||!['/apply','/status'].includes(req.url)){res.writeHead(404);res.end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)throw Error('Fixture request too large');}
  const value=JSON.parse(body);res.setHeader('Content-Type','application/json');
  if(req.url==='/apply'){
   if(!receipt){writes++;receipt={found:true,request_id:value.p_request,tenant_id:value.p_tenant,property_id:value.p_property,plan_id:value.p_plan,stay_date:value.p_stay_date,recommended_rate_minor:value.p_recommended_rate_minor,saved_at:new Date().toISOString()};}
   res.writeHead(503);res.end(JSON.stringify({error:'Synthetic reply lost after commit'}));return;
  }
  if(value.mode==='error'){res.writeHead(503);res.end('{}');return;}
  if(value.mode==='missing'||!receipt){res.end(JSON.stringify({found:false,request_id:value.p_request,tenant_id:value.p_tenant,property_id:value.p_property}));return;}
  res.end(JSON.stringify(value.mode==='mismatch'?{...receipt,recommended_rate_minor:99999}:receipt));
 }catch{res.writeHead(400);res.end('{}');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser,context;const cases=[],external=[];
async function check(name,work){await work();cases.push(name);console.log(`PASS ${name}`);}
try{
 browser=await chromium.launch({headless:true});context=await browser.newContext();
 await context.route('**/*',route=>{
  if(new URL(route.request().url()).origin!==origin){external.push('blocked external request');return route.abort();}
  return route.continue();
 });
 const page=await context.newPage();await page.goto(origin);await page.waitForSelector('body[data-ready="true"]');
 const run=(method,...args)=>page.evaluate(async({method,args})=>{
  try{return {ok:true,value:await window.qualification[method](...args)};}catch(error){return {ok:false,error:error.message};}
 },{method,args});
 await check('secure browser context and native Web Locks',async()=>assert.deepEqual((await run('secure')).value,{secure:true,locks:true}));
 await check('lost reply persists exact pending request through reload',async()=>{
  assert.equal((await run('stage')).ok,true);assert.equal((await run('submit')).ok,false);assert.equal(writes,1);
  await page.reload();await page.waitForSelector('body[data-ready="true"]');const value=(await run('read')).value;
  assert.equal(value.phase,'awaiting');assert.equal(value.command.p_request,'00000000-0000-4000-8000-000000000006');
 });
 await check('unresolved request blocks replacement and direct retry',async()=>{assert.equal((await run('competing')).ok,false);assert.equal((await run('submit')).ok,false);assert.equal(writes,1);});
 await check('offline recovery preserves uncertainty',async()=>{await context.setOffline(true);try{assert.equal((await run('recover')).ok,false);assert.equal((await run('read')).value.phase,'awaiting');}finally{await context.setOffline(false);}});
 await check('service failure preserves the original pending request',async()=>{await run('mode','error');assert.equal((await run('recover')).ok,false);assert.equal((await run('read')).value.phase,'awaiting');});
 await check('mismatched receipt cannot resolve uncertainty',async()=>{await run('mode','mismatch');assert.equal((await run('recover')).ok,false);assert.equal((await run('read')).value.phase,'awaiting');});
 await check('not-found permits only the same immutable request',async()=>{await run('mode','missing');assert.equal((await run('recover')).value.phase,'ready');assert.equal((await run('competing')).ok,false);assert.equal((await run('submit')).ok,false);assert.equal(writes,1);});
 await check('online status restores the original committed receipt',async()=>{await run('mode','normal');const value=(await run('recover')).value;assert.equal(value.phase,'saved');assert.equal(value.receipt.saved_at,receipt.saved_at);assert.equal(writes,1);});
 await check('saved submit and actor/property isolation avoid duplicate changes',async()=>{assert.equal((await run('submit')).value.phase,'saved');assert.equal(writes,1);assert.equal((await run('otherActor')).value,null);assert.equal((await run('otherProperty')).value,null);});
 await check('two tabs serialize work through an actual exclusive lock',async()=>{
  const second=await context.newPage();await second.goto(origin);await second.waitForSelector('body[data-ready="true"]');
  await page.evaluate(()=>{window.qualification.hold();});await page.waitForSelector('body[data-lock="held"]');
  let done=false;const pending=second.evaluate(()=>window.qualification.stage()).then(value=>{done=true;return value;});
  await second.waitForFunction(async()=>{const locks=await navigator.locks.query();return locks.pending.length===1;});assert.equal(done,false);
  await run('release');const value=await pending;assert.equal(value.phase,'saved');assert.equal(writes,1);await second.close();
 });
 assert.deepEqual(external,[]);
 const output=process.argv[2];
 const evidence={gate:'real Chromium candidate controller with synthetic HTTP',passed:cases.length,cases,source_sha256:createHash('sha256').update(source).digest('hex'),browser:browser.version(),synthetic_commits:writes,external_requests:external.length,authenticated_pms_ui_qualified:false,live_writeback_enabled:false};
 if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(evidence,null,2)+'\n');}
 console.log(JSON.stringify(evidence));
}finally{if(context)await context.close();if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
