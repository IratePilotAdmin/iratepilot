import {createHmac} from 'node:crypto';
import {isNativeAriBatch,type NativeAriBatch} from './native-ari-shadow-receiver';

// Offline preparation only: no endpoint, HTTP call, outbox acknowledgement or
// inventory mutation. The caller must configure an authorized test sender.
export function prepareNativeAriShadowRequest(batch:unknown,secret:string,now=Date.now()){
 if(!isNativeAriBatch(batch)||batch.connectionId.length>80)throw Error('invalid_ari_contract');
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||Buffer.byteLength(secret)>512)throw Error('invalid_signing_configuration');
 if(!Number.isSafeInteger(now)||now<0)throw Error('invalid_signing_time');
 const body=JSON.stringify(batch);
 if(Buffer.byteLength(body)>262144)throw Error('payload_too_large');
 const timestamp=String(Math.floor(now/1000));
 const signature=createHmac('sha256',secret).update(`${timestamp}.${batch.connectionId}.`).update(body).digest('hex');
 return {method:'POST' as const,headers:{'content-type':'application/json','x-irp-connection':batch.connectionId,'x-irp-timestamp':timestamp,'x-irp-signature':signature},body,redirect:'error' as const,credentials:'omit' as const};
}

const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const nullableInteger=(v:unknown)=>v===null||typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function readNativeAriShadowReceipt(value:unknown,batch:NativeAriBatch){
 if(!isNativeAriBatch(batch)||!exact(value,['outcome','persisted','certified','observations','eventId','sourceVersion','mode']))throw Error('invalid_shadow_receipt');
 const r=value as Record<string,unknown>;
 if(r.outcome!=='validated'||r.persisted!==false||r.certified!==false||r.mode!=='validate_only'||r.eventId!==batch.eventId||r.sourceVersion!==batch.sourceVersion||!Array.isArray(r.observations)||r.observations.length!==batch.updates.length)throw Error('invalid_shadow_receipt');
 const updates=new Map(batch.updates.map(u=>[[u.date,u.roomTypeId,u.ratePlanId].join('|'),u]));
 let matched=0,mismatched=0,missing=0,unknown=0;
 for(const row of r.observations){
  if(!exact(row,['date','roomTypeId','ratePlanId','currency','inventoryPresent','rateMinorObserved','availableObserved','taxMinorObserved','mandatoryFeeMinorObserved','targetMatches']))throw Error('invalid_shadow_receipt');
  const key=[row.date,row.roomTypeId,row.ratePlanId].join('|'),u=updates.get(key);
  if(!u||row.currency!=='USD'||typeof row.inventoryPresent!=='boolean'||![row.rateMinorObserved,row.availableObserved,row.taxMinorObserved,row.mandatoryFeeMinorObserved].every(nullableInteger))throw Error('invalid_shadow_receipt');
  updates.delete(key);
  const fields=[row.rateMinorObserved,row.availableObserved,row.taxMinorObserved,row.mandatoryFeeMinorObserved];
  if(!row.inventoryPresent){if(fields.some(v=>v!==null)||row.targetMatches!==false)throw Error('invalid_shadow_receipt');missing++;continue;}
  const rate=row.rateMinorObserved,availability=row.availableObserved;
  const expected=rate!==null&&rate!==u.rateMinor||availability!==null&&availability!==u.available?false:rate===null||availability===null?null:true;
  if(row.targetMatches!==expected)throw Error('invalid_shadow_receipt');
  if(expected===true)matched++;else if(expected===false)mismatched++;else unknown++;
 }
 return {outcome:'validated' as const,persisted:false as const,certified:false as const,writebackEnabled:false as const,matched,mismatched,missing,unknown};
}
