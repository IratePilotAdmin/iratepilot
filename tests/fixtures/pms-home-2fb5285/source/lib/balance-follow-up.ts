import {depositDate,depositZoneDate,addDepositDays} from '@/lib/deposits';
import {reportMoney,reportUsd,type ReportCell} from '@/lib/report-export';

export const followUpActions={schedule:'Schedule follow-up',reschedule:'Reschedule',complete:'Review completed',stop:'Stop follow-up',reopen:'Reopen'} as const;
export const followUpStates={open:'Open',completed:'Review completed',stopped:'Stopped'} as const;
export type FollowUpAction=keyof typeof followUpActions;
export type FollowUpState=keyof typeof followUpStates;
export type FollowUpScope={actor:string;tenant:string;property:string;reservation:string};
export type FollowUpQueueScope=Omit<FollowUpScope,'reservation'>;
export type FollowUpTask={state:FollowUpState;follow_up_on:string};
export type FollowUpComponents={accommodation_minor:number|null;taxes_minor:number|null;hotel_fees_minor:number|null;ota_fees_minor:number|null;total_minor:number|null};
export type FollowUpTotals={additional_minor:number;reversed_minor:number;charges_minor:number;external_payments_minor:number;external_refunds_minor:number;corrected_payments_minor:number;recorded_paid_minor:number;balance_minor:number};
export type FollowUpFlags={reservation_amounts_changed:boolean;opening_pricing_reconciliation_required:boolean;current_pricing_reconciliation_required:boolean;pricing_reconciliation_required:boolean};
export type FollowUpBooking={id:string;source:'direct'|'migration'|'iratepilot-ota';source_booking_id:string;status:'Confirmed'|'In house'|'Checked out'|'Cancelled';cancellation_kind:null|'no_show'};
export type FollowUpProperty={id:string;name:string;text_normalized:boolean;currency:'USD';time_zone:string;operating_model:'hotel'|'whole_home'};
export type FollowUpContext={schema_version:1;tenant_id:string;property_id:string;reservation_id:string;currency:'USD';reservation:{source:FollowUpBooking['source'];source_version:number;status:FollowUpBooking['status'];cancellation_kind:null|'no_show';arrival:string|null;departure:string|null};current_components:FollowUpComponents;available:boolean;unavailable_reason:null|'reservation_charges_unavailable';opening_mode:'frozen'|'reservation_preview'|'unavailable';opening:null|{components:FollowUpComponents;source:FollowUpBooking['source'];source_version:number;opened_at:string|null};totals:FollowUpTotals|null;flags:FollowUpFlags;folio_entry_count:number;source_fingerprints:{current_pricing:string|null;opening:string|null;entries:string};context_fingerprint:string};
export type FollowUpCommand={reservation_id:string;action:FollowUpAction;expected_version:number;expected_context_fingerprint:string;expected_business_date:string;expected_time_zone:string;follow_up_on:string|null;reason:string;confirmed:true};
export type FollowUpHead=FollowUpTask&{version:number;current_event_id:string;created_by:string;created_at:string;updated_at:string};
export type FollowUpEvent={id:string;tenant_id:string;property_id:string;reservation_id:string;request_id:string;actor_id:string;recorded_at:string;recording_time_zone:string;recording_business_date:string;action:FollowUpAction;from_version:number;to_version:number;before:FollowUpTask|null;after:FollowUpTask;reason:string;context:FollowUpContext};
export const followUpNoEffects={financial_changed:false,folio_changed:false,security_deposit_changed:false,revenue_changed:false,taxes_changed:false,money_moved:false,reservation_changed:false,guest_message_sent:false} as const;
export const followUpSemantics={mode:'internal_balance_follow_up',schedule_basis:'staff_follow_up_date',payment_recording:'external_only',debt_aging:false,collectibility_verified:false,payment_due_date_set:false,settlement_verified:false,security_funds_applied:false} as const;
export type FollowUpDetail={schema_version:1;tenant_id:string;property_id:string;reservation_id:string;actor_id:string;role:'owner'|'manager'|'staff';can_manage:boolean;generated_at:string;property_business_date:string;property:FollowUpProperty;reservation:FollowUpBooking;recorded:boolean;version:number;head:FollowUpHead|null;current_event:FollowUpEvent|null;events:FollowUpEvent[];current_context:FollowUpContext;context_changed_since_recording:boolean;schedule_zone_changed:boolean;events_truncated:false;financial_effects:typeof followUpNoEffects;semantics:typeof followUpSemantics};
export type FollowUpRecorded={schema_version:1;outcome:'recorded';action:'save_balance_follow_up';tenant_id:string;property_id:string;reservation_id:string;request_id:string;command:FollowUpCommand;event:FollowUpEvent;expected_version:number;version:number;financial_effects:typeof followUpNoEffects;semantics:typeof followUpSemantics;replayed:boolean};
export type FollowUpRetired={schema_version:1;outcome:'retired';action:'retire_balance_follow_up_request';tenant_id:string;property_id:string;reservation_id:string;request_id:string;command:FollowUpCommand;retirement_reason:string;retired_by:string;retired_at:string;follow_up_version_changed:false;financial_effects:typeof followUpNoEffects;semantics:typeof followUpSemantics;replayed:boolean};
export type FollowUpResult=FollowUpRecorded|FollowUpRetired;
export type FollowUpPending={schema_version:1;actor_id:string;tenant_id:string;property_id:string;reservation_id:string;request_id:string;command:FollowUpCommand;reviewed_task:FollowUpTask|null;reviewed_context:FollowUpContext;retirement_reason:string|null};
export type FollowUpStatus={schema_version:1;tenant_id:string;property_id:string;request_id:string;actor_id:string;found:boolean;action:null|FollowUpResult['action'];result:null|FollowUpResult};
export type FollowUpFilters={state:FollowUpState|'all';schedule:'all'|'past'|'today'|'future'};
export type FollowUpBalance={context_fingerprint:string;available:boolean;unavailable_reason:null|'reservation_charges_unavailable';opening_mode:FollowUpContext['opening_mode'];current_reservation_total_minor:number|null;opening_total_minor:number|null;charges_minor:number|null;recorded_paid_minor:number|null;balance_minor:number|null;folio_entry_count:number;flags:FollowUpFlags};
export type FollowUpRow={reservation:FollowUpBooking;head:FollowUpHead;last_action:{event_id:string;action:FollowUpAction;actor_id:string;recorded_at:string;recording_time_zone:string;recording_business_date:string;reviewed_balance:FollowUpBalance};current_balance:FollowUpBalance;context_changed_since_recording:boolean;schedule_zone_changed:boolean;follow_up_bucket:'past'|'today'|'future'|'inactive';days_past_follow_up:number|null};
export type FollowUpSummary={row_count:number;open_count:number;completed_count:number;stopped_count:number;past_count:number;today_count:number;future_count:number;available_count:number;unavailable_count:number;positive_balance_count:number;zero_balance_count:number;credit_balance_count:number;context_changed_count:number;schedule_zone_changed_count:number;pricing_review_count:number;known_charges_minor:number;known_recorded_paid_minor:number;known_balance_minor:number;known_positive_balances_minor:number;known_credit_balances_minor:number;amounts_complete:boolean};
export type FollowUpQueue={schema_version:1;tenant_id:string;property_id:string;actor_id:string;role:'owner'|'manager'|'staff';can_manage:boolean;property:FollowUpProperty;generated_at:string;property_business_date:string;filters:FollowUpFilters;population:'recorded_follow_ups';rows:FollowUpRow[];summary:FollowUpSummary;complete:true;rows_truncated:false;financial_effects:typeof followUpNoEffects;semantics:typeof followUpSemantics};

