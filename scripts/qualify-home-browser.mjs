// Actual Home/AuthPanel/ReleasePreviewGate and actual server GET, genuine isolated Auth.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {actors,baseline,validateQueueFixture} from './supervisor-queue-qualification-config.mjs';
const reviewMode=process.argv.includes('--review-recovery');
const rejectionMode=process.argv.includes('--auth-rejection');
const expiryMode=process.argv.includes('--natural-expiry');
const expiryProbe=process.argv.includes('--expiry-probe');
const authLifecycleMode=rejectionMode||expiryMode||expiryProbe;
const require=createRequire(new URL('./revenue-browser-tools/package.json',import.meta.url));
const fixture=resolve('tests/fixtures/pms-home-2fb5285'),out=resolve(expiryMode||expiryProbe?'work/home-natural-expiry-evidence':rejectionMode?'work/home-auth-rejection-evidence':reviewMode?'work/home-review-evidence':'work/home-browser-evidence');
const provenance=JSON.parse(await readFile(resolve(fixture,'provenance.json'),'utf8'));
assert.equal(provenance.candidate,'2fb5285ac74314e97a9161dd8872d7088ccb8a92');assert.equal(provenance.project,'ybehrayzwzyufxbxcysq');
for(const [name,hash] of Object.entries(provenance.files)){
 assert.ok(/^(app|components|lib)\//.test(name)&&!name.includes('..'));
 assert.equal(createHash('sha256').update(await readFile(resolve(fixture,'source',name))).digest('hex'),hash);
}
for(const [name,hash] of Object.entries(provenance.assets))assert.equal(createHash('sha256').update(await readFile(resolve(fixture,name))).digest('hex'),hash);
assert.match(await readFile(resolve(fixture,'source/components/revenue-recommendation-preview.tsx'),'utf8'),/auditedSaveEnabled\s*=\s*false/);
if(process.argv.includes('--verify-only')){console.log(JSON.stringify({status:'home-snapshot-integrity-passed',sources:Object.keys(provenance.files).length}));process.exit(0);}
if(!authLifecycleMode)assert.equal(process.env.IRP_HOME_SUPERVISED_CLEANUP,'1','An operator must audit and remove exact isolated queue observations after every run.');
assert.ok([reviewMode,rejectionMode,expiryMode,expiryProbe].filter(Boolean).length<=1,'Qualification modes must be separate');
const scope=reviewMode?validateQueueFixture(JSON.parse(await readFile(process.env.IRP_REVIEW_FIXTURE_PATH||'','utf8'))):null;
const scopeLabel=scope?'Synthetic queue recovery '+scope.tenant_id.replaceAll('-',''):null;
let issueId,originalCommand,dropReply=true;const commands=[],receipts=[],denials=[];
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
if(authLifecycleMode)allowedRPC.delete('irp_pms_pilot_revenue_supervisor_queue');
if(reviewMode)allowedRPC.add('irp_pms_pilot_revenue_supervisor_review');
// Keep test-session secrets only in memory. Never include them in reports/errors.
let authKey='',sessionToken='',sessionRefresh='',heldPreview,releasePreview;
let holdPreview=false,identityRejections=0;
let originalExpiry=0,originalToken='',latestExpiry=0,automaticRefreshes=0;
const issuedTokens=[];
async function revoke(token){
 const response=await fetch('https://ybehrayzwzyufxbxcysq.supabase.co/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:authKey,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(10000)});
 assert.ok(response.ok||response.status===401||response.status===403,'Isolated test-session cleanup failed');
}
async function login(role){const prefix=`IRP_HTTP_TEST_${role.toUpperCase()}`;assert.ok(process.env[prefix+'_EMAIL']&&process.env[prefix+'_PASSWORD']);await page.getByLabel('Work email').fill(process.env[prefix+'_EMAIL']);await page.getByLabel('Password',{exact:true}).fill(process.env[prefix+'_PASSWORD']);await page.getByRole('button',{name:'Sign in',exact:true}).click();}
async function screenshot(name){await page.screenshot({path:resolve(out,name+'.png'),fullPage:true,mask:[page.locator('.pilot-sidebar-bottom'),page.locator('input[name=email]'),page.locator('input[name=password]')]});}
async function journal(){return page.evaluate(actor=>{const value=localStorage.getItem('irp-supervisor-review-v1/'+actor);return value?JSON.parse(value):null;},actors.owner);}
const scopedArticle=()=>page.locator('article').filter({hasText:scopeLabel});
async function openQueue(){await page.getByRole('button',{name:'Revenue supervisor',exact:true}).click();await page.getByRole('heading',{name:'Active exceptions'}).waitFor({timeout:45000});await page.getByText('Loading shared reviews…',{exact:true}).waitFor({state:'hidden'});}
async function refreshQueue(){await Promise.all([page.waitForResponse(r=>r.url().endsWith('/rpc/irp_pms_pilot_revenue_supervisor_queue')&&r.request().method()==='POST'),page.getByRole('button',{name:'Refresh queue',exact:true}).click()]);await page.getByText('Loading shared reviews…',{exact:true}).waitFor({state:'hidden'});}
try{
 await mkdir(out,{recursive:true});browser=await chromium.launch({headless:true});context=await browser.newContext();
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin){if(['/','/home.js','/home.css','/api/release-preview','/favicon.ico'].includes(url.pathname)){
   if(rejectionMode&&url.pathname==='/api/release-preview'&&holdPreview){
    holdPreview=false;const response=await route.fetch({maxRetries:0});assert.ok(response.ok,'Preview must be genuinely authorized before revocation');
    heldPreview=true;await new Promise(done=>{releasePreview=done;});await route.fulfill({response});return;
   }
   await route.continue();return;}}
  if(url.origin==='https://ybehrayzwzyufxbxcysq.supabase.co'){
   const rpc=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.split('/').at(-1):null;
   if(allowedAuth.has(url.pathname)||(rpc&&allowedRPC.has(rpc))){
    if(authLifecycleMode&&url.pathname==='/auth/v1/token'&&req.method()==='POST'&&['?grant_type=password','?grant_type=refresh_token'].includes(url.search)){
     authKey=req.headers().apikey;const response=await route.fetch({maxRetries:0});
     if(response.ok()){const result=await response.json();assert.equal(result.user?.id,actors.owner);sessionToken=result.access_token;sessionRefresh=result.refresh_token;issuedTokens.push(sessionToken);
      if(expiryMode||expiryProbe){latestExpiry=JSON.parse(Buffer.from(sessionToken.split('.')[1],'base64url').toString('utf8')).exp;assert.ok(Number.isSafeInteger(latestExpiry));
       if(!originalExpiry){originalExpiry=latestExpiry;originalToken=sessionToken;}
       if(url.search==='?grant_type=refresh_token'){automaticRefreshes++;console.log(JSON.stringify({status:'home-natural-refresh-observed',refresh_count:automaticRefreshes,new_expiry:latestExpiry,observed_at:new Date().toISOString()}));}
      }
     }
     await route.fulfill({response});return;
    }
    if(authLifecycleMode&&url.pathname==='/auth/v1/user'&&req.method()==='GET'){
     const response=await route.fetch({maxRetries:0});if(response.status()>=400&&response.status()<500)identityRejections++;await route.fulfill({response});return;
    }
    if(reviewMode&&rpc&&req.method()!=='OPTIONS'){
     if(req.method()!=='POST'||url.search||Date.parse(scope.expires_at)<=Date.now()){blocked.push({path:url.pathname,reason:'method or expired fixture'});await route.abort();return;}
     const body=req.postDataJSON();
     if(rpc==='irp_pms_pilot_revenue_supervisor_review'){
      const keys=['p_tenant','p_property','p_issue','p_expected_revision','p_action','p_request'].sort();
      const safe=Object.keys(body).sort().join('|')===keys.join('|')&&body.p_tenant===scope.tenant_id&&body.p_property===scope.property_id&&body.p_issue===issueId&&/^[0-9a-f-]{36}$/.test(body.p_request)&&((body.p_action==='claim'&&body.p_expected_revision===1)||(body.p_action==='release'&&body.p_expected_revision===2));
      if(!safe){blocked.push({path:url.pathname,reason:'out of scope review'});await route.abort();return;}
      if(body.p_action==='claim'){originalCommand??=body;assert.deepEqual(body,originalCommand);}
      commands.push(body);const response=await route.fetch({maxRetries:0});
      if(response.ok()){
       const receipt=await response.json();assert.equal(receipt.issue_id,issueId);assert.equal(receipt.request_id,body.p_request);assert.equal(receipt.revision,body.p_expected_revision+1);receipts.push(receipt);
       if(body.p_action==='claim'&&dropReply){await route.abort('failed');return;}
      }else{const result=await response.json();denials.push({status:response.status(),code:result.code});}
      await route.fulfill({response});return;
     }
     if(rpc==='irp_pms_pilot_revenue_supervisor_queue'){
      assert.deepEqual(body,{p_offset:0,p_status:'all',p_mine:false});const response=await route.fetch({maxRetries:0});
      if(response.ok()){
       const result=await response.json();for(const item of result.items)assert.ok((item.tenant_id===baseline.tenant&&item.property_id===baseline.property)||(item.tenant_id===scope.tenant_id&&item.property_id===scope.property_id));
       const scoped=result.items.filter(item=>item.tenant_id===scope.tenant_id);if(scoped.length){assert.equal(scoped.length,1);assert.equal(scoped[0].issue_key,'capture_missing');issueId??=scoped[0].id;assert.equal(scoped[0].id,issueId);}
      }
      await route.fulfill({response});return;
     }
     if(rpc==='irp_pms_pilot_workspace'||rpc==='irp_pms_pilot_workspace_sync')assert.ok((body.p_tenant===baseline.tenant&&body.p_property===baseline.property)||(body.p_tenant===scope.tenant_id&&body.p_property===scope.property_id));
    }
    if(rpc&&req.method()==='POST'){reads[rpc]=(reads[rpc]??0)+1;if(rpc==='irp_pms_pilot_workspaces'&&interruptMembership){interruptMembership=false;await route.abort('failed');return;}}
    await route.continue();return;
   }
  }
  blocked.push({origin:url.origin,path:url.pathname,method:req.method()});await route.abort('blockedbyclient');
 });
 page=await context.newPage();page.on('pageerror',()=>errors.push('uncaught browser error'));
 phase='owner-sign-in';await page.goto(origin);await login('owner');await page.getByRole('heading',{name:'Today',exact:true}).waitFor({timeout:45000});await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor();checks.push('Actual owner login, server preview authorization, memberships and Home workspace');
 assert.ok(reads.irp_pms_pilot_workspaces&&reads.irp_pms_pilot_workspace);await screenshot('owner-home');
 if(expiryMode||expiryProbe){
  const remaining=originalExpiry-Math.floor(Date.now()/1000);assert.ok(remaining>120&&remaining<=4500,'Natural expiry falls outside the bounded qualification window');
  const timing={status:expiryProbe?'home-expiry-timing-probed':'home-natural-expiry-running',original_expires_at:new Date(originalExpiry*1000).toISOString(),remaining_seconds:remaining,automatic_refresh_enabled:true,clock_modified:false,auth_policy_modified:false,natural_jwt_expiry_qualified:false};
  await writeFile(resolve(out,expiryProbe?'probe.json':'progress.json'),JSON.stringify(timing,null,2));console.log(JSON.stringify(timing));
  if(expiryProbe){checks.push('Genuine owner session lifetime measured without exposing its token');}
  else{
   phase='natural-clock-wait';const deadline=(originalExpiry+150)*1000;
   // No SDK refresh call, reload, clock override, session mutation or policy change
   // during this wait. The captured production client runs its normal refresh timer.
   while(Date.now()<originalExpiry*1000+2000){assert.ok(Date.now()<deadline);await new Promise(done=>setTimeout(done,Math.min(30000,originalExpiry*1000+2000-Date.now())));}
   assert.ok(automaticRefreshes>0,'Normal foreground automatic refresh was not observed');assert.notEqual(sessionToken,originalToken);assert.ok(latestExpiry>originalExpiry);checks.push('Actual client automatically obtains a new genuine token using its normal timer');
   phase='old-token-natural-expiry';let expired=false;
   while(Date.now()<deadline){const response=await fetch('https://ybehrayzwzyufxbxcysq.supabase.co/auth/v1/user',{headers:{apikey:authKey,Authorization:'Bearer '+originalToken},redirect:'error',signal:AbortSignal.timeout(10000)});if(response.status>=400&&response.status<500){const result=await response.json();assert.ok(/expired/i.test([result.msg,result.message,result.error_description].filter(value=>typeof value==='string').join(' ')),'Provider rejection did not identify expiration');expired=true;break;}assert.ok(response.ok,'Provider unavailable during natural expiry verification');await new Promise(done=>setTimeout(done,10000));}
   assert.ok(expired,'Original token was not rejected after its real expiration');checks.push('Provider rejects the original token after real elapsed expiration without revocation');
   phase='refreshed-home';await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});await screenshot('naturally-refreshed-home');checks.push('Actual Home is authorized under the automatically refreshed session');
   phase='refreshed-reload';await page.reload();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});assert.equal(reads.irp_pms_pilot_revenue_supervisor_queue??0,0);checks.push('Home reload succeeds after original token expires; no queue/review/rate operation allowed');
  }
 }else if(rejectionMode){
  phase='hold-authorized-preview';holdPreview=true;await page.reload();await page.waitForFunction(()=>document.body.textContent.includes('Verifying your owner access'));
  const holdDeadline=Date.now()+15000;while(!heldPreview&&Date.now()<holdDeadline)await new Promise(done=>setTimeout(done,50));assert.ok(heldPreview,'Authorized preview response was not captured');
  assert.equal(await page.getByRole('heading',{name:'Today',exact:true}).count(),0);checks.push('Actual gate hides Home while an authorized preview response is delayed');
  phase='genuine-session-rejection';assert.ok(sessionToken&&sessionRefresh&&authKey);await revoke(sessionToken);
  const rejected=await fetch('https://ybehrayzwzyufxbxcysq.supabase.co/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:authKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:sessionRefresh}),redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.ok(rejected.status>=400&&rejected.status<500,'Provider did not reject revoked refresh');checks.push('Genuine provider rejects this session refresh after local revocation');
  phase='late-preview-identity-recheck';releasePreview();releasePreview=null;await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:20000});assert.ok(identityRejections>0,'Actual gate must recheck identity with provider');assert.equal(await page.getByRole('heading',{name:'Today',exact:true}).count(),0);checks.push('Delayed formerly valid preview cannot restore Home after actual provider identity rejection');await screenshot('provider-rejected-home');
  phase='fresh-owner-reentry';const previousToken=sessionToken;await login('owner');await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});assert.notEqual(sessionToken,previousToken);checks.push('Actual AuthPanel fresh owner sign-in restores Home with a newly issued session');await screenshot('fresh-owner-home');
  phase='fresh-session-reload';await page.reload();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});assert.equal(reads.irp_pms_pilot_revenue_supervisor_queue??0,0);checks.push('Fresh session survives actual Home reload; no queue/review/rate operation allowed');
 }else if(reviewMode){
  phase='fresh-scope';await page.locator('.pilot-property-label select').selectOption(scope.property_id);await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor();await openQueue();await scopedArticle().waitFor();assert.equal(await scopedArticle().count(),1);checks.push('Actual Home loads fresh authorized review scope');
  phase='lost-claim-reply';await scopedArticle().getByRole('button',{name:'Claim review',exact:true}).click();await page.getByRole('region',{name:'Unconfirmed review'}).waitFor();await page.getByRole('alert').filter({hasText:'Review could not be confirmed'}).waitFor();
  assert.ok(commands.length>=1);assert.equal(receipts[0].revision,2);const retained=await journal();assert.equal(retained.request,originalCommand.p_request);assert.equal(retained.revision,1);checks.push('Claim committed with genuine receipt; dropped delivery retains original journal');
  phase='server-access-denial';await refreshQueue();await scopedArticle().waitFor({state:'hidden'});await page.getByRole('alert').waitFor({state:'hidden'});assert.equal(await scopedArticle().count(),0);await Promise.all([page.waitForResponse(r=>r.url().endsWith('/rpc/irp_pms_pilot_revenue_supervisor_review')&&r.request().method()==='POST'),page.getByRole('button',{name:'Retry saved review',exact:true}).click()]);await page.getByRole('alert').filter({hasText:'Review could not be confirmed'}).waitFor();assert.deepEqual(await journal(),retained);assert.deepEqual(commands.at(-1),originalCommand);assert.deepEqual(denials.at(-1),{status:403,code:'42501'});assert.equal(receipts.length,1);checks.push('Revoked exact replay denied by real database before receipt disclosure');
  phase='reload-with-revoked-membership';await page.reload();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});await openQueue();await page.getByRole('region',{name:'Unconfirmed review'}).waitFor();assert.deepEqual(await journal(),retained);assert.equal(await scopedArticle().count(),0);const beforeLocalDenial=commands.length;await page.getByRole('button',{name:'Retry saved review',exact:true}).click();await page.getByRole('alert').filter({hasText:'Your review access is unavailable'}).waitFor();assert.equal(commands.length,beforeLocalDenial);checks.push('Home reload refreshes membership and locally blocks revoked replay while retaining journal');
  phase='offline-pending';await context.setOffline(true);await page.getByText('Offline. Review actions are paused until the queue refreshes.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Retry saved review',exact:true}).isEnabled(),false);assert.deepEqual(await journal(),retained);assert.equal(await page.locator('article').count(),0);await context.setOffline(false);await page.getByRole('heading',{name:'Active exceptions'}).waitFor();await refreshQueue();checks.push('Offline/reconnect retains exact pending request and clears unavailable queue evidence');
  phase='sign-out-reentry';await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Welcome back'}).waitFor();assert.deepEqual(await journal(),retained);await login('owner');await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});await openQueue();await page.getByRole('region',{name:'Unconfirmed review'}).waitFor();assert.deepEqual(await journal(),retained);assert.equal(commands.length,beforeLocalDenial);checks.push('Actual sign-out and genuine owner re-entry recover unresolved journal without review HTTP');
  phase='waiting-for-access-restore';console.log('WAITING_FOR_HOME_FIXTURE_OWNER_RESTORE');const deadline=Date.now()+240000;let restored=false;
  while(Date.now()<deadline){await page.reload();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});await openQueue();if(await scopedArticle().count()){restored=true;break;}await new Promise(done=>setTimeout(done,2000));}
  assert.ok(restored,'Operator restoration was not observed');assert.deepEqual(await journal(),retained);assert.equal(commands.length,beforeLocalDenial);checks.push('Restored disposable access is observed through actual Home membership reload');
  phase='exact-replay-confirmation';dropReply=false;await page.getByRole('button',{name:'Retry saved review',exact:true}).click();await page.getByText('Review saved. Revenue safety gates remain active.',{exact:true}).waitFor();assert.deepEqual(commands.at(-1),originalCommand);assert.equal(receipts.at(-1).replayed,true);assert.equal(await journal(),null);checks.push('Original request returns replayed receipt and clears journal only after confirmation');await screenshot('confirmed-home-review');
  phase='release-review';await scopedArticle().getByRole('button',{name:'Release review',exact:true}).click();await scopedArticle().getByRole('button',{name:'Claim review',exact:true}).waitFor();assert.equal(receipts.at(-1).revision,3);assert.equal(await journal(),null);checks.push('Explicit release closes test assignment without pricing action');
 }else{
 phase='owner-reload';await page.reload();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});checks.push('Authenticated full Home reload');
 phase='membership-interruption';interruptMembership=true;await page.reload();await page.getByRole('heading',{name:'We couldn’t load your properties'}).waitFor({timeout:45000});await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('heading',{name:'Today’s arrivals'}).waitFor({timeout:45000});checks.push('Interrupted actual membership read fails closed and Retry recovers');
 phase='offline';await context.setOffline(true);await page.getByText('You are offline.',{exact:true}).waitFor();checks.push('Actual Home offline warning');await context.setOffline(false);await page.getByRole('button',{name:'Refresh workspace',exact:true}).click();await page.getByText('You are offline.',{exact:true}).waitFor({state:'hidden'});checks.push('Reconnect and explicit workspace refresh');
 phase='supervisor-navigation';await page.getByRole('button',{name:'Revenue supervisor',exact:true}).click();await page.getByRole('heading',{name:'Revenue supervisor queue'}).waitFor({timeout:30000});await page.getByRole('heading',{name:'Active exceptions'}).waitFor({timeout:45000});checks.push('Actual Home navigation to genuine supervisor queue read');await screenshot('owner-supervisor');
 phase='owner-sign-out';await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:30000});checks.push('Owner sign-out returns to actual AuthPanel');
 for(const role of ['manager','staff']){phase=role+'-preview-denial';await login(role);await page.getByText('This preview is available only to its designated owner.',{exact:true}).waitFor({timeout:45000});assert.equal(await page.getByRole('heading',{name:'Today',exact:true}).count(),0);checks.push(role+' genuine Auth denied by actual owner-only server gate');await page.getByRole('button',{name:'Sign out and use another account',exact:true}).click();await page.getByRole('heading',{name:'Welcome back'}).waitFor();}
 }
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);checks.push('No unexpected network operations or uncaught browser errors');
 const report={status:expiryProbe?'actual-home-expiry-probe-passed':expiryMode?'actual-home-natural-expiry-passed':rejectionMode?'actual-home-auth-rejection-passed':reviewMode?'actual-home-review-recovery-passed':'actual-home-genuine-auth-browser-passed',candidate:provenance.candidate,project:provenance.project,checks,reads,review_actions_disabled:!reviewMode,pricing_actions_disabled:true,queue_observations_may_persist:!authLifecycleMode,operator_cleanup_required:!authLifecycleMode,...(expiryMode||expiryProbe?{automatic_refreshes:automaticRefreshes,original_expires_at:new Date(originalExpiry*1000).toISOString(),natural_jwt_expiry_qualified:expiryMode}:{}),...(rejectionMode?{identity_rejections:identityRejections,natural_jwt_expiry_qualified:false}:{}),...(reviewMode?{scope,commands,receipts,denials}:{}),limits:'Isolated Chromium HTTP host using synthetic property. Queue observations and bounded review effects require independent scoped audit and cleanup. Not live PMS deployment, populated hotel inventory, installed PWA, physical iPhone or historical hotel outcomes.'};await writeFile(resolve(out,expiryProbe?'probe-report.json':'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{process.exitCode=1;await writeFile(resolve(out,'report.json'),JSON.stringify({status:'actual-home-genuine-auth-browser-failed',phase,checks,reads,blocked,error_count:errors.length,...(reviewMode?{commands,receipts,denials}:{})},null,2));console.error(JSON.stringify({status:'actual-home-genuine-auth-browser-failed',phase,checks,reads,blocked,error_count:errors.length,...(reviewMode?{commands,receipts,denials}:{})}));if(page)try{await screenshot('failed');}catch{}}
finally{releasePreview?.();if(page)try{const button=page.getByRole('button',{name:/^(Sign out|Sign out and use another account)$/});if(await button.count()===1){await button.click();await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:20000});}}catch{process.exitCode=1;console.error('Qualification session cleanup could not be confirmed.');}if(authLifecycleMode)for(const token of issuedTokens)try{await revoke(token);}catch{process.exitCode=1;console.error('Isolated test-session cleanup could not be confirmed.');}originalToken='';sessionToken='';sessionRefresh='';authKey='';issuedTokens.length=0;await context?.close();await browser?.close();await new Promise(done=>server.close(done));}
