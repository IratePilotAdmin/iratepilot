import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {RevenueSupervisorQueue} from 'irp-supervisor-component';
import {hotelClient} from 'irp-supervisor-pilot';
import {readSupervisorCommand,supervisorJournalKey} from 'irp-supervisor-journal';
import {baseline,validateQueueFixture} from './supervisor-queue-qualification-config.mjs';

// Test host only. The component/transport/journal/deadlines remain unchanged.
// Membership props describe the two installed synthetic scopes; full Home
// membership loading is outside this qualification and is never simulated as proof.
let root,fixture,role,releaseLock;
async function start(nextRole,value,credentials){
 fixture=validateQueueFixture(value);role=nextRole;
 if(!['owner','manager','staff'].includes(role))throw Error('Unexpected fixture actor');
 const client=hotelClient();
 if(credentials){const signed=await client.auth.signInWithPassword(credentials);if(signed.error||!signed.data.session)throw Error('Browser fixture sign-in failed');}
 const current=await client.auth.getSession();
 if(current.error||!current.data.session)throw Error('Browser fixture session absent');
 const verified=await client.auth.getUser(current.data.session.access_token);
 if(verified.error||verified.data.user?.id!==fixture[role+'_id'])throw Error('Browser fixture identity mismatch');
 const label='Synthetic queue recovery '+fixture.tenant_id.replaceAll('-','');
 const members=[{tenant_id:baseline.tenant,property_id:baseline.property,tenant_name:baseline.tenantName,property_name:baseline.propertyName,role,time_zone:'America/Chicago'},
  {tenant_id:fixture.tenant_id,property_id:fixture.property_id,tenant_name:label,property_name:label,role,time_zone:'America/Chicago'}];
 if(!root)root=createRoot(document.getElementById('supervisor-host'));
 root.render(createElement(RevenueSupervisorQueue,{key:role,actor:fixture[role+'_id'],members,onOpen:()=>{}}));
 return {secure:window.isSecureContext,locks:!!navigator.locks?.request};
}
function journal(){return readSupervisorCommand(localStorage,fixture[role+'_id']);}
function holdLock(){
 if(releaseLock)throw Error('Fixture lock already held');
 void navigator.locks.request(supervisorJournalKey(fixture[role+'_id']),{mode:'exclusive'},async()=>{
  document.body.dataset.fixtureLock='held';await new Promise(resolve=>releaseLock=resolve);
  releaseLock=undefined;document.body.dataset.fixtureLock='released';
 });
}
async function signOut(){root?.unmount();root=undefined;releaseLock?.();const result=await hotelClient().auth.signOut({scope:'local'});if(result.error)throw Error('Browser fixture signout failed');return true;}
Object.assign(window,{supervisorQualification:{start,journal,holdLock,releaseLock:()=>releaseLock?.(),signOut}});
document.body.dataset.ready='true';
