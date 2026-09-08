// Exact local release/proof/shutdown validation. No credentials or network.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const db=new PGlite({extensions:{pgcrypto}}),root=new URL('../supabase/',import.meta.url),version='202609070171',stem=version+'_iratepilot_pms_turnover_workflow';
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const val=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const hash=x=>createHash('sha256').update(x).digest('hex');
const funcs=async()=>q("SELECT p.oid::text,n.nspname||'.'||p.proname name,p.proowner::text owner,p.proacl::text acl,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR n.nspname='public' AND p.proname LIKE 'irp_pms_%' ORDER BY p.oid");
const snapshot=async()=>{const result={};for(const {schemaname,tablename} of await q("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('irp_pms','auth','supabase_migrations') ORDER BY 1,2")){assert.match(tablename,/^[a-z_]+$/);result[schemaname+'.'+tablename]=await val(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM ${schemaname}.${tablename} x`);}return result;};
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);");
 const files=(await readdir(new URL('migrations/',root))).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170)_iratepilot_pms_/.test(n)).sort();
 for(const f of files){await db.exec(await readFile(new URL('migrations/'+f,root),'utf8'));await q('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,ARRAY[]::text[])',[f.slice(0,12),f.slice(13,-4)]);}
 const profile=JSON.parse(await readFile(new URL('preflights/'+stem+'.grants.json',root),'utf8'));let mirrored=0;
 for(const fn of profile.functions){const sig=fn.signature.replaceAll(' ','');assert.match(sig,/^(public|irp_pms)\.[a-z_]+\((?:[a-z]+(?:,[a-z]+)*)?\)$/);const current=await val("SELECT has_function_privilege('service_role',$1,'EXECUTE')",[sig]);if(fn.service_role&&!current){await db.exec('GRANT EXECUTE ON FUNCTION '+sig+' TO service_role');mirrored++;}else assert.equal(current,fn.service_role,sig);}assert.equal(mirrored,8);
 await db.exec("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('11111111-1111-4111-8111-111111111111','rollback171@example.invalid',now());INSERT INTO irp_pms.tenants(id,name) VALUES('faa76112-c793-43db-92bd-f9faecd8d93a','Existing owner selection fixture');INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES('faa76112-c793-43db-92bd-f9faecd8d93a','11111111-1111-4111-8111-111111111111','owner');");
 const catalogBefore=await funcs(),beforePreflight=await snapshot(),preflight=await readFile(new URL('preflights/'+stem+'.sql',root),'utf8');
 const preflightResult=await db.exec(preflight);assert.deepEqual(await snapshot(),beforePreflight,'Preflight changed rows');
 const migration=await readFile(new URL('migrations/'+stem+'.sql',root),'utf8'),body=migration.slice(migration.indexOf('BEGIN;')+7,-8),literal="'"+body.replaceAll("'","''")+"'";
 const install=`BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\n${preflight}\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','iratepilot_pms_turnover_workflow',ARRAY[${literal}]);\nNOTIFY pgrst,'reload schema';\nCOMMIT;\nSELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='${version}';\n`;
 assert.equal(await readFile(new URL('verification/'+stem+'.install.sql',root),'utf8'),install,'Saved atomic install differs from exact renderer');
 const installed=await db.exec(install);assert.equal(installed.at(-1).rows[0].installed_addon_migrations,1);
 const catalogAfter=await funcs(),byOid=new Map(catalogAfter.map(x=>[x.oid,x]));for(const old of catalogBefore)assert.deepEqual(byOid.get(old.oid),old,'Old grant or identity changed: '+old.name);
 const beforeProof=await snapshot(),proof=await readFile(new URL('verification/'+stem+'.rollback.sql',root),'utf8'),proofResult=await db.exec(proof);
 assert.ok(proofResult.some(x=>x.rows?.some(row=>row.verification==='turnover_rejection_helper_self_test_passed')),'Missing rejection helper self-test marker');
 assert.ok(proofResult.some(x=>x.rows?.some(row=>row.verification==='turnover_transaction_proof_passed')),'Missing rollback proof success marker');assert.deepEqual(await snapshot(),beforeProof,'Proof retained a fixture or changed existing data/identity');
 // Mutation test for the proof itself: after doing actual successful work,
 // replace the finish helper's result with an empty object. Positive SQL
 // assertions must reject missing fields instead of treating UNKNOWN as pass.
 const approvalReturn=/ RETURN public\.irp_pms_pilot_update_turnover\([^\n]+;/;
 assert.ok(approvalReturn.test(proof));const missingResultProof=proof.replace(approvalReturn,line=>line.replace(' RETURN ',' PERFORM ')+"RETURN '{}'::jsonb;");
 let missingResultError;try{await db.exec(missingResultProof);}catch(e){missingResultError=e;}finally{await db.exec('ROLLBACK');}
 assert.ok(missingResultError,'Proof accepted an empty approval result');assert.equal(missingResultError.code,'P0001');assert.match(missingResultError.message,/Whole-home cleaning\/inspection did not complete/);assert.deepEqual(await snapshot(),beforeProof);
 // A separate local-only execution retains the synthetic proof fixtures for
 // shutdown behavior checks. The distributed live proof still ends ROLLBACK.
 await db.exec(proof.replace(/ROLLBACK;\s*$/,'COMMIT;'));
 const fixture=(await q("SELECT t.id tenant_id,m.user_id FROM irp_pms.tenants t JOIN irp_pms.memberships m ON m.tenant_id=t.id WHERE t.name='Transaction-only171 turnover'"))[0];
 const home=(await q("SELECT p.id property_id,r.id room_id,r.room_type_id FROM irp_pms.properties p JOIN irp_pms.rooms r ON r.tenant_id=p.tenant_id AND r.property_id=p.id WHERE p.tenant_id=$1 AND p.operating_model='whole_home'",[fixture.tenant_id]))[0];
 const ownReceipt=(await q("SELECT request_id FROM irp_pms.turnover_requests WHERE tenant_id=$1 AND property_id=$2 AND action='create_turnover' LIMIT 1",[fixture.tenant_id,home.property_id]))[0];
 const beforeShutdown=await funcs(),shutdown=await readFile(new URL('rollbacks/'+stem+'.shutdown.sql',root),'utf8');await db.exec(shutdown);
 const changed=[];for(const after of await funcs()){const prior=beforeShutdown.find(x=>x.oid===after.oid);if(JSON.stringify(prior)!==JSON.stringify(after)){changed.push(after.name);assert.equal(after.authenticated,false);assert.equal(after.anon,false);assert.equal(after.service_role,false);}}
 assert.deepEqual(changed.sort(),['public.irp_pms_pilot_create_turnover','public.irp_pms_pilot_update_turnover']);
 // Lifecycle helpers/readiness gates stay installed; only direct task
 // commands lose ACL. Exercise the preserved paths, not only their source.
 const protectedNames=['public.irp_pms_pilot_stay_action','public.irp_pms_pilot_move_room','public.irp_pms_pilot_set_housekeeping'];
 for(const name of protectedNames)assert.match(await val("SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname=$1",[name]),/irp_pms.enqueue_turnover/);
 assert.equal(await val("SELECT has_function_privilege('authenticated','public.irp_pms_pilot_turnovers(uuid,uuid,date,date)','EXECUTE')"),true);
 assert.equal(await val("SELECT has_function_privilege('authenticated','public.irp_pms_pilot_turnover_request_status(uuid,uuid,uuid)','EXECUTE')"),true);
 await q("UPDATE irp_pms.rooms SET housekeeping='Clean' WHERE tenant_id=$1 AND id=$2",[fixture.tenant_id,home.room_id]);
 await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[fixture.user_id]);await db.exec('SET ROLE authenticated');
 const fails=async(fn,code,pattern)=>{let caught;try{await fn()}catch(e){caught=e;}assert.ok(caught,'Expected rejection');assert.equal(caught.code,code);if(pattern)assert.match(caught.message,pattern);};
 const w=await val('SELECT public.irp_pms_pilot_workspace($1,$2)',[fixture.tenant_id,home.property_id]),d=w.business_date;
 const read=await val('SELECT public.irp_pms_pilot_turnovers($1,$2,$3,$4::date+1)',[fixture.tenant_id,home.property_id,d,d]);assert.equal(read.open_tasks.length,1);
 assert.equal((await val('SELECT public.irp_pms_pilot_turnover_request_status($1,$2,$3)',[fixture.tenant_id,home.property_id,ownReceipt.request_id])).found,true);
 await fails(()=>val('SELECT public.irp_pms_pilot_create_turnover($1,$2,$3,gen_random_uuid(),$4,$5,$5,NULL,$6)',[fixture.tenant_id,home.property_id,home.room_id,w.rooms[0].state_version,d,'Shutdown manual request']),'42501');
 await fails(()=>val("SELECT public.irp_pms_pilot_update_turnover($1,$2,$3,gen_random_uuid(),1,$4,$5,'start','{}')",[fixture.tenant_id,home.property_id,read.open_tasks[0].id,w.rooms[0].state_version,d]),'42501');
 const newStay=await val("SELECT public.irp_pms_pilot_create_reservation($1,$2,gen_random_uuid(),$3,'Shutdown guarded arrival',$4,$4::date+1,1,10000,0)",[fixture.tenant_id,home.property_id,home.room_type_id,d]);
 await fails(()=>val("SELECT public.irp_pms_pilot_stay_action($1,$2,$3,'check_in',$4)",[fixture.tenant_id,home.property_id,newStay.id,home.room_id]),'P0001',/unfinished turnover/);
 await fails(()=>val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,gen_random_uuid(),$4,'Clean')",[fixture.tenant_id,home.property_id,home.room_id,w.rooms[0].state_version]),'P0001',/turnover/);
 const dirty=await val("SELECT public.irp_pms_pilot_set_housekeeping($1,$2,$3,gen_random_uuid(),$4,'Dirty')",[fixture.tenant_id,home.property_id,home.room_id,w.rooms[0].state_version]);assert.equal(dirty.room.housekeeping,'Dirty');
 const afterDirty=await val('SELECT public.irp_pms_pilot_turnovers($1,$2,$3,$4::date+1)',[fixture.tenant_id,home.property_id,d,d]);assert.equal(afterDirty.open_tasks[0].version,read.open_tasks[0].version+1);
 await db.exec('RESET ROLE');
 const occupied=(await q("SELECT id,property_id,physical_room_id FROM irp_pms.reservations WHERE tenant_id=$1 AND status='In house'",[fixture.tenant_id]))[0];await db.exec('SET ROLE authenticated');
 await val("SELECT public.irp_pms_pilot_stay_action($1,$2,$3,'check_out',NULL)",[fixture.tenant_id,occupied.property_id,occupied.id]);
 const afterCheckout=await val('SELECT public.irp_pms_pilot_turnovers($1,$2,$3,$4::date+1)',[fixture.tenant_id,occupied.property_id,d,d]);assert.ok(afterCheckout.open_tasks.some(t=>t.room_id===occupied.physical_room_id&&t.origin_kind==='checkout'));
 const result={passed:true,preflight:preflightResult.at(-1).rows,rollback_proof_passed:true,all_existing_catalog_identity_acl_preserved:true,all_pms_auth_receipt_rows_restored:true,mirrored_existing_service_grants:mirrored,shutdown_changed_functions:changed,shutdown_behavior_reads_receipt_readiness_dirty_checkout_passed:true,migration_sha256:hash(migration),install_sha256:hash(install),proof_sha256:hash(proof),scope:'Exact local171 install, live-profile emulation, transaction-only public hotel/home proof and targeted shutdown. Separate retained synthetic fixtures only inside scratch PGlite prove shutdown behavior. No live action. Native contention evidence is separate.'};
 if(process.env.TURNOVER_ROLLBACK_RESULT_PATH)await writeFile(process.env.TURNOVER_ROLLBACK_RESULT_PATH,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message,error.code??'',error.where??'',error.internalQuery??'');process.exitCode=1;}finally{await db.close();}
