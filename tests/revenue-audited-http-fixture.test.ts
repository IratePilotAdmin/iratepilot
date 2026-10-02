import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import {createRevenueQualificationDatabase} from './fixtures/revenue-qualification-database';
import {writeCommand,nextChicagoDay,parseAuditedWriteConfig,managerRequest,failureRequest} from './fixtures/revenue-http-write-commands';

test('isolated write wrapper bounds scope, expires, rolls back audit failure and restores disabled candidate',async()=>{
 const db=await createRevenueQualificationDatabase();
 const signature='public.irp_pms_pilot_apply_revenue_decision(uuid,uuid,uuid,uuid,bigint,date,bigint,bigint,bigint,bigint,bigint,integer,integer,integer,integer,integer,text,jsonb)';
 try{
  const original=(await db.query<{body:string}>('SELECT pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body;
  await db.exec(readFileSync('scripts/revenue-audited-http-fixture-setup.sql','utf8'));
  const day=(await db.query<{stay_day:string}>('SELECT stay_date::text AS stay_day FROM irp_pms.qualification_write_scope')).rows[0].stay_day;
  const owner='7e3ac7b8-3286-4fcb-aaa9-a850390d787c',manager='fe6502af-b9a2-478d-abad-bfbec8539df6',staff='451c631e-2e3f-4293-b78c-e1bb92087f20';
  const apply=(patch:Parameters<typeof writeCommand>[1]={})=>{
   const args=Object.values(writeCommand(day,patch));
   args[17]=JSON.stringify(args[17]);
   return db.query<{receipt:{replayed:boolean}}>(`SELECT public.irp_pms_pilot_apply_revenue_decision(${args.map((_,i)=>'$'+(i+1)).join(',')}) receipt`,args);
  };
  const actor=async(id:string)=>{
   await db.exec('RESET ROLE');
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);
   await db.exec('SET ROLE authenticated');
  };
  await actor(staff);
  await expect(apply()).rejects.toMatchObject({code:'42501'});
  await actor(owner);
  await expect(apply({p_property:'7d9add80-216e-435c-86e9-58e17cdcbb6d'})).rejects.toMatchObject({code:'42501'});
  await expect(apply({p_request:'00000000-0000-4000-8000-000000000099'})).rejects.toMatchObject({code:'42501'});
  await expect(apply({p_plan:'00000000-0000-4000-8000-000000000004'})).rejects.toMatchObject({code:'42501'});
  expect((await apply()).rows[0].receipt.replayed).toBe(false);
  expect((await apply()).rows[0].receipt.replayed).toBe(true);
  await actor(manager);
  await expect(apply()).rejects.toMatchObject({code:'23505'});
  expect((await apply({p_request:managerRequest,p_expected_version:2,p_current_rate_minor:16100,p_recommended_rate_minor:18515})).rows[0].receipt.replayed).toBe(false);
  await actor(owner);
  await expect(apply({p_request:failureRequest,p_expected_version:3,p_current_rate_minor:18515,p_recommended_rate_minor:21292})).rejects.toMatchObject({code:'P0001'});
  await db.exec('RESET ROLE');
  expect((await db.query('SELECT amount_minor::integer rate FROM irp_pms.nightly_rates')).rows[0]).toEqual({rate:18515});
  expect((await db.query("SELECT version::integer version FROM irp_pms.rate_plans WHERE id='00000000-0000-4000-8000-000000000032'")).rows[0]).toEqual({version:3});
  expect((await db.query('SELECT count(*)::integer n FROM irp_pms.rate_actions')).rows[0]).toEqual({n:2});
  await db.exec("UPDATE irp_pms.qualification_write_scope SET expires_at=clock_timestamp()-interval '1 second'");
  await actor(owner);
  await expect(apply()).rejects.toMatchObject({code:'42501'});
  await db.exec('RESET ROLE');
  await db.exec(readFileSync('scripts/revenue-audited-http-fixture-cleanup.sql','utf8'));
  expect((await db.query<{body:string}>('SELECT pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body).toBe(original);
  expect((await db.query("SELECT (SELECT count(*)::integer FROM irp_pms.properties) properties,(SELECT count(*)::integer FROM irp_pms.revenue_rate_decisions) decisions,(SELECT count(*)::integer FROM irp_pms.rate_actions) actions,(SELECT count(*)::integer FROM irp_pms.reservations) reservations,(SELECT count(*)::integer FROM irp_pms.nightly_rates) rates,(SELECT count(*)::integer FROM irp_pms.activity) activities,to_regclass('irp_pms.qualification_write_scope') IS NULL guard_removed,NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='qualification_http_audit_failure') trigger_removed")).rows[0]).toEqual({properties:1,decisions:1,actions:0,reservations:0,rates:0,activities:0,guard_removed:true,trigger_removed:true});
  for(const role of ['authenticated','anon','service_role'])expect((await db.query<{enabled:boolean}>('SELECT has_function_privilege($1,$2,\'execute\') enabled',[role,signature])).rows[0].enabled).toBe(false);
 }finally{await db.close();}
},20000);

test('write config cannot target a different project or default/copied branch',()=>{
 const input={branch:{project_ref:'ybehrayzwzyufxbxcysq',parent_project_ref:'eiqmdldjnedqgbtoozqa',is_default:false,with_data:false,name:'revenue-auth-20261001'},publishableKey:'sb_publishable_test',tenantId:'00000000-0000-4000-8000-000000000001',propertyId:'00000000-0000-4000-8000-000000000002',requestId:'00000000-0000-4000-8000-000000000006',planId:'00000000-0000-4000-8000-000000000004',actors:{owner:{id:'7e3ac7b8-3286-4fcb-aaa9-a850390d787c'},manager:{id:'fe6502af-b9a2-478d-abad-bfbec8539df6'},staff:{id:'451c631e-2e3f-4293-b78c-e1bb92087f20'}}};
 expect(parseAuditedWriteConfig(input).branch.project_ref).toBe('ybehrayzwzyufxbxcysq');
 for(const patch of [{project_ref:'eiqmdldjnedqgbtoozqa'},{project_ref:'abcdefghijklmnopqrst'},{name:'revenue-auth-other'},{is_default:true},{with_data:true}])expect(()=>parseAuditedWriteConfig({...input,branch:{...input.branch,...patch}})).toThrow('pinned isolated');
 expect(nextChicagoDay(new Date('2026-10-02T03:00:00Z'))).toBe('2026-10-02');
 expect(nextChicagoDay(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
});
