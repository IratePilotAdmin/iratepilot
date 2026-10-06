import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createRevenueApprovalRecovery,type ApprovalStorage} from '../lib/revenue-approval-recovery';
import {parseAuditedWriteConfig,writeCommand,nextChicagoDay} from './fixtures/revenue-http-write-commands';

// Real refresh rejection, not natural JWT expiry or physical-device proof.
// No database fixture/grant is needed; the only RPC is a scoped status read.
describe.runIf(process.env.IRP_RUN_AUTH_SESSION_REJECTION==='1').sequential('isolated Auth refresh rejection recovery',()=>{
 let config:ReturnType<typeof parseAuditedWriteConfig>;
 let issuer:SupabaseClient,consumer:SupabaseClient;
 let refresh:string,initialToken:string;
 const values=new Map<string,string>();
 const storage:ApprovalStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
 let controller:ReturnType<typeof createRevenueApprovalRecovery>;
 let originalJournal:string;
 let authSignedOut=0,statusRequests=0,applyRequests=0;
 let unsubscribe:(()=>void)|undefined;

 function client(label:string){return createClient(`https://${config.branch.project_ref}.supabase.co`,config.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:`session-rejection-${label}`},
  global:{fetch:async(url,init)=>{
   const target=new URL(String(url)),method=init?.method??'GET';
   const auth=target.origin===`https://${config.branch.project_ref}.supabase.co`
    &&((target.pathname==='/auth/v1/token'&&method==='POST'&&['?grant_type=password','?grant_type=refresh_token'].includes(target.search))
     ||(target.pathname==='/auth/v1/user'&&method==='GET')
     ||(target.pathname==='/auth/v1/logout'&&method==='POST'&&target.search==='?scope=local'));
   if(!auth)throw Error('Qualification network scope denied');
   return fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(10000)});
  }},
 });}
 async function signIn(target:SupabaseClient){
  // Never log SDK replies, credentials, bearer/refresh tokens or session objects.
  const email=process.env.IRP_HTTP_TEST_OWNER_EMAIL,password=process.env.IRP_HTTP_TEST_OWNER_PASSWORD;
  if(!email||!password)throw Error('Protected isolated owner credentials required');
  let ok=false;
  try{const signed=await target.auth.signInWithPassword({email,password});
   if(!signed.error&&signed.data.session){const verified=await target.auth.getUser(signed.data.session.access_token);
    ok=!verified.error&&verified.data.user?.id===config.actors.owner.id;}}
  catch{/* Generic error only: secrets must not become assertion output. */}
  if(!ok)throw Error('Isolated owner authentication failed');
 }
 async function status(scope:{p_tenant:string;p_property:string;p_request:string}){
  const session=await consumer.auth.getSession(),token=session.data.session?.access_token;
  if(session.error||!token)throw Error('Authentication required before recovery');
  const verified=await consumer.auth.getUser(token);
  if(verified.error||verified.data.user?.id!==config.actors.owner.id)throw Error('Recovery actor verification failed');
  if((await consumer.auth.getSession()).data.session?.access_token!==token)throw Error('Recovery session changed');
  if(scope.p_tenant!==config.tenantId||scope.p_property!==config.propertyId||scope.p_request!==command.p_request)
   throw Error('Recovery scope denied');
  statusRequests++;
  const reply=await fetch(`https://${config.branch.project_ref}.supabase.co/rest/v1/rpc/irp_pms_pilot_revenue_decision_status`,{
   method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
   body:JSON.stringify(scope),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
  });
  if(!reply.ok)throw Error('Isolated status read rejected');
  const body=await reply.text();if(body.length>16384)throw Error('Status response limit exceeded');
  if((await consumer.auth.getSession()).data.session?.access_token!==token)throw Error('Recovery session changed after reply');
  try{return JSON.parse(body);}catch{throw Error('Invalid isolated status response');}
 }
 let command:ReturnType<typeof writeCommand>;
 beforeAll(async()=>{
  const path=process.env.IRP_HTTP_QUALIFICATION_CONFIG;if(!path)throw Error('Protected isolated manifest required');
  try{config=parseAuditedWriteConfig(JSON.parse(readFileSync(path,'utf8')));}catch{throw Error('Pinned isolated manifest required');}
  // Pin the read-only baseline property too: never accept an arbitrary target.
  if(config.propertyId!=='00000000-0000-4000-8000-000000000002'||config.planId!=='00000000-0000-4000-8000-000000000004')
   throw Error('Isolated baseline scope differs');
  command=writeCommand(nextChicagoDay(new Date()),{p_property:config.propertyId,p_plan:config.planId,p_request:randomUUID()});
  issuer=client('issuer');consumer=client('consumer');
  await signIn(issuer);
  const session=(await issuer.auth.getSession()).data.session;if(!session)throw Error('Isolated session unavailable');
  refresh=session.refresh_token;initialToken=session.access_token;
  const cloned=await consumer.auth.setSession({access_token:initialToken,refresh_token:refresh});
  if(cloned.error||!cloned.data.session||cloned.data.session.access_token!==initialToken)throw Error('Shared isolated session initialization failed');
  const subscription=consumer.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')authSignedOut++;});
  unsubscribe=()=>subscription.data.subscription.unsubscribe();
  controller=createRevenueApprovalRecovery({actorId:config.actors.owner.id,tenantId:config.tenantId,propertyId:config.propertyId,
   storage,lock:async(_key,work)=>work(),transport:{status,apply:async()=>{applyRequests++;throw Error('Qualification rate writes disabled');}}});
 },60000);
 afterAll(async()=>{
  unsubscribe?.();
  for(const target of [issuer,consumer])if(target){const result=await target.auth.signOut({scope:'local'});
   if(result.error)throw Error('Isolated local-session cleanup failed');}
  values.clear();refresh='';initialToken='';
 },30000);
 it('verifies a genuine owner session in both independent SDK clients',async()=>{
  const user=await consumer.auth.getUser(initialToken);
  expect(!user.error&&user.data.user?.id===config.actors.owner.id).toBe(true);
 });
 it('retains a locally seeded unresolved command without any rate request',async()=>{
  const staged=await controller.stage(command);
  // Seed local uncertainty explicitly. This does not assert a server commit.
  const key=[...values.keys()][0];storage.setItem(key,JSON.stringify({...staged,phase:'awaiting'}));
  originalJournal=storage.getItem(key)!;
  expect(controller.read()?.phase==='awaiting'&&statusRequests===0&&applyRequests===0).toBe(true);
 });
 it('revokes only the newly created shared isolated session through real Auth',async()=>{
  const result=await issuer.auth.signOut({scope:'local'});expect(!result.error).toBe(true);
 });
 it('gets a genuine provider rejection for that revoked refresh token',async()=>{
  const result=await consumer.auth.refreshSession({refresh_token:refresh});
  const statusCode=result.error?.status??0;
  expect(!!result.error&&statusCode>=400&&statusCode<500&&!result.data.session).toBe(true);
 },30000);
 it('observes SDK SIGNED_OUT and absence of a usable local session',async()=>{
  const result=await consumer.auth.getSession();
  expect(!result.error&&result.data.session===null&&authSignedOut>0).toBe(true);
 });
 it('blocks recovery before RPC and preserves the exact unresolved journal',async()=>{
  await expect(controller.recover()).rejects.toThrow('Authentication required before recovery');
  expect([...values.values()][0]===originalJournal&&statusRequests===0&&applyRequests===0).toBe(true);
 });
 it('genuinely reauthenticates the same actor without automatically recovering or applying',async()=>{
  await signIn(consumer);
  expect([...values.values()][0]===originalJournal&&statusRequests===0&&applyRequests===0).toBe(true);
 },30000);
 it('explicit recovery reads missing status and retains the original immutable request',async()=>{
  const record=await controller.recover();
  expect(record?.phase==='ready'&&record.command.p_request===command.p_request&&JSON.stringify(record.command)===JSON.stringify(command)
   &&statusRequests===1&&applyRequests===0).toBe(true);
 },30000);
 it('refuses clearing an unresolved review and performs no rate write',async()=>{
  await expect(controller.acknowledge()).rejects.toThrow('Resolve saved status before clearing approval');
  expect(controller.read()?.command.p_request===command.p_request&&statusRequests===1&&applyRequests===0).toBe(true);
 });
});