const amountKeys=['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'];
const flagKeys=['reservation_amounts_changed','opening_pricing_reconciliation_required','current_pricing_reconciliation_required','pricing_reconciliation_required'];
const totalKeys=['additional_minor','reversed_minor','charges_minor','external_payments_minor','external_refunds_minor','corrected_payments_minor','recorded_paid_minor','balance_minor'];
const maxMoney=999999999999;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function requireValue(condition:unknown):asserts condition{if(!condition)throw Error('The balance follow-up response is incomplete or inconsistent. Refresh before continuing.')}
function exact(value:unknown,keys:readonly string[]):asserts value is Record<string,unknown>{requireValue(object(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|'))}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const bool=(v:unknown)=>typeof v==='boolean';
const one=(v:unknown,list:readonly string[])=>typeof v==='string'&&list.includes(v);
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length;
const text=(v:unknown,min:number,max:number)=>typeof v==='string'&&v.replace(/^ +| +$/g,'')===v&&Array.from(v).length>=min&&Array.from(v).length<=max&&!Array.from(v).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
const stamp=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v)&&depositDate(v.slice(0,10))&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v.slice(0,10);
const zone=(v:unknown):v is string=>typeof v==='string'&&v.length>=1&&v.length<=100&&!!depositZoneDate('2027-01-02T12:00:00Z',v);
function sorted(v:unknown):unknown{if(Array.isArray(v))return v.map(sorted);if(object(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])]));return v}
export const sameFollowUpValue=(a:unknown,b:unknown)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
function fixed(v:unknown,wanted:Record<string,unknown>){exact(v,Object.keys(wanted));requireValue(sameFollowUpValue(v,wanted))}
const source=(v:unknown)=>one(v,['direct','migration','iratepilot-ota']);
function lifecycle(status:unknown,kind:unknown){requireValue(one(status,['Confirmed','In house','Checked out','Cancelled'])&&(kind===null||kind==='no_show'&&status==='Cancelled'))}
function flags(value:unknown){exact(value,flagKeys);const v=value as FollowUpFlags;requireValue(Object.values(v).every(bool)&&v.pricing_reconciliation_required===(v.reservation_amounts_changed||v.opening_pricing_reconciliation_required||v.current_pricing_reconciliation_required))}
function components(value:unknown,complete=false){exact(value,amountKeys);const v=value as FollowUpComponents;requireValue(Object.values(v).every(n=>n===null?!complete:integer(n,0,maxMoney)));if(Object.values(v).every(n=>n!==null))requireValue(v.accommodation_minor! + v.taxes_minor! + v.hotel_fees_minor! + v.ota_fees_minor! === v.total_minor)}
function task(value:unknown){exact(value,['state','follow_up_on']);const v=value as FollowUpTask;requireValue(one(v.state,Object.keys(followUpStates))&&depositDate(v.follow_up_on))}
function head(value:unknown){exact(value,['version','current_event_id','state','follow_up_on','created_by','created_at','updated_at']);const v=value as FollowUpHead;task({state:v.state,follow_up_on:v.follow_up_on});requireValue(integer(v.version,1,1000)&&uuid(v.current_event_id)&&uuid(v.created_by)&&stamp(v.created_at)&&stamp(v.updated_at))}
function booking(value:unknown,id?:string){exact(value,['id','source','source_booking_id','status','cancellation_kind']);const v=value as FollowUpBooking;requireValue(uuid(v.id)&&(id===undefined||v.id===id)&&source(v.source)&&typeof v.source_booking_id==='string'&&Array.from(v.source_booking_id).length>=1&&Array.from(v.source_booking_id).length<=128);lifecycle(v.status,v.cancellation_kind)}
export function followUpText(raw:string){const value=raw.trim();requireValue(text(value,4,500));return value}
export function followUpDateAllowed(value:string,businessDate:string){return depositDate(value)&&depositDate(businessDate)&&value>=businessDate&&value<=addDepositDays(businessDate,365)}
export function followUpNextActions(value:FollowUpTask|null):FollowUpAction[]{return value===null?['schedule']:value.state==='open'?['reschedule','complete','stop']:['reopen']}
export function followUpStatusLabel(value:FollowUpBooking){return value.cancellation_kind==='no_show'?'No show':value.status}
export function followUpMoney(value:number|null){return value===null?'Unavailable':reportUsd(value)}
export function followUpBasis(value:Pick<FollowUpBalance,'opening_mode'>){return value.opening_mode==='frozen'?'Preserved folio opening':value.opening_mode==='reservation_preview'?'Reservation charge preview':'Charges unavailable'}
export function followUpPendingKey(s:FollowUpScope){return ['irp-balance-follow-up-v1',s.actor,s.tenant,s.property,s.reservation].join('/')}
export function followUpSaveArgs(p:FollowUpPending){return {p_tenant:p.tenant_id,p_property:p.property_id,p_request:p.request_id,p_command:p.command}}
export function followUpRetireArgs(p:FollowUpPending){requireValue(p.retirement_reason!==null);return {...followUpSaveArgs(p),p_reason:p.retirement_reason}}
export {addDepositDays as followUpAddDays};

