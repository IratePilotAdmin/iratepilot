import {validateFollowUpStatus, type FollowUpStatus, validateFollowUpPending, validateFollowUpResult, type FollowUpPending, type FollowUpResult, type FollowUpRecorded, validateFollowUpContext, validateFollowUpDetail, sameFollowUpValue, followUpBalance, type FollowUpDetail, type FollowUpEvent, type FollowUpContext, type FollowUpScope} from './balance-follow-up';

import {validateFollowUpQueue,followUpSummary,type FollowUpQueue,type FollowUpRow,type FollowUpBalance,type FollowUpQueueScope,type FollowUpFilters} from './balance-follow-up';

export type RoutedFollowUpContext={schema_version:2;base:FollowUpContext;routed_charge_minor:number;guest_balance_minor:number|null;routing_fingerprint:string;context_fingerprint:string};
export function validateRoutedFollowUpContext(value:unknown,scope:Pick<FollowUpScope,'tenant'|'property'|'reservation'>):asserts value is RoutedFollowUpContext {
 if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Guest billing review unavailable.');
 const v=value as RoutedFollowUpContext;
 const keys=['schema_version','base','routed_charge_minor','guest_balance_minor','routing_fingerprint','context_fingerprint'];
 if(Object.keys(v).length!==keys.length || keys.some(key=>!Object.prototype.hasOwnProperty.call(v,key)) || v.schema_version!==2 || JSON.stringify(v).length>10000) throw Error('Invalid guest billing review.');
 validateFollowUpContext(v.base,scope);
 if(!Number.isSafeInteger(v.routed_charge_minor) || v.routed_charge_minor<0 || v.routed_charge_minor>999999999999 || typeof v.routing_fingerprint!=='string' || typeof v.context_fingerprint!=='string' || !/^[0-9a-f]{64}$/.test(v.routing_fingerprint) || !/^[0-9a-f]{64}$/.test(v.context_fingerprint)) throw Error('Invalid routed balance.');
 if(v.base.available){
  if(!v.base.totals || !Number.isSafeInteger(v.guest_balance_minor) || v.routed_charge_minor>v.base.totals.charges_minor || v.guest_balance_minor!==v.base.totals.balance_minor-v.routed_charge_minor) throw Error('Guest balance does not reconcile.');
 }else if(v.routed_charge_minor!==0 || v.guest_balance_minor!==null) throw Error('Unknown guest balance must remain unavailable.');
}
export function routedFollowUpBalance(context:RoutedFollowUpContext,scope:Pick<FollowUpScope,'tenant'|'property'|'reservation'>){
 validateRoutedFollowUpContext(context,scope);
 const original=followUpBalance(context.base);
 return {...original,context_fingerprint:context.context_fingerprint,original_balance_minor:original.balance_minor,routed_charge_minor:context.routed_charge_minor,balance_minor:context.guest_balance_minor,balance_basis:'guest_after_routing' as const};
}

export type RoutedFollowUpEvent=Omit<FollowUpEvent,'context'>&{context:FollowUpContext|RoutedFollowUpContext};
export type RoutedFollowUpDetail=Omit<FollowUpDetail,'schema_version'|'events'|'current_event'|'current_context'>&{schema_version:2;events:RoutedFollowUpEvent[];current_event:RoutedFollowUpEvent|null;current_context:RoutedFollowUpContext;current_balance:ReturnType<typeof routedFollowUpBalance>};
export function validateRoutedFollowUpDetail(value:unknown,scope:FollowUpScope):asserts value is RoutedFollowUpDetail {
 if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Follow-up detail unavailable.');
 const v=value as RoutedFollowUpDetail;
 if(v.schema_version!==2 || !Array.isArray(v.events) || v.events.length>1000) throw Error('Invalid routed follow-up detail.');
 validateRoutedFollowUpContext(v.current_context,scope);
 if(!sameFollowUpValue(v.current_balance,routedFollowUpBalance(v.current_context,scope))) throw Error('Displayed guest balance disagrees with review.');
 const seen=new Map<string,unknown>();
 function checked(context:FollowUpContext|RoutedFollowUpContext):FollowUpContext {
  if(context?.schema_version===2)validateRoutedFollowUpContext(context,scope);else validateFollowUpContext(context,scope);
  const prior=seen.get(context.context_fingerprint);
  if(prior && !sameFollowUpValue(prior,context)) throw Error('Conflicting review history.');
  seen.set(context.context_fingerprint,context);
  // Use the proven legacy structural/history checks without changing stored or displayed values.
  return context.schema_version===2?{...context.base,context_fingerprint:context.context_fingerprint}:context;
 }
 const {current_balance:balance,...detail}=v;void balance;
 validateFollowUpDetail({...detail,schema_version:1,current_context:checked(v.current_context),events:v.events.map(e=>({...e,context:checked(e.context)})),current_event:v.current_event?{...v.current_event,context:checked(v.current_event.context)}:null},scope);
}

