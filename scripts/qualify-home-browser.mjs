// Actual Home/AuthPanel/ReleasePreviewGate and actual server GET, genuine isolated Auth.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./revenue-browser-tools/package.json',import.meta.url));
const fixture=resolve('tests/fixtures/pms-home-2fb5285'),out=resolve('work/home-browser-evidence');
const provenance=JSON.parse(await readFile(resolve(fixture,'provenance.json'),'utf8'));
assert.equal(provenance.candidate,'2fb5285ac74314e97a9161dd8872d7088ccb8a92');assert.equal(provenance.project,'ybehrayzwzyufxbxcysq');
for(const [name,hash] of Object.entries(provenance.files)){
 assert.ok(/^(app|components|lib)\//.test(name)&&!name.includes('..'));
 assert.equal(createHash('sha256').update(await readFile(resolve(fixture,'source',name))).digest('hex'),hash);
}
for(const [name,hash] of Object.entries(provenance.assets))assert.equal(createHash('sha256').update(await readFile(resolve(fixture,name))).digest('hex'),hash);
assert.match(await readFile(resolve(fixture,'source/components/revenue-recommendation-preview.tsx'),'utf8'),/auditedSaveEnabled\s*=\s*false/);
if(process.argv.includes('--verify-only')){console.log(JSON.stringify({status:'home-snapshot-integrity-passed',sources:Object.keys(provenance.files).length}));process.exit(0);}
assert.equal(process.env.IRP_HOME_SUPERVISED_CLEANUP,'1','An operator must audit and remove exact isolated queue observations after every run.');
process.env.RELEASE_PREVIEW_ENABLED='true';process.env.RELEASE_PREVIEW_OWNER_ID='7e3ac7b8-3286-4fcb-aaa9-a850390d787c';process.env.RELEASE_PREVIEW_OWNER_EMAIL=process.env.IRP_HTTP_TEST_OWNER_EMAIL;
const {GET}=await import(new URL('../tests/fixtures/pms-home-2fb5285/preview.mjs',import.meta.url));
const assets=new Map(await Promise.all(['home.js','home.css'].map(async name=>['/'+name,await readFile(resolve(fixture,name))])));
let origin;const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,origin).pathname;
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 if(path==='/api/release-preview'){
  const response=await GET(new Request(origin+req.url,{headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(assets.has(path)){res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':'text/css'});res.end(assets.get(path));return;}
 if(path==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><html><head><link rel="stylesheet" href="/home.css"></head><body><div id="root"></div><script src="/home.js"></script></body></html>');return;}
 res.writeHead(404).end();
 }catch{res.writeHead(503).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=require('playwright');let browser,context,page,phase='launch';const checks=[],blocked=[],reads={},errors=[];let interruptMembership=false;
const allowedAuth=new Set(['/auth/v1/token','/auth/v1/user','/auth/v1/logout','/auth/v1/factors']);
const allowedRPC=new Set(['irp_pms_pilot_workspaces','irp_pms_pilot_workspace','irp_pms_pilot_workspace_sync','irp_pms_pilot_revenue_supervisor_queue']);
async function login(role){const prefix=`IRP_HTTP_TEST_${role.toUpperCase()}`;assert.ok(process.env[prefix+'_EMAIL']&&process.env[prefix+'_PASSWORD']);await page.getByLabel('Work email').fill(process.env[prefix+'_EMAIL']);await page.getByLabel('Password',{exact:true}).fill(process.env[prefix+'_PASSWORD']);await page.getByRole('button',{name:'Sign in',exact:true}).click();}
async function screenshot(name){await page.screenshot({path:resolve(out,name+'.png'),fullPage:true,mask:[page.locator('.pilot-sidebar-bottom'),page.locator('input[name=email]'),page.locator('input[name=password]')]});}
try{
 await mkdir(out,{recursive:true});browser=await chromium.launch({headless:true});context=await browser.newContext();
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin){if(['/','/home.js','/home.css','/api/release-preview','/favicon.ico'].includes(url.pathname)){await route.continue();return;}}
  if(url.origin==='https://ybehrayzwzyufxbxcysq.supabase.co'){
   const rpc=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.split('/').at(-1):null;
   if(allowedAuth.has(url.pathname)||(rpc&&allowedRPC.has(rpc))){
    if(rpc&&req.method()==='POST'){reads[rpc]=(reads[rpc]??0)+1;if(rpc==='irp_pms_pilot_workspaces'&&interruptMembership){interruptMembership=false;await route.abort('failed');return;}}
    await route.continue();return;
   }
  }
  blocked.push({origin:url.origin,path:url.pathname,method:req.method()});await route.abort('blockedbyclient');
 });
 page=await context.newPage();page.on('pageerror',()=>errors.push('uncaught browser error'));
 phase='owner-sign-in';await page.goto(origin);await login('owner');await page.getByRole('heading',{name:'Today',exact:true}).waitFor({timeout:45000});await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor();checks.push('Actual owner login, server preview authorization, memberships and Home workspace');
 assert.ok(reads.irp_pms_pilot_workspaces&&reads.irp_pms_pilot_workspace);await screenshot('owner-home');
 phase='owner-reload';await page.reload();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});checks.push('Authenticated full Home reload');
 phase='membership-interruption';interruptMembership=true;await page.reload();await page.getByRole('heading',{name:'We couldn’t load your properties'}).waitFor({timeout:45000});await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});checks.push('Interrupted actual membership read fails closed and Retry recovers');
 phase='offline';await context.setOffline(true);await page.getByText('You are offline.',{exact:true}).waitFor();checks.push('Actual Home offline warning');await context.setOffline(false);await page.getByRole('button',{name:'Refresh workspace',exact:true}).click();await page.getByText('You are offline.',{exact:true}).waitFor({state:'hidden'});checks.push('Reconnect and explicit workspace refresh');
 phase='supervisor-navigation';await page.getByRole('button',{name:'Revenue supervisor',exact:true}).click();await page.getByRole('heading',{name:'Revenue supervisor queue'}).waitFor({timeout:30000});await page.getByRole('heading',{name:'Active exceptions'}).waitFor({timeout:45000});checks.push('Actual Home navigation to genuine supervisor queue read');await screenshot('owner-supervisor');
 phase='owner-sign-out';await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:30000});checks.push('Owner sign-out returns to actual AuthPanel');
 for(const role of ['manager','staff']){phase=role+'-preview-denial';await login(role);await page.getByText('This preview is available only to its designated owner.',{exact:true}).waitFor({timeout:45000});assert.equal(await page.getByRole('heading',{name:'Today',exact:true}).count(),0);checks.push(role+' genuine Auth denied by actual owner-only server gate');await page.getByRole('button',{name:'Sign out and use another account',exact:true}).click();await page.getByRole('heading',{name:'Welcome back'}).waitFor();}
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);checks.push('No unexpected network operations or uncaught browser errors');
 const report={status:'actual-home-genuine-auth-browser-passed',candidate:provenance.candidate,project:provenance.project,checks,reads,review_actions_disabled:true,pricing_actions_disabled:true,queue_observations_may_persist:true,operator_cleanup_required:true,limits:'Isolated Chromium HTTP host using preserved synthetic empty property. Queue reads persist synthetic observations which require independent scoped audit and cleanup. Not live PMS deployment, populated hotel inventory, review mutation recovery, installed PWA, physical iPhone or historical hotel outcomes.'};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{process.exitCode=1;await writeFile(resolve(out,'report.json'),JSON.stringify({status:'actual-home-genuine-auth-browser-failed',phase,checks,reads,blocked,error_count:errors.length},null,2));console.error(JSON.stringify({status:'actual-home-genuine-auth-browser-failed',phase,checks,reads,blocked,error_count:errors.length}));if(page)try{await screenshot('failed');}catch{}}
finally{if(page)try{const button=page.getByRole('button',{name:/^(Sign out|Sign out and use another account)$/});if(await button.count()===1){await button.click();await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:20000});}}catch{process.exitCode=1;console.error('Qualification session cleanup could not be confirmed.');}await context?.close();await browser?.close();await new Promise(done=>server.close(done));}
