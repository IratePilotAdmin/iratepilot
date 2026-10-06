// New read-only prerequisite. Protected credentials remain inside the CI process.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {actors,baseline,project} from './supervisor-queue-qualification-config.mjs';
const base=`https://${project}.supabase.co`,key='sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf';
const checks=[];let token,phase='anonymous';
const paths=new Set(['/auth/v1/token?grant_type=password','/auth/v1/logout?scope=local','/rest/v1/rpc/irp_pms_pilot_workspaces','/rest/v1/rpc/irp_pms_pilot_workspace']);
async function request(path,body,bearer=token){
 assert.ok(paths.has(path),'Unexpected transport');
 const response=await fetch(base+path,{method:'POST',signal:AbortSignal.timeout(20000),headers:{apikey:key,'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:JSON.stringify(body)});
 return {ok:response.ok,status:response.status,data:await response.json().catch(()=>null)};
}
async function logout(){if(!token)return;const result=await request('/auth/v1/logout?scope=local',{});assert.ok(result.ok);token=null;}
try{
 for(const name of ['workspaces','workspace']){
  const result=await request(`/rest/v1/rpc/irp_pms_pilot_${name}`,name==='workspace'?{p_tenant:baseline.tenant,p_property:baseline.property}:{},null);
  assert.ok(!result.ok);assert.equal(result.data?.code,'42501');checks.push(`anonymous ${name} denied`);
 }
 for(const role of ['owner','manager','staff']){
  phase=`${role}-sign-in`;const prefix=`IRP_HTTP_TEST_${role.toUpperCase()}`;
  const email=process.env[`${prefix}_EMAIL`],password=process.env[`${prefix}_PASSWORD`];assert.ok(email&&password);
  const signed=await request('/auth/v1/token?grant_type=password',{email,password},null);assert.ok(signed.ok);assert.equal(signed.data.user?.id,actors[role]);token=signed.data.access_token;assert.ok(token);
  phase=`${role}-memberships`;const members=await request('/rest/v1/rpc/irp_pms_pilot_workspaces',{});assert.ok(members.ok);assert.equal(members.data.length,1);
  assert.equal(members.data[0].tenant_id,baseline.tenant);assert.equal(members.data[0].property_id,baseline.property);assert.equal(members.data[0].role,role);checks.push(`${role} Auth-issued membership scope and role`);
  phase=`${role}-workspace`;const workspace=await request('/rest/v1/rpc/irp_pms_pilot_workspace',{p_tenant:baseline.tenant,p_property:baseline.property});assert.ok(workspace.ok);assert.equal(workspace.data.property.id,baseline.property);assert.equal(workspace.data.role,role);assert.match(workspace.data.business_date,/^\d{4}-\d{2}-\d{2}$/);assert.equal(workspace.data.room_types.length,1);
  for(const field of ['rooms','reservations','capacity','activity'])assert.deepEqual(workspace.data[field],[]);checks.push(`${role} scoped Home workspace read`);
  phase=`${role}-cross-scope`;const denied=await request('/rest/v1/rpc/irp_pms_pilot_workspace',{p_tenant:baseline.tenant,p_property:'00000000-0000-4000-8000-000000000099'});assert.equal(denied.ok,false);assert.equal(denied.status,403);assert.equal(denied.data?.code,'42501');checks.push(`${role} unauthorized property denied`);
  phase=`${role}-sign-out`;await logout();
 }
 const report={status:'home-read-services-http-passed',project_ref:project,checks,read_only:true,limits:'Genuine Auth-issued HTTP reads of preserved synthetic baseline only. No Home DOM, private-preview authorization, populated inventory, mobile recovery, physical PWA or hotel-outcome proof.'};
 await mkdir('work/home-read-services-evidence',{recursive:true});await writeFile('work/home-read-services-evidence/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch{process.exitCode=1;console.error(JSON.stringify({status:'home-read-services-http-failed',phase,checks}));}
finally{try{await logout();}catch{process.exitCode=1;console.error('Qualification session cleanup failed.');}}
