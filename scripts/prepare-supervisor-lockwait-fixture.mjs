// Generates manual, expiring SQL and a scheduled HTTP manifest. No network or credentials.
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {validateLockwaitFixture} from './supervisor-lockwait-config.mjs';
const [directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw Error('One empty fixture directory required');
const root=resolve(directory);
const result=spawnSync(process.execPath,[resolve(import.meta.dirname,'prepare-supervisor-review-fixture.mjs'),root],{encoding:'utf8'});
if(result.status!==0)throw Error('Fresh base fixture preparation failed');
const original=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const f=validateLockwaitFixture({...original,purpose:'isolated-supervisor-lockwait',start_at:new Date(Date.parse(original.generated_at)+180000).toISOString(),review_hash:'ae12f9df71b5335f86614494ff07dff8',requests:{denied:randomUUID(),claim:randomUUID(),release:randomUUID()}});
await writeFile(join(root,'manifest.json'),JSON.stringify(f,null,2)+'\n');
const header=`-- MANUAL isolated ${f.project_ref} only. Fresh fixture required. No credentials.\n`;
const probe='review_lockwait_probe_'+f.issue_id.replaceAll('-','');
const install=await readFile(join(root,'install.sql'),'utf8');
await writeFile(join(root,'install.sql'),install.replace('COMMIT;',`CREATE TABLE irp_pms.${probe}(phase text PRIMARY KEY CHECK(phase IN('new','replay')),observation jsonb NOT NULL);
ALTER TABLE irp_pms.${probe} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.${probe} FROM PUBLIC,anon,authenticated,service_role;
COMMIT;`));
const cleanup=await readFile(join(root,'cleanup.sql'),'utf8');
await writeFile(join(root,'cleanup.sql'),cleanup.replace('COMMIT;',`DROP TABLE IF EXISTS irp_pms.${probe};\nCOMMIT;`));
await writeFile(join(root,'audit.sql'),(await readFile(join(root,'audit.sql'),'utf8'))+`SELECT phase,observation FROM irp_pms.${probe} ORDER BY phase;\n`);
function restore(count){return header+`BEGIN; DO $restore$ DECLARE n integer; BEGIN
 IF clock_timestamp()>='${f.expires_at}'::timestamptz THEN RAISE EXCEPTION 'Expired fixture'; END IF;
 IF (SELECT count(*) FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${f.tenant_id}' AND property_id='${f.property_id}')<>${count} THEN RAISE EXCEPTION 'Unexpected event count'; END IF;
 UPDATE irp_pms.memberships SET role='manager' WHERE tenant_id='${f.tenant_id}' AND user_id='${f.manager_id}' AND role='staff'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Unexpected fixture membership'; END IF;
 END $restore$; SELECT clock_timestamp() AS restored_at; COMMIT;\n`;}
function holder(offset,count){const at=new Date(Date.parse(f.start_at)+offset).toISOString();return header+`-- Start between ${new Date(Date.parse(at)-10000).toISOString()} and ${at}; at most 25 seconds.
BEGIN; SET LOCAL statement_timeout='25s'; SET LOCAL lock_timeout='2s';
DO $holder$ DECLARE stop_at timestamptz; seen jsonb; n integer; BEGIN
 IF clock_timestamp()<'${at}'::timestamptz-interval '10 seconds' OR clock_timestamp()>='${at}'::timestamptz THEN RAISE EXCEPTION 'Outside holder start window'; END IF;
 IF md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_review(uuid,uuid,uuid,bigint,text,uuid)'::regprocedure))<>'${f.review_hash}' THEN RAISE EXCEPTION 'Review source mismatch'; END IF;
 IF (SELECT role FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}' AND user_id='${f.manager_id}') IS DISTINCT FROM 'manager' OR (SELECT count(*) FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${f.tenant_id}' AND property_id='${f.property_id}')<>${count} THEN RAISE EXCEPTION 'Unexpected phase'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('${f.tenant_id}/${f.property_id}',0));
 stop_at:='${at}'::timestamptz+interval '10 seconds';
 LOOP
  SELECT jsonb_agg(jsonb_build_object('pid',a.pid,'wait_event',a.wait_event,'wait_event_type',a.wait_event_type,'observed_at',clock_timestamp())) INTO seen FROM pg_stat_activity a WHERE pg_backend_pid()=ANY(pg_blocking_pids(a.pid)) AND a.wait_event_type='Lock' AND a.wait_event='advisory' AND a.usename='authenticator' AND a.query LIKE '%irp_pms_pilot_revenue_supervisor_review%';
  EXIT WHEN seen IS NOT NULL;
  IF clock_timestamp()>stop_at THEN RAISE EXCEPTION 'No HTTP advisory wait observed; revocation withheld'; END IF;
  PERFORM pg_sleep(0.1); PERFORM pg_stat_clear_snapshot();
 END LOOP;
 IF jsonb_array_length(seen)<>1 THEN RAISE EXCEPTION 'Ambiguous waiters; revocation withheld'; END IF;
 UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='${f.tenant_id}' AND user_id='${f.manager_id}' AND role='manager'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Fixture-only revocation failed'; END IF;
 INSERT INTO irp_pms.${probe}(phase,observation) VALUES('${count===0?'new':'replay'}',jsonb_build_object('waiters',seen,'revoked_at',clock_timestamp(),'expected_events',${count}));
END $holder$;
SELECT observation FROM irp_pms.${probe} WHERE phase='${count===0?'new':'replay'}'; COMMIT;\n`;}
for(const [name,content] of [['hold-new.sql',holder(0,0)],['restore-before-claim.sql',restore(0)],['hold-replay.sql',holder(60000,1)],['restore-before-replay.sql',restore(1)]])await writeFile(join(root,name),content,{flag:'wx'});
console.log(JSON.stringify({project_ref:f.project_ref,start_at:f.start_at,expires_at:f.expires_at,sql_executed:false,cleanup_required:true}));
