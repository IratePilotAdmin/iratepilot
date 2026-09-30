import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRevenueApprovalRecovery,type ApprovalLock,type RevenueApprovalCommand} from '../lib/revenue-approval-recovery';

const command:RevenueApprovalCommand={p_tenant:'00000000-0000-4000-8000-000000000001',
  p_property:'00000000-0000-4000-8000-000000000002',p_request:'00000000-0000-4000-8000-000000000006',
  p_plan:'00000000-0000-4000-8000-000000000004',p_expected_version:1,p_stay_date:'2026-10-01',
  p_current_rate_minor:14000,p_recommended_rate_minor:16100,p_minimum_rate_minor:7000,
  p_maximum_rate_minor:21000,p_competitor_rate_minor:null,p_event_uplift_basis_points:0,
  p_effective_units:10,p_reserved_units:8,p_occupancy_tenths_percent:800,p_adjustment_basis_points:1500,
  p_guardrail:'none',p_explanations:['Reviewed inputs']};
const receipt={request_id:command.p_request,tenant_id:command.p_tenant,property_id:command.p_property,
  plan_id:command.p_plan,stay_date:command.p_stay_date,recommended_rate_minor:16100,
  saved_at:'2026-09-30T20:46:15.838626+00:00',replayed:false};
function fixture(){
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key)??null,
    setItem:vi.fn((key:string,value:string)=>{data.set(key,value);}),removeItem:(key:string)=>{data.delete(key);}};
  let tail=Promise.resolve();
  const lock:ApprovalLock=(_key,work)=>{
    const result=tail.then(work);tail=result.then(()=>undefined,()=>undefined);return result;
  };
  const transport={apply:vi.fn<(command:RevenueApprovalCommand)=>Promise<typeof receipt>>().mockResolvedValue(receipt),
    status:vi.fn(async():Promise<unknown>=>({...receipt,found:true}))};
  const create=(actorId='00000000-0000-4000-8000-000000000005')=>createRevenueApprovalRecovery({actorId,
    tenantId:command.p_tenant,propertyId:command.p_property,storage,transport,lock});
  return {data,storage,transport,create};
}
describe('durable audited approval recovery',()=>{
  afterEach(()=>{vi.useRealTimers();});
  it('releases a stalled apply lock while retaining the request and ignores its late reply',async()=>{
    vi.useFakeTimers();
    const f=fixture();const c=f.create();await c.stage(command);
    let finish!:(value:typeof receipt)=>void;
    f.transport.apply.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const sending=c.submit();
    const rejected=expect(sending).rejects.toThrow('Approval reply timed out');
    // Another controller is queued behind the same exclusive lock.
    const checking=f.create().recover();
    await vi.advanceTimersByTimeAsync(30000);await rejected;
    expect((await checking)?.phase).toBe('saved');
    expect(f.transport.status).toHaveBeenCalledWith({p_tenant:command.p_tenant,p_property:command.p_property,p_request:command.p_request});
    const persisted=[...f.data.values()];const writes=f.storage.setItem.mock.calls.length;
    finish({...receipt,recommended_rate_minor:17000});
    await Promise.resolve();await Promise.resolve();
    expect([...f.data.values()]).toEqual(persisted);
    expect(f.storage.setItem).toHaveBeenCalledTimes(writes);
    await c.submit();expect(f.transport.apply).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retains uncertainty when status stalls, releases the lock and ignores late not-found',async()=>{
    vi.useFakeTimers();
    const f=fixture();const c=f.create();await c.stage(command);
    f.transport.apply.mockRejectedValueOnce(new Error('Lost reply'));
    await expect(c.submit()).rejects.toThrow('Lost reply');
    let finish!:(value:unknown)=>void;
    f.transport.status.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const checking=c.recover();
    const rejected=expect(checking).rejects.toThrow('Saved-status check timed out');
    await vi.advanceTimersByTimeAsync(30000);await rejected;
    expect(f.create().read()?.phase).toBe('awaiting');
    await expect(c.submit()).rejects.toThrow('Check saved status');
    await expect(c.stage({...command,p_request:'00000000-0000-4000-8000-000000000007'})).rejects.toThrow('Resolve');
    await expect(c.acknowledge()).rejects.toThrow('Resolve');
    finish({found:false,request_id:command.p_request,tenant_id:command.p_tenant,property_id:command.p_property});
    await Promise.resolve();await Promise.resolve();
    expect(c.read()?.phase).toBe('awaiting');
    expect((await f.create().recover())?.phase).toBe('saved');
    expect(f.transport.apply).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    null,{}, {found:false}, {found:'true'},
    {...receipt,found:true,request_id:'00000000-0000-4000-8000-000000000099'},
    {...receipt,found:true,stay_date:'2026-10-02'},
    {...receipt,found:true,saved_at:'invalid'},
    {...receipt,found:true,unexpected:'field'},
  ])('retains the exact uncertain request on malformed status %#',async value=>{
    const f=fixture();const c=f.create();await c.stage(command);
    f.transport.apply.mockRejectedValueOnce(new Error('Lost reply'));
    await expect(c.submit()).rejects.toThrow('Lost reply');
    const persisted=[...f.data.values()];
    f.transport.status.mockResolvedValueOnce(value);
    await expect(c.recover()).rejects.toThrow();
    expect([...f.data.values()]).toEqual(persisted);
    expect(c.read()).toMatchObject({phase:'awaiting',command});
    await expect(c.submit()).rejects.toThrow('Check saved status');
    expect(f.transport.apply).toHaveBeenCalledTimes(1);
  });
  it('recovers a committed save after a lost reply and reload without sending again',async()=>{
    const f=fixture();f.transport.apply.mockRejectedValueOnce(new Error('Connection lost after commit'));
    const controller=f.create();await controller.stage(command);
    await expect(controller.submit()).rejects.toThrow('Connection lost');
    const reloaded=f.create();expect(reloaded.read()?.phase).toBe('awaiting');
    await expect(reloaded.submit()).rejects.toThrow('Check saved status');
    expect((await reloaded.recover())?.phase).toBe('saved');
    await reloaded.submit();expect(f.transport.apply).toHaveBeenCalledTimes(1);
    await reloaded.acknowledge();expect(reloaded.read()).toBeNull();
  });
  it('retries the identical journalled request after not-found, preserving review identity',async()=>{
    const f=fixture();f.transport.apply.mockRejectedValueOnce(new Error('Timeout'));
    f.transport.status.mockResolvedValueOnce({found:false,request_id:command.p_request,
      tenant_id:command.p_tenant,property_id:command.p_property});
    const c=f.create();await c.stage(command);await expect(c.submit()).rejects.toThrow();
    await expect(c.stage({...command,p_request:'00000000-0000-4000-8000-000000000007'})).rejects.toThrow('Resolve');
    await c.recover();await c.submit();expect(f.transport.apply.mock.calls.map(call=>call[0])).toEqual([command,command]);
  });
  it('blocks send when durable storage fails and blocks clearing an uncertain result',async()=>{
    const f=fixture();const c=f.create();await c.stage(command);
    f.storage.setItem.mockImplementationOnce(()=>{throw new Error('Storage full');});
    await expect(c.submit()).rejects.toThrow('Storage full');expect(f.transport.apply).not.toHaveBeenCalled();
    await expect(c.acknowledge()).rejects.toThrow('Resolve');
  });
  it('serializes two controller submissions sharing a cross-tab lock',async()=>{
    const f=fixture();await f.create().stage(command);
    const results=await Promise.all([f.create().submit(),f.create().submit()]);
    expect(results.map(result=>result.phase)).toEqual(['saved','saved']);
    expect(f.transport.apply).toHaveBeenCalledTimes(1);
  });
  it('retains uncertainty on wrong receipts, unavailable status or revoked authorization',async()=>{
    const f=fixture();const c=f.create();await c.stage(command);
    f.transport.apply.mockResolvedValueOnce({...receipt,recommended_rate_minor:17000});
    await expect(c.submit()).rejects.toThrow('does not match');
    f.transport.status.mockRejectedValueOnce(new Error('42501: access denied'));
    await expect(c.recover()).rejects.toThrow('access denied');expect(c.read()?.phase).toBe('awaiting');
    f.transport.status.mockResolvedValueOnce({found:false,request_id:command.p_request,
      tenant_id:command.p_tenant,property_id:'00000000-0000-4000-8000-000000000099'});
    await expect(c.recover()).rejects.toThrow('scope mismatch');expect(c.read()?.phase).toBe('awaiting');
  });
  it('isolates accounts and refuses corrupted journals without sending',async()=>{
    const f=fixture();await f.create().stage(command);
    expect(f.create('00000000-0000-4000-8000-000000000099').read()).toBeNull();
    const key=[...f.data.keys()][0];f.data.set(key,'{"version":2}');
    await expect(f.create().submit()).rejects.toThrow();expect(f.transport.apply).not.toHaveBeenCalled();
  });
  it('preserves uncertain status if receipt persistence fails after server success',async()=>{
    const f=fixture();const c=f.create();await c.stage(command);
    f.transport.apply.mockImplementationOnce(async()=>{
      f.storage.setItem.mockImplementationOnce(()=>{throw new Error('Storage unavailable');});return receipt;
    });
    await expect(c.submit()).rejects.toThrow('Storage unavailable');
    expect(f.create().read()?.phase).toBe('awaiting');
    expect((await f.create().recover())?.phase).toBe('saved');expect(f.transport.apply).toHaveBeenCalledTimes(1);
  });
});
