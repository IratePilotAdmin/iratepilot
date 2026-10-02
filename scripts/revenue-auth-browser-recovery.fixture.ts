import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {createRevenueApprovalRecovery,type RevenueApprovalReceipt} from '../lib/revenue-approval-recovery';
import {parseAuditedWriteConfig,writeCommand,writeProperty,ownerRequest} from '../tests/fixtures/revenue-http-write-commands';

// Qualification page only. No deployed PMS callsite imports this transport.
type Role='owner'|'manager'|'staff';
type Credentials=Record<Role,{email:string;password:string}>;
let config:ReturnType<typeof parseAuditedWriteConfig>;
let command:ReturnType<typeof writeCommand>;
const clients:Partial<Record<Role,SupabaseClient>>={};
let committed:RevenueApprovalReceipt|undefined;
let releaseLock:(()=>void)|undefined;
async function signOut(){
 const results=await Promise.allSettled(Object.values(clients).map(async client=>{
  const result=await client.auth.signOut({scope:'local'});
  if(result.error)throw Error('Qualification session cleanup failed');
 }));
 for(const role of ['owner','manager','staff'] as const)delete clients[role];
 if(results.some(result=>result.status==='rejected'))throw Error('Qualification session cleanup failed');
}
async function initialize(input:unknown,day:string,credentials:Credentials){
 if(Object.keys(clients).length)throw Error('Qualification already initialized');
 config=parseAuditedWriteConfig(input);command=writeCommand(day);
 try{
  for(const role of ['owner','manager','staff'] as const){
   const client=createClient(`https://${config.branch.project_ref}.supabase.co`,config.publishableKey,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:`qualification-${role}`},
     global:{fetch:(url,init)=>fetch(url,{...init,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)})}});
   clients[role]=client;
   const signed=await client.auth.signInWithPassword(credentials[role]);
   if(signed.error||!signed.data.session)throw Error('Qualification sign-in failed');
   const checked=await client.auth.getUser(signed.data.session.access_token);
   if(checked.error||checked.data.user?.id.toLowerCase()!==config.actors[role].id.toLowerCase())throw Error('Qualification identity mismatch');
  }
 }catch{await signOut();throw Error('Qualification browser authentication failed');}
 return true;
}
async function post(role:Role,endpoint:'apply'|'status',body:unknown){
 const client=clients[role];if(!client)throw Error('Qualification session unavailable');
 const session=await client.auth.getSession(),token=session.data.session?.access_token;
 if(session.error||!token)throw Error('Qualification session unavailable');
 const checked=await client.auth.getUser(token);
 if(checked.error||checked.data.user?.id.toLowerCase()!==config.actors[role].id.toLowerCase())throw Error('Qualification identity mismatch');
 if((await client.auth.getSession()).data.session?.access_token!==token)throw Error('Qualification session changed');
 const response=await fetch(`https://${config.branch.project_ref}.supabase.co/rest/v1/rpc/irp_pms_pilot_${endpoint==='apply'?'apply_revenue_decision':'revenue_decision_status'}`,{
  method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json','Content-Profile':'public'},
  body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),
 });
 const text=await response.text();if(text.length>16384)throw Error('Qualification reply exceeds limit');
 let value:Record<string,unknown>;
 try{value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();}
 catch{throw Error('Invalid qualification reply');}
 if((await client.auth.getSession()).data.session?.access_token!==token)throw Error('Qualification session changed');
 return {ok:response.ok,status:response.status,code:typeof value.code==='string'?value.code:undefined,value};
}
function controller(role:Role='owner',propertyId=writeProperty){
 return createRevenueApprovalRecovery({actorId:config.actors[role].id,tenantId:config.tenantId,propertyId,storage:localStorage,
  lock:async(key,work)=>await navigator.locks.request(key,{mode:'exclusive'},work),transport:{
   apply:async value=>{
    const result=await post(role,'apply',value);
    if(!result.ok)throw Error('Qualification save rejected');
    // The backend really committed. Validate before discarding the successful reply.
    const receipt=result.value;
    if(receipt.request_id!==ownerRequest||receipt.property_id!==writeProperty||receipt.tenant_id!==config.tenantId
     ||receipt.plan_id!==command.p_plan||receipt.stay_date!==command.p_stay_date||receipt.recommended_rate_minor!==16100
     ||receipt.replayed!==false||typeof receipt.saved_at!=='string'||!Number.isFinite(Date.parse(receipt.saved_at)))throw Error('Qualification commit receipt mismatch');
    committed=receipt as RevenueApprovalReceipt;
    throw Error('Qualification deliberately discarded committed save reply');
   },status:async scope=>{const result=await post(role,'status',scope);if(!result.ok)throw Error('Qualification status unavailable');return result.value;},
  }});
}
const qualification={
 initialize,signOut,
 secure:()=>({secure:isSecureContext,locks:typeof navigator.locks?.request==='function'}),
 fresh:async()=>{for(const role of ['owner','manager'] as const){const result=await post(role,'status',{p_tenant:config.tenantId,p_property:writeProperty,p_request:ownerRequest});
  if(!result.ok||result.value.found!==false||result.value.request_id!==ownerRequest)throw Error('Qualification fixture is not fresh');}return true;},
 staffDenied:async()=>{const result=await post('staff','apply',command);return !result.ok&&result.code==='42501';},
 managerHidden:async()=>{const result=await post('manager','status',{p_tenant:config.tenantId,p_property:writeProperty,p_request:ownerRequest});return result.ok&&result.value.found===false&&!('saved_at' in result.value);},
 read:()=>controller().read(),stage:()=>controller().stage(command),submit:()=>controller().submit(),recover:()=>controller().recover(),
 competing:()=>controller().stage({...command,p_request:'00000000-0000-4000-8000-000000000099'}),
 committed:()=>committed,otherActor:()=>controller('manager').read(),
 otherProperty:()=>controller('owner','00000000-0000-4000-8000-000000000009').read(),
 hold:()=>navigator.locks.request(`irp:revenue-approval:v1:${config.actors.owner.id.toLowerCase()}:${config.tenantId}:${writeProperty}`,{mode:'exclusive'},async()=>{
  document.body.dataset.lock='held';await new Promise<void>(resolve=>{releaseLock=resolve;});document.body.dataset.lock='released';
 }),release:()=>releaseLock?.(),
};
Object.assign(window,{qualification});document.body.dataset.ready='true';
