export type TransferScope={tenant:string;property:string;account:string;reservation:string};
export type TransferReview={tenant_id:string;property_id:string;account_id:string;account_name:string;account_kind:'company'|'group';reservation_id:string;currency:'USD';money_moved:false;sources:{tenant_id:string;property_id:string;reservation_id:string;source_hash:string;routing_hash:string;lines:{source_key:string;description:string;category:string;amount_minor:string;invoiced_minor:string;available_minor:string;routed_minor:string;routing_available_minor:string}[]}};
const money=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9]\d{0,11})$/.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validateTransferReview(value:unknown,scope:TransferScope):asserts value is TransferReview{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Transfer review unavailable.');
 const v=value as TransferReview,s=v.sources;
 if(v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.account_id!==scope.account||v.reservation_id!==scope.reservation||v.currency!=='USD'||v.money_moved!==false||!['company','group'].includes(v.account_kind)||typeof v.account_name!=='string'||!v.account_name.trim()||v.account_name.length>200)throw Error('Transfer account does not match.');
 if(!s||s.tenant_id!==scope.tenant||s.property_id!==scope.property||s.reservation_id!==scope.reservation||!hash(s.source_hash)||!hash(s.routing_hash)||!Array.isArray(s.lines)||s.lines.length>10000)throw Error('Transfer sources could not be verified.');
 const seen=new Set<string>();
 for(const line of s.lines){
  if(!line||typeof line.source_key!=='string'||!line.source_key||line.source_key.length>300||seen.has(line.source_key)||!money(line.available_minor)||!money(line.routed_minor)||!money(line.routing_available_minor)||BigInt(line.available_minor)-BigInt(line.routed_minor)!==BigInt(line.routing_available_minor))throw Error('Transfer charge does not reconcile.');
  if(typeof line.description!=='string'||!line.description.trim()||line.description.length>500||typeof line.category!=='string'||!line.category||line.category.length>100||!money(line.amount_minor)||!money(line.invoiced_minor)||BigInt(line.amount_minor)-BigInt(line.invoiced_minor)!==BigInt(line.available_minor))throw Error('Transfer charge description or original amount is invalid.');
  seen.add(line.source_key);
 }
}
export function transferAmountMinor(dollars:string,available:string):string{
 if(!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(dollars)||!money(available))throw Error('Enter a valid transfer amount.');
 const [whole,fraction='']=dollars.split('.');const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(amount<=0n||amount>999999999999n||amount>BigInt(available))throw Error('Transfer exceeds the available charge.');
 return amount.toString();
}
export type PendingTransfer={version:1;actor:string;request:string;review:TransferReview;source:string;amount:string;reason:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function validatePendingTransfer(value:unknown,scope:TransferScope&{actor:string}):asserts value is PendingTransfer{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Saved transfer unavailable.');
 const v=value as PendingTransfer;
 if(Object.keys(v).sort().join(',')!=='actor,amount,reason,request,review,source,version'||v.version!==1||v.actor!==scope.actor||!uuid(v.request)||typeof v.reason!=='string'||v.reason!==v.reason.trim()||v.reason.length<4||v.reason.length>500||!money(v.amount)||BigInt(v.amount)<=0n)throw Error('Saved transfer is invalid.');
 validateTransferReview(v.review,scope);
 const line=v.review.sources.lines.find(line=>line.source_key===v.source);
 if(!line||BigInt(v.amount)>BigInt(line.routing_available_minor))throw Error('Saved transfer exceeds reviewed charge.');
}
export function transferSaveArgs(p:PendingTransfer){
 const r=p.review;
 validatePendingTransfer(p,{actor:p.actor,tenant:r.tenant_id,property:r.property_id,account:r.account_id,reservation:r.reservation_id});
 return {p_tenant:r.tenant_id,p_property:r.property_id,p_request:p.request,p_account:r.account_id,p_reservation:r.reservation_id,p_source:p.source,p_amount:p.amount,p_review_hash:r.sources.routing_hash,p_reason:p.reason,p_confirmed:true};
}
export function validateTransferResult(value:unknown,p:PendingTransfer):asserts value is {id:string;account_id:string;reservation_id:string;amount_minor:string;reversed:boolean}{
 transferSaveArgs(p);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Transfer result unavailable.');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='account_id,amount_minor,id,reservation_id,reversed'||!uuid(v.id)||v.account_id!==p.review.account_id||v.reservation_id!==p.review.reservation_id||v.amount_minor!==p.amount||typeof v.reversed!=='boolean')throw Error('Transfer result does not match the saved request.');
}
export function readTransferStatus(value:unknown,p:PendingTransfer){
 transferSaveArgs(p);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Transfer status unavailable.');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='found,property_id,reason,request_id,result,review_hash,source,tenant_id'||v.tenant_id!==p.review.tenant_id||v.property_id!==p.review.property_id||v.request_id!==p.request||typeof v.found!=='boolean')throw Error('Transfer status scope changed.');
 if(!v.found){if(v.source!==null||v.review_hash!==null||v.reason!==null||v.result!==null)throw Error('Conflicting transfer status.');return null;}
 if(v.source!==p.source||v.review_hash!==p.review.sources.routing_hash||v.reason!==p.reason)throw Error('Saved transfer details changed.');
 validateTransferResult(v.result,p);return v.result;
}
export function transferRetirementArgs(p:PendingTransfer,reason:string){
 transferSaveArgs(p);
 if(typeof reason!=='string'||reason!==reason.trim()||reason.length<4||reason.length>500)throw Error('Enter a cancellation reason of 4 to 500 characters.');
 return {p_tenant:p.review.tenant_id,p_property:p.review.property_id,p_request:p.request,p_reason:reason,p_confirmed:true};
}
export function validateTransferRetirement(value:unknown,p:PendingTransfer,reason:string){
 transferRetirementArgs(p,reason);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Cancellation result unavailable.');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='actor_id,money_moved,property_id,reason,request_id,retired,tenant_id'||v.tenant_id!==p.review.tenant_id||v.property_id!==p.review.property_id||v.request_id!==p.request||v.actor_id!==p.actor||v.reason!==reason||v.retired!==true||v.money_moved!==false)throw Error('Cancellation result does not match the saved request.');
}