export type RoutedFollowUpPending=Omit<FollowUpPending,'reviewed_context'>&{reviewed_context:RoutedFollowUpContext};
export type RoutedFollowUpResult=Exclude<FollowUpResult,FollowUpRecorded>|(Omit<FollowUpRecorded,'event'>&{event:RoutedFollowUpEvent});
function pendingBase(p:RoutedFollowUpPending):FollowUpPending{return {...p,reviewed_context:{...p.reviewed_context.base,context_fingerprint:p.reviewed_context.context_fingerprint}};}
export function validateRoutedFollowUpPending(value:unknown,scope:FollowUpScope):asserts value is RoutedFollowUpPending {
 if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Saved follow-up request unavailable.');
 const p=value as RoutedFollowUpPending;
 validateRoutedFollowUpContext(p.reviewed_context,scope);
 validateFollowUpPending(pendingBase(p),scope);
}
export function validateRoutedFollowUpResult(value:unknown,p:RoutedFollowUpPending):asserts value is RoutedFollowUpResult {
 const scope={actor:p.actor_id,tenant:p.tenant_id,property:p.property_id,reservation:p.reservation_id};validateRoutedFollowUpPending(p,scope);
 if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Follow-up outcome unavailable.');
 const result=value as RoutedFollowUpResult;
 if(result.outcome==='recorded'){
  validateRoutedFollowUpContext(result.event?.context,scope);
  if(!sameFollowUpValue(result.event.context,p.reviewed_context)) throw Error('Saved review differs from submitted review.');
  validateFollowUpResult({...result,event:{...result.event,context:pendingBase(p).reviewed_context}},pendingBase(p));
 }else validateFollowUpResult(result,pendingBase(p));
}

export type RoutedFollowUpStatus=Omit<FollowUpStatus,'result'>&{result:RoutedFollowUpResult|null};
export type RoutedFollowUpBalance=ReturnType<typeof routedFollowUpBalance>;
export type RoutedFollowUpRow=Omit<FollowUpRow,'current_balance'|'last_action'>&{current_balance:RoutedFollowUpBalance;last_action:Omit<FollowUpRow['last_action'],'reviewed_balance'>&{reviewed_balance:FollowUpBalance|RoutedFollowUpBalance}};
export type RoutedFollowUpQueue=Omit<FollowUpQueue,'schema_version'|'rows'>&{schema_version:2;rows:RoutedFollowUpRow[]};
export function validateRoutedFollowUpQueue(value:unknown,scope:FollowUpQueueScope,filters:FollowUpFilters):asserts value is RoutedFollowUpQueue {
 if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Follow-up list unavailable.');
 const v=value as RoutedFollowUpQueue;
 if(v.schema_version!==2 || !Array.isArray(v.rows) || v.rows.length>10000) throw Error('Invalid follow-up list.');
 function original(value:FollowUpBalance|RoutedFollowUpBalance,required:boolean):FollowUpBalance {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Invalid follow-up balance.');
  if(!('balance_basis' in value)) {if(required)throw Error('Routed guest balance missing.');return value;}
  const {original_balance_minor,routed_charge_minor,balance_basis,...base}=value;
  if(balance_basis!=='guest_after_routing' || !Number.isSafeInteger(routed_charge_minor) || routed_charge_minor<0 || routed_charge_minor>999999999999) throw Error('Invalid transferred amount.');
  if(base.available){
   if(!Number.isSafeInteger(original_balance_minor) || !Number.isSafeInteger(base.balance_minor) || base.charges_minor===null || routed_charge_minor>base.charges_minor || base.balance_minor!==original_balance_minor!-routed_charge_minor) throw Error('Guest balance does not reconcile.');
  }else if(original_balance_minor!==null || routed_charge_minor!==0 || base.balance_minor!==null) throw Error('Unknown guest balance must remain unavailable.');
  return {...base,balance_minor:original_balance_minor};
 }
 const rows=v.rows.map(row=>{
  if(!row || !row.last_action)throw Error('Incomplete follow-up row.');
  if(row.context_changed_since_recording===false && !sameFollowUpValue(row.current_balance,row.last_action.reviewed_balance))throw Error('Conflicting saved balance.');
  return {...row,current_balance:original(row.current_balance,true),last_action:{...row.last_action,reviewed_balance:original(row.last_action.reviewed_balance,false)}};
 });
 // Validate original charge arithmetic and all existing scope, history, ordering and filter rules.
 validateFollowUpQueue({...v,schema_version:1,rows,summary:followUpSummary(rows)},scope,filters);
 if(!sameFollowUpValue(v.summary,followUpSummary(v.rows)))throw Error('Guest balance totals do not reconcile.');
}
export function validateRoutedFollowUpStatus(value:unknown,p:RoutedFollowUpPending):asserts value is RoutedFollowUpStatus {
 validateRoutedFollowUpPending(p,{actor:p.actor_id,tenant:p.tenant_id,property:p.property_id,reservation:p.reservation_id});
 if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Follow-up status unavailable.');
 const status=value as RoutedFollowUpStatus;
 if(status.found){
  validateRoutedFollowUpResult(status.result,p);
  const result=status.result!;
  validateFollowUpStatus({...status,result:result.outcome==='recorded'?{...result,event:{...result.event,context:pendingBase(p).reviewed_context}}:result},pendingBase(p));
 }else validateFollowUpStatus(status,pendingBase(p));
}

