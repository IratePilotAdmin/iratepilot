export type ServiceInventory={schema_version:1;service_date:string;basis:'inventory_configuration_at_close';room_types:{room_type_id:string;room_type_name:string;configured_units:number|null;physical_units:number;closed_units:number;effective_units:number|null}[];physical_units:number;closed_units:number;configured_units:number|null;effective_units:number|null;missing_capacity_types:number;room_type_count:number;complete:boolean};
export function readServiceInventory(value:unknown,day:string):ServiceInventory{
 const fail=()=>{throw Error('Inventory preview is inconsistent. Refresh before closing.');};
 if(!value||typeof value!=='object')return fail();
 const v=value as ServiceInventory;
 const count=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 if(v.schema_version!==1||v.service_date!==day||v.basis!=='inventory_configuration_at_close'||!Array.isArray(v.room_types))return fail();
 const ids=new Set<string>();
 for(const r of v.room_types){
  if(!r||typeof r.room_type_id!=='string'||!r.room_type_id||ids.has(r.room_type_id)||typeof r.room_type_name!=='string'||!count(r.physical_units)||!count(r.closed_units)||r.closed_units>r.physical_units||!(r.configured_units===null||count(r.configured_units)))return fail();
  ids.add(r.room_type_id);
  if(r.effective_units!==(r.configured_units===null?null:Math.min(r.configured_units,r.physical_units-r.closed_units)))return fail();
 }
 const missing=v.room_types.filter(r=>r.configured_units===null).length,complete=v.room_types.length>0&&missing===0;
 const sum=(key:'physical_units'|'closed_units'|'configured_units'|'effective_units')=>v.room_types.reduce((n,r)=>n+(r[key]??0),0);
 if(v.room_type_count!==v.room_types.length||v.missing_capacity_types!==missing||v.complete!==complete||v.physical_units!==sum('physical_units')||v.closed_units!==sum('closed_units')||!count(v.physical_units)||!count(v.closed_units)||v.configured_units!==(complete?sum('configured_units'):null)||v.effective_units!==(complete?sum('effective_units'):null)||(complete&&(!count(v.configured_units)||!count(v.effective_units))))return fail();
 return v;
}
