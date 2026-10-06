import {readCashConfiguration,type CashScope} from './cash-flow-report';
import type {CashFlowCategory} from './cash-flow';
export type CashCommand={kind:'configuration';expected:number;accounts:string[];reason:string}|{kind:'review';expected:number;configuration:string;journal:string;allocations:{category:CashFlowCategory;amount_minor:string}[];reason:string};
export type CashRequest={actor:string;tenant:string;property:string;request:string;command:CashCommand};
export function cashCommand(value:unknown):CashCommand{
 const c=value as CashCommand;if(!c||typeof c!=='object'||!Number.isSafeInteger(c.expected)||c.expected<0||c.expected>=Number.MAX_SAFE_INTEGER||typeof c.reason!=='string'||c.reason.trim().length<4||c.reason.trim().length>500||/[\u0000-\u001f\u007f]/.test(c.reason))throw Error('Review the reason and current version before saving.');
 if(c.kind==='configuration'){
  if(!Array.isArray(c.accounts)||c.accounts.length<1||c.accounts.length>100||c.accounts.some(a=>typeof a!=='string'||!a)||new Set(c.accounts).size!==c.accounts.length)throw Error('Choose distinct cash accounts.');
  return {kind:c.kind,expected:c.expected,accounts:[...c.accounts].sort(),reason:c.reason.trim()};
 }
 if(c.kind!=='review'||typeof c.configuration!=='string'||!c.configuration||typeof c.journal!=='string'||!c.journal||!Array.isArray(c.allocations)||c.allocations.length>100)throw Error('Review the journal and configuration before saving.');
 const groups=new Map<string,bigint>();for(const a of c.allocations){if(!a||!['operating','investing','financing'].includes(a.category)||typeof a.amount_minor!=='string'||!/^(-?[1-9][0-9]{0,40})$/.test(a.amount_minor))throw Error('Enter nonzero allocation amounts.');const key=a.category+'/'+(BigInt(a.amount_minor)<0n?'-':'+');groups.set(key,(groups.get(key)??0n)+BigInt(a.amount_minor));}
 const allocations=[...groups].map(([key,n])=>({category:key.split('/')[0] as CashFlowCategory,amount_minor:n.toString()})).sort((a,b)=>a.category.localeCompare(b.category)||(BigInt(a.amount_minor)<0n?-1:1));
 return {kind:c.kind,expected:c.expected,configuration:c.configuration,journal:c.journal,allocations,reason:c.reason.trim()};
}
export function cashRequestKey(actor:string,scope:CashScope){return ['irp-cash-flow-request',actor,scope.tenant_id,scope.property_id].join('/');}
export function readCashRequest(storage:Pick<Storage,'getItem'>,actor:string,scope:CashScope):CashRequest|null{
 const raw=storage.getItem(cashRequestKey(actor,scope));if(!raw)return null;
 if(raw.length>100000)throw Error('Cash-flow recovery data is invalid.');
 const r=JSON.parse(raw) as CashRequest;if(!r||r.actor!==actor||r.tenant!==scope.tenant_id||r.property!==scope.property_id||typeof r.request!=='string'||!r.request)throw Error('Cash-flow recovery does not match this sign-in and property.');
 return {...r,command:cashCommand(r.command)};
}
export function cashParams(r:CashRequest){return {p_tenant:r.tenant,p_property:r.property,p_request:r.request,p_expected_version:r.command.expected,p_reason:r.command.reason,p_confirmed:true,...(r.command.kind==='configuration'?{p_accounts:r.command.accounts}:{p_configuration:r.command.configuration,p_journal:r.command.journal,p_allocations:r.command.allocations})};}
export function verifyCashResult(value:unknown,r:CashRequest){
 const v=value as Record<string,unknown>;if(!v||v.id!==r.request||v.tenant_id!==r.tenant||v.property_id!==r.property||v.actor_id!==r.actor||v.version!==r.command.expected+1||v.reason!==r.command.reason)throw Error('Saved result could not be verified. Retry the retained request.');
 if(r.command.kind==='configuration'){const c=readCashConfiguration({...v,configured:true},{tenant_id:r.tenant,property_id:r.property});if(!c.configured||JSON.stringify([...c.cash_account_ids].sort())!==JSON.stringify(r.command.accounts))throw Error('Saved cash accounts do not match the request.');}
 else{const returned=cashCommand({kind:'review',expected:r.command.expected,configuration:v.configuration_id,journal:v.journal_id,allocations:v.allocations,reason:v.reason});if(JSON.stringify(returned)!==JSON.stringify(r.command))throw Error('Saved cash-flow review does not match the request.');}
}
export function allocationMinor(value:string){if(!/^-?(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(value))throw Error('Enter a signed USD amount with up to two decimal places.');const negative=value.startsWith('-'),[whole,decimal='']=value.replace(/^-/,'').split('.'),amount=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));if(!amount)throw Error('Allocation amounts must be nonzero.');return (negative?-amount:amount).toString();}
