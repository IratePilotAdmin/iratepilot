import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {baseline,validateQueueFixture} from '../supervisor-queue-qualification-config.mjs';
const generator=resolve('scripts/prepare-supervisor-queue-fixture.mjs'),runner=resolve('scripts/qualify-supervisor-queue-recovery.mjs');
function fresh(){const root=mkdtempSync(join(tmpdir(),'irp-queue-'));const result=spawnSync(process.execPath,[generator,root],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return {root,f:JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'))};}
test('generator makes independent 30-minute scopes, separate DDL/data cleanup and no credential fields',()=>{
 const fixtures=[fresh(),fresh()];try{
  for(const {root,f} of fixtures){assert.equal(validateQueueFixture(f),f);assert.equal(Date.parse(f.expires_at)-Date.parse(f.generated_at),1800000);assert.deepEqual(readdirSync(root).sort(),['audit.sql','cleanup-data.sql','cleanup-guards.sql','install-data.sql','install-guards.sql','manifest.json']);assert.equal(/password|access_token|signing_secret/.test(JSON.stringify(f)),false);assert.equal(/CREATE FUNCTION|CREATE TRIGGER/.test(readFileSync(join(root,'install-data.sql'),'utf8')),false);assert.equal(/DELETE FROM/.test(readFileSync(join(root,'cleanup-guards.sql'),'utf8')),false);const guards=readFileSync(join(root,'install-guards.sql'),'utf8');assert.match(guards,/NEW.expected_revision IS DISTINCT FROM 3/);assert.match(guards,/role='manager'/);assert.match(guards,new RegExp(f.tenant_id));assert.match(guards,/ERRCODE='55000'/);}
  assert.notEqual(fixtures[0].f.tenant_id,fixtures[1].f.tenant_id);assert.notEqual(fixtures[0].f.property_id,fixtures[1].f.property_id);
 }finally{for(const {root} of fixtures)rmSync(root,{recursive:true,force:true});}
});
test('preflight refuses other projects, pilot scopes, actor substitution, secrets and changed source',()=>{
 const {root,f}=fresh();try{for(const mutate of [v=>v.project_ref='eiqmdldjnedqgbtoozqa',v=>v.property_id='7d9add80-216e-435c-86e9-58e17cdcbb6d',v=>v.tenant_id=baseline.tenant,v=>v.property_id=baseline.property,v=>v.manager_id=v.owner_id,v=>v.queue_hash='wrong',v=>v.password='must-not-be-read',v=>v.purpose='isolated-supervisor-review-race']){const value={...f};mutate(value);assert.throws(()=>validateQueueFixture(value));}}finally{rmSync(root,{recursive:true,force:true});}
});

test('simulated HTTP revocation retains the other property and never reviews its issues',()=>{
 const {root,f}=fresh();try{
  const preload=join(root,'scope-fetch.mjs'),metrics=join(root,'metrics.json');
  writeFileSync(preload,`import {readFileSync,writeFileSync} from 'node:fs';
const f=JSON.parse(readFileSync(process.env.IRP_REVIEW_FIXTURE_PATH)),b=${JSON.stringify(baseline)};
let signins=0,revision=1,assigned=false,demoted=false,commands=[],receipts=new Map();
const roles=['owner','manager','staff'],json=(data,status=200)=>new Response(JSON.stringify(data),{status});
globalThis.fetch=async(url,init)=>{const path=new URL(url).pathname,role=init.headers.Authorization?.replace('Bearer ','');
 if(path==='/auth/v1/token')return json({access_token:roles[signins++]});
 if(path==='/auth/v1/user')return json({id:f[role+'_id']});
 if(path==='/auth/v1/logout')return new Response(null,{status:204});
 if(path.endsWith('_queue')){
  const base=role==='staff'?[]:['capture_missing','room_mapping'].map(issue_key=>({tenant_id:b.tenant,property_id:b.property,issue_key,revision:1,review_status:'open',assigned:false}));
  const scoped=role==='staff'||(role==='manager'&&demoted)?[]:[{id:'synthetic-new-issue',tenant_id:f.tenant_id,property_id:f.property_id,issue_key:'capture_missing',revision,review_status:assigned?'in_review':'open',assigned,reclaimable:assigned&&demoted}];
  return json({as_of:new Date().toISOString(),property_count:(base.length?1:0)+(scoped.length?1:0),total:base.length+scoped.length,items:[...base,...scoped],next_offset:null});
 }
 if(path.endsWith('_review')){
  const c=JSON.parse(init.body);commands.push(c);
  if(c.p_tenant!==f.tenant_id||c.p_property!==f.property_id)throw Error('Protected old pricing scope review');
  if(role==='staff'||(role==='manager'&&demoted))return json({code:'42501'},403);
  if(receipts.has(c.p_request))return json({...receipts.get(c.p_request),replayed:true});
  if(c.p_expected_revision!==revision)throw Error('Unexpected revision');
  const reclaimed=role==='owner'&&assigned&&demoted;revision++;assigned=c.p_action==='claim';
  if(role==='manager')demoted=true;
  const receipt={issue_id:c.p_issue,request_id:c.p_request,revision,replayed:false,...(reclaimed?{reclaimed:true,previous_assignee:f.manager_id}:{})};receipts.set(c.p_request,receipt);return json(receipt);
 }
 throw Error('Unexpected HTTP operation');
};process.on('exit',()=>writeFileSync(process.env.METRICS,JSON.stringify({revision,assigned,commands,signins})));`);
  const env={...process.env,METRICS:metrics,IRP_REVIEW_FIXTURE_PATH:join(root,'manifest.json'),IRP_REVIEW_PUBLISHABLE_KEY:'sb_publishable_simulated',IRP_REVIEW_SUPERVISED_CLEANUP:'1'};
  for(const role of ['OWNER','MANAGER','STAFF']){env[`IRP_REVIEW_${role}_EMAIL`]='synthetic@invalid';env[`IRP_REVIEW_${role}_PASSWORD`]='synthetic-do-not-log';}
  const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,runner],{encoding:'utf8',env});assert.equal(result.status,0,result.stderr);
  const state=JSON.parse(readFileSync(metrics,'utf8'));assert.equal(state.revision,6);assert.equal(state.assigned,false);assert.equal(state.signins,3);
  assert.ok(state.commands.every(c=>c.p_tenant===f.tenant_id&&c.p_property===f.property_id));assert.equal((result.stdout+result.stderr).includes('synthetic-do-not-log'),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('preflight refuses expired, extended and malformed times',()=>{
 const {root,f}=fresh();try{assert.throws(()=>validateQueueFixture(f,Date.parse(f.expires_at)-120000));assert.throws(()=>validateQueueFixture({...f,expires_at:new Date(Date.parse(f.expires_at)+1).toISOString()}));assert.throws(()=>validateQueueFixture({...f,generated_at:'not-a-date'}));assert.throws(()=>validateQueueFixture(f,Date.parse(f.generated_at)-6000));}finally{rmSync(root,{recursive:true,force:true});}
});
test('generator preserves nonempty directories and rejects a target override',()=>{
 const root=mkdtempSync(join(tmpdir(),'irp-queue-'));try{writeFileSync(join(root,'existing.txt'),'keep');assert.notEqual(spawnSync(process.execPath,[generator,root],{encoding:'utf8'}).status,0);assert.equal(readFileSync(join(root,'existing.txt'),'utf8'),'keep');assert.notEqual(spawnSync(process.execPath,[generator,root,'eiqmdldjnedqgbtoozqa'],{encoding:'utf8'}).status,0);assert.deepEqual(readdirSync(root),['existing.txt']);}finally{rmSync(root,{recursive:true,force:true});}
});
test('runner preflight requires supervision and cannot log injected secret content',()=>{
 const {root,f}=fresh();try{
  const env={...process.env,IRP_REVIEW_FIXTURE_PATH:join(root,'manifest.json'),IRP_REVIEW_PUBLISHABLE_KEY:'sb_publishable_synthetic_fixture',IRP_REVIEW_SUPERVISED_CLEANUP:'1'};
  const passed=spawnSync(process.execPath,[runner,'--preflight'],{encoding:'utf8',env});assert.equal(passed.status,0,passed.stderr);assert.equal(JSON.parse(passed.stdout).status,'preflight-passed');
  const denied=spawnSync(process.execPath,[runner,'--preflight'],{encoding:'utf8',env:{...env,IRP_REVIEW_SUPERVISED_CLEANUP:'0'}});assert.notEqual(denied.status,0);assert.equal(JSON.parse(denied.stderr).phase,'preflight');
  writeFileSync(join(root,'manifest.json'),JSON.stringify({...f,password:'sentinel-do-not-log'}));const redacted=spawnSync(process.execPath,[runner,'--preflight'],{encoding:'utf8',env});assert.notEqual(redacted.status,0);assert.equal((redacted.stdout+redacted.stderr).includes('sentinel-do-not-log'),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('verified Auth identity mismatch aborts before queue/review and cleans up an empty 204 logout',()=>{
 const {root}=fresh();try{
  const preload=join(root,'mock-fetch.mjs'),metrics=join(root,'metrics.json');
  writeFileSync(preload,`import {writeFileSync} from 'node:fs';let calls=[];globalThis.fetch=async(url,init)=>{const path=new URL(url).pathname;calls.push(path);if(path==='/auth/v1/token')return new Response(JSON.stringify({access_token:'synthetic-token-do-not-log'}),{status:200});if(path==='/auth/v1/user')return new Response(JSON.stringify({id:'different-test-identity'}),{status:200});if(path==='/auth/v1/logout')return new Response(null,{status:204});throw Error('Unexpected operation');};process.on('exit',()=>writeFileSync(process.env.METRICS,JSON.stringify(calls)));`);
  const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,runner],{encoding:'utf8',env:{...process.env,METRICS:metrics,IRP_REVIEW_FIXTURE_PATH:join(root,'manifest.json'),IRP_REVIEW_PUBLISHABLE_KEY:'sb_publishable_synthetic_fixture',IRP_REVIEW_SUPERVISED_CLEANUP:'1',IRP_REVIEW_OWNER_EMAIL:'owner@synthetic.invalid',IRP_REVIEW_OWNER_PASSWORD:'synthetic-password-do-not-log'}});
  assert.notEqual(result.status,0);assert.equal(JSON.parse(result.stderr.trim()).phase,'sign-in');assert.equal((result.stdout+result.stderr).includes('synthetic-token-do-not-log'),false);assert.equal((result.stdout+result.stderr).includes('synthetic-password-do-not-log'),false);
  assert.deepEqual(JSON.parse(readFileSync(metrics,'utf8')),['/auth/v1/token','/auth/v1/user','/auth/v1/logout']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
