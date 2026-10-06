import {createRevenueApprovalRecovery} from '../lib/revenue-approval-recovery';

const actor='00000000-0000-4000-8000-000000000005';
const tenant='00000000-0000-4000-8000-000000000001';
const property='00000000-0000-4000-8000-000000000002';
const command={p_tenant:tenant,p_property:property,p_request:'00000000-0000-4000-8000-000000000006',p_plan:'00000000-0000-4000-8000-000000000004',p_expected_version:1,p_stay_date:'2026-10-02',p_current_rate_minor:14000,p_recommended_rate_minor:16100,p_minimum_rate_minor:7000,p_maximum_rate_minor:21000,p_competitor_rate_minor:null,p_event_uplift_basis_points:0,p_effective_units:10,p_reserved_units:8,p_occupancy_tenths_percent:800,p_adjustment_basis_points:1500,p_guardrail:'none' as const,p_explanations:['Synthetic browser review']};
let statusMode='normal';
let releaseLock:(()=>void)|undefined;
const lockKey=`irp:revenue-approval:v1:${actor}:${tenant}:${property}`;
function controller(actorId=actor,propertyId=property){
 return createRevenueApprovalRecovery({actorId,tenantId:tenant,propertyId,storage:localStorage,
  lock:async(key,work)=>await navigator.locks.request(key,{mode:'exclusive'},work),transport:{
   apply:async value=>{
    const response=await fetch('/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    if(!response.ok)throw Error('Synthetic save reply lost');
    return response.json();
   },status:async scope=>{
    const response=await fetch('/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...scope,mode:statusMode})});
    if(!response.ok)throw Error('Synthetic status unavailable');
    return response.json();
   },
  }});
}
const qualification={
 secure:()=>({secure:isSecureContext,locks:typeof navigator.locks?.request==='function'}),
 read:()=>controller().read(),
 stage:()=>controller().stage(command),
 competing:()=>controller().stage({...command,p_request:'00000000-0000-4000-8000-000000000099'}),
 submit:()=>controller().submit(),recover:()=>controller().recover(),
 otherActor:()=>controller('00000000-0000-4000-8000-000000000009').read(),
 otherProperty:()=>controller(actor,'00000000-0000-4000-8000-000000000009').read(),
 mode:(mode:string)=>{statusMode=mode;},
 hold:()=>navigator.locks.request(lockKey,{mode:'exclusive'},async()=>{
  document.body.dataset.lock='held';await new Promise<void>(resolve=>{releaseLock=resolve;});document.body.dataset.lock='released';
 }),
 release:()=>releaseLock?.(),
};
Object.assign(window,{qualification});
document.body.dataset.ready='true';
