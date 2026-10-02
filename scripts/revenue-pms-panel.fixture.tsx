import {createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {RevenueApprovalRecoveryPanel} from 'irp-pms-panel';
import {hotelClient} from 'irp-pms-pilot';
import {qualification as base} from './revenue-auth-browser-recovery.fixture';
import {parseAuditedWriteConfig,writeProperty} from '../tests/fixtures/revenue-http-write-commands';

// Exact version-215 panel and hotelRpc are bundled without changing their source.
// Only the connection module is replaced by a pinned isolated public connection.
let root:Root|undefined;
let config:ReturnType<typeof parseAuditedWriteConfig>|undefined;
let credentials:Parameters<typeof base.initialize>[2]|undefined;
async function signIn(role:'owner'|'manager'){
 if(!config||!credentials)throw Error('Panel qualification is not initialized');
 const client=hotelClient();
 const signed=await client.auth.signInWithPassword(credentials[role]);
 if(signed.error||!signed.data.session)throw Error('Panel qualification sign-in failed');
 const checked=await client.auth.getUser(signed.data.session.access_token);
 if(checked.error||checked.data.user?.id.toLowerCase()!==config.actors[role].id.toLowerCase())throw Error('Panel qualification identity mismatch');
}
function render(role:'owner'|'manager'='owner',property=writeProperty){
 if(!root||!config)throw Error('Panel qualification is not initialized');
 root.render(createElement(RevenueApprovalRecoveryPanel,{actor:config.actors[role].id,tenant:config.tenantId,property}));
}
async function signOut(){
 root?.unmount();root=undefined;config=undefined;credentials=undefined;
 try{const result=await hotelClient().auth.signOut({scope:'local'});if(result.error)throw Error('Panel session cleanup failed');}
 finally{await base.signOut();}
}
async function initialize(input:unknown,day:string,values:Parameters<typeof base.initialize>[2]){
 await base.initialize(input,day,values);config=parseAuditedWriteConfig(input);credentials=values;
 try{
  await signIn('owner');
  let host=document.getElementById('pms-panel');
  if(!host){host=document.createElement('div');host.id='pms-panel';document.body.append(host);}
  root=createRoot(host);render();return true;
 }catch{await signOut();throw Error('Panel qualification initialization failed');}
}
async function switchActor(role:'owner'|'manager'){
 const result=await hotelClient().auth.signOut({scope:'local'});
 if(result.error)throw Error('Panel session cleanup failed');
 await signIn(role);render(role);return true;
}
Object.assign(window,{qualification:{...base,initialize,signOut,switchActor,
 switchProperty:(property:string)=>{render('owner',property);return true;},
}});
