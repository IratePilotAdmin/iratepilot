import type {FinancialPostingSelection} from './financial-migration-posting';
import type {prepareSplitEntries} from './financial-split-entry';
import {readSplitReview} from './financial-split-review';
export type SplitSaveRequest={id:string;selection:FinancialPostingSelection;assessment:Record<string,unknown>;allocations:ReturnType<typeof prepareSplitEntries>;review:Record<string,unknown>};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid split save response.');return v as Record<string,unknown>};
export function validateSplitSaveRequest(request:SplitSaveRequest){if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(request.id))throw Error('Invalid split save request identity.');return readSplitReview(request.review,request.selection,request.assessment,request.allocations);}
export function readSplitSaveReceipt(value:unknown,request:SplitSaveRequest){validateSplitSaveRequest(request);const v=object(value);if(v.request_id!==request.id||v.batch_id!==request.selection.batch||v.saved!==true||v.ready_to_commit!==false||typeof v.replayed!=='boolean')throw Error('Split save receipt differs from this request.');return v;}
export function readSplitSaveStatus(value:unknown,request:SplitSaveRequest){validateSplitSaveRequest(request);const v=object(value),s=request.selection.scope;if(v.schema_version!==1||v.tenant_id!==s.tenant||v.property_id!==s.property||v.actor_id!==s.actor||v.request_id!==request.id||typeof v.found!=='boolean'||typeof v.cancelled!=='boolean'||v.found&&v.cancelled)throw Error('Split recovery belongs to another request.');
 if(v.found){readSplitReview(v.review,request.selection,request.assessment,request.allocations);readSplitSaveReceipt(v.result,request);}else if(v.review!==null||v.result!==null)throw Error('Unrecorded split save contains a receipt.');return {found:v.found,cancelled:v.cancelled};
}
