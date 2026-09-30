// Synthetic DOM/component qualification only; not real-browser or authenticated RPC evidence.
import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const pms=process.env.IRP_QUALIFICATION_PMS_CHECKOUT;
if(!pms||!process.env.IRP_UI_RUNTIME_PACKAGE)throw Error('Set IRP_QUALIFICATION_PMS_CHECKOUT and IRP_UI_RUNTIME_PACKAGE');
const require=createRequire(resolve(process.env.IRP_UI_RUNTIME_PACKAGE));
const {JSDOM}=require('jsdom'),React=require('react');
const dom=new JSDOM('<html><body></body></html>',{url:'https://synthetic.example.invalid'});
for(const name of ['window','document','navigator','HTMLElement','Node','Event','localStorage'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,screen,cleanup,act,fireEvent}=require('@testing-library/react');
const {loadSite}=await import(pathToFileURL(resolve(pms,'tests/ui/load-site.mjs')).href);
const actor='00000000-0000-4000-8000-000000000005',tenant='00000000-0000-4000-8000-000000000001',property='00000000-0000-4000-8000-000000000002';
const key=`irp:revenue-approval:v1:${actor}:${tenant}:${property}`;
const command={p_tenant:tenant,p_property:property,p_request:'00000000-0000-4000-8000-000000000006',p_plan:'00000000-0000-4000-8000-000000000004',p_expected_version:1,p_stay_date:'2026-10-01',p_current_rate_minor:14000,p_recommended_rate_minor:16100,p_minimum_rate_minor:7000,p_maximum_rate_minor:21000,p_competitor_rate_minor:null,p_event_uplift_basis_points:0,p_effective_units:10,p_reserved_units:8,p_occupancy_tenths_percent:800,p_adjustment_basis_points:1500,p_guardrail:'none',p_explanations:['Synthetic review']};
const receipt={request_id:command.p_request,tenant_id:tenant,property_id:property,plan_id:command.p_plan,stay_date:command.p_stay_date,recommended_rate_minor:16100,saved_at:'2026-09-30T22:29:00Z',found:true};
let tails=new Map();
function locks(){Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(key,_options,work)=>{const result=(tails.get(key)||Promise.resolve()).then(work);tails.set(key,result.catch(()=>{}));return result}}})}
locks();
Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
afterEach(()=>{cleanup();localStorage.clear();tails=new Map();locks();Object.defineProperty(navigator,'onLine',{configurable:true,value:true})});
function pending(){localStorage.setItem(key,JSON.stringify({version:1,actor_id:actor,command,phase:'awaiting'}));return localStorage.getItem(key)}
function panel(rpc){return loadSite(null,{'@/lib/pilot':{usd:value=>String(value),hotelRpc:rpc}})('components/revenue-approval-recovery-panel.tsx').RevenueApprovalRecoveryPanel}
const props={actor,tenant,property};
test('lost save reply survives controller recreation and component remount without resending',async()=>{
 const {createRevenueApprovalRecovery}=loadSite(null)('lib/revenue-approval-recovery.ts');let writes=0,statuses=0;
 const create=()=>createRevenueApprovalRecovery({actorId:actor,tenantId:tenant,propertyId:property,storage:localStorage,lock:(key,work)=>navigator.locks.request(key,{mode:'exclusive'},work),transport:{apply:async()=>{writes++;throw Error('Synthetic lost reply')},status:async()=>({...receipt})}});
 await create().stage(command);await assert.rejects(create().submit(),/lost reply/);assert.equal(create().read().phase,'awaiting');
 const Component=panel(async(name,args)=>{statuses++;assert.equal(name,'revenue_decision_status');assert.deepEqual(args,{p_tenant:tenant,p_property:property,p_request:command.p_request});return receipt});
 const first=render(React.createElement(Component,props));first.unmount();render(React.createElement(Component,props));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));
 assert.match(screen.getByText(/matching server receipt/).textContent,/confirms/);assert.equal(create().read().phase,'saved');assert.equal(writes,1);assert.equal(statuses,1);
});
test('offline status check retains uncertainty and sends nothing',async()=>{
 const original=pending();let calls=0;Object.defineProperty(navigator,'onLine',{configurable:true,value:false});const Component=panel(async()=>{calls++;return receipt});render(React.createElement(Component,props));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));assert.match(screen.getByRole('alert').textContent,/Reconnect/);assert.equal(calls,0);assert.equal(localStorage.getItem(key),original);
});
test('unavailable status retains exact journal and allows checking again',async()=>{
 const original=pending();const Component=panel(async()=>{throw Error('Synthetic access denied')});render(React.createElement(Component,props));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));
 assert.match(screen.getByRole('alert').textContent,/access denied/);assert.equal(localStorage.getItem(key),original);assert.equal(screen.getByRole('button',{name:'Check saved status'}).disabled,false);
});
test('not-found retains immutable command without showing a saved receipt or retry action',async()=>{
 pending();const Component=panel(async()=>({found:false,request_id:command.p_request,tenant_id:tenant,property_id:property}));render(React.createElement(Component,props));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));
 const record=JSON.parse(localStorage.getItem(key));assert.equal(record.phase,'ready');assert.deepEqual(record.command,command);assert.equal(screen.queryByText(/matching server receipt/),null);assert.equal(screen.getAllByRole('button').length,1);
});
test('late old-scope response is hidden after actor switch',async()=>{
 pending();let finish;const Component=panel(()=>new Promise(resolve=>finish=resolve));const view=render(React.createElement(Component,props));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));
 view.rerender(React.createElement(Component,{...props,actor:'00000000-0000-4000-8000-000000000009'}));await act(async()=>finish(receipt));
 assert.ok(screen.getByText(/No unresolved audited approval/));assert.equal(screen.queryByText(/matching server receipt/),null);assert.equal(screen.queryByRole('alert'),null);assert.equal(JSON.parse(localStorage.getItem(key)).phase,'saved');
});
test('missing lock capability refuses recovery without transport',async()=>{
 const original=pending();Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});let calls=0;const Component=panel(async()=>{calls++;return receipt});render(React.createElement(Component,props));assert.match(screen.getByRole('alert').textContent,/exclusive lock support/);assert.equal(screen.queryByRole('button'),null);assert.equal(calls,0);assert.equal(localStorage.getItem(key),original);
});
test('wrong request receipt is rejected and uncertainty remains',async()=>{
 const original=pending();const Component=panel(async()=>({...receipt,request_id:'00000000-0000-4000-8000-000000000099'}));render(React.createElement(Component,props));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));assert.match(screen.getByRole('alert').textContent,/does not match/);assert.equal(localStorage.getItem(key),original);
});
test('stalled status releases recovery, ignores late reply and retains exact request',async()=>{
 const original=pending();let finish,deadline,calls=0;const realTimeout=globalThis.setTimeout;const realClear=globalThis.clearTimeout;const token={};
 globalThis.setTimeout=(fn,ms,...args)=>{if(ms===30000){deadline=fn;return token}return realTimeout(fn,ms,...args)};globalThis.clearTimeout=value=>{if(value!==token)realClear(value)};
 try{const Component=panel(()=>{calls++;return calls===1?new Promise(resolve=>finish=resolve):Promise.resolve(receipt)});render(React.createElement(Component,props));await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));
 assert.equal(screen.getByRole('button',{name:'Checking saved status…'}).disabled,true);assert.equal(typeof deadline,'function');await act(async()=>deadline());assert.match(screen.getByRole('alert').textContent,/timed out/);assert.equal(screen.getByRole('button',{name:'Check saved status'}).disabled,false);assert.equal(localStorage.getItem(key),original);await act(async()=>finish(receipt));assert.equal(localStorage.getItem(key),original);assert.equal(screen.queryByText(/matching server receipt/),null);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Check saved status'})));assert.equal(JSON.parse(localStorage.getItem(key)).phase,'saved');assert.equal(calls,2);
 }finally{globalThis.setTimeout=realTimeout;globalThis.clearTimeout=realClear}
});
