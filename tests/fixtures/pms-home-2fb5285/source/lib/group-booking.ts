export type GroupCommand={p_request:string;p_name:string;p_arrival:string;p_departure:string;p_rooms:{quote_id:string;guest_name:string}[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function day(value:unknown):value is string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value}
function name(value:unknown):value is string{return typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value)}
export function readGroupCommand(raw:string):GroupCommand{
 const fail=()=>{throw Error('Saved group request is invalid. Have a manager reconcile it before creating another group.')};
 let c:GroupCommand;try{c=JSON.parse(raw)}catch{return fail()}
 if(!c||typeof c!=='object'||Object.keys(c).sort().join(',')!=='p_arrival,p_departure,p_name,p_request,p_rooms'||typeof c.p_request!=='string'||!uuid.test(c.p_request)||!name(c.p_name)||!day(c.p_arrival)||!day(c.p_departure)||c.p_departure<=c.p_arrival||(Date.parse(c.p_departure)-Date.parse(c.p_arrival))/86400000>30||!Array.isArray(c.p_rooms)||c.p_rooms.length<1||c.p_rooms.length>100)return fail();
 const seen=new Set<string>();
 for(const row of c.p_rooms){if(!row||typeof row!=='object'||Object.keys(row).sort().join(',')!=='guest_name,quote_id'||typeof row.quote_id!=='string'||!uuid.test(row.quote_id)||!name(row.guest_name)||seen.has(row.quote_id.toLowerCase()))return fail();seen.add(row.quote_id.toLowerCase())}
 return c;
}