export function validateFollowUpContext(value:unknown,s:Pick<FollowUpScope,'tenant'|'property'|'reservation'>):asserts value is FollowUpContext{
 exact(value,['schema_version','tenant_id','property_id','reservation_id','currency','reservation','current_components','available','unavailable_reason','opening_mode','opening','totals','flags','folio_entry_count','source_fingerprints','context_fingerprint']);
 const v=value as FollowUpContext;
 requireValue(bytes(v)<=8192&&v.schema_version===1&&v.tenant_id===s.tenant&&v.property_id===s.property&&v.reservation_id===s.reservation&&[s.tenant,s.property,s.reservation].every(uuid)&&v.currency==='USD'&&bool(v.available)&&integer(v.folio_entry_count,0,10000)&&hex(v.context_fingerprint));
 exact(v.reservation,['source','source_version','status','cancellation_kind','arrival','departure']);
 const r=v.reservation;requireValue(source(r.source)&&integer(r.source_version,1)&&(r.arrival===null||depositDate(r.arrival))&&(r.departure===null||depositDate(r.departure)));lifecycle(r.status,r.cancellation_kind);
 if(r.arrival!==null&&r.departure!==null){const nights=(Date.parse(r.departure+'T00:00:00Z')-Date.parse(r.arrival+'T00:00:00Z'))/86400000;requireValue(integer(nights,1,30))}
 components(v.current_components);flags(v.flags);
 exact(v.source_fingerprints,['current_pricing','opening','entries']);const f=v.source_fingerprints;requireValue((f.current_pricing===null||hex(f.current_pricing))&&(f.opening===null||hex(f.opening))&&hex(f.entries));
 if(!v.available){requireValue(v.unavailable_reason==='reservation_charges_unavailable'&&v.opening_mode==='unavailable'&&v.opening===null&&v.totals===null&&v.folio_entry_count===0&&f.opening===null&&!v.flags.reservation_amounts_changed&&!v.flags.opening_pricing_reconciliation_required&&Object.values(v.current_components).some(n=>n===null));return}
 requireValue(v.unavailable_reason===null&&one(v.opening_mode,['frozen','reservation_preview']));exact(v.opening,['components','source','source_version','opened_at']);const o=v.opening!;components(o.components,true);requireValue(source(o.source)&&o.source===r.source&&integer(o.source_version,1,r.source_version));
 exact(v.totals,totalKeys);const t=v.totals!;requireValue(totalKeys.filter(k=>k!=='balance_minor').every(k=>integer(t[k as keyof FollowUpTotals],0,maxMoney))&&integer(t.balance_minor,-maxMoney,maxMoney));
 requireValue(t.charges_minor===o.components.total_minor!+t.additional_minor-t.reversed_minor&&t.recorded_paid_minor===t.external_payments_minor-t.external_refunds_minor-t.corrected_payments_minor&&t.balance_minor===t.charges_minor-t.recorded_paid_minor);
 if(v.opening_mode==='reservation_preview'){
  requireValue(o.opened_at===null&&o.source_version===r.source_version&&v.folio_entry_count===0&&f.opening===null&&sameFollowUpValue(o.components,v.current_components)&&!v.flags.reservation_amounts_changed&&v.flags.opening_pricing_reconciliation_required===v.flags.current_pricing_reconciliation_required);
 }else{requireValue(stamp(o.opened_at)&&hex(f.opening));if(!v.flags.reservation_amounts_changed)requireValue(sameFollowUpValue(o.components,v.current_components))}
 if(v.folio_entry_count===0)requireValue(t.additional_minor===0&&t.reversed_minor===0&&t.external_payments_minor===0&&t.external_refunds_minor===0&&t.corrected_payments_minor===0);
}

