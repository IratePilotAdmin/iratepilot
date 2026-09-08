// Exact local install, rollback-only public proof and targeted shutdown.
// Scratch PGlite only: no credentials, network or live database operations.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const db=new PGlite({extensions:{pgcrypto}}),root=new URL('../supabase/',import.meta.url),version='202609070172',stem=version+'_iratepilot_pms_security_deposits';
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const val=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
const hash=x=>createHash('sha256').update(x).digest('hex');
const funcs=()=>q("SELECT p.oid::text,n.nspname||'.'||p.proname name,p.proowner::text owner,p.proacl::text acl,pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' OR n.nspname='public' AND p.proname LIKE 'irp_pms_%' ORDER BY p.oid");
const snapshot=async()=>{const result={};for(const {schemaname,tablename} of await q("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('irp_pms','auth','supabase_migrations') ORDER BY 1,2")){assert.match(tablename,/^[a-z_]+$/);result[schemaname+'.'+tablename]=await val("SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM "+schemaname+'.'+tablename+' x');}return result;};
const fails=async(fn,code,pattern)=>{let caught;try{await fn()}catch(e){caught=e}assert.ok(caught,'Expected rejection');assert.equal(caught.code,code);if(pattern)assert.match(caught.message,pattern);return caught};
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);");
 const files=(await readdir(new URL('migrations/',root))).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171)_iratepilot_pms_/.test(n)).sort();assert.equal(files.length,28);
 for(const f of files){await db.exec(await readFile(new URL('migrations/'+f,root),'utf8'));await q('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,ARRAY[]::text[])',[f.slice(0,12),f.slice(13,-4)]);}
 const profile=JSON.parse(await readFile(new URL('preflights/'+stem+'.grants.json',root),'utf8'));assert.equal(profile.functions.length,44);let mirrored=0;
 for(const fn of profile.functions){const sig=fn.signature.replaceAll('timestamp with time zone','timestamptz').replaceAll(' ','');assert.match(sig,/^(public|irp_pms)\.[a-z_]+\((?:[a-z]+(?:,[a-z]+)*)?\)$/);const current=await val("SELECT has_function_privilege('service_role',$1,'EXECUTE')",[sig]);if(fn.service_role&&!current){await db.exec('GRANT EXECUTE ON FUNCTION '+sig+' TO service_role');mirrored++;}else assert.equal(current,fn.service_role,sig);}assert.equal(mirrored,8);
 await db.exec("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('11111111-1111-4111-8111-111111111111','rollback172@example.invalid',now());INSERT INTO irp_pms.tenants(id,name) VALUES('faa76112-c793-43db-92bd-f9faecd8d93a','Existing owner selection fixture');INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES('faa76112-c793-43db-92bd-f9faecd8d93a','11111111-1111-4111-8111-111111111111','owner');");
 const catalogBefore=await funcs(),beforePreflight=await snapshot(),preflight=await readFile(new URL('preflights/'+stem+'.sql',root),'utf8');
 const preflightResult=await db.exec(preflight);assert.deepEqual(await snapshot(),beforePreflight,'Preflight changed rows');
 const migration=await readFile(new URL('migrations/'+stem+'.sql',root),'utf8'),body=migration.slice(migration.indexOf('BEGIN;')+7,-8),literal="'"+body.replaceAll("'","''")+"'";
 const install="BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\n"+preflight+'\n'+body+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('"+version+"','iratepilot_pms_security_deposits',ARRAY["+literal+"]);\nNOTIFY pgrst,'reload schema';\nCOMMIT;\nSELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='"+version+"';\n";
 assert.equal(await readFile(new URL('verification/'+stem+'.install.sql',root),'utf8'),install,'Saved atomic install differs from exact renderer');
 const installed=await db.exec(install);assert.equal(installed.at(-1).rows[0].installed_addon_migrations,1);
 const afterInstall=await snapshot();for(const [name,oldRows] of Object.entries(beforePreflight)){const installedRows=name==='supabase_migrations.schema_migrations'?afterInstall[name].filter(row=>row.version!==version):afterInstall[name];assert.deepEqual(installedRows,oldRows,'Exact install changed preexisting rows: '+name);}
 const catalogAfter=await funcs(),byOid=new Map(catalogAfter.map(x=>[x.oid,x]));for(const old of catalogBefore)assert.deepEqual(byOid.get(old.oid),old,'Old grant, identity or definition changed: '+old.name);
 for(const table of ['security_deposit_books','security_deposit_events','security_deposit_requests'])assert.equal(await val('SELECT count(*)::int FROM irp_pms.'+table),0);
 const beforeProof=await snapshot(),proof=await readFile(new URL('verification/'+stem+'.rollback.sql',root),'utf8'),proofResult=await db.exec(proof);
 assert.ok(proofResult.some(x=>x.rows?.some(row=>row.verification==='security_deposit_rejection_helper_self_test_passed')),'Missing rejection helper self-test marker');
 assert.ok(proofResult.some(x=>x.rows?.some(row=>row.verification==='security_deposit_transaction_proof_passed')),'Missing rollback proof success marker');
 assert.deepEqual(await snapshot(),beforeProof,'Proof retained a fixture or changed existing data/identity');
 // Mutate only the proof helper: do the real event write, then lose its JSON.
 // The positive checks must reject NULL/missing fields, even after real success.
 const postReturn=/ RETURN public\.irp_pms_pilot_record_security_deposit\([^\n]+;/;assert.ok(postReturn.test(proof));
 const missingResultProof=proof.replace(postReturn,line=>line.replace(' RETURN ',' PERFORM ')+"RETURN '{}'::jsonb;");
 let missingResultError;try{await db.exec(missingResultProof)}catch(e){missingResultError=e}finally{await db.exec('ROLLBACK')}
 assert.ok(missingResultError,'Proof accepted an empty financial result');assert.equal(missingResultError.code,'P0001');assert.match(missingResultError.message,/First hotel receipt result is incomplete/);assert.deepEqual(await snapshot(),beforeProof);
 const exhaustionAssertion=" PERFORM pg_temp.irp172_assert(x->'book'->'totals'='{\"received_minor\":10000,\"refunded_minor\":10000";assert.equal(proof.split(exhaustionAssertion).length,2);
 const missingBookProof=proof.replace(exhaustionAssertion," d:=d-'book';\n"+exhaustionAssertion);
 let missingBookError;try{await db.exec(missingBookProof)}catch(e){missingBookError=e}finally{await db.exec('ROLLBACK')}
 assert.ok(missingBookError,'Proof accepted a missing exhausted book');assert.equal(missingBookError.code,'P0001');assert.match(missingBookError.message,/Exhausted home book or target is incomplete/);assert.deepEqual(await snapshot(),beforeProof);
 // Retain synthetic proof fixtures only in this scratch database, solely to
 // exercise shutdown. The distributed live proof always ends ROLLBACK.
 await db.exec(proof.replace(/ROLLBACK;\s*$/,'COMMIT;'));
 const fixture=(await q("SELECT t.id tenant_id,m.user_id FROM irp_pms.tenants t JOIN irp_pms.memberships m ON m.tenant_id=t.id WHERE t.name='Transaction-only172 security deposits'"))[0];assert.ok(fixture);
 const home=(await q("SELECT p.id property_id,r.id reservation_id FROM irp_pms.properties p JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id WHERE p.tenant_id=$1 AND p.operating_model='whole_home'",[fixture.tenant_id]))[0];assert.ok(home);
 const ownReceipt=(await q("SELECT request_id FROM irp_pms.security_deposit_requests WHERE tenant_id=$1 AND property_id=$2 AND outcome='recorded' ORDER BY recorded_at LIMIT 1",[fixture.tenant_id,home.property_id]))[0];
 const beforeShutdown=await funcs(),rowsBeforeShutdown=await snapshot(),shutdown=await readFile(new URL('rollbacks/'+stem+'.shutdown.sql',root),'utf8');await db.exec(shutdown);assert.deepEqual(await snapshot(),rowsBeforeShutdown,'Shutdown altered data');
 const changed=[];for(const after of await funcs()){const prior=beforeShutdown.find(x=>x.oid===after.oid);if(JSON.stringify(prior)!==JSON.stringify(after)){changed.push(after.name);assert.equal(after.authenticated,false);assert.equal(after.anon,false);assert.equal(after.service_role,false);assert.equal(after.definition,prior.definition);}}
 assert.deepEqual(changed,['public.irp_pms_pilot_record_security_deposit']);
 const post=(c,id=randomUUID())=>val('SELECT public.irp_pms_pilot_record_security_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[fixture.tenant_id,home.property_id,c.reservation_id,id,c.expected_version,c.expected_recording_time_zone,c.expected_recording_date,c.kind,c.amount_minor,c.method,c.reference,c.reason,c.target_event_id,c.confirmed]);
 await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[fixture.user_id]);await db.exec('SET ROLE authenticated');
 const detail=await val('SELECT public.irp_pms_pilot_security_deposit($1,$2,$3)',[fixture.tenant_id,home.property_id,home.reservation_id]);assert.equal(detail.version,2);assert.equal(detail.totals.held_minor,0);
 const register=await val('SELECT public.irp_pms_pilot_security_deposit_register($1,$2)',[fixture.tenant_id,home.property_id]);assert.equal(register.summary.book_count,1);
 const activity=await val('SELECT public.irp_pms_pilot_security_deposit_activity($1,$2,$3,$3::date+1)',[fixture.tenant_id,home.property_id,detail.recording_date]);assert.equal(activity.totals.event_count,2);
 assert.equal((await val('SELECT public.irp_pms_pilot_security_deposit_request_status($1,$2,$3)',[fixture.tenant_id,home.property_id,ownReceipt.request_id])).found,true);
 const c={reservation_id:home.reservation_id,expected_version:detail.version,expected_recording_time_zone:detail.recording_time_zone,expected_recording_date:detail.recording_date,kind:'external_receipt',amount_minor:1,method:'cash',reference:'TEST shutdown record',reason:'Shutdown must not post money',target_event_id:null,confirmed:true},request=randomUUID();
 await fails(()=>post(c,request),'42501');
 const retirement=await val('SELECT public.irp_pms_pilot_retire_security_deposit_request($1,$2,$3,$4,$5,$6)',[fixture.tenant_id,home.property_id,home.reservation_id,request,c,'Stop retrying during financial shutdown']);assert.equal(retirement.outcome,'retired');assert.equal(retirement.financial_changed,false);assert.equal(retirement.book_version_changed,false);
 const retiredStatus=await val('SELECT public.irp_pms_pilot_security_deposit_request_status($1,$2,$3)',[fixture.tenant_id,home.property_id,request]);assert.equal(retiredStatus.found,true);assert.deepEqual(retiredStatus.result,retirement);
 const afterDetail=await val('SELECT public.irp_pms_pilot_security_deposit($1,$2,$3)',[fixture.tenant_id,home.property_id,home.reservation_id]);assert.deepEqual(afterDetail.book,detail.book);assert.deepEqual(afterDetail.events,detail.events);
 await fails(()=>post(c,request),'42501');await db.exec('RESET ROLE');
 const afterShutdownRetirement=await snapshot();for(const [name,rows] of Object.entries(rowsBeforeShutdown)){if(!['irp_pms.security_deposit_requests','irp_pms.activity'].includes(name))assert.deepEqual(afterShutdownRetirement[name],rows,'Shutdown retirement changed '+name);}
 assert.equal(afterShutdownRetirement['irp_pms.security_deposit_requests'].length,rowsBeforeShutdown['irp_pms.security_deposit_requests'].length+1);
 assert.equal(afterShutdownRetirement['irp_pms.activity'].length,rowsBeforeShutdown['irp_pms.activity'].length+1);
 const result={passed:true,preflight:preflightResult.at(-1).rows,install_old_rows_preserved:true,rollback_proof_passed:true,proof_rejection_helper_and_null_result_mutations_passed:true,proof_missing_exhausted_book_mutation_rejected:true,all_existing_catalog_identity_acl_definition_preserved:true,all_pms_auth_receipt_rows_restored:true,mirrored_existing_service_grants:mirrored,shutdown_changed_functions:changed,shutdown_all_reads_and_nonfinancial_retirement_passed:true,migration_sha256:hash(migration),install_sha256:hash(install),proof_sha256:hash(proof),shutdown_sha256:hash(shutdown),scope:'Exact local172 install with observed legacy grant profile; transaction-only public hotel/home deposit and retirement proof; targeted financial shutdown. Separate retained fixtures exist only in scratch PGlite. No live action or native contention claim.'};
 if(process.env.DEPOSIT_ROLLBACK_RESULT_PATH)await writeFile(process.env.DEPOSIT_ROLLBACK_RESULT_PATH,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message,error.code??'',error.where??'',error.internalQuery??'');process.exitCode=1;}finally{await db.close()}
