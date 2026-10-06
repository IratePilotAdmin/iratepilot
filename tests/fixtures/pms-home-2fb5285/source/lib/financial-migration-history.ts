import type {HandoffScope} from './cashier-handoff';
export function readFinancialMigrationHistory(value:unknown,scope:HandoffScope,before:string|null){
 if(!value||typeof value!=='object')throw Error('Invalid migration history.');const v=value as Record<string,unknown>;
 if(v.schema_version!==1||v.tenant_id!==scope.tenant||v.property_id!==scope.property||v.actor_id!==scope.actor||v.order!=='id_desc'||!Array.isArray(v.entries)||v.entries.length>50)throw Error('Migration history does not match this workspace.');
 let previous=before;
 const entries=v.entries.map(raw=>{if(!raw||typeof raw!=='object')throw Error('Invalid migration history item.');const r=raw as Record<string,unknown>;if(typeof r.id!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(r.id)||previous!==null&&r.id>=previous||typeof r.provider!=='string'||typeof r.source_batch_id!=='string'||typeof r.cutover_date!=='string'||!Number.isInteger(r.row_count)||Number(r.row_count)<1||Number(r.row_count)>500||!['staged','committed'].includes(r.status as string)||typeof r.source_reconciled!=='boolean')throw Error('Invalid migration history item.');previous=r.id;return {id:r.id,provider:r.provider,sourceBatch:r.source_batch_id,cutover:r.cutover_date,count:Number(r.row_count),status:r.status as 'staged'|'committed',reconciled:r.source_reconciled}});
 if(v.next_before!==null&&(entries.length!==50||v.next_before!==previous))throw Error('Invalid migration history continuation.');return {entries,next:v.next_before as string|null};
}
