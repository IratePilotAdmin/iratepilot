import {isTurnoverUuid,isTurnoverVersion,turnoverReason,type TurnoverScope} from '@/lib/turnovers';
import {validMaintenanceDate} from '@/lib/maintenance';
export type PendingAssignmentBatch=TurnoverScope&{requestId:string;day:string;reason:string;team:{user_id:string;maximum_tasks:number}[];assignments:{task_id:string;room_id:string;task_version:number;room_version:number;assignee_id:string}[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).sort().join(',')===[...expected].sort().join(',');
export function validAssignmentBatch(v:unknown,scope:TurnoverScope):v is PendingAssignmentBatch{
 if(!object(v)||!keys(v,['actor','tenant','property','requestId','day','reason','team','assignments'])||v.actor!==scope.actor||v.tenant!==scope.tenant||v.property!==scope.property||![v.actor,v.tenant,v.property,v.requestId].every(isTurnoverUuid)||!validMaintenanceDate(v.day)||!turnoverReason(v.reason)||!Array.isArray(v.team)||v.team.length<1||v.team.length>200||!Array.isArray(v.assignments)||v.assignments.length<1||v.assignments.length>500)return false;
 const people=new Set<string>(),tasks=new Set<string>(),rooms=new Set<string>();
 for(const p of v.team){if(!object(p)||!keys(p,['user_id','maximum_tasks'])||!isTurnoverUuid(p.user_id)||people.has(p.user_id)||!Number.isSafeInteger(p.maximum_tasks)||Number(p.maximum_tasks)<1||Number(p.maximum_tasks)>100)return false;people.add(p.user_id)}
 for(const a of v.assignments){if(!object(a)||!keys(a,['task_id','room_id','task_version','room_version','assignee_id'])||!isTurnoverUuid(a.task_id)||!isTurnoverUuid(a.room_id)||!isTurnoverUuid(a.assignee_id)||!people.has(a.assignee_id)||tasks.has(a.task_id)||rooms.has(a.room_id)||!isTurnoverVersion(a.task_version)||a.task_version===Number.MAX_SAFE_INTEGER||!isTurnoverVersion(a.room_version))return false;tasks.add(a.task_id);rooms.add(a.room_id)}
 return true;
}
export function assignmentBatchArgs(p:PendingAssignmentBatch){return {p_tenant:p.tenant,p_property:p.property,p_request:p.requestId,p_day:p.day,p_team:p.team,p_assignments:p.assignments.map(({room_id,...a})=>a),p_reason:p.reason}}
export function verifyAssignmentBatchReceipt(v:unknown,p:PendingAssignmentBatch){
 if(validAssignmentBatch(p,p)&&object(v)&&keys(v,['tenant_id','property_id','request_id','cancelled'])&&v.tenant_id===p.tenant&&v.property_id===p.property&&v.request_id===p.requestId&&v.cancelled===true)return v;
 if(!validAssignmentBatch(p,p)||!object(v)||!keys(v,['tenant_id','property_id','request_id','business_date','assignments','replayed'])||v.tenant_id!==p.tenant||v.property_id!==p.property||v.request_id!==p.requestId||v.business_date!==p.day||typeof v.replayed!=='boolean'||!Array.isArray(v.assignments)||v.assignments.length!==p.assignments.length)throw Error('Batch receipt does not match the reviewed request.');
 const childRequests=new Set<string>();
 v.assignments.forEach((a,i)=>{const expected=p.assignments[i];if(!object(a)||!keys(a,['request_id','task_id','room_id','assignee_id','task_version','room_version'])||!isTurnoverUuid(a.request_id)||childRequests.has(a.request_id)||a.task_id!==expected.task_id||a.room_id!==expected.room_id||a.assignee_id!==expected.assignee_id||a.task_version!==expected.task_version+1||a.room_version!==expected.room_version)throw Error('An assignment receipt could not be verified.');childRequests.add(a.request_id)});
 return v;
}
export const assignmentBatchKey=(scope:TurnoverScope)=>'iratepilot-pms-pending-assignment-batch:'+scope.actor+':'+scope.tenant+':'+scope.property;
export function readAssignmentBatch(storage:Pick<Storage,'getItem'>,scope:TurnoverScope):PendingAssignmentBatch|null{
 const raw=storage.getItem(assignmentBatchKey(scope));if(raw===null)return null;
 if(raw.length>1000000)throw Error('Saved batch is too large. Keep the record and reconcile before continuing.');
 let value:unknown;try{value=JSON.parse(raw)}catch{throw Error('Saved batch cannot be read. Keep the record and reconcile before continuing.')}
 if(!validAssignmentBatch(value,scope))throw Error('Saved batch does not match this account and property.');
 return value;
}
export function storeAssignmentBatch(storage:Pick<Storage,'getItem'|'setItem'>,pending:PendingAssignmentBatch){
 if(!validAssignmentBatch(pending,pending))throw Error('Review the assignment batch before saving.');
 const existing=readAssignmentBatch(storage,pending);
 if(existing&&JSON.stringify(existing)!==JSON.stringify(pending))throw Error('Resolve the existing assignment batch first.');
 const raw=JSON.stringify(pending);storage.setItem(assignmentBatchKey(pending),raw);
 if(storage.getItem(assignmentBatchKey(pending))!==raw)throw Error('The recovery record could not be saved. Do not submit the batch.');
}
// Null means no receipt was observed; an in-flight save could still commit.
export function verifyAssignmentBatchStatus(value:unknown,pending:PendingAssignmentBatch){
 if(!object(value)||!keys(value,['found','result'])||typeof value.found!=='boolean')throw Error('Batch status could not be verified.');
 if(!value.found){if(value.result!==null)throw Error('Inconsistent batch status.');return null}
 return verifyAssignmentBatchReceipt(value.result,pending);
}
export function clearConfirmedAssignmentBatch(storage:Pick<Storage,'getItem'|'removeItem'>,pending:PendingAssignmentBatch,receipt:unknown){
 verifyAssignmentBatchReceipt(receipt,pending);
 const current=readAssignmentBatch(storage,pending);
 if(!current||JSON.stringify(current)!==JSON.stringify(pending))throw Error('Saved batch changed while checking its receipt.');
 storage.removeItem(assignmentBatchKey(pending));
}
