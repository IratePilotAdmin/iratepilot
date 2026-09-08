// Reproduce171 static forwards from the exact installed142–170 source set.
// This edits only171 after its marker; immutable baseline files are read-only.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=new URL('../supabase/migrations/',import.meta.url),catalog=new Map();
for(const f of (await readdir(dir)).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170)_iratepilot_pms_/.test(n)).sort()){
 const sql=await readFile(new URL(f,dir),'utf8');
 for(const match of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION\s+((?:public|irp_pms)\.[a-z_]+)\s*\([\s\S]*?\$\$[\s\S]*?\$\$;/g))catalog.set(match[1],{sql:match[0],source:f});
}
const outputs=[];
function modify(name,edits){
 const item=catalog.get(name);assert.ok(item,name);let sql=item.sql.replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION');
 for(const [before,after] of edits){assert.equal(sql.split(before).length,2,`${name}: replacement must match exactly once: ${before}`);sql=sql.replace(before,after);}
 outputs.push(`-- Forward from ${item.source}; turnover lifecycle enforcement.\n${sql}`);
}
modify('public.irp_pms_pilot_stay_action',[
 ["  IF irp_pms.room_is_closed(p_tenant,p_property,p_room,business_date,res.departure)","  IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_room AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Physical room has unfinished turnover work';END IF;\n  IF irp_pms.room_is_closed(p_tenant,p_property,p_room,business_date,res.departure)"],
 ["  UPDATE irp_pms.rooms SET housekeeping='Dirty' WHERE tenant_id=p_tenant AND property_id=p_property AND id=res.physical_room_id;","  IF res.physical_room_id IS NOT NULL THEN\n   PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,res.physical_room_id,'checkout',res.id::text,res.id,res.source_version,auth.uid(),res.checked_out_at,'Actual guest checkout');\n  END IF;"]
]);
modify('public.irp_pms_pilot_move_room',[
 [" IF irp_pms.room_is_closed(p_tenant,p_property,p_to_room,business_date,", " IF EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND room_id=p_to_room AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Destination room has unfinished turnover work';END IF;\n IF irp_pms.room_is_closed(p_tenant,p_property,p_to_room,business_date,"],
 [" UPDATE irp_pms.rooms SET housekeeping='Dirty' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_from_room;"," PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,p_from_room,'room_move',p_request::text,res.id,res.source_version,auth.uid(),moved_at,trim(p_reason));"]
]);
modify('public.irp_pms_pilot_set_housekeeping',[
 [" SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;"," IF p_status IN('Clean','Inspect') THEN RAISE EXCEPTION 'Use turnover cleaning and manager inspection to mark a room ready';END IF;\n SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;"],
 [" UPDATE irp_pms.rooms SET housekeeping=p_status WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;"," IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND status='In house') THEN\n  UPDATE irp_pms.rooms SET housekeeping=p_status WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room RETURNING * INTO room;\n ELSE\n  PERFORM irp_pms.enqueue_turnover(p_tenant,p_property,p_room,'readiness_dirty',p_request::text,NULL,NULL,auth.uid(),clock_timestamp(),'Room explicitly marked Dirty');\n  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room;\n END IF;"]
]);
modify('public.irp_pms_pilot_workspace',[
 ["jsonb_build_object('maintenance_intervals',", "jsonb_build_object('open_turnover_task',(SELECT jsonb_build_object('id',t.id,'version',t.version,'state',t.state) FROM irp_pms.turnover_tasks t WHERE t.tenant_id=r.tenant_id AND t.property_id=r.property_id AND t.room_id=r.id AND t.state NOT IN('completed','cancelled')),'maintenance_intervals',"]
]);
modify('public.irp_pms_pilot_configure_property',[
 [" IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.room_closures", " IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Resolve open turnover work before changing property time zone';END IF;\n IF prop.time_zone IS DISTINCT FROM p_time_zone AND EXISTS(SELECT 1 FROM irp_pms.room_closures"]
]);
modify('irp_pms.apply_operating_model',[
 [" IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.room_closures", " IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.turnover_tasks WHERE tenant_id=p_tenant AND property_id=p_property AND state NOT IN('completed','cancelled')) THEN RAISE EXCEPTION 'Resolve open turnover work before changing property operating model';END IF;\n IF prop.operating_model IS DISTINCT FROM p_mode AND EXISTS(SELECT 1 FROM irp_pms.room_closures"]
]);
const target=new URL('202609070171_iratepilot_pms_turnover_workflow.sql',dir),source=await readFile(target,'utf8'),marker='-- Frozen-source forward definitions follow.';
assert.equal(source.split(marker).length,2);await writeFile(target,source.split(marker)[0]+marker+'\n'+outputs.join('\n\n')+'\nCOMMIT;\n');
console.log(`Generated ${outputs.length} static forwards in171; earlier migrations unchanged.`);
