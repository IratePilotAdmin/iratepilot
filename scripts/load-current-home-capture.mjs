import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';

export async function loadCurrentHomeCapture(captureDir=resolve('tests/fixtures/pms-home-current-263')){
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const parts=await Promise.all(Array.from({length:6},(_,i)=>readFile(resolve(captureDir,`capture-${String(i).padStart(2,'0')}.b64`),'utf8')));
 const encoded=parts.join('');
 assert.equal(encoded.length,1928444);
 assert.equal(hash(encoded),'5cb4052dcc491a0518102c92e7aef8bfc98d9a79f5d1156a4c33caf1fedecd20');
 assert.match(encoded,/^[A-Za-z0-9+/]+={0,2}$/);
 const capture=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:64*1024*1024}).toString('utf8'));
 const {provenance,sources,assets}=capture;
 assert.equal(provenance.candidate,'743b1d704b08e5f2b2ed977d8f1108b3c215ca13');
 assert.equal(provenance.site_version,263);
 assert.equal(provenance.project,'ybehrayzwzyufxbxcysq');
 assert.equal(Object.keys(sources).length,433);
 assert.deepEqual(Object.keys(sources).sort(),Object.keys(provenance.files).sort());
 assert.deepEqual(Object.keys(assets).sort(),['home.css','home.js','preview.mjs']);
 assert.deepEqual(Object.keys(provenance.assets).sort(),Object.keys(assets).sort());
 assert.ok(!Object.hasOwn(sources,'lib/hotel-connection.ts'));
 for(const [name,content] of Object.entries(sources)){
  assert.match(name,/^(app|components|lib)\/[A-Za-z0-9_./-]+\.(ts|tsx)$/);
  assert.ok(!name.split('/').some(part=>part==='..'||part==='.'||part===''));
  assert.equal(typeof content,'string');assert.equal(hash(content),provenance.files[name]);
 }
 for(const [name,content] of Object.entries(assets)){assert.equal(typeof content,'string');assert.equal(hash(content),provenance.assets[name]);}
 assert.match(sources['components/rates-panel.tsx'],/RevenueApprovalRecoveryPanel/);
 assert.match(sources['components/revenue-approval-recovery-panel.tsx'],/Audited recommendation saving and retry are not yet enabled/);
 await mkdir(resolve('work'),{recursive:true});
 const fixture=await mkdtemp(resolve('work/current-home-263-'));
 for(const [name,content] of Object.entries(sources)){const path=resolve(fixture,'source',name);await mkdir(dirname(path),{recursive:true});await writeFile(path,content,{flag:'wx'});}
 for(const [name,content] of Object.entries(assets))await writeFile(resolve(fixture,name),content,{flag:'wx'});
 await writeFile(resolve(fixture,'provenance.json'),JSON.stringify(provenance,null,2),{flag:'wx'});
 return {fixture,provenance};
}
