import {guestBillingBalance,type GuestBalanceScope} from './guest-billing-balance';
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function readBillingCheckoutReview(value:unknown,scope:GuestBalanceScope){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Checkout review unavailable.');
 const v=value as Record<string,unknown>;
 if(v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.reservation_id!==scope.reservation||v.money_moved!==false||v.stay_changed!==false)throw Error('Checkout review does not match this stay.');
 if(!date(v.business_date)||!['Confirmed','In house','Checked out','Cancelled','No show'].includes(String(v.status))||(v.arrival!==null&&!date(v.arrival))||(v.departure!==null&&!date(v.departure))||(v.room_id!==null&&(typeof v.room_id!=='string'||!v.room_id)))throw Error('Checkout stay details are invalid.');
 const eligible=v.status==='In house'&&typeof v.arrival==='string'&&v.business_date>=v.arrival;
 if(v.eligible!==eligible)throw Error('Checkout eligibility does not reconcile.');
 const balance=guestBillingBalance(v.snapshot,scope);
 const disposition=!balance.available?'unavailable':BigInt(balance.guestMinor)>0n?'outstanding':BigInt(balance.guestMinor)<0n?'credit':'zero';
 if(v.balance_disposition!==disposition||v.financial_review_required!==(disposition!=='zero'))throw Error('Checkout balance review does not reconcile.');
 return {eligible,balance,disposition,businessDate:v.business_date,status:String(v.status),financialReviewRequired:disposition!=='zero'};
}
