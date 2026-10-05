import {readPaymentSources,type PaymentSources} from './payment-accounting';
import {balanceDecimal} from './guest-balance-register';
export function paymentActivityTotals(sources:PaymentSources){
 readPaymentSources(sources,{actor:sources.actor_id,tenant:sources.tenant_id,property:sources.property_id},sources.start_date,sources.end_date_exclusive);
 let payments=BigInt(0),refunds=BigInt(0),corrections=BigInt(0),posted=0;
 for(const row of sources.rows){const amount=BigInt(row.amount_minor);if(row.kind==='external_payment')payments+=amount;else if(row.kind==='external_refund')refunds+=amount;else corrections+=amount;if(row.journal_id)posted++;}
 return {payments:payments.toString(),refunds:refunds.toString(),corrections:corrections.toString(),net:(payments-refunds-corrections).toString(),posted,unposted:sources.rows.length-posted,count:sources.rows.length};
}
export function paymentActivityRows(sources:PaymentSources):(string|number)[][]{
 const t=paymentActivityTotals(sources);
 return [['Report','Recorded payment activity'],['Property reference',sources.property_id],['Recorded from',sources.start_date],['Recorded until (exclusive)',sources.end_date_exclusive],['Basis','Property-local recording dates; not processor settlement or general ledger posting dates. Journal status is the loaded snapshot; refresh after posting.'],['Currency','USD'],['Payment records',t.count],['Accounting posted',t.posted],['Accounting unposted',t.unposted],['Recorded payments USD',balanceDecimal(t.payments)],['Recorded refunds USD',balanceDecimal(t.refunds)],['Payment corrections USD',balanceDecimal(t.corrections)],['Net recorded movement USD',balanceDecimal(t.net)],[],['Payment record','Reservation','Reservation reference','Kind','Recorded timestamp','Property date','Amount USD','Accounting status','Journal','Original payment','Original journal'],...sources.rows.map(row=>[row.entry_id,row.reservation_id,row.reservation_reference,row.kind,row.created_at,row.source_date,balanceDecimal(row.amount_minor),row.journal_id?'Posted':'Unposted',row.journal_id??'',row.target_entry_id??'',row.original_posting?.journal_id??''])];
}
