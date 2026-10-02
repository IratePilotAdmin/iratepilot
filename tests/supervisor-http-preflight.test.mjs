import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

function preflight(overrides={},supervised='1') {
  const root=mkdtempSync(join(tmpdir(),'review-preflight-'));
  try {
    const path=join(root,'manifest.json');
    writeFileSync(path,JSON.stringify({project_ref:'ybehrayzwzyufxbxcysq',purpose:'isolated-supervisor-review-race',
      initial_revision:1,initial_status:'open',initial_assignee:null,expires_at:new Date(Date.now()+30*60_000).toISOString(),
      tenant_id:randomUUID(),property_id:randomUUID(),issue_id:randomUUID(),owner_id:randomUUID(),manager_id:randomUUID(),staff_id:randomUUID(),...overrides}));
    return spawnSync(process.execPath,[resolve('scripts/qualify-supervisor-review-race.mjs'),'--preflight'],{
      encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,IRP_REVIEW_FIXTURE_PATH:path,
        IRP_REVIEW_PUBLISHABLE_KEY:'sb_publishable_fixture_only',IRP_REVIEW_SUPERVISED_CLEANUP:supervised}});
  } finally { rmSync(root,{recursive:true,force:true}); }
}
test('preflight succeeds without any Auth credentials or sign-in',()=>{
  const result=preflight();assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).status,'preflight-passed');
});
test('live parent target is rejected before Auth',()=>{
  assert.notEqual(preflight({project_ref:'eiqmdldjnedqgbtoozqa'}).status,0);
});
test('expired and insufficient-duration fixtures are rejected before Auth',()=>{
  for(const remaining of [-1000,60_000])assert.notEqual(preflight({expires_at:new Date(Date.now()+remaining).toISOString()}).status,0);
});
test('unattended execution is rejected before Auth',()=>{
  assert.notEqual(preflight({},'0').status,0);
});
