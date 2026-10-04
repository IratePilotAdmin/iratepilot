// Generates manual SQL only. No network, credentials, Auth changes or SQL execution.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const [directory,...extra]=process.argv.slice(2);
assert.ok(directory&&!extra.length,'Provide one empty output directory');
const root=resolve(directory);await mkdir(root,{recursive:true});assert.equal((await readdir(root)).length,0,'Output directory must be empty');
const generatedAt=Date.now();
const fixture={project_ref:'ybehrayzwzyufxbxcysq',purpose:'isolated-supervisor-review-race',tenant_id:randomUUID(),property_id:randomUUID(),issue_id:randomUUID(),
 owner_id:'7e3ac7b8-3286-4fcb-aaa9-a850390d787c',manager_id:'fe6502af-b9a2-478d-abad-bfbec8539df6',staff_id:'451c631e-2e3f-4293-b78c-e1bb92087f20',
 initial_revision:1,initial_status:'open',initial_assignee:null,generated_at:new Date(generatedAt).toISOString(),expires_at:new Date(generatedAt+30*60_000).toISOString()};
const f=fixture,suffix=f.issue_id.replaceAll('-',''),guard=`review_fixture_guard_${suffix}`,label=`Synthetic supervisor fixture ${suffix}`;
const header=`-- MANUAL isolated branch only: ${f.project_ref}. Never execute against live PMS.\n-- Generated ${f.generated_at}; expires ${f.expires_at}. No credentials included.\n`;
const install=header+`BEGIN;
DO $check$
BEGIN
 IF clock_timestamp()>='${f.expires_at}'::timestamptz-interval '2 minutes' THEN RAISE EXCEPTION 'Generate a fresh fixture'; END IF;
 IF md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_review(uuid,uuid,uuid,bigint,text,uuid)'::regprocedure))<>'ae12f9df71b5335f86614494ff07dff8' THEN RAISE EXCEPTION 'Review source mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='irp_pms_pilot_apply_revenue_decision') THEN RAISE EXCEPTION 'Isolated pricing slice required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='irp_pms_pilot_apply_revenue_decision' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Rate apply must remain disabled'; END IF;
 IF (SELECT count(*) FROM auth.users WHERE id IN('${f.owner_id}','${f.manager_id}','${f.staff_id}'))<>3 THEN RAISE EXCEPTION 'Expected test actors absent'; END IF;
END $check$;
INSERT INTO irp_pms.tenants(id,name) VALUES('${f.tenant_id}','${label}');
INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES('${f.tenant_id}','${f.property_id}','${label}','USD','America/Chicago');
INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES('${f.tenant_id}','${f.owner_id}','owner'),('${f.tenant_id}','${f.manager_id}','manager'),('${f.tenant_id}','${f.staff_id}','staff');
INSERT INTO irp_pms.revenue_supervisor_issues(id,tenant_id,property_id,issue_key,priority,title,detail,fingerprint,first_seen_at,observed_at)
VALUES('${f.issue_id}','${f.tenant_id}','${f.property_id}','synthetic-claim-race','attention','Synthetic review race','Not a hotel operating issue','${suffix}',clock_timestamp(),clock_timestamp());
CREATE FUNCTION irp_pms.${guard}() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
BEGIN
 IF NEW.tenant_id='${f.tenant_id}'::uuid AND NEW.property_id='${f.property_id}'::uuid AND clock_timestamp()>='${f.expires_at}'::timestamptz THEN RAISE EXCEPTION 'Synthetic fixture expired' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION irp_pms.${guard}() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ${guard} BEFORE INSERT OR UPDATE ON irp_pms.revenue_supervisor_issues FOR EACH ROW EXECUTE FUNCTION irp_pms.${guard}();
CREATE TRIGGER ${guard} BEFORE INSERT OR UPDATE ON irp_pms.revenue_supervisor_events FOR EACH ROW EXECUTE FUNCTION irp_pms.${guard}();
COMMIT;
`;
const audit=header+`SELECT jsonb_build_object(
 'issue',(SELECT jsonb_build_object('revision',revision,'status',review_status,'assigned_to',assigned_to) FROM irp_pms.revenue_supervisor_issues WHERE id='${f.issue_id}' AND tenant_id='${f.tenant_id}' AND property_id='${f.property_id}'),
 'events',(SELECT jsonb_agg(jsonb_build_object('request_id',request_id,'actor_id',actor_id,'action',action,'expected_revision',expected_revision,'receipt_revision',receipt->'revision') ORDER BY created_at) FROM irp_pms.revenue_supervisor_events WHERE issue_id='${f.issue_id}' AND tenant_id='${f.tenant_id}' AND property_id='${f.property_id}'),
 'rate_apply_disabled',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='irp_pms_pilot_apply_revenue_decision' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE')))
) AS audit;
`;
const cleanup=header+`BEGIN;
DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='${f.tenant_id}' AND name<>'${label}') THEN RAISE EXCEPTION 'Unexpected tenant identity'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.properties WHERE tenant_id='${f.tenant_id}' AND (id<>'${f.property_id}' OR name<>'${label}')) THEN RAISE EXCEPTION 'Unexpected property in fixture scope'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${f.tenant_id}' AND id<>'${f.issue_id}') THEN RAISE EXCEPTION 'Unexpected issue in fixture scope'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}' AND user_id NOT IN('${f.owner_id}','${f.manager_id}','${f.staff_id}')) THEN RAISE EXCEPTION 'Unexpected membership in fixture scope'; END IF;
END $check$;
DELETE FROM irp_pms.revenue_supervisor_events WHERE issue_id='${f.issue_id}' AND tenant_id='${f.tenant_id}' AND property_id='${f.property_id}';
DELETE FROM irp_pms.revenue_supervisor_issues WHERE id='${f.issue_id}' AND tenant_id='${f.tenant_id}' AND property_id='${f.property_id}';
DELETE FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}' AND user_id IN('${f.owner_id}','${f.manager_id}','${f.staff_id}');
DELETE FROM irp_pms.properties WHERE tenant_id='${f.tenant_id}' AND id='${f.property_id}' AND name='${label}';
DELETE FROM irp_pms.tenants WHERE id='${f.tenant_id}' AND name='${label}';
DROP TRIGGER IF EXISTS ${guard} ON irp_pms.revenue_supervisor_events;
DROP TRIGGER IF EXISTS ${guard} ON irp_pms.revenue_supervisor_issues;
DROP FUNCTION IF EXISTS irp_pms.${guard}();
COMMIT;
SELECT jsonb_build_object('issues',(SELECT count(*) FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${f.tenant_id}'),'events',(SELECT count(*) FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${f.tenant_id}'),'memberships',(SELECT count(*) FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}'),'properties',(SELECT count(*) FROM irp_pms.properties WHERE tenant_id='${f.tenant_id}'),'tenants',(SELECT count(*) FROM irp_pms.tenants WHERE id='${f.tenant_id}')) AS cleanup;
`;
for(const [name,content] of [['manifest.json',JSON.stringify(f,null,2)+'\n'],['install.sql',install],['audit.sql',audit],['cleanup.sql',cleanup]])await writeFile(join(root,name),content,{flag:'wx'});
console.log(JSON.stringify({project_ref:f.project_ref,purpose:f.purpose,expires_at:f.expires_at,sql_executed:false}));
