import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {project,baseline,validateQueueFixture} from './supervisor-queue-qualification-config.mjs';
import {supervisorBuildOptions} from './supervisor-browser-build.mjs';

const root=resolve(import.meta.dirname,'..'),require=createRequire(resolve(root,'scripts/revenue-browser-tools/package.json'));
const {build}=require('esbuild');
const source=await supervisorBuildOptions(root);
const built=await build({bundle:true,write:false,platform:'browser',format:'iife',...source.options});
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--build-only'){console.log(JSON.stringify({status:'build-passed',site_commit:source.provenance.site_commit,site_version:246,credentials_used:false}));process.exit(0);}
assert.equal(args.length,0,'Unexpected browser qualification arguments');
const fixture=validateQueueFixture(JSON.parse(await readFile(process.env.IRP_REVIEW_FIXTURE_PATH||'','utf8')));
assert.equal(process.env.IRP_REVIEW_SUPERVISED_CLEANUP,'1','Operator audit and cleanup required');
assert.equal(process.env.IRP_REVIEW_PUBLISHABLE_KEY,'sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf','Pinned isolated public connection required');
const credentials=Object.fromEntries(['owner','manager','staff'].map(role=>{
 const email=process.env[`IRP_REVIEW_${role.toUpperCase()}_EMAIL`],password=process.env[`IRP_REVIEW_${role.toUpperCase()}_PASSWORD`];
 assert.ok(email&&password,'Protected test credentials required');return [role,{email,password}];
}));
const {chromium}=require('playwright'),api=`https://${project}.supabase.co`;
const label='Synthetic queue recovery '+fixture.tenant_id.replaceAll('-','');
const server=createServer((request,response)=>{
 response.setHeader('Cache-Control','no-store');
 if(request.method!=='GET'){response.writeHead(405);response.end();return;}
 if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><head><title>Isolated supervisor recovery qualification</title></head><body><h1>Exact supervisor component in isolated test host</h1><p>Disposable synthetic scope only. Full deployed PMS and physical phone are not qualified here.</p><div id="supervisor-host"></div><script src="/fixture.js"></script></body></html>');return;}
 if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(built.outputFiles[0].text);return;}
 if(request.url==='/favicon.ico'){response.writeHead(204);response.end();return;}
 response.writeHead(404);response.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,checks=[],commands=[],blocked=[],contexts=[];
let browser,phase='browser-start',issueId,ownerQueueFault=false;
const discarded=new Set(),receipts=[],allowReplies={owner:false,manager:false};
async function check(name,work){phase=name;await work();checks.push(name);console.log('PASS '+name);}
async function invoke(page,method,...args){return page.evaluate(async({method,args})=>window.supervisorQualification[method](...args),{method,args});}
async function journal(page){return invoke(page,'journal');}
const target=page=>page.locator('article').filter({hasText:label});
async function fresh(page){await page.getByRole('button',{name:'Refresh queue',exact:true}).waitFor();await page.getByText('Loading shared reviews…',{exact:true}).waitFor({state:'hidden'});}
async function refresh(page){await Promise.all([page.waitForResponse(response=>response.url()===api+'/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_queue'&&response.request().method()==='POST'),page.getByRole('button',{name:'Refresh queue',exact:true}).click()]);await fresh(page);}
async function session(role){
 const context=await browser.newContext();contexts.push({context,role,pages:[]});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(url.origin===origin&&method==='GET'&&['/','/fixture.js','/favicon.ico'].includes(url.pathname))return route.continue();
  const authPaths=['/auth/v1/token','/auth/v1/user','/auth/v1/logout'];
  const rpcPaths=['/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_queue','/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_review'];
  if(url.origin!==api||![...authPaths,...rpcPaths].includes(url.pathname)){blocked.push('unapproved destination/path');return route.abort();}
  if(method==='OPTIONS')return route.continue();
  if(url.pathname==='/auth/v1/logout'&&method==='POST'&&url.search==='?scope=local')return route.continue();
  if(Date.parse(fixture.expires_at)<=Date.now()){blocked.push('expired fixture');return route.abort();}
  if(url.pathname==='/auth/v1/token'&&method==='POST'&&url.search==='?grant_type=password')return route.continue();
  if(url.pathname==='/auth/v1/user'&&method==='GET'&&!url.search)return route.continue();
  if(!rpcPaths.includes(url.pathname)||method!=='POST'||url.search){blocked.push('unapproved method/query');return route.abort();}
  let body;try{body=request.postDataJSON();}catch{blocked.push('invalid RPC body');return route.abort();}
  if(url.pathname.endsWith('_queue')){
   if(JSON.stringify(body)!==JSON.stringify({p_offset:0,p_status:'all',p_mine:false})){blocked.push('unexpected queue filters');return route.abort();}
   if(role==='owner'&&ownerQueueFault)return route.fulfill({status:503,contentType:'application/json',body:'{"code":"P0001","message":"Injected isolated queue failure"}'});
   const response=await route.fetch({maxRetries:0});
   if(response.ok()){
    const page=await response.json();const scoped=page.items.filter(item=>item.tenant_id===fixture.tenant_id&&item.property_id===fixture.property_id);
    const prior=page.items.filter(item=>item.tenant_id===baseline.tenant&&item.property_id===baseline.property);
    assert.equal(scoped.length+prior.length,page.items.length,'Unexpected queue scope');
    if(scoped.length){assert.equal(scoped.length,1);assert.equal(scoped[0].issue_key,'capture_missing');issueId??=scoped[0].id;assert.equal(scoped[0].id,issueId);}
   }
   return route.fulfill({response});
  }
  const keys=['p_tenant','p_property','p_issue','p_expected_revision','p_action','p_request'];
  if(Object.keys(body).sort().join('|')!==keys.sort().join('|')||body.p_tenant!==fixture.tenant_id||body.p_property!==fixture.property_id||body.p_issue!==issueId||!['claim','release'].includes(body.p_action)||!Number.isSafeInteger(body.p_expected_revision)||body.p_expected_revision<1||body.p_expected_revision>5||!/^[0-9a-f-]{36}$/.test(body.p_request)||role==='staff'){blocked.push('out-of-scope review');return route.abort();}
  commands.push({role,...body});const response=await route.fetch({maxRetries:0});
  if(response.ok()){
   const receipt=await response.json();assert.equal(receipt.request_id,body.p_request);assert.equal(receipt.issue_id,issueId);assert.equal(receipt.revision,body.p_expected_revision+1);receipts.push({role,...receipt});
   const lose=(role==='owner'&&body.p_action==='claim'&&body.p_expected_revision===1)||(role==='manager'&&body.p_action==='claim'&&body.p_expected_revision===3);
   if(lose&&!allowReplies[role]){discarded.add(role);return route.abort('failed');}
  }
  return route.fulfill({response});
 });
 const page=await context.newPage();contexts.at(-1).pages.push(page);await page.goto(origin);await page.locator('body[data-ready="true"]').waitFor();
 assert.deepEqual(await invoke(page,'start',role,fixture,credentials[role]),{secure:true,locks:true});await fresh(page);return {context,page};
}
try{
 browser=await chromium.launch({headless:true});
 const owner=await session('owner');
 await check('real owner SDK sign-in loads both authorized synthetic properties',async()=>{await target(owner.page).waitFor();assert.equal(await owner.page.locator('article').count(),3);});
 const second=await owner.context.newPage();contexts[0].pages.push(second);await second.goto(origin);await second.locator('body[data-ready="true"]').waitFor();await invoke(second,'start','owner',fixture);await fresh(second);
 await check('native cross-tab Web Lock refuses review without staging or HTTP',async()=>{
  await invoke(second,'holdLock');await second.locator('body[data-fixture-lock="held"]').waitFor();await target(owner.page).getByRole('button',{name:'Claim review',exact:true}).click();
  await owner.page.getByRole('alert').filter({hasText:'Another tab'}).waitFor();assert.equal(await journal(owner.page),null);assert.equal(commands.length,0);await invoke(second,'releaseLock');await second.locator('body[data-fixture-lock="released"]').waitFor();await second.close();
 });
 await refresh(owner.page);
 await check('real owner claim commits while lost delivery retains the exact journal',async()=>{
  await target(owner.page).getByRole('button',{name:'Claim review',exact:true}).click();await owner.page.getByRole('region',{name:'Unconfirmed review'}).waitFor();await owner.page.getByRole('alert').waitFor();
  assert.ok(commands.length>=1);assert.equal(receipts[0].revision,2);assert.ok(commands.every(command=>JSON.stringify(command)===JSON.stringify(commands[0])));const pending=await journal(owner.page);assert.equal(pending.request,commands[0].p_request);assert.equal(pending.revision,1);
 });
 const original=await journal(owner.page);let retainedRequestCount=commands.length;
 await check('reload restores SDK session and unresolved command without review HTTP',async()=>{
  await owner.page.reload();await owner.page.locator('body[data-ready="true"]').waitFor();await invoke(owner.page,'start','owner',fixture);await fresh(owner.page);await owner.page.getByRole('region',{name:'Unconfirmed review'}).waitFor();assert.deepEqual(await journal(owner.page),original);assert.ok(commands.every(command=>JSON.stringify(command)===JSON.stringify(commands[0])));retainedRequestCount=commands.length;
 });
 await check('offline removes evidence and disables retry without replacing the journal',async()=>{
  await owner.context.setOffline(true);await owner.page.getByText('Offline. Review actions are paused until the queue refreshes.',{exact:true}).waitFor();assert.equal(await owner.page.locator('article').count(),0);assert.equal(await owner.page.getByRole('button',{name:'Retry saved review',exact:true}).isEnabled(),false);assert.deepEqual(await journal(owner.page),original);assert.equal(commands.length,retainedRequestCount);await owner.context.setOffline(false);await target(owner.page).waitFor();await fresh(owner.page);
 });
 await check('failed refresh purges old details and keeps retry paused until fresh read',async()=>{
  ownerQueueFault=true;await refresh(owner.page);await owner.page.getByRole('alert').filter({hasText:'Injected isolated queue failure'}).waitFor();assert.equal(await owner.page.locator('article').count(),0);assert.equal(await owner.page.getByRole('button',{name:'Retry saved review',exact:true}).isEnabled(),false);assert.deepEqual(await journal(owner.page),original);assert.equal(commands.length,retainedRequestCount);ownerQueueFault=false;await refresh(owner.page);await target(owner.page).waitFor();assert.equal(await owner.page.getByRole('button',{name:'Retry saved review',exact:true}).isEnabled(),true);
 });
 await check('explicit UI retry uses original command and clears only its confirmed journal',async()=>{
  allowReplies.owner=true;await owner.page.getByRole('button',{name:'Retry saved review',exact:true}).click();await owner.page.getByText('Review saved. Revenue safety gates remain active.',{exact:true}).waitFor();await fresh(owner.page);assert.deepEqual(commands.at(-1),commands[0]);assert.equal(receipts.at(-1).replayed,true);assert.equal(await journal(owner.page),null);
 });
 await target(owner.page).getByRole('button',{name:'Release review',exact:true}).click();await target(owner.page).getByRole('button',{name:'Claim review',exact:true}).waitFor();
 const manager=await session('manager');
 await check('manager committed claim loses delivery and revoked queue hides only its property',async()=>{
  await target(manager.page).getByRole('button',{name:'Claim review',exact:true}).click();await manager.page.getByRole('region',{name:'Unconfirmed review'}).waitFor();await manager.page.getByRole('alert').waitFor();await refresh(manager.page);assert.equal(await target(manager.page).count(),0);assert.equal(await manager.page.locator('article').count(),2);assert.equal((await journal(manager.page)).revision,3);
 });
 const managerPending=await journal(manager.page),managerOriginal=commands.find(command=>command.role==='manager'),beforeDeniedReceipts=receipts.length;
 await check('revoked exact UI retry is denied and retains its original pending request',async()=>{
  await manager.page.getByRole('button',{name:'Retry saved review',exact:true}).click();await manager.page.getByRole('alert').filter({hasText:'Review could not be confirmed'}).waitFor();assert.deepEqual(await journal(manager.page),managerPending);assert.deepEqual(commands.at(-1),managerOriginal);assert.equal(receipts.length,beforeDeniedReceipts);assert.equal(await target(manager.page).count(),0);
 });
 const staff=await session('staff');
 await check('staff actual component displays no properties or claim control',async()=>{await staff.page.getByText('No active exceptions match these filters.',{exact:false}).waitFor();assert.equal(await staff.page.locator('article').count(),0);assert.equal(await staff.page.getByRole('button',{name:'Claim review',exact:true}).count(),0);});
 await check('owner actual UI reclaims abandoned assignment and releases at revision six',async()=>{
  await refresh(owner.page);await target(owner.page).getByRole('button',{name:'Claim abandoned review',exact:true}).click();await target(owner.page).getByRole('button',{name:'Release review',exact:true}).waitFor();assert.equal(receipts.at(-1).reclaimed,true);assert.equal(receipts.at(-1).previous_assignee,fixture.manager_id);
  await target(owner.page).getByRole('button',{name:'Release review',exact:true}).click();await target(owner.page).getByRole('button',{name:'Claim review',exact:true}).waitFor();assert.equal(receipts.at(-1).revision,6);assert.equal(await journal(owner.page),null);assert.deepEqual(await journal(manager.page),managerPending);
 });
 assert.deepEqual(blocked,[]);assert.equal(new Set(commands.map(command=>command.p_request)).size,5);assert.equal(discarded.size,2);
 const byRequest=new Map();for(const command of commands){const originalCommand=byRequest.get(command.p_request);if(originalCommand)assert.deepEqual(command,originalCommand);else byRequest.set(command.p_request,command);}
 const report={status:'supervisor-browser-passed',checks,site_source:source.provenance,browser:browser.version(),review_http_requests:commands.length,validated_receipts:receipts.length,expected_database_events:5,expected_final_revision:6,commands,receipts,blocked_requests:blocked.length,cleanup_required:true,database_audit_required:true,limits:'Exact component in disposable host with synthetic membership props; no full Home/auth callback navigation, deployed CSS, physical iPhone/PWA, real packet loss, reauthorization, database lock-wait revocation or load proof.'};
 const evidence=resolve(root,'work/supervisor-browser-evidence');await mkdir(evidence,{recursive:true});await owner.page.screenshot({path:resolve(evidence,'owner-final.png'),fullPage:true});await manager.page.screenshot({path:resolve(evidence,'revoked-manager-pending.png'),fullPage:true});
 for(const entry of contexts){for(const page of entry.pages.filter(page=>!page.isClosed())){assert.equal(await invoke(page,'signOut'),true);}}
 await writeFile(resolve(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{process.exitCode=1;console.error(JSON.stringify({status:'supervisor-browser-failed',phase,passed_checks:checks,review_http_requests:commands.length,blocked_requests:blocked.length,cleanup_required:true}));}
finally{
 for(const entry of contexts){await entry.context.setOffline(false);for(const page of entry.pages.filter(page=>!page.isClosed())){try{await invoke(page,'signOut');}catch{process.exitCode=1;console.error(JSON.stringify({status:'browser-session-cleanup-failed',cleanup_required:true}));}}await entry.context.close();}
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
