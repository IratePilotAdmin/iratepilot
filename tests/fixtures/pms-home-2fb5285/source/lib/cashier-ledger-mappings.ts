import type {HandoffScope} from './cashier-handoff';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid ledger account response.');return v as Record<string,unknown>}
function account(value:unknown,id:unknown){const a=object(value);if(!uuid(id)||a.id!==id||typeof a.code!=='string'||!a.code.trim()||typeof a.name!=='string'||!a.name.trim()||typeof a.active!=='boolean')throw Error('Invalid ledger account.');return {id,code:a.code,name:a.name,active:a.active}}
export function readCashierLedgerMappings(value:unknown,scope:HandoffScope,bank:string,before:string|null=null){
 const v=object(value);if(!Object.values(scope).every(uuid)||!uuid(bank)||(before!==null&&!uuid(before))||v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.actor_id!==scope.actor||v.bank_id!==bank||!Array.isArray(v.entries)||v.entries.length>50||typeof v.has_more!=='boolean')throw Error('Ledger account workspace changed.');
 let prior=before;const entries=v.entries.map(value=>{const m=object(value);if(!uuid(m.id)||!uuid(m.actor_id)||m.tenant_id!==scope.tenant||m.property_id!==scope.property||m.bank_id!==bank||(prior!==null&&m.id>=prior))throw Error('Invalid ledger mapping.');prior=m.id;
  const custody=account(m.custody,m.custody_account),transit=account(m.transit,m.transit_account),bankAccount=account(m.bank_ledger,m.bank_account);
  if(new Set([custody.id,transit.id,bankAccount.id]).size!==3||m.usable!==(custody.active&&transit.active&&bankAccount.active))throw Error('Invalid ledger mapping accounts.');
  return {id:m.id,custody,transit,bank:bankAccount,usable:m.usable as boolean};
 });
 if(v.has_more?(entries.length!==50||v.next_cursor!==entries[49].id):v.next_cursor!==null)throw Error('Invalid ledger mapping cursor.');
 return {entries,next:v.next_cursor as string|null};
}

