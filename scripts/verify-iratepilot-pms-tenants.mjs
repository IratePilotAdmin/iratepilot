import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const db=new PGlite();let passed=0;
const q=(s,p=[])=>db.query(s,p),v=async(s,p=[])=>Object.values((await q(s,p)).rows[0])[0];
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 await db.exec(await readFile(new URL('../supabase/migrations/202609070142_iratepilot_pms_tenant_foundation.sql',import.meta.url),'utf8'));
 const a=await v("INSERT INTO irp_pms.tenants(name) VALUES('A') RETURNING id"),b=await v("INSERT INTO irp_pms.tenants(name) VALUES('B') RETURNING id");
 const user=await v('INSERT INTO auth.users VALUES(gen_random_uuid()) RETURNING id');
 await q("INSERT INTO irp_pms.memberships VALUES($1,$2,'staff')",[a,user]);
 const pa=await v("INSERT INTO irp_pms.properties(tenant_id,name,currency) VALUES($1,'A Hotel','USD') RETURNING id",[a]);
 const pb=await v("INSERT INTO irp_pms.properties(tenant_id,name,currency) VALUES($1,'B Hotel','USD') RETURNING id",[b]);
 const ra=await v("INSERT INTO irp_pms.room_types(tenant_id,property_id,name) VALUES($1,$2,'King') RETURNING id",[a,pa]);
 const rb=await v("INSERT INTO irp_pms.room_types(tenant_id,property_id,name) VALUES($1,$2,'King') RETURNING id",[b,pb]);
 const insert=(tenant,prop,room,source='booking',total=400)=>q("INSERT INTO irp_pms.reservations(tenant_id,property_id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor) VALUES($1,$2,'iratepilot-ota',$4,1,repeat('a',64),'Confirmed',$3,'2026-10-01','2026-10-03',2,400,0,0,$5)",[tenant,prop,room,source,total]);
 await check('service role writes valid scoped reservations',async()=>{await db.exec('SET ROLE service_role');await insert(a,pa,ra);await insert(b,pb,rb);await db.exec('RESET ROLE')});
 await check('cross-tenant property relationship rejected',async()=>assert.rejects(()=>insert(a,pb,rb,'bad')));
 await check('cross-property room type rejected',async()=>assert.rejects(()=>insert(a,pa,rb,'bad')));
 await check('unbalanced money rejected',async()=>assert.rejects(()=>insert(a,pa,ra,'bad',500)));
 await check('duplicate source booking rejected',async()=>assert.rejects(()=>insert(a,pa,ra)));
 await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);
 await db.exec('SET ROLE authenticated');
 await check('staff sees only own tenant and property',async()=>{assert.equal(await v('SELECT count(*)::int FROM irp_pms.tenants'),1);assert.equal(await v('SELECT name FROM irp_pms.properties'),'A Hotel')});
 await check('staff cannot read other tenant booking by ID',async()=>assert.equal(await v('SELECT count(*)::int FROM irp_pms.reservations WHERE tenant_id=$1',[b]),0));
 await check('staff cannot insert reservation',async()=>assert.rejects(()=>insert(a,pa,ra,'direct')));
 await check('staff cannot escalate own role',async()=>assert.rejects(()=>q("UPDATE irp_pms.memberships SET role='owner'")));
 await db.exec('RESET ROLE');await q('DELETE FROM irp_pms.memberships WHERE tenant_id=$1',[a]);await db.exec('SET ROLE authenticated');
 await check('membership revocation immediately removes reads',async()=>assert.equal(await v('SELECT count(*)::int FROM irp_pms.reservations'),0));
 await db.exec('RESET ROLE;SET ROLE anon');
 await check('anonymous access denied',async()=>assert.rejects(()=>q('SELECT * FROM irp_pms.tenants')));
 await db.exec('RESET ROLE');
 await check('cancellation tombstone needs no assigned room',async()=>{await q("INSERT INTO irp_pms.reservations(tenant_id,property_id,source,source_booking_id,source_version,payload_hash,status) VALUES($1,$2,'iratepilot-ota','cancel-before-create',2,repeat('b',64),'Cancelled')",[a,pa])});
 console.log(JSON.stringify({passed,failed:0,scope:'local PostgreSQL with auth stubs, not remote'}));
}finally{await db.close()}
