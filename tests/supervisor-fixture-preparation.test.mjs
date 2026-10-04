import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const script=resolve('scripts/prepare-supervisor-review-fixture.mjs');
function generate(root){return spawnSync(process.execPath,[script,root],{encoding:'utf8',timeout:10_000})}
test('fixture preparation creates short-lived independent scopes without executing SQL',()=>{
 const roots=[mkdtempSync(join(tmpdir(),'irp-review-')),mkdtempSync(join(tmpdir(),'irp-review-'))];
 try{
  const fixtures=roots.map(root=>{
   const result=generate(root);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).sql_executed,false);
   assert.deepEqual(readdirSync(root).sort(),['audit.sql','cleanup.sql','install.sql','manifest.json']);
   const f=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
   assert.equal(f.project_ref,'ybehrayzwzyufxbxcysq');assert.equal(f.initial_revision,1);
   assert.equal(Date.parse(f.expires_at)-Date.parse(f.generated_at),30*60_000);
   assert.ok(Date.parse(f.expires_at)>Date.now());
   assert.notEqual(f.property_id,'7d9add80-216e-435c-86e9-58e17cdcbb6d');
   assert.notEqual(f.tenant_id,'faa76112-c793-43db-92bd-f9faecd8d93a');
   assert.equal(new Set([f.owner_id,f.manager_id,f.staff_id]).size,3);
   return f;
  });
  for(const key of ['tenant_id','property_id','issue_id'])assert.notEqual(fixtures[0][key],fixtures[1][key]);
 }finally{roots.forEach(root=>rmSync(root,{recursive:true,force:true}))}
});
test('fixture preparation preserves a populated output directory',()=>{
 const root=mkdtempSync(join(tmpdir(),'irp-review-'));
 try{writeFileSync(join(root,'manifest.json'),'existing');assert.notEqual(generate(root).status,0);assert.equal(readFileSync(join(root,'manifest.json'),'utf8'),'existing');assert.deepEqual(readdirSync(root),['manifest.json']);}
 finally{rmSync(root,{recursive:true,force:true})}
});
test('fixture generator does not accept extra target arguments',()=>{
 const root=mkdtempSync(join(tmpdir(),'irp-review-'));
 try{const result=spawnSync(process.execPath,[script,root,'eiqmdldjnedqgbtoozqa'],{encoding:'utf8',timeout:10_000});assert.notEqual(result.status,0);assert.deepEqual(readdirSync(root),[]);}
 finally{rmSync(root,{recursive:true,force:true})}
});
