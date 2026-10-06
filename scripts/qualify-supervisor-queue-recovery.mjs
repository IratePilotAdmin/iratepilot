// Genuine Auth / HTTP only. Does not claim browser, Web Locks or phone proof.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {project,baseline,validateQueueFixture} from './supervisor-queue-qualification-config.mjs';
const base=`https://${project}.supabase.co`,sessions=[],checks=[];
let f,key,phase='preflight',failed=false;
async function request(path,token,body){
 if(path.startsWith('/rest/')&&Date.parse(f.expires_at)<=Date.now())throw Error('Fixture expired');
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 const text=await response.text();if(text.length>65536)throw Error('Qualification reply too large');
 const data=text?JSON.parse(text):null;return {ok:response.ok,status:response.status,data};
}
async function signIn(role){
 const email=process.env[`IRP_REVIEW_${role.toUpperCase()}_EMAIL`],password=process.env[`IRP_REVIEW_${role.toUpperCase()}_PASSWORD`];
 assert.ok(email&&password,'Protected test credentials required');
 const reply=await request('/auth/v1/token?grant_type=password',null,{email,password});
 assert.ok(reply.ok&&reply.data?.access_token,'Qualification sign-in failed');
 const token=reply.data.access_token;sessions.push(token);
 const user=await request('/auth/v1/user',token);
 assert.ok(user.ok&&user.data?.id===f[`${role}_id`],'Verified fixture actor mismatch');
 return token;
}
async function queue(token,authorized=true,baselineAuthorized=true){
 const reply=await request('/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_queue',token,{p_offset:0,p_status:'all',p_mine:false});
 assert.ok(reply.ok,'Qualification queue failed');const page=reply.data;
 const expected=(authorized?1:0)+(baselineAuthorized?2:0);
 assert.equal(page.property_count,(authorized?1:0)+(baselineAuthorized?1:0));assert.equal(page.total,expected);assert.equal(page.items.length,expected);assert.equal(page.next_offset,null);
 assert.ok(Number.isFinite(Date.parse(page.as_of))&&Math.abs(Date.now()-Date.parse(page.as_of))<60000,'Queue observation must be fresh');
 const prior=page.items.filter(item=>item.tenant_id===baseline.tenant&&item.property_id===baseline.property);
 assert.deepEqual(prior.map(item=>item.issue_key).sort(),baselineAuthorized?['capture_missing','room_mapping']:[]);
 for(const item of prior){assert.equal(item.revision,1);assert.equal(item.review_status,'open');assert.equal(item.assigned,false);}
 const scoped=page.items.filter(item=>item.tenant_id===f.tenant_id&&item.property_id===f.property_id);
 assert.equal(scoped.length,authorized?1:0);assert.equal(prior.length+scoped.length,page.items.length);
 if(authorized){const issue=scoped[0];assert.equal(issue.issue_key,'capture_missing');return issue;}
 return null;
}
const command=(issue,revision,action)=>({p_tenant:f.tenant_id,p_property:f.property_id,p_issue:issue.id,p_expected_revision:revision,p_action:action,p_request:randomUUID()});
const review=(token,args)=>request('/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_review',token,args);
function receipt(reply,args,revision,replayed=false){assert.ok(reply.ok,'Qualification review failed');assert.equal(reply.data.issue_id,args.p_issue);assert.equal(reply.data.request_id,args.p_request);assert.equal(reply.data.revision,revision);assert.equal(reply.data.replayed,replayed);return reply.data;}
try{
 const args=process.argv.slice(2);assert.ok(args.length===0||(args.length===1&&args[0]==='--preflight'),'Unexpected qualification arguments');
 f=validateQueueFixture(JSON.parse(await readFile(process.env.IRP_REVIEW_FIXTURE_PATH||'','utf8')));
 key=process.env.IRP_REVIEW_PUBLISHABLE_KEY;assert.ok(key?.startsWith('sb_publishable_'),'Isolated publishable key required');
 assert.equal(process.env.IRP_REVIEW_SUPERVISED_CLEANUP,'1','Operator audit and cleanup required');
 if(args[0]==='--preflight')console.log(JSON.stringify({status:'preflight-passed',project_ref:project,cleanup_required:true}));
 else{
  phase='sign-in';const owner=await signIn('owner'),manager=await signIn('manager'),staff=await signIn('staff');
  phase='queue-scope';const issue=await queue(owner);assert.equal(issue.revision,1);assert.equal(issue.review_status,'open');
  assert.equal((await queue(manager)).id,issue.id);await queue(staff,false,false);checks.push('owner/manager see both authorized synthetic properties; staff sees none');
  const claim=command(issue,1,'claim');phase='discarded-owner-reply';
  // Read/validate the committed receipt, then deliberately discard it from the
  // client recovery path. Only the original command survives this injected fault.
  receipt(await review(owner,claim),claim,2);checks.push('real owner claim commits before deliberate reply loss');
  phase='exact-owner-retry';const retry=JSON.parse(JSON.stringify(claim));receipt(await review(owner,retry),retry,2,true);
  assert.equal((await queue(owner)).revision,2);checks.push('fresh HTTP exact retry returns revision two without another claim');
  const release=command(issue,2,'release');receipt(await review(owner,release),release,3);
  phase='fixture-membership-revocation';assert.equal((await queue(manager)).revision,3);
  const managerClaim=command(issue,3,'claim');receipt(await review(manager,managerClaim),managerClaim,4);
  // The reviewed fixture-only AFTER INSERT trigger demotes this tenant's manager
  // membership in the claim transaction. No Auth account or other scope changes.
  await queue(manager,false,true);checks.push('fixture-only demotion removes the new property and retains the earlier authorized property');
  phase='revoked-exact-retry';const denied=await review(manager,JSON.parse(JSON.stringify(managerClaim)));assert.equal(denied.ok,false);assert.equal(denied.data?.code,'42501');
  const staffDenied=await review(staff,command(issue,4,'claim'));assert.equal(staffDenied.ok,false);assert.equal(staffDenied.data?.code,'42501');
  checks.push('revoked manager exact retry and staff review are denied with 42501');
  phase='abandoned-recovery';const abandoned=await queue(owner);assert.equal(abandoned.revision,4);assert.equal(abandoned.reclaimable,true);
  const reclaim=command(issue,4,'claim'),reclaimed=receipt(await review(owner,reclaim),reclaim,5);assert.equal(reclaimed.reclaimed,true);assert.equal(reclaimed.previous_assignee,f.manager_id);
  const finalRelease=command(issue,5,'release');receipt(await review(owner,finalRelease),finalRelease,6);
  const final=await queue(owner);assert.equal(final.revision,6);assert.equal(final.review_status,'open');assert.equal(final.assigned,false);
  checks.push('authorized owner reclaims abandoned review and releases at revision six');
  console.log(JSON.stringify({status:'http-assertions-passed',project_ref:project,checks,expected_events:5,expected_final_revision:6,cleanup_required:true,database_audit_required:true,limits:'Controlled reply discard and fixture trigger demotion; no browser/PWA, real packet loss, revocation lock overlap, reauthorization or load proof.'}));
 }
}catch{
 failed=true;process.exitCode=1;console.error(JSON.stringify({status:'failed',project_ref:project,phase,passed_checks:checks,cleanup_required:true}));
}finally{
 const cleanup=await Promise.allSettled(sessions.map(async token=>{const result=await request('/auth/v1/logout?scope=local',token,{});if(!result.ok)throw Error('Session cleanup failed');}));
 if(cleanup.some(result=>result.status==='rejected')){process.exitCode=1;console.error(JSON.stringify({status:'session-cleanup-failed',qualification_failed:failed,cleanup_required:true}));}
}