import {reportMoney,type ReportCell} from './report-export';
import {followUpStatusLabel,followUpStates,followUpBasis,followUpActions} from './balance-follow-up';
export function routedFollowUpQueueCsv(v:RoutedFollowUpQueue):ReportCell[][]{
 validateRoutedFollowUpQueue(v,{actor:v.actor_id,tenant:v.tenant_id,property:v.property_id},v.filters);const s=v.summary;
 return [['Balance follow-up'],['Population','Recorded follow-ups only'],['Prepared at',v.generated_at],['Property',v.property.name],['Property ID',v.property_id],['Time zone',v.property.time_zone],['Property business date',v.property_business_date],['State filter',v.filters.state],['Staff schedule filter',v.filters.schedule],['Complete returned rows',s.row_count],['Amounts complete',s.amounts_complete],['Unavailable current balances',s.unavailable_count],['Known charges USD',reportMoney(s.known_charges_minor)],['Known recorded paid USD',reportMoney(s.known_recorded_paid_minor)],['Known guest balance USD',reportMoney(s.known_balance_minor)],['Known positive balances USD',reportMoney(s.known_positive_balances_minor)],['Known credit balances USD',reportMoney(s.known_credit_balances_minor)],['Meaning','Internal staff follow-up dates are not debt due dates or receivables age. Security funds excluded. Completing a review does not mark a stay paid.'],[],
 ['Reservation ID','Booking source','Booking reference','Current booking status','Follow-up state','Staff follow-up date / last scheduled follow-up','Work schedule bucket','Days past staff follow-up','Current guest balance USD','Transferred to company accounts USD','Original balance USD','Current charge basis','Current opening USD','Current charges USD','Current recorded paid USD','Current reservation total USD','Last reviewed balance USD','Last reviewed charge basis','Last reviewed opening USD','Last reviewed charges USD','Last reviewed recorded paid USD','Current amount available','Last reviewed amount available','Balance or booking context changed','Schedule zone changed','Current pricing review required','Last action','Recorded at','Recording time zone','Recording business date','Recorded by','Task version','Current event ID','Current context fingerprint','Reviewed context fingerprint'],
 ...v.rows.map(r=>[r.reservation.id,r.reservation.source,r.reservation.source_booking_id,followUpStatusLabel(r.reservation),followUpStates[r.head.state],r.head.follow_up_on,r.follow_up_bucket,r.days_past_follow_up,reportMoney(r.current_balance.balance_minor),reportMoney(r.current_balance.routed_charge_minor),reportMoney(r.current_balance.original_balance_minor),followUpBasis(r.current_balance),reportMoney(r.current_balance.opening_total_minor),reportMoney(r.current_balance.charges_minor),reportMoney(r.current_balance.recorded_paid_minor),reportMoney(r.current_balance.current_reservation_total_minor),reportMoney(r.last_action.reviewed_balance.balance_minor),followUpBasis(r.last_action.reviewed_balance),reportMoney(r.last_action.reviewed_balance.opening_total_minor),reportMoney(r.last_action.reviewed_balance.charges_minor),reportMoney(r.last_action.reviewed_balance.recorded_paid_minor),r.current_balance.available,r.last_action.reviewed_balance.available,r.context_changed_since_recording,r.schedule_zone_changed,r.current_balance.flags.pricing_reconciliation_required,followUpActions[r.last_action.action],r.last_action.recorded_at,r.last_action.recording_time_zone,r.last_action.recording_business_date,r.last_action.actor_id,r.head.version,r.head.current_event_id,r.current_balance.context_fingerprint,r.last_action.reviewed_balance.context_fingerprint])];
}
