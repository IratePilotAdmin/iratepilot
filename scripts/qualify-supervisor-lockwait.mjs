// Genuine Auth HTTP only. Operator supplies the independent scoped database lock holder.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateLockwaitFixture} from './supervisor-lockwait-config.mjs';
const f=validateLockwaitFixture(JSON.parse(await readFile(process.env.IRP_REVIEW_FIXTURE_PATH||'','utf8')));
assert.equal(process.env.IRP_REVIEW_SUPERVISED_CLEANUP,'1');
const key=process.env.IRP_REVIEW_PUBLISHABLE_KEY;
assert.equal(key,'sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf');
if(process.argv.length===3&&process.argv[2]==='--preflight'){console.log(JSON.stringify({status:'preflight-passed',start_at:f.start_at,cleanup_required:true}));process.exit(0);}
assert.equal(process.argv.length,2);
const base='https://ybehrayzwzyufxbxcysq.supabase.co',checks=[],responses=[];
let token,phase='sign-in';
async function request(path,body,bearer=token){
 const r=await fetch(base+path,{method:'POST',signal:AbortSignal.timeout(20000),headers:{apikey:key,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)});
 return {ok:r.ok,status:r.status,data:await r.json().catch(()=>null)};
}
async function scheduled(offset,name){phase=name;const at=Date.parse(f.start_at)+offset;assert.ok(Date.now()<at-1000,'Missed scheduled phase');console.log(JSON.stringify({status:'armed',phase,at:new Date(at).toISOString()}));while(Date.now()<at)await new Promise(r=>setTimeout(r,Math.min(1000,at-Date.now())));}
function command(revision,action,id){return {p_tenant:f.tenant_id,p_property:f.property_id,p_issue:f.issue_id,p_expected_revision:revision,p_action:action,p_request:id};}
async function review(body){assert.ok(Date.now()<Date.parse(f.expires_at));const r=await request('/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_review',body);responses.push({phase,command:body,http_status:r.status,...(r.ok?{receipt:r.data}:{sqlstate:r.data?.code})});return r;}
try {
 const email=process.env.IRP_REVIEW_MANAGER_EMAIL,password=process.env.IRP_REVIEW_MANAGER_PASSWORD;assert.ok(email&&password);
 const signed=await request('/auth/v1/token?grant_type=password',{email,password},null);assert.ok(signed.ok&&signed.data?.access_token);token=signed.data.access_token;assert.equal(signed.data.user?.id,f.manager_id);
 const denied=command(1,'claim',f.requests.denied),claim=command(1,'claim',f.requests.claim);
 await scheduled(0,'new-command-lockwait');const first=await review(denied);assert.equal(first.ok,false);assert.equal(first.status,403);assert.equal(first.data?.code,'42501');checks.push('new command denied after supervised lock-wait revocation');
 await scheduled(30000,'authorized-claim');const committed=await review(claim);assert.ok(committed.ok);assert.equal(committed.data.request_id,f.requests.claim);assert.equal(committed.data.issue_id,f.issue_id);assert.equal(committed.data.revision,2);assert.equal(committed.data.replayed,false);checks.push('reauthorized manager commits one claim');
 await scheduled(60000,'committed-replay-lockwait');const deniedReplay=await review(claim);assert.equal(deniedReplay.ok,false);assert.equal(deniedReplay.status,403);assert.equal(deniedReplay.data?.code,'42501');checks.push('committed receipt replay denied after supervised lock-wait revocation');
 await scheduled(90000,'reauthorized-exact-replay');const replay=await review(claim);assert.ok(replay.ok);assert.deepEqual(replay.data,{...committed.data,replayed:true});checks.push('reauthorized identical command returns its original receipt');
 phase='release';const released=await review(command(2,'release',f.requests.release));assert.ok(released.ok);assert.equal(released.data.request_id,f.requests.release);assert.equal(released.data.issue_id,f.issue_id);assert.equal(released.data.revision,3);assert.equal(released.data.review_status,'open');checks.push('manager releases at revision three');
 const signout=await request('/auth/v1/logout?scope=local',{});assert.ok(signout.ok);token=null;
 const report={status:'lockwait-http-passed',checks,responses,expected_database_events:2,expected_final_revision:3,database_wait_observations_required:2,cleanup_required:true,limits:'Synthetic isolated HTTP and database transactions only; no full Home recovery, physical PWA or hotel-outcome proof.'};
 const root=resolve('work/supervisor-lockwait-evidence');await mkdir(root,{recursive:true});await writeFile(resolve(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch {process.exitCode=1;console.error(JSON.stringify({status:'lockwait-http-failed',phase,checks,responses,cleanup_required:true}));}
finally {if(token)try{const r=await request('/auth/v1/logout?scope=local',{});if(!r.ok)process.exitCode=1;}catch{process.exitCode=1;}}
