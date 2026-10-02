import {readFileSync} from 'node:fs';
import {createRevenueQualificationDatabase} from './fixtures/revenue-qualification-database';
import {expect,test} from 'vitest';

test('native audited-save rehearsal rolls back all fixture and failure-injection changes',async()=>{
 const db=await createRevenueQualificationDatabase();
 try{
  const result=await db.exec(readFileSync('scripts/revenue-audited-rollback-qualification.sql','utf8'));
  const qualification=result.flatMap(r=>r.rows).find(r=>'qualification' in r)?.qualification as {passed:number;signed_http_write_qualified:boolean;persistent_writes:boolean};
  expect(qualification).toMatchObject({passed:12,signed_http_write_qualified:false,persistent_writes:false});
  const state=(await db.query(`SELECT
   (SELECT count(*)::integer FROM irp_pms.rooms) rooms,
   (SELECT count(*)::integer FROM irp_pms.reservations) reservations,
   (SELECT count(*)::integer FROM irp_pms.nightly_rates) rates,
   (SELECT count(*)::integer FROM irp_pms.rate_actions) actions,
   (SELECT count(*)::integer FROM irp_pms.activity) activities,
   (SELECT count(*)::integer FROM irp_pms.revenue_rate_decisions) decisions,
   (SELECT count(*)::integer FROM irp_pms.properties) properties,
   (SELECT version::integer FROM irp_pms.rate_plans) version,
   EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='qualification_audit_failure') injected_trigger,
   has_function_privilege('authenticated','public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb)','execute') write_enabled`)).rows[0];
  expect(state).toEqual({rooms:0,reservations:0,rates:0,actions:0,activities:0,decisions:1,properties:1,version:1,injected_trigger:false,write_enabled:false});
 }finally{await db.close();}
},20000);
