export type PeriodCloseRequest={version:1;actor:string;tenant:string;property:string;request:string;period:string;reviewToken:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function validatePeriodClose(value:unknown):PeriodCloseRequest{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Saved period close cannot be read.');const v=value as PeriodCloseRequest;
 if(Object.keys(v).sort().join(',')!=='actor,period,property,request,reviewToken,tenant,version'||v.version!==1||![v.actor,v.tenant,v.property,v.request,v.period].every(uuid)||typeof v.reviewToken!=='string'||!/^[0-9a-f]{64}$/.test(v.reviewToken))throw Error('Saved period close is invalid. Reconcile it before continuing.');return v;
}
export function periodCloseKey(actor:string,tenant:string,property:string){if(![actor,tenant,property].every(uuid))throw Error('Verified accounting scope required.');return 'iratepilot-pms-period-close:'+actor+':'+tenant+':'+property;}
export function readPeriodClose(storage:Pick<Storage,'getItem'>,actor:string,tenant:string,property:string){const raw=storage.getItem(periodCloseKey(actor,tenant,property));if(raw===null)return null;const v=validatePeriodClose(JSON.parse(raw));if(v.actor!==actor||v.tenant!==tenant||v.property!==property)throw Error('Saved close belongs to another scope.');return v;}
export function retainPeriodClose(storage:Pick<Storage,'getItem'|'setItem'>,value:PeriodCloseRequest){const v=validatePeriodClose(value),key=periodCloseKey(v.actor,v.tenant,v.property),text=JSON.stringify(v),prior=storage.getItem(key);if(prior!==null&&prior!==text)throw Error('A period close is already pending. Check its result first.');storage.setItem(key,text);if(storage.getItem(key)!==text)throw Error('Period close could not be retained.');}
export function periodCloseParams(v:PeriodCloseRequest){validatePeriodClose(v);return {p_tenant:v.tenant,p_property:v.property,p_request:v.request,p_period:v.period,p_review_token:v.reviewToken,p_confirmed:true};}
export function periodCloseReceipt(value:unknown,r:PeriodCloseRequest):boolean{
 validatePeriodClose(r);if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>;
 return v.schema_version===1&&v.tenant_id===r.tenant&&v.property_id===r.property&&v.actor_id===r.actor&&v.request_id===r.request&&v.period_id===r.period&&v.review_token===r.reviewToken&&v.closed===true&&typeof v.replayed==='boolean'&&typeof v.closed_at==='string'&&Number.isFinite(Date.parse(v.closed_at));
}
export function clearPeriodClose(storage:Pick<Storage,'getItem'|'removeItem'>,r:PeriodCloseRequest,value:unknown){if(!periodCloseReceipt(value,r))throw Error('Period close receipt does not match the saved request.');const key=periodCloseKey(r.actor,r.tenant,r.property);if(storage.getItem(key)!==JSON.stringify(r))throw Error('Saved period close changed. Reopen recovery.');storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('Saved period close could not be cleared.');}
export function readPeriodCloseStatus(value:unknown,r:PeriodCloseRequest):{found:false;retired?:false}|{found:false;retired:true;receipt:unknown}|{found:true;receipt:unknown}{
 validatePeriodClose(r);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Period close status unavailable.');const v=value as Record<string,unknown>;
 if(v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.actor_id!==r.actor||v.request_id!==r.request||typeof v.found!=='boolean')throw Error('Period close status belongs to another request.');
 if(v.retired===true){
  if(v.found!==false||v.closed_at!==null)throw Error('Conflicting period close status.');
  const receipt={...v,replayed:true};
  if(v.period_id!==r.period||v.review_token!==r.reviewToken||typeof v.retired_at!=='string'||!Number.isFinite(Date.parse(v.retired_at)))throw Error('Retirement status does not match the retained review.');
  return {found:false,retired:true,receipt};
 }
 if(v.retired!==undefined&&v.retired!==false)throw Error('Invalid retirement status.');
 if(!v.found){if(v.period_id!==null||v.review_token!==null||v.closed_at!==null)throw Error('Invalid missing close response.');return {found:false};}
 const receipt={...v,closed:true,replayed:true};if(!periodCloseReceipt(receipt,r))throw Error('Period close result does not match the retained review.');return {found:true,receipt};
}
export function clearRetiredPeriodClose(storage:Pick<Storage,'getItem'|'removeItem'>,r:PeriodCloseRequest,value:unknown){
 validatePeriodClose(r);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Retirement receipt unavailable.');const v=value as Record<string,unknown>;
 if(v.schema_version!==1||v.tenant_id!==r.tenant||v.property_id!==r.property||v.actor_id!==r.actor||v.request_id!==r.request||v.period_id!==r.period||v.review_token!==r.reviewToken||v.retired!==true||typeof v.replayed!=='boolean'||typeof v.retired_at!=='string'||!Number.isFinite(Date.parse(v.retired_at)))throw Error('Retirement receipt does not match the saved close.');
 const key=periodCloseKey(r.actor,r.tenant,r.property);if(storage.getItem(key)!==JSON.stringify(r))throw Error('Saved period close changed. Reopen recovery.');storage.removeItem(key);if(storage.getItem(key)!==null)throw Error('Retired request could not be cleared.');
}
