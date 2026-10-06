import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {validateLockwaitFixture} from '../supervisor-lockwait-config.mjs';
function fresh(){const root=mkdtempSync(join(tmpdir(),'irp-lockwait-'));const r=spawnSync(process.execPath,['scripts/prepare-supervisor-lockwait-fixture.mjs',root],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return {root,f:JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'))};}
test('lock-wait preparation isolates actors, scopes, commands and scheduled phases',()=>{
 const {root,f}=fresh();try {
  validateLockwaitFixture(f);assert.equal(Date.parse(f.start_at)-Date.parse(f.generated_at),180000);
  const holder=readFileSync(join(root,'hold-new.sql'),'utf8');
  assert.match(holder,/pg_blocking_pids/);assert.match(holder,/wait_event='advisory'/);assert.match(holder,/No HTTP advisory wait observed; revocation withheld/);
  assert.match(holder,/statement_timeout='25s'/);assert.match(holder,/role='manager'/);assert.equal(/GRANT |CREATE FUNCTION/.test(holder),false);
  assert.match(holder,/INSERT INTO irp_pms.review_lockwait_probe_/);
  const install=readFileSync(join(root,'install.sql'),'utf8');assert.match(install,/ENABLE ROW LEVEL SECURITY/);assert.match(install,/REVOKE ALL ON irp_pms.review_lockwait_probe_/);
  assert.match(readFileSync(join(root,'cleanup.sql'),'utf8'),/DROP TABLE IF EXISTS irp_pms.review_lockwait_probe_/);
  assert.match(readFileSync(join(root,'restore-before-replay.sql'),'utf8'),/<>1 THEN RAISE/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('lock-wait preflight rejects wrong target, actor, stale start, changed source and extra fields',()=>{
 const {root,f}=fresh();try{for(const mutate of [v=>v.project_ref='eiqmdldjnedqgbtoozqa',v=>v.manager_id=v.owner_id,v=>v.start_at=v.generated_at,v=>v.review_hash='changed',v=>v.password='unexpected',v=>v.requests.claim=v.requests.denied]){const v=structuredClone(f);mutate(v);assert.throws(()=>validateLockwaitFixture(v));}}finally{rmSync(root,{recursive:true,force:true});}
});
test('simulated HTTP runner keeps replay command identical and requires denial and original receipt',()=>{
 const {root,f}=fresh();try{
  const preload=join(root,'simulated.mjs');
  writeFileSync(preload,`import {readFileSync} from 'node:fs';
const f=JSON.parse(readFileSync(process.env.IRP_REVIEW_FIXTURE_PATH));let now=Date.now(),calls=0,original;
Date.now=()=>now;globalThis.setTimeout=(cb,ms)=>{queueMicrotask(()=>{now+=ms;cb();});return 1;};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
globalThis.fetch=async(url,init)=>{
 if(url.endsWith('/auth/v1/token?grant_type=password'))return json({access_token:'synthetic',user:{id:f.manager_id}});
 if(url.endsWith('/auth/v1/logout?scope=local'))return new Response(null,{status:204});
 if(!url.endsWith('/rest/v1/rpc/irp_pms_pilot_revenue_supervisor_review'))throw Error('Unexpected destination');
 const c=JSON.parse(init.body);if(c.p_tenant!==f.tenant_id||c.p_property!==f.property_id)throw Error('Wrong scope');calls++;
 if(calls===1||calls===3)return json({code:'42501'},403);
 if(calls===2){original=c;return json({request_id:c.p_request,issue_id:f.issue_id,revision:2,review_status:'in_review',replayed:false});}
 if(calls===4){if(JSON.stringify(c)!==JSON.stringify(original))throw Error('Replaced replay');return json({request_id:c.p_request,issue_id:f.issue_id,revision:2,review_status:'in_review',replayed:true});}
 if(calls===5)return json({request_id:c.p_request,issue_id:f.issue_id,revision:3,review_status:'open',replayed:false});throw Error('Extra review');
};`);
  const r=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,resolve('scripts/qualify-supervisor-lockwait.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,IRP_REVIEW_FIXTURE_PATH:join(root,'manifest.json'),IRP_REVIEW_PUBLISHABLE_KEY:'sb_publishable_5qakGx4LyLTT4OnC2mO_ag_b0BY4Vjf',IRP_REVIEW_SUPERVISED_CLEANUP:'1',IRP_REVIEW_MANAGER_EMAIL:'synthetic@invalid',IRP_REVIEW_MANAGER_PASSWORD:'synthetic-not-real'},timeout:10000});
  assert.equal(r.status,0,r.stderr);const evidence=JSON.parse(readFileSync(join(root,'work/supervisor-lockwait-evidence/report.json'),'utf8'));assert.equal(evidence.checks.length,5);assert.equal(evidence.responses.length,5);assert.deepEqual(evidence.responses[1].command,evidence.responses[2].command);assert.deepEqual(evidence.responses[1].command,evidence.responses[3].command);assert.equal(evidence.database_wait_observations_required,2);
 }finally{rmSync(root,{recursive:true,force:true});}
});
