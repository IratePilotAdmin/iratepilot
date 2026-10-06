import assert from 'node:assert/strict';
import {actors,baseline,project,hashes} from './supervisor-queue-qualification-config.mjs';
export function validateLockwaitFixture(f,now=Date.now()) {
 const keys=['project_ref','purpose','tenant_id','property_id','issue_id','owner_id','manager_id','staff_id','initial_revision','initial_status','initial_assignee','generated_at','expires_at','start_at','review_hash','requests'];
 assert.deepEqual(Object.keys(f).sort(),keys.sort());
 assert.equal(f.project_ref,project);assert.equal(f.purpose,'isolated-supervisor-lockwait');
 assert.equal(f.review_hash,hashes.review);assert.equal(f.initial_revision,1);assert.equal(f.initial_status,'open');assert.equal(f.initial_assignee,null);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 for(const key of ['tenant_id','property_id','issue_id','owner_id','manager_id','staff_id'])assert.match(f[key],uuid);
 for(const [role,id] of Object.entries(actors))assert.equal(f[role+'_id'],id);
 assert.equal(new Set([f.tenant_id,f.property_id,f.issue_id,...Object.values(actors),baseline.tenant,baseline.property]).size,8);
 assert.notEqual(f.tenant_id,'faa76112-c793-43db-92bd-f9faecd8d93a');assert.notEqual(f.property_id,'7d9add80-216e-435c-86e9-58e17cdcbb6d');
 const start=Date.parse(f.generated_at),end=Date.parse(f.expires_at),run=Date.parse(f.start_at);
 for(const key of ['generated_at','expires_at','start_at'])assert.equal(new Date(Date.parse(f[key])).toISOString(),f[key]);
 assert.equal(end-start,1800000);assert.ok(start<=now+5000&&end>now+120000);
 assert.ok(run>=start+120000&&run<=start+600000&&run>now+30000,'Fresh scheduled start required');
 assert.deepEqual(Object.keys(f.requests).sort(),['claim','denied','release']);
 for(const id of Object.values(f.requests))assert.match(id,uuid);
 assert.equal(new Set([...Object.values(f.requests),f.tenant_id,f.property_id,f.issue_id,...Object.values(actors),baseline.tenant,baseline.property]).size,11);
 return f;
}
