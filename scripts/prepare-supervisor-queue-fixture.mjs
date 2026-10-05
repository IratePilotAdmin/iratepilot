// Generates scoped manual SQL. Never executes SQL or handles credentials.
import {randomUUID} from 'node:crypto';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {actors,project,baseline,hashes,validateQueueFixture} from './supervisor-queue-qualification-config.mjs';
const [directory,...extra]=process.argv.slice(2);
if(!directory||extra.length)throw Error('Provide one empty output directory; target is fixed');
const root=resolve(directory);await mkdir(root,{recursive:true});if((await readdir(root)).length)throw Error('Output directory must be empty');
const now=Date.now(),f=validateQueueFixture({project_ref:project,purpose:'isolated-supervisor-queue-recovery',tenant_id:randomUUID(),property_id:randomUUID(),owner_id:actors.owner,manager_id:actors.manager,staff_id:actors.staff,generated_at:new Date(now).toISOString(),expires_at:new Date(now+30*60_000).toISOString(),queue_hash:hashes.queue,review_hash:hashes.review,fault:'manager-membership-demotion-after-claim'});
const suffix=f.tenant_id.replaceAll('-',''),expiry=`queue_fixture_expiry_${suffix}`,demote=`queue_fixture_demote_${suffix}`,label=`Synthetic queue recovery ${suffix}`;
const header=`-- MANUAL isolated project ${project} only. Never execute on live PMS.\n-- Generated ${f.generated_at}; expires ${f.expires_at}. No credentials.\n`;
const check=`DO $check$ BEGIN
 IF clock_timestamp()>='${f.expires_at}'::timestamptz-interval '2 minutes' THEN RAISE EXCEPTION 'Fresh fixture required'; END IF;
 IF md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_queue(integer,text,boolean)'::regprocedure))<>'${hashes.queue}' OR md5(pg_get_functiondef('public.irp_pms_pilot_revenue_supervisor_review(uuid,uuid,uuid,bigint,text,uuid)'::regprocedure))<>'${hashes.review}' THEN RAISE EXCEPTION 'Queue/review source mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='irp_pms_pilot_apply_revenue_decision') OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='irp_pms_pilot_apply_revenue_decision' AND (has_function_privilege('anon',p.oid,'execute') OR has_function_privilege('authenticated',p.oid,'execute') OR has_function_privilege('service_role',p.oid,'execute'))) THEN RAISE EXCEPTION 'Isolated pricing slice with disabled rate apply required'; END IF;
 IF (SELECT count(*) FROM auth.users WHERE id IN('${actors.owner}','${actors.manager}','${actors.staff}'))<>3 THEN RAISE EXCEPTION 'Protected test actors absent'; END IF;
END $check$;\n`;
const baselineCheck=`DO $baseline$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='${baseline.tenant}' AND name='${baseline.tenantName}') OR (SELECT count(*) FROM irp_pms.properties WHERE tenant_id='${baseline.tenant}')<>1 OR NOT EXISTS(SELECT 1 FROM irp_pms.properties WHERE tenant_id='${baseline.tenant}' AND id='${baseline.property}' AND name='${baseline.propertyName}') THEN RAISE EXCEPTION 'Earlier synthetic pricing scope mismatch'; END IF;
 IF (SELECT count(*) FROM irp_pms.memberships WHERE tenant_id='${baseline.tenant}')<>3 OR (SELECT count(*) FROM irp_pms.memberships WHERE tenant_id='${baseline.tenant}' AND ((user_id='${actors.owner}' AND role='owner') OR (user_id='${actors.manager}' AND role='manager') OR (user_id='${actors.staff}' AND role='staff')))<>3 THEN RAISE EXCEPTION 'Earlier synthetic pricing roles mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.memberships WHERE user_id IN('${actors.owner}','${actors.manager}','${actors.staff}') AND tenant_id NOT IN('${baseline.tenant}','${f.tenant_id}')) THEN RAISE EXCEPTION 'Unexpected additional actor scope'; END IF;
 IF (SELECT count(*) FROM irp_pms.room_types WHERE tenant_id='${baseline.tenant}' AND property_id='${baseline.property}')<>1 OR EXISTS(SELECT 1 FROM irp_pms.gateway_connections WHERE tenant_id IN('${baseline.tenant}','${f.tenant_id}')) OR EXISTS(SELECT 1 FROM irp_pms.revenue_shadow_snapshots WHERE tenant_id IN('${baseline.tenant}','${f.tenant_id}')) OR EXISTS(SELECT 1 FROM irp_pms.revenue_forecast_records WHERE tenant_id IN('${baseline.tenant}','${f.tenant_id}')) THEN RAISE EXCEPTION 'Synthetic observation source mismatch'; END IF;
END $baseline$;\n`;
const installData=header+'BEGIN;\n'+check+baselineCheck+`DO $check$ BEGIN
 IF EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}') OR EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_issues) OR EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_events) THEN RAISE EXCEPTION 'Fresh empty supervisor observation state required'; END IF;
END $check$;
INSERT INTO irp_pms.tenants(id,name) VALUES('${f.tenant_id}','${label}');
INSERT INTO irp_pms.properties(tenant_id,id,name,currency,time_zone) VALUES('${f.tenant_id}','${f.property_id}','${label}','USD','America/Chicago');
INSERT INTO irp_pms.memberships(tenant_id,user_id,role) VALUES('${f.tenant_id}','${actors.owner}','owner'),('${f.tenant_id}','${actors.manager}','manager'),('${f.tenant_id}','${actors.staff}','staff');
COMMIT;\n`;
const installGuards=header+check+`DO $check$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='${f.tenant_id}' AND name='${label}') OR NOT EXISTS(SELECT 1 FROM irp_pms.properties WHERE tenant_id='${f.tenant_id}' AND id='${f.property_id}' AND name='${label}') OR (SELECT count(*) FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}' AND ((user_id='${actors.owner}' AND role='owner') OR (user_id='${actors.manager}' AND role='manager') OR (user_id='${actors.staff}' AND role='staff')))<>3 THEN RAISE EXCEPTION 'Expected synthetic scope absent'; END IF;
END $check$;
CREATE FUNCTION irp_pms.${expiry}() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
BEGIN
 IF NEW.tenant_id='${f.tenant_id}'::uuid AND NEW.property_id='${f.property_id}'::uuid AND clock_timestamp()>='${f.expires_at}'::timestamptz THEN RAISE EXCEPTION 'Synthetic queue fixture expired' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $guard$;
CREATE FUNCTION irp_pms.${demote}() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
DECLARE n integer;
BEGIN
 IF NEW.tenant_id='${f.tenant_id}'::uuid AND NEW.property_id='${f.property_id}'::uuid AND NEW.actor_id='${actors.manager}'::uuid AND NEW.action='claim' THEN
  IF NEW.expected_revision IS DISTINCT FROM 3 OR NEW.receipt->>'revision' IS DISTINCT FROM '4' OR NOT EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_issues WHERE id=NEW.issue_id AND tenant_id='${f.tenant_id}'::uuid AND property_id='${f.property_id}'::uuid AND issue_key='capture_missing') THEN RAISE EXCEPTION 'Unexpected fixture fault phase'; END IF;
  UPDATE irp_pms.memberships SET role='staff' WHERE tenant_id='${f.tenant_id}'::uuid AND user_id='${actors.manager}'::uuid AND role='manager';
  GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Fixture-only demotion failed'; END IF;
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION irp_pms.${expiry}(),irp_pms.${demote}() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ${expiry} BEFORE INSERT OR UPDATE ON irp_pms.revenue_supervisor_issues FOR EACH ROW EXECUTE FUNCTION irp_pms.${expiry}();
CREATE TRIGGER ${expiry} BEFORE INSERT OR UPDATE ON irp_pms.revenue_supervisor_events FOR EACH ROW EXECUTE FUNCTION irp_pms.${expiry}();
CREATE TRIGGER ${demote} AFTER INSERT ON irp_pms.revenue_supervisor_events FOR EACH ROW EXECUTE FUNCTION irp_pms.${demote}();
`;
const audit=header+`SELECT jsonb_build_object('checked_at',clock_timestamp(),
 'issues',(SELECT jsonb_agg(jsonb_build_object('id',id,'key',issue_key,'revision',revision,'status',review_status,'assigned',assigned_to)) FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${f.tenant_id}' AND property_id='${f.property_id}'),
 'events',(SELECT jsonb_agg(jsonb_build_object('actor',actor_id,'action',action,'expected_revision',expected_revision,'receipt_revision',receipt->'revision','request',request_id) ORDER BY created_at,expected_revision) FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${f.tenant_id}' AND property_id='${f.property_id}'),
 'roles',(SELECT jsonb_agg(jsonb_build_object('actor',user_id,'role',role)) FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}'),
 'rate_apply_disabled',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='irp_pms_pilot_apply_revenue_decision' AND (has_function_privilege('anon',p.oid,'execute') OR has_function_privilege('authenticated',p.oid,'execute') OR has_function_privilege('service_role',p.oid,'execute')))) AS audit;\n`;
