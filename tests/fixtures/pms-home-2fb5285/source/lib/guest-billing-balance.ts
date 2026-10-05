export type GuestBalanceScope={tenant:string;property:string;reservation:string};
export type GuestBillingBalance={available:false}|{available:true;originalMinor:string;transferredMinor:string;guestMinor:string;paymentSuggestion:string|null};
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Guest balance unavailable.');return value as Record<string,unknown>}
function minor(value:unknown,signed=false):bigint{if(typeof value!=='string'||!(signed?/^(0|-?[1-9]\d{0,14})$/:/^(0|[1-9]\d{0,14})$/).test(value))throw Error('Invalid guest balance amount.');return BigInt(value)}
// Validates the balance projection only, not the complete folio entry history.
export function guestBillingBalance(value:unknown,scope:GuestBalanceScope):GuestBillingBalance{
 const v=object(value),f=object(v.folio);
 if(v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.reservation_id!==scope.reservation||v.currency!=='USD'||v.money_moved!==false||f.reservation_id!==scope.reservation||f.currency!=='USD')throw Error('Guest balance scope does not match.');
 if(f.available===false){if(v.obligations!==null)throw Error('Unavailable charges cannot have a known balance.');return {available:false}}
 if(f.available!==true)throw Error('Guest balance availability is missing.');
 const o=object(v.obligations),t=object(f.totals);
 if(o.tenant_id!==scope.tenant||o.property_id!==scope.property||o.reservation_id!==scope.reservation||o.currency!=='USD'||o.account_payments_included!==false)throw Error('Guest obligation scope does not match.');
 const original=minor(o.original_balance_minor,true),transferred=minor(o.routed_obligation_minor),guest=minor(o.guest_obligation_minor,true);
 if(!Number.isSafeInteger(t.balance_minor)||BigInt(t.balance_minor as number)!==original||original-transferred!==guest)throw Error('Guest balance does not reconcile.');
 if(!Array.isArray(o.accounts))throw Error('Transferred accounts unavailable.');
 let sum=0n;const seen=new Set<string>();
 for(const value of o.accounts){const a=object(value);if(typeof a.account_id!=='string'||!a.account_id||seen.has(a.account_id))throw Error('Invalid transferred account.');seen.add(a.account_id);const amount=minor(a.routed_charge_minor);if(amount<=0n)throw Error('Invalid transferred amount.');sum+=amount}
 if(sum!==transferred)throw Error('Transferred amounts do not reconcile.');
 return {available:true,originalMinor:String(original),transferredMinor:String(transferred),guestMinor:String(guest),paymentSuggestion:guest>0n?String(guest/100n)+'.'+String(guest%100n).padStart(2,'0'):null};
}
