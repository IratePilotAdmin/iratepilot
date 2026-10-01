import {describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createRevenueApprovalStatusTransport} from '../lib/revenue-approval-status-transport';
import {createRevenueApprovalRecovery,type RevenueApprovalCommand} from '../lib/revenue-approval-recovery';

const actor='00000000-0000-4000-8000-000000000005';
const scope={p_tenant:'00000000-0000-4000-8000-000000000001',p_property:'00000000-0000-4000-8000-000000000002',p_request:'00000000-0000-4000-8000-000000000006'};
const missing={found:false,request_id:scope.p_request,tenant_id:scope.p_tenant,property_id:scope.p_property};
const command:RevenueApprovalCommand={...scope,p_plan:'00000000-0000-4000-8000-000000000004',p_expected_version:1,p_stay_date:'2026-10-01',p_current_rate_minor:14000,p_recommended_rate_minor:16100,p_minimum_rate_minor:7000,p_maximum_rate_minor:21000,p_competitor_rate_minor:null,p_event_uplift_basis_points:0,p_effective_units:10,p_reserved_units:8,p_occupancy_tenths_percent:800,p_adjustment_basis_points:1500,p_guardrail:'none',p_explanations:['Reviewed inputs']};
function fixture(){
  let token:string|null='synthetic-token-A';
  const auth={getSession:vi.fn(async()=>({data:{session:token?{access_token:token,user:{id:actor}}:null},error:null})),
    getUser:vi.fn(async()=>({data:{user:{id:actor}},error:null}))};
  const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(missing)));
  const options={apiUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_synthetic',actorId:actor,tenantId:scope.p_tenant,propertyId:scope.p_property,
    auth:auth as unknown as Pick<SupabaseClient['auth'],'getSession'|'getUser'>,fetch:request};
  return {auth,request,options,setToken:(value:string|null)=>{token=value;},transport:createRevenueApprovalStatusTransport(options)};
}
describe('read-only saved-status HTTP transport candidate',()=>{
  it('verifies the captured token and sends only scoped status parameters',async()=>{
    const f=fixture();expect(await f.transport.status(scope)).toEqual(missing);
    expect(f.auth.getUser).toHaveBeenCalledWith('synthetic-token-A');
    const [url,init]=f.request.mock.calls[0];
    expect(String(url)).toBe('https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/irp_pms_pilot_revenue_decision_status');
    expect(init).toMatchObject({method:'POST',cache:'no-store',credentials:'omit',redirect:'error',body:JSON.stringify(scope),headers:{Authorization:'Bearer synthetic-token-A',apikey:'sb_publishable_synthetic','Content-Profile':'public'}});
  });
  it('keeps all apply calls disabled without accessing Auth or HTTP',async()=>{
    const f=fixture();await expect(f.transport.apply(command)).rejects.toThrow('not enabled');
    expect(f.request).not.toHaveBeenCalled();expect(f.auth.getSession).not.toHaveBeenCalled();
  });
  it('rejects cross-property status before credentials or HTTP',async()=>{
    const f=fixture();await expect(f.transport.status({...scope,p_property:actor})).rejects.toThrow('scope mismatch');
    expect(f.auth.getSession).not.toHaveBeenCalled();expect(f.request).not.toHaveBeenCalled();
  });
  it('does not trust a stored session user when Auth returns another actor',async()=>{
    const f=fixture();f.auth.getUser.mockResolvedValueOnce({data:{user:{id:scope.p_request}},error:null});
    await expect(f.transport.status(scope)).rejects.toThrow('identity');expect(f.request).not.toHaveBeenCalled();
  });
  it('blocks signed-out sessions',async()=>{
    const f=fixture();f.setToken(null);await expect(f.transport.status(scope)).rejects.toThrow('Sign in');
    expect(f.request).not.toHaveBeenCalled();
  });
  it('blocks a token changed during verification before posting',async()=>{
    const f=fixture();f.auth.getUser.mockImplementationOnce(async()=>{f.setToken('synthetic-token-B');return {data:{user:{id:actor}},error:null};});
    await expect(f.transport.status(scope)).rejects.toThrow('session changed');expect(f.request).not.toHaveBeenCalled();
  });
  it('discards a response when the account changes during HTTP',async()=>{
    const f=fixture();f.request.mockImplementationOnce(async()=>{f.setToken('synthetic-token-B');return new Response(JSON.stringify(missing));});
    await expect(f.transport.status(scope)).rejects.toThrow('session changed');
  });
  it.each([401,403,404,500])('retains awaiting state on HTTP %i without converting errors to not-found',async status=>{
    const f=fixture();f.request.mockResolvedValueOnce(new Response(JSON.stringify(missing),{status}));
    const data=new Map<string,string>();
    const c=createRevenueApprovalRecovery({actorId:actor,tenantId:scope.p_tenant,propertyId:scope.p_property,
      storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}},lock:async(_key,work)=>work(),transport:f.transport});
    await c.stage(command);await expect(c.submit()).rejects.toThrow('not enabled');
    await expect(c.recover()).rejects.toThrow('unresolved');expect(c.read()?.phase).toBe('awaiting');
    await expect(c.submit()).rejects.toThrow('Check saved status');expect(f.request).toHaveBeenCalledTimes(1);
  });
  it.each(['not JSON','x'.repeat(16385)])('rejects invalid or oversized successful responses %#',async body=>{
    const f=fixture();f.request.mockResolvedValueOnce(new Response(body));await expect(f.transport.status(scope)).rejects.toThrow();
  });
  it.each(['http://abcdefghijklmnopqrst.supabase.co','https://abcdefghijklmnopqrst.supabase.co/other','https://other.example'])('rejects an unexpected endpoint %s',apiUrl=>{
    const f=fixture();expect(()=>createRevenueApprovalStatusTransport({...f.options,apiUrl})).toThrow('origin');
  });
  it('rejects secret or legacy credentials as client API keys',()=>{
    const f=fixture();expect(()=>createRevenueApprovalStatusTransport({...f.options,publishableKey:'sb_secret_synthetic'})).toThrow('publishable');
  });
});
