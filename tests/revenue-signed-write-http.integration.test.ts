import {readFileSync} from 'node:fs';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {parseAuditedWriteConfig,writeCommand,nextChicagoDay,writeProperty,ownerRequest,managerRequest,failureRequest} from './fixtures/revenue-http-write-commands';

// Explicit opt-in only. This never mounts an application write transport.
// Operator must install the expiring isolated fixture and clean it afterward.
describe.runIf(process.env.IRP_RUN_SIGNED_HTTP_WRITE_QUALIFICATION==='1').sequential('isolated Auth-issued audited write HTTP',()=>{
 type Role='owner'|'manager'|'staff';
 let config:ReturnType<typeof parseAuditedWriteConfig>;
 let day:string;
 let ownerSavedAt:string|undefined,managerSavedAt:string|undefined;
 const clients:Partial<Record<Role,SupabaseClient>>={};
 async function post(role:Role,endpoint:'apply'|'status',body:unknown,invalidBearer=false){
  const client=clients[role]!;
  const session=await client.auth.getSession();
  const token=session.data.session?.access_token;
  if(session.error||!token)throw new Error('Isolated qualification session unavailable');
  const verified=await client.auth.getUser(token);
  if(verified.error||verified.data.user?.id.toLowerCase()!==config.actors[role].id.toLowerCase())throw new Error('Isolated qualification identity verification failed');
  if((await client.auth.getSession()).data.session?.access_token!==token)throw new Error('Isolated qualification session changed');
  const response=await fetch(`https://${config.branch.project_ref}.supabase.co/rest/v1/rpc/irp_pms_pilot_${endpoint==='apply'?'apply_revenue_decision':'revenue_decision_status'}`,{
   method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${invalidBearer?'invalid-qualification-token':token}`,
    'Content-Type':'application/json','Accept':'application/json','Content-Profile':'public'},
   body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),
  });
  const text=await response.text();
  if(text.length>16384)throw new Error('Isolated qualification reply exceeded limit');
  let value:Record<string,unknown>;
  try{value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();}
  catch{throw new Error('Invalid isolated qualification reply');}
  if((await client.auth.getSession()).data.session?.access_token!==token)throw new Error('Isolated qualification session changed after reply');
  return {ok:response.ok,status:response.status,code:typeof value.code==='string'?value.code:undefined,value};
 }
 const scope=(request:string)=>({p_tenant:config.tenantId,p_property:writeProperty,p_request:request});
 const apply=(role:Role,patch:Parameters<typeof writeCommand>[1]={})=>post(role,'apply',writeCommand(day,patch));
 async function reject(role:Role,code:string,patch:Parameters<typeof writeCommand>[1]={}){
  const result=await apply(role,patch);
  expect(!result.ok&&result.code===code).toBe(true); // Never dump raw Auth/RPC replies.
 }
 function receiptMatches(value:Record<string,unknown>,request:string,rate:number,replayed:boolean,savedAt?:string){
  return value.request_id===request&&value.tenant_id===config.tenantId&&value.property_id===writeProperty
   &&value.plan_id===writeCommand(day).p_plan&&value.stay_date===day&&value.recommended_rate_minor===rate
   &&value.replayed===replayed&&typeof value.saved_at==='string'&&Number.isFinite(Date.parse(value.saved_at))
   &&(savedAt===undefined||value.saved_at===savedAt);
 }
 beforeAll(async()=>{
  const path=process.env.IRP_HTTP_QUALIFICATION_CONFIG;
  if(!path)throw new Error('An isolated branch manifest is required');
  try{config=parseAuditedWriteConfig(JSON.parse(readFileSync(path,'utf8')));}
  catch{throw new Error('Pinned isolated write qualification manifest required');}
  day=nextChicagoDay(new Date());
  for(const role of ['owner','manager','staff'] as const){
   const email=process.env[`IRP_HTTP_TEST_${role.toUpperCase()}_EMAIL`],password=process.env[`IRP_HTTP_TEST_${role.toUpperCase()}_PASSWORD`];
   if(!email||!password)throw new Error('Secure isolated test credentials required');
   const client=createClient(`https://${config.branch.project_ref}.supabase.co`,config.publishableKey,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(10000)})}});
   clients[role]=client;
   let valid=false;
   try{
    const signed=await client.auth.signInWithPassword({email,password});
    if(!signed.error&&signed.data.session){const checked=await client.auth.getUser(signed.data.session.access_token);valid=!checked.error&&checked.data.user?.id.toLowerCase()===config.actors[role].id.toLowerCase();}
   }catch{/* Keep credentials, tokens and raw authentication replies out of logs. */}
   if(!valid)throw new Error(`Isolated ${role} sign-in verification failed`);
  }
  // Refuse to restart a partially completed fixture. Operator inspects and cleans it.
  for(const [role,request] of [['owner',ownerRequest],['manager',managerRequest]] as const){
   const result=await post(role,'status',scope(request));
   if(!result.ok||result.value.found!==false||result.value.request_id!==request)throw new Error('Write fixture is not fresh; inspect and clean before another run');
  }
 },90000);
 afterAll(async()=>{
  const results=await Promise.allSettled(Object.values(clients).map(client=>client.auth.signOut({scope:'local'}).then(reply=>{
   if(reply.error)throw new Error('Isolated session cleanup failed');
  },()=>{throw new Error('Isolated session cleanup failed');})));
  if(results.some(r=>r.status==='rejected'))throw new Error('Isolated session cleanup requires review');
 },30000);
 it('rejects an invalid bearer before any write',async()=>{const r=await post('owner','apply',writeCommand(day),true);expect(!r.ok&&r.status===401).toBe(true);},30000);
 it('denies staff writes',()=>reject('staff','42501'),30000);
 it('denies the live shadow property at the fixture guard',()=>reject('owner','42501',{p_property:'7d9add80-216e-435c-86e9-58e17cdcbb6d'}),30000);
 it('denies request IDs outside the fixture',()=>reject('owner','42501',{p_request:'00000000-0000-4000-8000-000000000099'}),30000);
 it('rejects a tampered calculation',()=>reject('owner','22023',{p_recommended_rate_minor:16200}),30000);
 it('rejects a stale plan version',()=>reject('owner','40001',{p_expected_version:2}),30000);
 it('rejects a stale current price',()=>reject('owner','40001',{p_current_rate_minor:14100,p_recommended_rate_minor:16215}),30000);
 it('rejects stale capacity',()=>reject('owner','40001',{p_effective_units:11,p_occupancy_tenths_percent:727,p_adjustment_basis_points:800,p_recommended_rate_minor:15120}),30000);
 it('rejects stale reserved occupancy',()=>reject('owner','40001',{p_reserved_units:7,p_occupancy_tenths_percent:700,p_adjustment_basis_points:800,p_recommended_rate_minor:15120}),30000);
 it('saves the owner reviewed rate and audit receipt',async()=>{
  const r=await apply('owner');expect(r.ok&&receiptMatches(r.value,ownerRequest,16100,false)).toBe(true);ownerSavedAt=r.value.saved_at as string;
 },30000);
 it('replays the identical owner request with its original timestamp',async()=>{
  const r=await apply('owner');expect(ownerSavedAt!==undefined&&r.ok&&receiptMatches(r.value,ownerRequest,16100,true,ownerSavedAt)).toBe(true);
 },30000);
 it('rejects a changed review under the saved request ID',()=>reject('owner','23505',{p_explanations:['Conflicting synthetic review']}),30000);
 it('denies manager replay of the owner receipt',()=>reject('manager','23505'),30000);
 it('returns the saved owner status after a separate HTTP request',async()=>{
  const r=await post('owner','status',scope(ownerRequest));expect(r.ok&&r.value.found===true&&r.value.saved_at===ownerSavedAt&&r.value.recommended_rate_minor===16100).toBe(true);
 },30000);
 it('hides the owner saved status from the manager',async()=>{
  const r=await post('manager','status',scope(ownerRequest));expect(r.ok&&r.value.found===false&&!('saved_at' in r.value)).toBe(true);
 },30000);
 const managerPatch=()=>({p_request:managerRequest,p_expected_version:2,p_current_rate_minor:16100,p_recommended_rate_minor:18515});
 it('saves a fresh manager reviewed rate',async()=>{
  const r=await apply('manager',managerPatch());expect(r.ok&&receiptMatches(r.value,managerRequest,18515,false)).toBe(true);managerSavedAt=r.value.saved_at as string;
 },30000);
 it('replays the manager request without a second change',async()=>{
  const r=await apply('manager',managerPatch());expect(managerSavedAt!==undefined&&r.ok&&receiptMatches(r.value,managerRequest,18515,true,managerSavedAt)).toBe(true);
 },30000);
 it('returns manager saved status with the original receipt timestamp',async()=>{
  const r=await post('manager','status',scope(managerRequest));expect(r.ok&&r.value.found===true&&r.value.saved_at===managerSavedAt&&r.value.recommended_rate_minor===18515).toBe(true);
 },30000);
 it('hides the manager saved status from the owner',async()=>{
  const r=await post('owner','status',scope(managerRequest));expect(r.ok&&r.value.found===false&&!('saved_at' in r.value)).toBe(true);
 },30000);
 it('rejects an injected audit failure',()=>reject('owner','P0001',{p_request:failureRequest,p_expected_version:3,p_current_rate_minor:18515,p_recommended_rate_minor:21292}),30000);
 it('does not create a receipt for the failed audit',async()=>{
  const r=await post('owner','status',scope(failureRequest));expect(r.ok&&r.value.found===false&&!('saved_at' in r.value)).toBe(true);
 },30000);
});