const cleanupData=header+`BEGIN;\n`+baselineCheck+`
DO $check$ BEGIN
 IF EXISTS(SELECT 1 FROM irp_pms.tenants WHERE id='${f.tenant_id}' AND name<>'${label}') OR EXISTS(SELECT 1 FROM irp_pms.properties WHERE tenant_id='${f.tenant_id}' AND (id<>'${f.property_id}' OR name<>'${label}')) THEN RAISE EXCEPTION 'Unexpected fixture identity'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}' AND user_id NOT IN('${actors.owner}','${actors.manager}','${actors.staff}')) OR EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${f.tenant_id}' AND (property_id<>'${f.property_id}' OR issue_key<>'capture_missing')) THEN RAISE EXCEPTION 'Unexpected fixture scope'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${baseline.tenant}') OR EXISTS(SELECT 1 FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${baseline.tenant}' AND (property_id<>'${baseline.property}' OR issue_key NOT IN('capture_missing','room_mapping') OR revision<>1 OR review_status<>'open' OR assigned_to IS NOT NULL OR NOT active)) THEN RAISE EXCEPTION 'Earlier synthetic observations changed; retain for review'; END IF;
END $check$;
-- Only queue observations created from the verified empty starting state.
-- Preserve all earlier pricing tenants, properties, room types, roles and rates.
DELETE FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${baseline.tenant}' AND property_id='${baseline.property}' AND issue_key IN('capture_missing','room_mapping');
DELETE FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${f.tenant_id}' AND property_id='${f.property_id}';
DELETE FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${f.tenant_id}' AND property_id='${f.property_id}' AND issue_key='capture_missing';
DELETE FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}' AND user_id IN('${actors.owner}','${actors.manager}','${actors.staff}');
DELETE FROM irp_pms.properties WHERE tenant_id='${f.tenant_id}' AND id='${f.property_id}' AND name='${label}';
DELETE FROM irp_pms.tenants WHERE id='${f.tenant_id}' AND name='${label}';
COMMIT;
SELECT jsonb_build_object('issues',(SELECT count(*) FROM irp_pms.revenue_supervisor_issues WHERE tenant_id='${f.tenant_id}'),'events',(SELECT count(*) FROM irp_pms.revenue_supervisor_events WHERE tenant_id='${f.tenant_id}'),'memberships',(SELECT count(*) FROM irp_pms.memberships WHERE tenant_id='${f.tenant_id}'),'properties',(SELECT count(*) FROM irp_pms.properties WHERE tenant_id='${f.tenant_id}'),'tenants',(SELECT count(*) FROM irp_pms.tenants WHERE id='${f.tenant_id}')) AS cleanup;\n`;
const cleanupGuards=header+`DROP TRIGGER IF EXISTS ${demote} ON irp_pms.revenue_supervisor_events;
DROP TRIGGER IF EXISTS ${expiry} ON irp_pms.revenue_supervisor_events;
DROP TRIGGER IF EXISTS ${expiry} ON irp_pms.revenue_supervisor_issues;
DROP FUNCTION IF EXISTS irp_pms.${demote}();
DROP FUNCTION IF EXISTS irp_pms.${expiry}();\n`;
for(const [name,content] of [['manifest.json',JSON.stringify(f,null,2)+'\n'],['install-data.sql',installData],['install-guards.sql',installGuards],['audit.sql',audit],['cleanup-data.sql',cleanupData],['cleanup-guards.sql',cleanupGuards]])await writeFile(join(root,name),content,{flag:'wx'});
console.log(JSON.stringify({project_ref:project,purpose:f.purpose,sql_executed:false,expires_at:f.expires_at}));
