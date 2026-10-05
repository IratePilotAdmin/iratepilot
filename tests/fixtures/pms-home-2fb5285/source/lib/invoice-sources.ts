export function readInvoiceSources(value:unknown,scope:{tenant:string;property:string;reservation:string;actor:string}){
 const r=value as Record<string,unknown>;
 if(!r||r.schema_version!==1||r.tenant_id!==scope.tenant||r.property_id!==scope.property||r.reservation_id!==scope.reservation||r.actor_id!==scope.actor||r.currency!=='USD'||typeof r.source_hash!=='string'||!/^[a-f0-9]{64}$/.test(r.source_hash)||!Array.isArray(r.lines)||r.lines.length>10000)throw Error('Invoice charge preview scope changed.');
 const keys=new Set<string>();let total=BigInt(0);
 const amount=(v:unknown)=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,11})$/.test(v))throw Error('Invalid invoice charge amount.');return BigInt(v);};
 const lines=r.lines.map(value=>{const line=value as Record<string,unknown>;if(!line||typeof line.source_key!=='string'||line.source_key.length<1||line.source_key.length>200||keys.has(line.source_key)||typeof line.description!=='string'||!line.description.trim()||line.description.length>500||typeof line.category!=='string'||!line.category||line.category.length>100)throw Error('Invalid invoice charge source.');keys.add(line.source_key);
 const original=amount(line.amount_minor),invoiced=amount(line.invoiced_minor),available=amount(line.available_minor);const routed=amount(line.routed_minor===undefined?'0':line.routed_minor);if(original-invoiced-routed!==available)throw Error('Invoice charge preview does not reconcile.');total+=available;
 return {source_key:line.source_key,description:line.description,category:line.category,amount_minor:original.toString(),invoiced_minor:invoiced.toString(),routed_minor:routed.toString(),available_minor:available.toString()};});
 if(total>BigInt('999999999999'))throw Error('Invoice preview exceeds supported amount.');
 return {source_hash:r.source_hash,lines,available_minor:total.toString()};
}
