// Local deterministic artifact generation; no network, credentials or live SQL.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_DIST)throw Error('Set PGLITE_DIST');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_DIST+'/index.js'));
const {pgcrypto}=await import(pathToFileURL(process.env.PGLITE_DIST+'/contrib/pgcrypto.js'));
const db=new PGlite({extensions:{pgcrypto}}),root=new URL('../supabase/',import.meta.url),version='202609070173',stem=version+'_iratepilot_pms_guest_documents';
const quote=x=>"'"+String(x).replaceAll("'","''")+"'",hash=(kind,x)=>createHash(kind).update(x).digest('hex');
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 const files=(await readdir(new URL('migrations/',root))).filter(n=>/^202609070(14[2-7]|149|15[0-6]|158|159|16[0-9]|170|171|172)_iratepilot_pms_/.test(n)).sort();
 for(const f of files)await db.exec(await readFile(new URL('migrations/'+f,root),'utf8'));
 const observed=JSON.parse(await readFile(new URL('preflights/202609070172_iratepilot_pms_security_deposits.grants.json',root),'utf8'));
 const priorSource=await readFile(new URL('migrations/202609070172_iratepilot_pms_security_deposits.sql',root),'utf8');
 const names=[...new Set(['irp_pms.normalize_guest_data','public.irp_pms_pilot_guest_profile','public.irp_pms_pilot_reservation_guest','public.irp_pms_pilot_save_guest_profile','public.irp_pms_pilot_save_reservation_guest','public.irp_pms_pilot_folio',...observed.functions.map(x=>x.signature.split('(')[0]),...[...priorSource.matchAll(/^CREATE FUNCTION ([a-z_.]+)\(/gm)].map(x=>x[1])])];
 const rows=(await db.query("SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' signature,p.prosrc,p.prosecdef,p.provolatile,array_to_string(p.proconfig,',') config,p.prorettype::regtype::text returns,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service_role FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname=ANY($1::text[]) ORDER BY 1",[names])).rows;
 if(rows.length!==65)throw Error('Expected65 effective172 functions');
 const key=x=>x.replaceAll(' ','').replace(/^public\./,'');let inherited=0;
 for(const row of rows){const old=observed.functions.find(x=>key(x.signature)===key(row.signature));if(!old)continue;if(old.anon!==row.anon||old.authenticated!==row.authenticated)throw Error('Unexpected inherited ACL '+row.signature);if(old.service_role!==row.service_role){if(row.service_role||!old.service_role)throw Error('Unexpected inherited service ACL');row.service_role=true;inherited++;}}
 if(inherited!==8)throw Error('Expected eight observed retained service grants');
 // Root's read-only hosted inventory of all153 scoped functions, observed
 // 2026-09-08T04:25:02.915Z, confirms one additional grant in this65 subset.
 // Pin the observation as an expectation only; the install never grants old functions.
 const observedCapture={observed_at:'2026-09-08T04:25:02.915Z',sha256:'490df5d1a58fcd1459e84dea557f7b245f277a2e3710bbeae9c8843a18a7c677',scoped_functions:153,scoped_service_grants:30};
 const folio=rows.find(row=>key(row.signature)==='irp_pms_pilot_folio(uuid,uuid,uuid)');
 if(!folio||folio.anon||!folio.authenticated||folio.service_role)throw Error('Unexpected frozen local folio grant profile');
 folio.service_role=true;
 if(rows.filter(row=>row.service_role).length!==10)throw Error('Expected ten observed service grants in selected65 functions');
 const columns=(await db.query("SELECT c.relname table_name,md5(jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated) ORDER BY a.attnum)::text) columns_md5 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname='irp_pms' AND c.relkind='r' GROUP BY c.relname ORDER BY c.relname")).rows;
 if(columns.length!==53)throw Error('Expected53 installed PMS tables');
 const values=rows.map(r=>'('+[quote(r.signature),quote(hash('md5',r.prosrc.replace(/\r\n?/g,'\n'))),r.prosecdef,quote(r.provolatile),quote(r.config),quote(r.returns),r.anon,r.authenticated,r.service_role].join(',')+')').join(',\n ');
 const columnValues=columns.map(r=>'('+quote(r.table_name)+','+quote(r.columns_md5)+')').join(',\n ');
 const preflight=[
 '-- Read-only173 preflight. Frozen172 effective definitions, observed retained',
 '-- grants and53 table column shapes; no configuration or financial mutation.',
 'DO $preflight$',
 'DECLARE expected record;actual record;matched integer;column_hash text;',
 'BEGIN',
 " IF to_regprocedure('public.irp_pms_pilot_guest_documents(uuid,uuid,uuid)') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='irp_pms' AND p.proname LIKE 'guest_document_%') THEN RAISE EXCEPTION 'Guest-documents173 functions already exist; inspect before proceeding';END IF;",
 " IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'Migration receipt table is required';END IF;",
 ' SELECT count(*) INTO matched FROM supabase_migrations.schema_migrations WHERE version IN ('+files.map(f=>quote(f.slice(0,12))).join(',')+');',
 " IF matched<>29 OR EXISTS(SELECT1 FROM supabase_migrations.schema_migrations WHERE version='202609070173') THEN RAISE EXCEPTION 'Require all29 installed destination add-ons through172 and no173 receipt';END IF;".replace('SELECT1','SELECT 1'),
 ' FOR expected IN SELECT * FROM (VALUES\n '+values+'\n ) e(signature,body_md5,definer,volatility,config,returns,anon,authenticated,service_role) LOOP',
 "  SELECT p.*,array_to_string(p.proconfig,',') config_string,p.prorettype::regtype::text return_name INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);",
 "  IF NOT FOUND OR md5(regexp_replace(actual.prosrc,E'\\r\\n?',E'\\n','g')) IS DISTINCT FROM expected.body_md5 OR actual.prosecdef IS DISTINCT FROM expected.definer OR actual.provolatile::text IS DISTINCT FROM expected.volatility OR actual.config_string IS DISTINCT FROM expected.config OR actual.return_name IS DISTINCT FROM expected.returns THEN RAISE EXCEPTION 'Effective172 definition differs: %',expected.signature;END IF;",
 "  IF has_function_privilege('anon',actual.oid,'EXECUTE') IS DISTINCT FROM expected.anon OR has_function_privilege('authenticated',actual.oid,'EXECUTE') IS DISTINCT FROM expected.authenticated OR has_function_privilege('service_role',actual.oid,'EXECUTE') IS DISTINCT FROM expected.service_role THEN RAISE EXCEPTION 'Effective172 execution grants differ: %',expected.signature;END IF;",
 ' END LOOP;',
 ' FOR expected IN SELECT * FROM (VALUES\n '+columnValues+'\n ) e(table_name,columns_md5) LOOP',
 "  SELECT md5(jsonb_agg(jsonb_build_array(a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated) ORDER BY a.attnum)::text) INTO column_hash FROM pg_attribute a WHERE a.attrelid=to_regclass('irp_pms.'||expected.table_name) AND a.attnum>0 AND NOT a.attisdropped;",
 "  IF column_hash IS DISTINCT FROM expected.columns_md5 THEN RAISE EXCEPTION 'Effective172 column shape differs: %',expected.table_name;END IF;",
 ' END LOOP;',
 " IF NOT EXISTS(SELECT1 FROM auth.users u JOIN irp_pms.memberships m ON m.user_id=u.id WHERE m.tenant_id='faa76112-c793-43db-92bd-f9faecd8d93a' AND m.role='owner' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmed test organization owner required for transaction-only proof';END IF;".replace('SELECT1','SELECT 1'),
 'END $preflight$;',
 "SELECT 'guest_documents_preflight_passed' AS verification;",''
 ].join('\n');
 await writeFile(new URL('preflights/'+stem+'.sql',root),preflight);
 await writeFile(new URL('preflights/'+stem+'.grants.json',root),JSON.stringify({source:'Frozen installed172 definitions and exact65-function subset of the observed hosted execution profile. Ten selected service grants are retained; nine differ from local migration defaults, including the existing folio grant. No old ACL change or broadened access.',observed_capture:observedCapture,selected_service_grants:10,local_service_grants_to_mirror:9,functions:rows.map(({signature,anon,authenticated,service_role})=>({signature,anon,authenticated,service_role}))},null,2)+'\n');
 const sql=await readFile(new URL('migrations/'+stem+'.sql',root),'utf8'),begin=sql.indexOf('BEGIN;');if(begin<0||!sql.endsWith('COMMIT;\n'))throw Error('Expected atomic migration');
 const body=sql.slice(begin+7,-8);
 const install="BEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\n"+preflight+'\n'+body+"\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('"+version+"','iratepilot_pms_guest_documents',ARRAY["+quote(body)+"]);\nNOTIFY pgrst,'reload schema';\nCOMMIT;\nSELECT count(*) AS installed_addon_migrations FROM supabase_migrations.schema_migrations WHERE version='"+version+"';\n";
 await writeFile(new URL('verification/'+stem+'.install.sql',root),install);
 const manifest={migration_sha256:hash('sha256',sql),install_sha256:hash('sha256',install),preflight_sha256:hash('sha256',preflight),preflight_definitions:rows.length,preflight_table_shapes:columns.length,prerequisite_receipts:files.length};
 await writeFile(new URL('verification/'+stem+'.manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
}finally{await db.close()}
