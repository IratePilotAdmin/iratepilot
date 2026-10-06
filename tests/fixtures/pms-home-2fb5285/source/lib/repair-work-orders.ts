export const repairStates = ['reported', 'assigned', 'in_progress', 'awaiting_verification', 'completed', 'cancelled'] as const;
export type RepairState = typeof repairStates[number];
export type RepairScope = {tenant: string; property: string};
export type RepairAttention='unfinished'|'overdue'|'unassigned';
export type RepairSummary={schema_version:1;tenant_id:string;property_id:string;business_date:string;time_zone:string;generated_at:string;counts:{open:number;urgent:number;overdue:number;unassigned:number;awaiting_verification:number}};
export function parseRepairSummary(v:unknown,scope:RepairScope):RepairSummary {
 const fail=()=>{throw Error('Repair overview could not be verified. Refresh to try again.');};
 if(!object(v)||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||!uuid(scope.tenant)||!uuid(scope.property)||!date(v.business_date)||!timestamp(v.generated_at)||typeof v.time_zone!=='string'||!object(v.counts))return fail();
 try{const formatted=new Intl.DateTimeFormat('en-CA',{timeZone:v.time_zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(v.generated_at));const part=(name:string)=>formatted.find(p=>p.type===name)?.value;if(`${part('year')}-${part('month')}-${part('day')}`!==v.business_date)return fail();}catch{return fail();}
 for(const key of ['open','urgent','overdue','unassigned','awaiting_verification'])if(!Number.isSafeInteger(v.counts[key])||Number(v.counts[key])<0||Number(v.counts[key])>Number(v.counts.open))return fail();
 return v as RepairSummary;
}
export type PendingRepairReport = RepairScope & {actor:string; request:string; room:string|null; location:string; description:string; priority:RepairOrder['priority']};
export const repairReportKey = (scope:RepairScope & {actor:string}) => 'iratepilot-repair-report:'+scope.actor+':'+scope.tenant+':'+scope.property;
export type RepairOrder = {
  id: string; room_id: string | null; location: string; description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent'; state: RepairState; version: number;
  assignee_id: string | null; due_on: string | null; created_at: string; updated_at: string;
};
export type RepairQueue = {schema_version: 1; tenant_id: string; property_id: string; orders: RepairOrder[]; has_more: boolean; next_after: string | null};
export type RepairEvent={version:number;actor_id:string;action:string;reason:string;created_at:string};
export type RepairDetail={schema_version:1;tenant_id:string;property_id:string;order:RepairOrder & {tenant_id:string;property_id:string;reported_by:string};events:RepairEvent[];has_more:boolean;next_after_version:number|null};
export function parseRepairDetail(value:unknown,scope:RepairScope,order:string,after=0):RepairDetail{
 const fail=()=>{throw Error('The repair history could not be verified. Refresh before continuing.');};
 if(!uuid(scope.tenant)||!uuid(scope.property)||!uuid(order)||!Number.isSafeInteger(after)||after<0||!object(value)||value.schema_version!==1||value.tenant_id!==scope.tenant||value.property_id!==scope.property||!object(value.order)||value.order.tenant_id!==scope.tenant||value.order.property_id!==scope.property||!uuid(value.order.reported_by)||!validOrder(value.order)||value.order.id!==order||!Array.isArray(value.events)||value.events.length>50||typeof value.has_more!=='boolean')return fail();
 let previous=after;
 for(const event of value.events){
  if(!object(event)||event.version!==previous+1||Number(event.version)>value.order.version||!uuid(event.actor_id)||!['report','assign','start','submit','complete','return','cancel','reopen','update'].includes(String(event.action))||!text(event.reason,4,2000)||!timestamp(event.created_at))return fail();
  previous=Number(event.version);
 }
 if(value.has_more?value.events.length!==50||value.next_after_version!==previous||previous>=value.order.version:value.next_after_version!==null||previous!==value.order.version)return fail();
 return value as RepairDetail;
}
export type RepairAction = 'priority'|'assign'|'start'|'submit'|'complete'|'return'|'cancel'|'reopen';
export type PendingRepairChange = RepairScope & {actor:string;request:string;order:string;version:number;action:RepairAction;reason:string;assignee:string|null;due:string|null;priority?:RepairOrder['priority'];priorState?:RepairState};
const nextRepairState:Record<RepairAction,RepairState>={priority:'reported',assign:'assigned',start:'in_progress',submit:'awaiting_verification',complete:'completed',return:'in_progress',cancel:'cancelled',reopen:'reported'};
export const repairChangeKey=(scope:RepairScope & {actor:string})=>'iratepilot-repair-change:'+scope.actor+':'+scope.tenant+':'+scope.property;
export function validPendingRepairChange(v:unknown,scope:RepairScope & {actor:string}):v is PendingRepairChange {
 return object(v)&&v.actor===scope.actor&&v.tenant===scope.tenant&&v.property===scope.property&&[v.actor,v.tenant,v.property,v.request,v.order].every(uuid)
  &&Number.isSafeInteger(v.version)&&Number(v.version)>0&&Number(v.version)<Number.MAX_SAFE_INTEGER&&typeof v.action==='string'&&Object.hasOwn(nextRepairState,v.action)&&text(v.reason,4,500)
  &&(v.action==='priority'?['low','normal','high','urgent'].includes(String(v.priority))&&['reported','assigned','in_progress','awaiting_verification'].includes(String(v.priorState)):v.priority===undefined&&v.priorState===undefined)
  &&(v.action==='assign'?uuid(v.assignee)&&(v.due===null||date(v.due)):v.assignee===null&&v.due===null);
}
export function repairChangeArgs(p:PendingRepairChange):Record<string,unknown>{
 if(!validPendingRepairChange(p,p))throw Error('The saved repair action is invalid.');
 const args={p_tenant:p.tenant,p_property:p.property,p_order:p.order,p_request:p.request,p_version:p.version,p_reason:p.reason};
 return p.action==='priority'?{...args,p_priority:p.priority}:p.action==='assign'?{...args,p_assignee:p.assignee,p_due:p.due}:{...args,p_action:p.action};
}
export function verifyRepairChangeReceipt(v:unknown,p:PendingRepairChange):void{
 if(!validPendingRepairChange(p,p)||!object(v)||v.schema_version!==1||v.tenant_id!==p.tenant||v.property_id!==p.property||v.actor_id!==p.actor||v.request_id!==p.request||v.order_id!==p.order||v.version!==p.version+1||v.state!==(p.action==='priority'?p.priorState:nextRepairState[p.action])||(p.action==='priority'&&v.priority!==p.priority)||v.availability_changed!==false||v.housekeeping_changed!==false)throw Error('The repair update confirmation does not match this saved action. Keep it and check again.');
}
export function repairChangeStatus(v:unknown,p:PendingRepairChange):boolean{
 if(!object(v)||v.schema_version!==1||v.tenant_id!==p.tenant||v.property_id!==p.property||v.actor_id!==p.actor||v.request_id!==p.request||typeof v.found!=='boolean'||(!v.found&&v.receipt!==null))throw Error('Unable to verify the saved repair action.');
 if(v.found)verifyRepairChangeReceipt(v.receipt,p);
 return v.found;
}
export type RepairPerson = {user_id:string;label:string;role:'owner'|'manager'|'staff'};
export type RepairTeam = {schema_version:1;tenant_id:string;property_id:string;people:RepairPerson[];has_more:boolean;next_after:string|null};
/** Presentation only: the database independently authorizes every command. */
export function availableRepairActions(order:RepairOrder, actor:string, role:string):RepairAction[] {
  if (!['owner','manager','staff'].includes(role) || !uuid(actor) || !validOrder(order)) return [];
  const result:RepairAction[]=[];
  if (['owner','manager'].includes(role)) {
    if (['reported','assigned'].includes(order.state)) result.push('assign');
    if (order.state==='awaiting_verification') result.push('complete','return');
    if (['completed','cancelled'].includes(order.state)) result.push('reopen'); else result.push('cancel','priority');
  }
  if (order.assignee_id===actor) {
    if (order.state==='assigned') result.push('start');
    if (order.state==='in_progress') result.push('submit');
  }
  return result;
}
export function parseRepairTeam(value:unknown,scope:RepairScope,after:string|null=null,limit=50):RepairTeam {
  const fail=()=>{throw Error('The repair team could not be verified for this property. Refresh before assigning work.');};
  if (!uuid(scope.tenant)||!uuid(scope.property)||(after!==null&&!uuid(after))||!Number.isSafeInteger(limit)||limit<1||limit>100||!object(value)||value.schema_version!==1||value.tenant_id!==scope.tenant||value.property_id!==scope.property||!Array.isArray(value.people)||value.people.length>limit||typeof value.has_more!=='boolean')return fail();
  let previous=after?.toLowerCase()??'';
  for(const person of value.people){
    if(!object(person)||!uuid(person.user_id)||person.user_id.toLowerCase()<=previous||typeof person.label!=='string'||!person.label.trim()||!['owner','manager','staff'].includes(String(person.role)))return fail();
    previous=person.user_id.toLowerCase();
  }
  if(value.has_more?value.people.length!==limit||value.next_after!==value.people.at(-1)?.user_id:value.next_after!==null)return fail();
  return value as RepairTeam;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function repairCancellationResult(v:unknown,pending:PendingRepairChange):'saved'|'cancelled' {
 if(!object(v)||v.schema_version!==1||v.tenant_id!==pending.tenant||v.property_id!==pending.property||v.actor_id!==pending.actor||v.request_id!==pending.request||v.order_id!==pending.order)throw Error('Repair request cancellation could not be verified. Keep the saved request.');
 if(v.outcome==='saved'){verifyRepairChangeReceipt(v.receipt,pending);return 'saved';}
 if(v.outcome==='cancelled'&&v.receipt===null)return 'cancelled';
 throw Error('Repair request cancellation could not be verified. Keep the saved request.');
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const text = (v: unknown, min: number, max: number) => typeof v === 'string' && v.trim() === v && v.length >= min && v.length <= max;
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const date = (v: unknown) => typeof v === 'string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
export function validPendingRepairReport(v:unknown, scope:RepairScope & {actor:string}):v is PendingRepairReport {
  return object(v) && v.actor===scope.actor && v.tenant===scope.tenant && v.property===scope.property && uuid(v.actor) && uuid(v.tenant) && uuid(v.property) && uuid(v.request)
    && (v.room===null || uuid(v.room)) && text(v.location,1,200) && text(v.description,4,2000) && ['low','normal','high','urgent'].includes(String(v.priority));
}
export function verifyRepairReportReceipt(v:unknown, pending:PendingRepairReport):string {
  if (!object(v) || v.schema_version!==1 || v.tenant_id!==pending.tenant || v.property_id!==pending.property || v.actor_id!==pending.actor || v.request_id!==pending.request || !uuid(v.order_id) || v.version!==1 || v.state!=='reported' || v.availability_changed!==false || v.housekeeping_changed!==false) throw Error('The repair confirmation could not be verified. Keep this saved request and check again.');
  return v.order_id;
}
export function repairReportStatus(v:unknown,pending:PendingRepairReport):string|null {
  if (!object(v) || v.schema_version!==1 || v.tenant_id!==pending.tenant || v.property_id!==pending.property || v.actor_id!==pending.actor || v.request_id!==pending.request || typeof v.found!=='boolean' || (!v.found && v.receipt!==null)) throw Error('The repair lookup could not be verified. Keep this request and try again.');
  return v.found ? verifyRepairReportReceipt(v.receipt,pending) : null;
}
export function repairReportCancellation(v:unknown,pending:PendingRepairReport):'saved'|'cancelled' {
 if(!object(v)||v.schema_version!==1||v.tenant_id!==pending.tenant||v.property_id!==pending.property||v.actor_id!==pending.actor||v.request_id!==pending.request)throw Error('Report cancellation could not be verified. Keep the saved report.');
 if(v.outcome==='saved'){verifyRepairReportReceipt(v.receipt,pending);return 'saved';}
 if(v.outcome==='cancelled'&&v.receipt===null)return 'cancelled';
 throw Error('Report cancellation could not be verified. Keep the saved report.');
}
function validOrder(v: unknown): v is RepairOrder {
  return object(v) && uuid(v.id) && (v.room_id === null || uuid(v.room_id)) && text(v.location, 1, 200) && text(v.description, 4, 2000)
    && ['low', 'normal', 'high', 'urgent'].includes(String(v.priority)) && repairStates.includes(v.state as RepairState)
    && Number.isSafeInteger(v.version) && Number(v.version) > 0 && (v.assignee_id === null || uuid(v.assignee_id))
    && (!['assigned', 'in_progress', 'awaiting_verification'].includes(String(v.state)) || uuid(v.assignee_id))
    && (v.due_on === null || date(v.due_on)) && timestamp(v.created_at) && timestamp(v.updated_at) && Date.parse(v.updated_at) >= Date.parse(v.created_at);
}
/** Validate each page against the request before allowing it into property state. */
export function parseRepairQueue(value: unknown, scope: RepairScope, options: {after?: string | null; state?: RepairState | null; limit?: number;priority?:RepairOrder['priority']|null;assignee?:string|null;attention?:RepairAttention|null} = {}): RepairQueue {
  const limit = options.limit ?? 50, after = options.after ?? null;
  const fail = () => {throw Error('Repair information could not be verified for this property. Refresh and try again.');};
  if(options.attention!=null&&(!['unfinished','overdue','unassigned'].includes(options.attention)||!object(value)||!date(value.business_date)))return fail();
  if ((options.priority!=null&&!['low','normal','high','urgent'].includes(options.priority))||(options.assignee!=null&&!uuid(options.assignee))) return fail();
  if (!uuid(scope.tenant) || !uuid(scope.property) || (after !== null && !uuid(after)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (options.state != null && !repairStates.includes(options.state))) return fail();
  if (!object(value) || value.schema_version !== 1 || value.tenant_id !== scope.tenant || value.property_id !== scope.property || !Array.isArray(value.orders) || value.orders.length > limit || typeof value.has_more !== 'boolean') return fail();
  let previous = after?.toLowerCase() ?? '';
  for (const row of value.orders) {
    if ((options.priority!=null&&(!object(row)||row.priority!==options.priority))||(options.assignee!=null&&(!uuid(options.assignee)||!object(row)||row.assignee_id!==options.assignee))) return fail();
    if (!validOrder(row) || row.id.toLowerCase() <= previous || (options.state != null && row.state !== options.state)) return fail();
    if(options.attention!=null&&(['completed','cancelled'].includes(row.state)||(options.attention==='unassigned'&&row.assignee_id!==null)||(options.attention==='overdue'&&(row.due_on===null||row.due_on>=String(value.business_date)))))return fail();
    previous = row.id.toLowerCase();
  }
  if (value.has_more ? value.orders.length !== limit || value.next_after !== value.orders.at(-1)?.id : value.next_after !== null) return fail();
  return value as RepairQueue;
}