function command(value:unknown,reservation:string){
 exact(value,['reservation_id','action','expected_version','expected_context_fingerprint','expected_business_date','expected_time_zone','follow_up_on','reason','confirmed']);const v=value as FollowUpCommand;
 requireValue(bytes(v)<=4096&&v.reservation_id===reservation&&uuid(reservation)&&one(v.action,Object.keys(followUpActions))&&integer(v.expected_version,0,1000)&&hex(v.expected_context_fingerprint)&&depositDate(v.expected_business_date)&&zone(v.expected_time_zone)&&text(v.reason,4,500)&&v.confirmed===true);
 requireValue(['schedule','reschedule','reopen'].includes(v.action)?depositDate(v.follow_up_on):v.follow_up_on===null);
}
function event(value:unknown,s:Pick<FollowUpScope,'tenant'|'property'|'reservation'>){
 exact(value,['id','tenant_id','property_id','reservation_id','request_id','actor_id','recorded_at','recording_time_zone','recording_business_date','action','from_version','to_version','before','after','reason','context']);const v=value as FollowUpEvent;
 requireValue([v.id,v.request_id,v.actor_id].every(uuid)&&v.tenant_id===s.tenant&&v.property_id===s.property&&v.reservation_id===s.reservation&&stamp(v.recorded_at)&&zone(v.recording_time_zone)&&depositDate(v.recording_business_date)&&depositZoneDate(v.recorded_at,v.recording_time_zone)===v.recording_business_date&&integer(v.from_version,0,999)&&v.to_version===v.from_version+1&&one(v.action,Object.keys(followUpActions))&&text(v.reason,4,500));
 if(v.before!==null)task(v.before);task(v.after);validateFollowUpContext(v.context,s);
 requireValue(v.from_version===0?v.before===null&&v.action==='schedule':v.before!==null&&v.action!=='schedule');
 requireValue(followUpNextActions(v.before).includes(v.action));
 const expectedState=v.action==='complete'?'completed':v.action==='stop'?'stopped':'open';requireValue(v.after.state===expectedState);
 if(expectedState==='open')requireValue(followUpDateAllowed(v.after.follow_up_on,v.recording_business_date));else requireValue(v.after.follow_up_on===v.before?.follow_up_on);
}
function authority(v:FollowUpQueue|FollowUpDetail,s:FollowUpQueueScope){
 requireValue(v.schema_version===1&&[s.actor,s.tenant,s.property].every(uuid)&&v.actor_id===s.actor&&v.tenant_id===s.tenant&&v.property_id===s.property&&one(v.role,['owner','manager','staff'])&&v.can_manage===(v.role==='owner'||v.role==='manager')&&stamp(v.generated_at)&&depositDate(v.property_business_date));
 exact(v.property,['id','name','text_normalized','currency','time_zone','operating_model']);const p=v.property;
 requireValue(p.id===s.property&&text(p.name,1,200)&&bool(p.text_normalized)&&p.currency==='USD'&&zone(p.time_zone)&&one(p.operating_model,['hotel','whole_home'])&&depositZoneDate(v.generated_at,p.time_zone)===v.property_business_date);fixed(v.financial_effects,followUpNoEffects);fixed(v.semantics,followUpSemantics);
}
export function validateFollowUpDetail(value:unknown,s:FollowUpScope):asserts value is FollowUpDetail{
 exact(value,['schema_version','tenant_id','property_id','reservation_id','actor_id','role','can_manage','generated_at','property_business_date','property','reservation','recorded','version','head','current_event','events','current_context','context_changed_since_recording','schedule_zone_changed','events_truncated','financial_effects','semantics']);const v=value as FollowUpDetail;
 authority(v,s);requireValue(bytes(v)<=4*1024*1024&&v.reservation_id===s.reservation&&v.events_truncated===false&&bool(v.recorded)&&integer(v.version,0,1000)&&Array.isArray(v.events)&&v.events.length===v.version&&bytes(v.events)<=3*1024*1024&&bool(v.context_changed_since_recording)&&bool(v.schedule_zone_changed));
 booking(v.reservation,s.reservation);validateFollowUpContext(v.current_context,s);requireValue(v.reservation.source===v.current_context.reservation.source&&v.reservation.status===v.current_context.reservation.status&&v.reservation.cancellation_kind===v.current_context.reservation.cancellation_kind);
 if(!v.recorded){requireValue(v.version===0&&v.head===null&&v.current_event===null&&!v.context_changed_since_recording&&!v.schedule_zone_changed);return}
 head(v.head);const h=v.head!;requireValue(v.version>=1&&h.version===v.version);const ids=new Set<string>(),requests=new Set<string>();let before:FollowUpTask|null=null;
 const contexts=new Map<string,FollowUpContext>([[v.current_context.context_fingerprint,v.current_context]]);
 v.events.forEach((e,index)=>{event(e,s);requireValue(e.from_version===index&&sameFollowUpValue(e.before,before)&&!ids.has(e.id)&&!requests.has(e.request_id));const priorContext=contexts.get(e.context.context_fingerprint);requireValue(!priorContext||sameFollowUpValue(priorContext,e.context));contexts.set(e.context.context_fingerprint,e.context);ids.add(e.id);requests.add(e.request_id);before=e.after});
 const first=v.events[0],last=v.events[v.events.length-1];requireValue(sameFollowUpValue(v.current_event,last)&&h.current_event_id===last.id&&sameFollowUpValue({state:h.state,follow_up_on:h.follow_up_on},last.after)&&h.created_at===first.recorded_at&&h.created_by===first.actor_id&&h.updated_at===last.recorded_at);
 requireValue(v.context_changed_since_recording===(v.current_context.context_fingerprint!==last.context.context_fingerprint)&&v.schedule_zone_changed===(v.property.time_zone!==last.recording_time_zone));
}
export function validateFollowUpPending(value:unknown,s:FollowUpScope):asserts value is FollowUpPending{
 exact(value,['schema_version','actor_id','tenant_id','property_id','reservation_id','request_id','command','reviewed_task','reviewed_context','retirement_reason']);const v=value as FollowUpPending;
 requireValue(bytes(v)<=16384&&v.schema_version===1&&v.actor_id===s.actor&&v.tenant_id===s.tenant&&v.property_id===s.property&&v.reservation_id===s.reservation&&[s.actor,s.tenant,s.property,s.reservation,v.request_id].every(uuid)&&(v.retirement_reason===null||text(v.retirement_reason,4,500)));command(v.command,s.reservation);validateFollowUpContext(v.reviewed_context,s);
 requireValue(v.command.expected_context_fingerprint===v.reviewed_context.context_fingerprint);if(v.reviewed_task!==null)task(v.reviewed_task);requireValue((v.reviewed_task===null)===(v.command.expected_version===0)&&followUpNextActions(v.reviewed_task).includes(v.command.action));
 if(v.command.follow_up_on!==null)requireValue(followUpDateAllowed(v.command.follow_up_on,v.command.expected_business_date));
}
export function validateFollowUpResult(value:unknown,p:FollowUpPending):asserts value is FollowUpResult{
 const scope={actor:p.actor_id,tenant:p.tenant_id,property:p.property_id,reservation:p.reservation_id};validateFollowUpPending(p,scope);requireValue(object(value));
 const common=['schema_version','outcome','action','tenant_id','property_id','reservation_id','request_id','command','financial_effects','semantics','replayed'];
 exact(value,value.outcome==='recorded'?[...common,'event','expected_version','version']:[...common,'retirement_reason','retired_by','retired_at','follow_up_version_changed']);const v=value as FollowUpResult;
 requireValue(bytes(v)<=32768&&v.schema_version===1&&v.tenant_id===p.tenant_id&&v.property_id===p.property_id&&v.reservation_id===p.reservation_id&&v.request_id===p.request_id&&sameFollowUpValue(v.command,p.command)&&bool(v.replayed));fixed(v.financial_effects,followUpNoEffects);fixed(v.semantics,followUpSemantics);
 if(v.outcome==='retired'){requireValue(v.action==='retire_balance_follow_up_request'&&v.retired_by===p.actor_id&&stamp(v.retired_at)&&v.follow_up_version_changed===false&&text(v.retirement_reason,4,500)&&(p.retirement_reason===null||p.retirement_reason===v.retirement_reason));return}
 requireValue(v.outcome==='recorded'&&v.action==='save_balance_follow_up');event(v.event,scope);const e=v.event,c=p.command;
 requireValue(v.expected_version===c.expected_version&&v.version===c.expected_version+1&&e.from_version===c.expected_version&&e.to_version===v.version&&e.request_id===p.request_id&&e.actor_id===p.actor_id&&e.action===c.action&&e.reason===c.reason&&e.recording_business_date===c.expected_business_date&&e.recording_time_zone===c.expected_time_zone&&sameFollowUpValue(e.context,p.reviewed_context)&&sameFollowUpValue(e.before,p.reviewed_task));
 if(c.follow_up_on!==null)requireValue(e.after.follow_up_on===c.follow_up_on);
}
export function validateFollowUpStatus(value:unknown,p:FollowUpPending):asserts value is FollowUpStatus{
 exact(value,['schema_version','tenant_id','property_id','request_id','actor_id','found','action','result']);const v=value as FollowUpStatus;requireValue(v.schema_version===1&&v.tenant_id===p.tenant_id&&v.property_id===p.property_id&&v.request_id===p.request_id&&v.actor_id===p.actor_id&&bool(v.found));
 if(!v.found){requireValue(v.action===null&&v.result===null);return}validateFollowUpResult(v.result,p);requireValue(v.result.replayed===false&&v.action===v.result.action);
}

