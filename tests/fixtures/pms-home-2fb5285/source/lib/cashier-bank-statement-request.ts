import type {HandoffScope} from './cashier-handoff';
export type StatementRequest={id:string;account:string;amount:string;date:string;reference:string;description:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
function text(v:unknown,max:number){if(typeof v!=='string'||v!==v.trim()||v.length<2||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw Error('Review the statement reference and description.');return v}
export function checkedStatement(v:StatementRequest):StatementRequest{
 if(!v||!uuid(v.id)||!uuid(v.account)||typeof v.amount!=='string'||! /^-?[1-9][0-9]{0,11}$/.test(v.amount)||typeof v.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!Number.isFinite(Date.parse(v.date))||new Date(v.date).toISOString().slice(0,10)!==v.date||v.date<'1900-01-01')throw Error('Review the statement account, amount and date.');
 return {id:v.id,account:v.account,amount:v.amount,date:v.date,reference:text(v.reference,120),description:text(v.description,500)};
}
export function statementMinor(value:string,direction:string){if(!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(value)||!['credit','debit'].includes(direction))throw Error('Enter a valid statement amount.');const [whole,fraction='']=value.split('.');const n=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));if(n<=BigInt(0)||n>BigInt('999999999999'))throw Error('Statement amount is out of range.');return (direction==='debit'?-n:n).toString()}
export function statementArgs(r:StatementRequest,scope:HandoffScope){checkedStatement(r);return {p_tenant:scope.tenant,p_property:scope.property,p_account:r.account,p_request:r.id,p_amount_minor:r.amount,p_value_date:r.date,p_reference:r.reference,p_description:r.description,p_confirmed:true}}
export function readStatementReceipt(value:unknown,r:StatementRequest,scope:HandoffScope,status=false){
 let v=value as Record<string,unknown>;const scoped=(x:Record<string,unknown>)=>x&&x.schema_version===1&&x.tenant_id===scope.tenant&&x.property_id===scope.property&&x.actor_id===scope.actor;
 if(status){if(!scoped(v)||v.kind!=='statement'||v.request_id!==r.id||typeof v.found!=='boolean')throw Error('Statement recovery scope changed.');if(!v.found){if(v.result!==null)throw Error('Invalid statement recovery.');return false}v=v.result as Record<string,unknown>}
 if(!scoped(v)||v.entry_id!==r.id||v.account_id!==r.account||v.amount_minor!==r.amount||v.value_date!==r.date||v.reference!==r.reference||v.description!==r.description||v.source!=='manual'||v.bank_verified!==false||v.journal_posted!==false||typeof v.replayed!=='boolean'||typeof v.created_at!=='string')throw Error('Statement receipt does not match the request.');return true;
}
