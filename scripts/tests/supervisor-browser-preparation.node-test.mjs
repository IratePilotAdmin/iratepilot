import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {supervisorBuildOptions} from '../supervisor-browser-build.mjs';

const root=resolve(import.meta.dirname,'../..');
function copy(){const temporary=mkdtempSync(join(tmpdir(),'irp-supervisor-source-'));const directory=join(temporary,'tests/fixtures/pms-supervisor-246');cpSync(join(root,'tests/fixtures/pms-supervisor-246'),directory,{recursive:true});return {temporary,directory};}
test('exact supervisor source and eight dependency snapshots load without credentials',async()=>{
 const source=await supervisorBuildOptions(root);assert.equal(source.provenance.site_version,246);assert.equal(source.provenance.site_commit,'efe6b94765e39f4aa5e916375600666de0750441');assert.equal(Object.keys(source.provenance.files).length,8);assert.match(source.provenance.connection_override,/live connection module excluded/);
});
test('supervisor build refuses source tampering before building or sign-in',async()=>{
 const {temporary,directory}=copy();try{const path=join(directory,'lib__revenue-supervisor-transport.ts.source');writeFileSync(path,readFileSync(path,'utf8')+'\n// tampered');await assert.rejects(supervisorBuildOptions(temporary),/hash mismatch/);}finally{rmSync(temporary,{recursive:true,force:true});}
});
test('supervisor build refuses an unreviewed commit or dependency escape',async()=>{
 for(const mutate of [value=>value.site_commit='wrong',value=>value.files['lib/pilot.ts'].snapshot='../outside.source',value=>delete value.files['lib/revenue-supervisor-journal.ts']]){
  const {temporary,directory}=copy();try{const path=join(directory,'provenance.json'),value=JSON.parse(readFileSync(path,'utf8'));mutate(value);writeFileSync(path,JSON.stringify(value));await assert.rejects(supervisorBuildOptions(temporary));}finally{rmSync(temporary,{recursive:true,force:true});}
 }
});
