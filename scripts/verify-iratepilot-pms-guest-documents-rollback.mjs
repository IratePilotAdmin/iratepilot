// Exact local install, rollback-only public proof and targeted shutdown.
// Scratch PGlite only: no credentials, network or live database operations.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const db=new PGlite({extensions:{pgcrypto}}),root=new URL('../supabase/',import.meta.url),version='202609070173',stem=version+'_iratepilot_pms_guest_documents';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const val=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const hash=x=>createHash('sha256').update(x).digest('hex');
const funcs=()=>q("SELECT p.oid::text,n.nspname||'.'||p.proname name,p.proowner::text owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR n.nspname='public' AND p.proname LIKE 'irp_pms_%' ORDER BY p.oid");
const snapshot=async()=>{const result={};for(const {schemaname,tablename} of await q("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('irp_pms','auth','supabase_migrations') ORDER BY 1,2")){assert.match(tablename,/^[a-z_]+$/);result[schemaname+'.'+tablename]=await val("SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM "+schemaname+'.'+tablename+' x');}return result;};
const fails=async(fn,code,pattern)=>{let caught;try{await fn()}catch(e){caught=e}assert.ok(caught,'Expected rejection');assert.equal(caught.code,code);if(pattern)assert.match(caught.message,pattern);return caught};
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);");
 const files=(await readdir(new URL('migrations/',root))).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171|172)_iratepilot_pms_/.test(n)).sort();assert.equal(files.length,29);
 for(const f of files){await db.exec(await readFile(new URL('migrations/'+f,root),'utf8'));await q('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,ARRAY[]::text[])',[f.slice(0,12),f.slice(13,-4)]);}
 const profile=JSON.parse(await readFile(new URL('preflights/'+stem+'.grants.json',root),'utf8'));assert.equal(profile.functions.length,65);let mirrored=0;
 for(const fn of profile.functions){const sig=fn.signature.replaceAll('timestamp with time zone','timestamptz').replaceAll(' ','');assert.match(sig,/^(public|irp_pms)\.[a-z_]+\((?:[a-z_.]+(?:,[a-z_.]+)*)?\)$/);const current=await val("SELECT has_function_privilege('service_role',$1,'EXECUTE')",[sig]);if(fn.service_role&&!current){await db.exec('GRANT EXECUTE ON FUNCTION '+sig+' TO service_role');mirrored++;}else assert.equal(current,fn.service_role,sig);}assert.equal(mirrored,9);assert.equal(profile.functions.filter(fn=>fn.service_role).length,10);
 await db.exec("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('11111111-1111-4111-8111-111111111111','rollback172@example.invalid',now());INSERT INTO irp_pms.tenants(id,name) VALUES('faa76112-c793-43db-92bd-f9faecd8d93a','Existing owner selection fixture');INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES('faa76112-c793-43db-92bd-f9faecd8d93a','11111111-1111-4111-8111-111111111111','owner');");
 const catalogBefore=await funcs(),beforePreflight=await snapshot(),preflight=await readFile(new URL('preflights/'+stem+'.sql',root),'utf8');
 const preflightResult=await db.exec(preflight);assert.deepEqual(await snapshot(),beforePreflight,'Preflight changed rows');
 // Missing the retained folio grant must fail the exact preflight; no old grant is changed by installation.
 await db.exec('BEGIN;REVOKE EXECUTE ON FUNCTION public.irp_pms_pilot_folio(uuid,uuid,uuid) FROM service_role;');
 try{await fails(()=>db.exec(preflight),'P0001',/Effective172 execution grants differ: public\.irp_pms_pilot_folio/)}finally{await db.exec('ROLLBACK')}
 assert.deepEqual(await funcs(),catalogBefore);assert.deepEqual(await snapshot(),beforePreflight);
 const migration=await readFile(new URL('migrations/'+stem+'.sql',root),'utf8'),body=migration.slice(migration.indexOf('BEGIN;')+7,-8),literal="'"+body.replaceAll("'","''")+"'";
 const install="BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\n"+preflight+'\n'+body+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('"+version+"','iratepilot_pms_guest_documents',ARRAY["+literal+"]);\nNOTIFY pgrst,'reload schema';\nCOMMIT;\nSELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='"+version+"';\n";
 assert.equal(await readFile(new URL('verification/'+stem+'.install.sql',root),'utf8'),install,'Saved atomic install differs from exact renderer');
 const installed=await db.exec(install);assert.equal(installed.at(-1).rows[0].installed_addon_migrations,1);
 const afterInstall=await snapshot();for(const [name,oldRows] of Object.entries(beforePreflight)){const installedRows=name==='supabase_migrations.schema_migrations'?afterInstall[name].filter(row=>row.version!==version):afterInstall[name];assert.deepEqual(installedRows,oldRows,'Exact install changed preexisting rows: '+name);}
 const catalogAfter=await funcs(),byOid=new Map(catalogAfter.map(x=>[x.oid,x]));for(const old of catalogBefore)assert.deepEqual(byOid.get(old.oid),old,'Old grant, identity or definition changed: '+old.name);
 for(const table of ['security_deposit_books','security_deposit_events','security_deposit_requests'])assert.equal(await val('SELECT count(*)::int FROM irp_pms.'+table),0);
 const beforeProof=await snapshot(),proof=await readFile(new URL('verification/'+stem+'.rollback.sql',root),'utf8'),proofResult=await db.exec(proof);
 assert.ok(proofResult.some(x=>x.rows?.some(row=>row.verification==='guest_documents_helper_self_test_passed')),'Missing rejection helper self-test marker');
 assert.ok(proofResult.some(x=>x.rows?.some(row=>row.verification==='guest_documents_transaction_proof_passed')),'Missing rollback proof success marker');
 assert.deepEqual(await snapshot(),beforeProof,'Proof retained a fixture or changed existing data/identity');

 const documentReturn=/ RETURN public\.irp_pms_pilot_guest_documents\([^\n]+;/;assert.ok(documentReturn.test(proof));
 let missingResultError;try{await db.exec(proof.replace(documentReturn,line=>line.replace(' RETURN ',' PERFORM ')+"RETURN '{}'::jsonb;"))}catch(e){missingResultError=e}finally{await db.exec('ROLLBACK')}
 assert.ok(missingResultError,'Proof accepted an empty document');assert.equal(missingResultError.code,'P0001');assert.match(missingResultError.message,/Hotel document context is incomplete/);assert.deepEqual(await snapshot(),beforeProof);
 const entriesAssertion=" PERFORM pg_temp.irp173_assert(jsonb_typeof(x->'account'->'entries')=";assert.equal(proof.split(entriesAssertion).length,2);
 let missingEntriesError;try{await db.exec(proof.replace(entriesAssertion," x:=jsonb_set(x,'{account,entries}','[]'::jsonb);\n"+entriesAssertion))}catch(e){missingEntriesError=e}finally{await db.exec('ROLLBACK')}
 assert.ok(missingEntriesError,'Proof accepted omitted hotel entries');assert.equal(missingEntriesError.code,'P0001');assert.match(missingEntriesError.message,/Hotel document entry evidence is incomplete/);assert.deepEqual(await snapshot(),beforeProof);
 await db.exec(proof.replace(/ROLLBACK;\s*$/,'COMMIT;'));
 const fixture=(await q("SELECT t.id tenant_id,m.user_id,p.id property_id,r.id reservation_id FROM irp_pms.tenants t JOIN irp_pms.memberships m ON m.tenant_id=t.id JOIN irp_pms.properties p ON p.tenant_id=t.id JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id WHERE t.name='Transaction-only173 guest documents' AND p.operating_model='hotel'"))[0];assert.ok(fixture);
 const beforeShutdown=await funcs(),rowsBeforeShutdown=await snapshot(),shutdown=await readFile(new URL('rollbacks/'+stem+'.shutdown.sql',root),'utf8');await db.exec(shutdown);assert.deepEqual(await snapshot(),rowsBeforeShutdown,'Shutdown altered source data');
 const changed=[];for(const after of await funcs()){const prior=beforeShutdown.find(x=>x.oid===after.oid);if(JSON.stringify(prior)!==JSON.stringify(after)){changed.push(after.name);assert.equal(after.authenticated,false);assert.equal(after.anon,false);assert.equal(after.service_role,false);assert.equal(after.definition,prior.definition);}}
 assert.deepEqual(changed,['public.irp_pms_pilot_guest_documents']);
 await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[fixture.user_id]);await db.exec('SET ROLE authenticated');
 await fails(()=>val('SELECT public.irp_pms_pilot_guest_documents($1,$2,$3)',[fixture.tenant_id,fixture.property_id,fixture.reservation_id]),'42501');
 const guest=await val('SELECT public.irp_pms_pilot_reservation_guest($1,$2,$3)',[fixture.tenant_id,fixture.property_id,fixture.reservation_id]);assert.equal(guest.contact.email,'saved173@example.invalid');
 const folio=await val('SELECT public.irp_pms_pilot_folio($1,$2,$3)',[fixture.tenant_id,fixture.property_id,fixture.reservation_id]);assert.equal(folio.totals.balance_minor,4000);
 const deposit=await val('SELECT public.irp_pms_pilot_security_deposit($1,$2,$3)',[fixture.tenant_id,fixture.property_id,fixture.reservation_id]);assert.equal(deposit.totals.held_minor,10000);
 await db.exec('RESET ROLE');assert.deepEqual(await snapshot(),rowsBeforeShutdown,'Preserved source reads changed data');
 const result={passed:true,preflight:preflightResult.at(-1).rows,preflight_rejects_missing_retained_folio_grant:true,install_old_rows_preserved:true,all_existing_catalog_identity_acl_definition_preserved:true,rollback_proof_passed:true,proof_empty_result_mutation_rejected:true,proof_missing_entries_mutation_rejected:true,proof_all53_source_tables_pure:true,all_pms_auth_receipt_rows_restored:true,mirrored_existing_service_grants:mirrored,selected_existing_service_grants:profile.functions.filter(fn=>fn.service_role).length,shutdown_changed_functions:changed,shutdown_existing_guest_folio_deposit_reads_preserved:true,migration_sha256:hash(migration),install_sha256:hash(install),preflight_sha256:hash(preflight),proof_sha256:hash(proof),shutdown_sha256:hash(shutdown),scope:'Exact local173 preflight/install/public hotel-home document proof/targeted read shutdown. Full source snapshots preserved and all proof fixtures rolled back; separate shutdown fixtures only in scratch. No hosted or native concurrency claim.'};
 if(process.env.GUEST_DOCUMENT_ROLLBACK_RESULT_PATH)await writeFile(process.env.GUEST_DOCUMENT_ROLLBACK_RESULT_PATH,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message,error.code??'',error.where??'',error.internalQuery??'',error.position??'');process.exitCode=1}finally{await db.close()}
