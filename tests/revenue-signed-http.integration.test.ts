import {readFileSync} from 'node:fs';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {revenueHttpQualificationConfigSchema} from '../lib/revenue-http-qualification-config';
import {createRevenueApprovalStatusTransport} from '../lib/revenue-approval-status-transport';

// Opt-in network qualification; default CI skips this suite and cannot qualify this gate.
describe.runIf(process.env.IRP_RUN_SIGNED_HTTP_QUALIFICATION==='1')('isolated Auth-issued saved-status HTTP',()=>{
  type Config=ReturnType<typeof revenueHttpQualificationConfigSchema.parse>;
  let config:Config;
  const clients:Partial<Record<'owner'|'manager'|'staff',SupabaseClient>>={};
  const signouts:Promise<unknown>[]=[];
  beforeAll(async()=>{
    const path=process.env.IRP_HTTP_QUALIFICATION_CONFIG;
    if(!path)throw new Error('An isolated branch manifest is required');
    // Validate before constructing clients or attempting any sign-in.
    try{config=revenueHttpQualificationConfigSchema.parse(JSON.parse(readFileSync(path,'utf8')));}
    catch{throw new Error('Invalid isolated qualification manifest');}
    for(const role of ['owner','manager','staff'] as const){
      const email=process.env[`IRP_HTTP_TEST_${role.toUpperCase()}_EMAIL`];
      const password=process.env[`IRP_HTTP_TEST_${role.toUpperCase()}_PASSWORD`];
      if(!email||!password)throw new Error('Secure isolated test credentials are required');
      const client=createClient(`https://${config.branch.project_ref}.supabase.co`,config.publishableKey,
        {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(10000)})}});
      clients[role]=client;
      let signedIn=false;
      try{
        const signed=await client.auth.signInWithPassword({email,password});
        if(!signed.error&&signed.data.session){
          const verified=await client.auth.getUser(signed.data.session.access_token);
          signedIn=!verified.error&&verified.data.user?.id.toLowerCase()===config.actors[role].id.toLowerCase();
        }
      }catch{/* Never print credentials, tokens or raw Auth responses. */}
      if(!signedIn)throw new Error(`Isolated ${role} sign-in verification failed`);
    }
  },90000);
  afterAll(async()=>{
    for(const client of Object.values(clients))signouts.push(client.auth.signOut({scope:'local'}).then(result=>{
      if(result.error)throw new Error('Isolated session cleanup failed');
    },()=>{throw new Error('Isolated session cleanup failed');}));
    const results=await Promise.allSettled(signouts);
    if(results.some(r=>r.status==='rejected'))throw new Error('Isolated session cleanup requires review');
  },30000);
  function transport(role:'owner'|'manager'|'staff'){
    return createRevenueApprovalStatusTransport({apiUrl:`https://${config.branch.project_ref}.supabase.co`,
      publishableKey:config.publishableKey,actorId:config.actors[role].id,tenantId:config.tenantId,propertyId:config.propertyId,auth:clients[role]!.auth});
  }
  function scope(request:string=config.requestId){return {p_tenant:config.tenantId,p_property:config.propertyId,p_request:request};}
  it('returns the owner fixture receipt through the candidate adapter',async()=>{
    const reply=await transport('owner').status(scope()) as Record<string,unknown>;
    // Do not let test assertion diagnostics dump a credential-bearing response.
    const matches=reply?.found===true&&reply.request_id===config.requestId&&reply.tenant_id===config.tenantId
      &&reply.property_id===config.propertyId&&reply.plan_id===config.planId&&reply.stay_date==='2026-10-01'
      &&reply.recommended_rate_minor===16100&&typeof reply.saved_at==='string';
    expect(matches).toBe(true);
  },40000);
  it('hides another actor receipt from the second manager',async()=>{
    const reply=await transport('manager').status(scope()) as Record<string,unknown>;
    expect(reply?.found===false&&reply.request_id===config.requestId&&!('saved_at' in reply)).toBe(true);
  },40000);
  it('denies staff instead of returning a missing receipt',async()=>{
    await expect(transport('staff').status(scope())).rejects.toThrow('access denied');
  },40000);
  it('returns scoped not-found for an unused owner request',async()=>{
    const reply=await transport('owner').status(scope('00000000-0000-4000-8000-000000000099')) as Record<string,unknown>;
    expect(reply?.found===false&&reply.request_id==='00000000-0000-4000-8000-000000000099'&&reply.tenant_id===config.tenantId&&reply.property_id===config.propertyId).toBe(true);
  },40000);
  it('denies an invalid bearer at the deployed gateway',async()=>{
    const response=await fetch(`https://${config.branch.project_ref}.supabase.co/rest/v1/rpc/irp_pms_pilot_revenue_decision_status`,{
      method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer invalid-qualification-token','Content-Type':'application/json'},
      body:JSON.stringify(scope()),redirect:'error',signal:AbortSignal.timeout(30000)});
    expect(response.status).toBe(401);
  },40000);
});
