// Builds on the existing bounded fixture; never executes SQL or reads credentials.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {actors,validateQueueFixture} from './supervisor-queue-qualification-config.mjs';
const [directory,...rest]=process.argv.slice(2);if(!directory||rest.length)throw Error('One empty directory required');
const made=spawnSync(process.execPath,[resolve(import.meta.dirname,'prepare-supervisor-queue-fixture.mjs'),directory],{encoding:'utf8'});if(made.status!==0)throw Error(made.stderr);
const root=resolve(directory),f=validateQueueFixture(JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'))),suffix=f.tenant_id.replaceAll('-',''),guard=`home_owner_demote_${suffix}`;
await appendFile(resolve(root,'install-guards.sql'),`
CREATE FUNCTION irp_pms.${guard}() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
DECLARE n integer;
BEGIN
 IF NEW.tenant_id='${f.tenant_id}'::uuid AND NEW.property_id='${f.property_id}'::uuid AND NEW.actor_id='${actors.owner}'::uuid AND NEW.action='claim' THEN
  IF NEW.expected_revision IS DISTINCT FROM 1 OR NEW.receipt->>'revision' IS DISTINCT FROM '2' OR NOT EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_issues WHERE id=NEW.issue_id AND tenant_id='${f.tenant_id}'::uuid AND property_id='${f.property_id}'::uuid AND issue_key='capture_missing') THEN RAISE EXCEPTION 'Unexpected Home fault phase'; END IF;
  UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='${f.tenant_id}'::uuid AND user_id='${actors.owner}'::uuid AND role='owner';
  GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'Fixture-only owner demotion failed';END IF;
 END IF;RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION irp_pms.${guard}() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ${guard} AFTER INSERT ON irp_pms.revenue_supervisor_events FOR EACH ROW EXECUTE FUNCTION irp_pms.${guard}();
`);
await appendFile(resolve(root,'cleanup-guards.sql'),`DROP TRIGGER IF EXISTS ${guard} ON irp_pms.revenue_supervisor_events;
DROP FUNCTION IF EXISTS irp_pms.${guard}();
`);
await writeFile(resolve(root,'restore-owner.sql'),`DO $restore$
DECLARE n integer;
BEGIN
 IF clock_timestamp()>='${f.expires_at}'::timestamptz-interval '2 minutes' THEN RAISE EXCEPTION 'Fixture expired';END IF;
 IF (SELECT count(*) FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${f.tenant_id}' AND property_id='${f.property_id}')<>1 OR NOT EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_events e JOIN irp_pms.revenue_supervisor_issues i ON i.id=e.issue_id WHERE e.tenant_id='${f.tenant_id}' AND e.property_id='${f.property_id}' AND e.actor_id='${actors.owner}' AND e.action='claim' AND e.expected_revision=1 AND e.receipt->>'revision'='2' AND i.revision=2 AND i.assigned_to='${actors.owner}' AND i.review_status='in_review') THEN RAISE EXCEPTION 'Unexpected restore state';END IF;
 UPDATE irp_pms.memberships SET role='owner' WHERE tenant_id='${f.tenant_id}' AND user_id='${actors.owner}' AND role='staff';GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'Unexpected role';END IF;
END $restore$;
`);
console.log(JSON.stringify({status:'home-recovery-fixture-prepared',scope:f.tenant_id,expires_at:f.expires_at,sql_executed:false}));
