import {z} from 'zod';

const uuid=z.string().uuid().transform(value=>value.toLowerCase());
const money=z.number().int().min(1).max(100000000);
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
});
export const revenueApprovalCommandSchema=z.object({
  p_tenant:uuid,p_property:uuid,p_request:uuid,p_plan:uuid,
  p_expected_version:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  p_stay_date:day,p_current_rate_minor:money,p_recommended_rate_minor:money,
  p_minimum_rate_minor:money,p_maximum_rate_minor:money,p_competitor_rate_minor:money.nullable(),
  p_event_uplift_basis_points:z.number().int().min(0).max(5000),
  p_effective_units:z.number().int().min(1).max(100000),p_reserved_units:z.number().int().min(0),
  p_occupancy_tenths_percent:z.number().int().min(0).max(1000),
  p_adjustment_basis_points:z.number().int().min(-3000).max(5000),
  p_guardrail:z.enum(['none','minimum','maximum']),
  p_explanations:z.array(z.string().min(1).max(1000).refine(value=>
    !Array.from(value).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))).min(1).max(20),
}).strict().refine(value=>value.p_maximum_rate_minor>=value.p_minimum_rate_minor
  &&value.p_reserved_units<=value.p_effective_units
  &&new TextEncoder().encode(JSON.stringify(value.p_explanations)).length<=19000);
export type RevenueApprovalCommand=z.infer<typeof revenueApprovalCommandSchema>;

const receiptSchema=z.object({request_id:uuid,tenant_id:uuid,property_id:uuid,plan_id:uuid,
  stay_date:day,recommended_rate_minor:money,saved_at:z.string().datetime({offset:true}),
  replayed:z.boolean().optional(),found:z.literal(true).optional()}).strict();
export type RevenueApprovalReceipt=z.infer<typeof receiptSchema>;
const recordSchema=z.object({version:z.literal(1),actor_id:uuid,command:revenueApprovalCommandSchema,
  phase:z.enum(['ready','awaiting','saved']),receipt:receiptSchema.optional()}).strict();
export type RevenueApprovalRecord=z.infer<typeof recordSchema>;

export interface ApprovalStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
  removeItem(key:string):void;
}
export interface ApprovalTransport {
  apply(command:RevenueApprovalCommand):Promise<unknown>;
  status(scope:{p_tenant:string;p_property:string;p_request:string}):Promise<unknown>;
}
// The interface must inject a cross-tab exclusive lock (for example Web Locks).
// Do not use an unlocked browser fallback: two tabs could replace a pending review.
export type ApprovalLock=<T>(key:string,work:()=>Promise<T>)=>Promise<T>;

export function createRevenueApprovalRecovery(options:{actorId:string;tenantId:string;propertyId:string;
  storage:ApprovalStorage;transport:ApprovalTransport;lock:ApprovalLock}){
  const actor=uuid.parse(options.actorId),tenant=uuid.parse(options.tenantId),property=uuid.parse(options.propertyId);
  const key=`irp:revenue-approval:v1:${actor}:${tenant}:${property}`;
  function read():RevenueApprovalRecord|null{
    const raw=options.storage.getItem(key);
    if(raw===null)return null;
    const record=recordSchema.parse(JSON.parse(raw));
    if(record.actor_id!==actor||record.command.p_tenant!==tenant||record.command.p_property!==property)
      throw new Error('Approval journal scope mismatch');
    if(record.phase==='saved'&&!record.receipt)throw new Error('Approval receipt is missing');
    if(record.receipt)matchingReceipt(record.command,record.receipt);
    return record;
  }
  function write(record:RevenueApprovalRecord){options.storage.setItem(key,JSON.stringify(recordSchema.parse(record)));}
  function matchingReceipt(command:RevenueApprovalCommand,value:unknown){
    const receipt=receiptSchema.parse(value);
    if(receipt.request_id!==command.p_request||receipt.tenant_id!==tenant||receipt.property_id!==property
      ||receipt.plan_id!==command.p_plan||receipt.stay_date!==command.p_stay_date
      ||receipt.recommended_rate_minor!==command.p_recommended_rate_minor)
      throw new Error('Approval receipt does not match the reviewed request');
    return receipt;
  }
  function saved(record:RevenueApprovalRecord,value:unknown){
    const next:RevenueApprovalRecord={...record,phase:'saved',receipt:matchingReceipt(record.command,value)};
    write(next);return next;
  }
  return {
    read,
    stage(input:RevenueApprovalCommand){return options.lock(key,async()=>{
      const command=revenueApprovalCommandSchema.parse(input);
      if(command.p_tenant!==tenant||command.p_property!==property)throw new Error('Review scope mismatch');
      const prior=read();
      if(prior){
        if(JSON.stringify(prior.command)!==JSON.stringify(command))throw new Error('Resolve the existing approval first');
        return prior;
      }
      const record:RevenueApprovalRecord={version:1,actor_id:actor,command,phase:'ready'};
      write(record);return record;
    });},
    submit(){return options.lock(key,async()=>{
      const record=read();
      if(!record)throw new Error('Stage a reviewed approval first');
      if(record.phase==='saved')return record;
      if(record.phase==='awaiting')throw new Error('Check saved status before retrying');
      // Persist uncertainty BEFORE sending. Any exception leaves this exact request recoverable.
      write({...record,phase:'awaiting'});
      return saved(record,await options.transport.apply(revenueApprovalCommandSchema.parse(record.command)));
    });},
    recover(){return options.lock(key,async()=>{
      const record=read();
      if(!record||record.phase==='saved')return record;
      const command=record.command;
      const value=await options.transport.status({p_tenant:tenant,p_property:property,p_request:command.p_request});
      const missing=z.object({found:z.literal(false),request_id:uuid,tenant_id:uuid,property_id:uuid}).strict().safeParse(value);
      if(missing.success){
        if(missing.data.request_id!==command.p_request||missing.data.tenant_id!==tenant||missing.data.property_id!==property)
          throw new Error('Approval status scope mismatch');
        // A delayed original request may still commit: retry only the same immutable request.
        const next:RevenueApprovalRecord={...record,phase:'ready'};write(next);return next;
      }
      if(typeof value!=='object'||value===null||!('found' in value)||value.found!==true)
        throw new Error('Invalid approval status');
      return saved(record,value);
    });},
    acknowledge(){return options.lock(key,async()=>{
      if(read()?.phase!=='saved')throw new Error('Resolve saved status before clearing approval');
      options.storage.removeItem(key);
    });},
  };
}