export function followUpBalance(context:FollowUpContext):FollowUpBalance{return {context_fingerprint:context.context_fingerprint,available:context.available,unavailable_reason:context.unavailable_reason,opening_mode:context.opening_mode,current_reservation_total_minor:context.current_components.total_minor,opening_total_minor:context.opening?.components.total_minor??null,charges_minor:context.totals?.charges_minor??null,recorded_paid_minor:context.totals?.recorded_paid_minor??null,balance_minor:context.totals?.balance_minor??null,folio_entry_count:context.folio_entry_count,flags:context.flags}}
function balance(value:unknown){
 exact(value,['context_fingerprint','available','unavailable_reason','opening_mode','current_reservation_total_minor','opening_total_minor','charges_minor','recorded_paid_minor','balance_minor','folio_entry_count','flags']);const v=value as FollowUpBalance;
 requireValue(hex(v.context_fingerprint)&&bool(v.available)&&integer(v.folio_entry_count,0,10000)&&(v.current_reservation_total_minor===null||integer(v.current_reservation_total_minor,0,maxMoney)));flags(v.flags);
 if(!v.available){requireValue(v.unavailable_reason==='reservation_charges_unavailable'&&v.opening_mode==='unavailable'&&v.opening_total_minor===null&&v.charges_minor===null&&v.recorded_paid_minor===null&&v.balance_minor===null&&v.folio_entry_count===0&&!v.flags.reservation_amounts_changed&&!v.flags.opening_pricing_reconciliation_required);return}
 requireValue(v.unavailable_reason===null&&one(v.opening_mode,['frozen','reservation_preview'])&&integer(v.opening_total_minor,0,maxMoney)&&integer(v.charges_minor,0,maxMoney)&&integer(v.recorded_paid_minor,0,maxMoney)&&integer(v.balance_minor,-maxMoney,maxMoney)&&v.balance_minor===v.charges_minor-v.recorded_paid_minor);
 if(v.folio_entry_count===0)requireValue(v.charges_minor===v.opening_total_minor&&v.recorded_paid_minor===0);
 if(v.opening_mode==='reservation_preview')requireValue(v.folio_entry_count===0&&v.current_reservation_total_minor===v.opening_total_minor&&!v.flags.reservation_amounts_changed&&v.flags.opening_pricing_reconciliation_required===v.flags.current_pricing_reconciliation_required);
 if(v.current_reservation_total_minor!==null&&v.current_reservation_total_minor!==v.opening_total_minor)requireValue(v.flags.reservation_amounts_changed);
}
export function validateFollowUpFilters(value:unknown):asserts value is FollowUpFilters{exact(value,['state','schedule']);const v=value as FollowUpFilters;requireValue(one(v.state,['open','completed','stopped','all'])&&one(v.schedule,['all','past','today','future'])&&(v.schedule==='all'||v.state==='open'))}
function sum(a:number,b:number){const result=a+b;requireValue(Number.isSafeInteger(result));return result}
function emptySummary():FollowUpSummary{return {row_count:0,open_count:0,completed_count:0,stopped_count:0,past_count:0,today_count:0,future_count:0,available_count:0,unavailable_count:0,positive_balance_count:0,zero_balance_count:0,credit_balance_count:0,context_changed_count:0,schedule_zone_changed_count:0,pricing_review_count:0,known_charges_minor:0,known_recorded_paid_minor:0,known_balance_minor:0,known_positive_balances_minor:0,known_credit_balances_minor:0,amounts_complete:true}}
export function followUpSummary(rows:FollowUpRow[]):FollowUpSummary{
 const v=emptySummary();for(const r of rows){v.row_count++;v[r.head.state==='open'?'open_count':r.head.state==='completed'?'completed_count':'stopped_count']++;if(r.follow_up_bucket!=='inactive')v[r.follow_up_bucket==='past'?'past_count':r.follow_up_bucket==='today'?'today_count':'future_count']++;
  if(r.context_changed_since_recording)v.context_changed_count++;if(r.schedule_zone_changed)v.schedule_zone_changed_count++;if(r.current_balance.flags.pricing_reconciliation_required)v.pricing_review_count++;
  const b=r.current_balance;if(!b.available){v.unavailable_count++;continue}v.available_count++;const n=b.balance_minor!;v[n>0?'positive_balance_count':n<0?'credit_balance_count':'zero_balance_count']++;
  v.known_charges_minor=sum(v.known_charges_minor,b.charges_minor!);v.known_recorded_paid_minor=sum(v.known_recorded_paid_minor,b.recorded_paid_minor!);v.known_balance_minor=sum(v.known_balance_minor,n);
  if(n>0)v.known_positive_balances_minor=sum(v.known_positive_balances_minor,n);if(n<0)v.known_credit_balances_minor=sum(v.known_credit_balances_minor,n);
 }v.amounts_complete=v.unavailable_count===0;return v;
}
export function validateFollowUpQueue(value:unknown,s:FollowUpQueueScope,filters:FollowUpFilters):asserts value is FollowUpQueue{
 exact(value,['schema_version','tenant_id','property_id','actor_id','role','can_manage','property','generated_at','property_business_date','filters','population','rows','summary','complete','rows_truncated','financial_effects','semantics']);const v=value as FollowUpQueue;
 authority(v,s);validateFollowUpFilters(filters);validateFollowUpFilters(v.filters);requireValue(sameFollowUpValue(v.filters,filters)&&bytes(v)<=32*1024*1024&&v.population==='recorded_follow_ups'&&v.complete===true&&v.rows_truncated===false&&Array.isArray(v.rows)&&v.rows.length<=10000);
 const ids=new Set<string>(),events=new Set<string>();let previous='',entries=0;
 for(const row of v.rows){
  exact(row,['reservation','head','last_action','current_balance','context_changed_since_recording','schedule_zone_changed','follow_up_bucket','days_past_follow_up']);booking(row.reservation);head(row.head);balance(row.current_balance);
  const h=row.head,l=row.last_action;exact(l,['event_id','action','actor_id','recorded_at','recording_time_zone','recording_business_date','reviewed_balance']);balance(l.reviewed_balance);
  requireValue(!ids.has(row.reservation.id)&&!events.has(l.event_id)&&uuid(l.event_id)&&l.event_id===h.current_event_id&&uuid(l.actor_id)&&stamp(l.recorded_at)&&h.updated_at===l.recorded_at&&zone(l.recording_time_zone)&&depositDate(l.recording_business_date)&&depositZoneDate(l.recorded_at,l.recording_time_zone)===l.recording_business_date&&one(l.action,Object.keys(followUpActions)));
  ids.add(row.reservation.id);events.add(l.event_id);requireValue(h.state===(l.action==='complete'?'completed':l.action==='stop'?'stopped':'open')&&((l.action==='schedule')===(h.version===1)));
  if(h.version===1)requireValue(h.created_by===l.actor_id&&h.created_at===l.recorded_at);if(h.state==='open')requireValue(followUpDateAllowed(h.follow_up_on,l.recording_business_date));
  const bucket=h.state!=='open'?'inactive':h.follow_up_on<v.property_business_date?'past':h.follow_up_on===v.property_business_date?'today':'future';const days=h.state==='open'?Math.max(0,(Date.parse(v.property_business_date+'T00:00:00Z')-Date.parse(h.follow_up_on+'T00:00:00Z'))/86400000):null;
  requireValue(row.follow_up_bucket===bucket&&row.days_past_follow_up===days&&bool(row.context_changed_since_recording)&&row.context_changed_since_recording===(row.current_balance.context_fingerprint!==l.reviewed_balance.context_fingerprint)&&bool(row.schedule_zone_changed)&&row.schedule_zone_changed===(v.property.time_zone!==l.recording_time_zone));
  if(!row.context_changed_since_recording)requireValue(sameFollowUpValue(row.current_balance,l.reviewed_balance));
  requireValue((filters.state==='all'||h.state===filters.state)&&(filters.schedule==='all'||bucket===filters.schedule));
  const order=(h.state==='open'?'0':h.state==='completed'?'1':'2')+'/'+h.follow_up_on+'/'+row.reservation.id;requireValue(order>previous);previous=order;entries+=row.current_balance.folio_entry_count;requireValue(entries<=10000);
 }
 exact(v.summary,Object.keys(emptySummary()));requireValue(sameFollowUpValue(v.summary,followUpSummary(v.rows)));
}
export function followUpQueueCsv(v:FollowUpQueue):ReportCell[][]{
 validateFollowUpQueue(v,{actor:v.actor_id,tenant:v.tenant_id,property:v.property_id},v.filters);const s=v.summary;
 return [['Balance follow-up'],['Population','Recorded follow-ups only'],['Prepared at',v.generated_at],['Property',v.property.name],['Property ID',v.property_id],['Time zone',v.property.time_zone],['Property business date',v.property_business_date],['State filter',v.filters.state],['Staff schedule filter',v.filters.schedule],['Complete returned rows',s.row_count],['Amounts complete',s.amounts_complete],['Unavailable current balances',s.unavailable_count],['Known charges USD',reportMoney(s.known_charges_minor)],['Known recorded paid USD',reportMoney(s.known_recorded_paid_minor)],['Known current balance USD',reportMoney(s.known_balance_minor)],['Known positive balances USD',reportMoney(s.known_positive_balances_minor)],['Known credit balances USD',reportMoney(s.known_credit_balances_minor)],['Meaning','Internal staff follow-up dates are not debt due dates or receivables age. Security funds excluded. Completing a review does not mark a stay paid.'],[],
 ['Reservation ID','Booking source','Booking reference','Current booking status','Follow-up state','Staff follow-up date / last scheduled follow-up','Work schedule bucket','Days past staff follow-up','Current balance USD','Current charge basis','Current opening USD','Current charges USD','Current recorded paid USD','Current reservation total USD','Last reviewed balance USD','Last reviewed charge basis','Last reviewed opening USD','Last reviewed charges USD','Last reviewed recorded paid USD','Current amount available','Last reviewed amount available','Balance or booking context changed','Schedule zone changed','Current pricing review required','Last action','Recorded at','Recording time zone','Recording business date','Recorded by','Task version','Current event ID','Current context fingerprint','Reviewed context fingerprint'],
 ...v.rows.map(r=>[r.reservation.id,r.reservation.source,r.reservation.source_booking_id,followUpStatusLabel(r.reservation),followUpStates[r.head.state],r.head.follow_up_on,r.follow_up_bucket,r.days_past_follow_up,reportMoney(r.current_balance.balance_minor),followUpBasis(r.current_balance),reportMoney(r.current_balance.opening_total_minor),reportMoney(r.current_balance.charges_minor),reportMoney(r.current_balance.recorded_paid_minor),reportMoney(r.current_balance.current_reservation_total_minor),reportMoney(r.last_action.reviewed_balance.balance_minor),followUpBasis(r.last_action.reviewed_balance),reportMoney(r.last_action.reviewed_balance.opening_total_minor),reportMoney(r.last_action.reviewed_balance.charges_minor),reportMoney(r.last_action.reviewed_balance.recorded_paid_minor),r.current_balance.available,r.last_action.reviewed_balance.available,r.context_changed_since_recording,r.schedule_zone_changed,r.current_balance.flags.pricing_reconciliation_required,followUpActions[r.last_action.action],r.last_action.recorded_at,r.last_action.recording_time_zone,r.last_action.recording_business_date,r.last_action.actor_id,r.head.version,r.head.current_event_id,r.current_balance.context_fingerprint,r.last_action.reviewed_balance.context_fingerprint])];
}
