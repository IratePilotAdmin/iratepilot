import {revenueHttpQualificationConfigSchema} from '../../lib/revenue-http-qualification-config';
import {revenueApprovalCommandSchema,type RevenueApprovalCommand} from '../../lib/revenue-approval-recovery';

export const writeProperty='00000000-0000-4000-8000-000000000030';
export const writePlan='00000000-0000-4000-8000-000000000032';
export const ownerRequest='00000000-0000-4000-8000-000000000020';
export const managerRequest='00000000-0000-4000-8000-000000000021';
export const failureRequest='00000000-0000-4000-8000-000000000022';

export function parseAuditedWriteConfig(raw:unknown){
 try{
  const config=revenueHttpQualificationConfigSchema.parse(raw);
  if(config.branch.project_ref!=='ybehrayzwzyufxbxcysq'||config.branch.name!=='revenue-auth-20261001')throw new Error();
  return config;
 }catch{throw new Error('Use the pinned isolated audited-write branch');}
}
export function writeCommand(day:string,patch:Partial<RevenueApprovalCommand>={}){
 return revenueApprovalCommandSchema.parse({
  p_tenant:'00000000-0000-4000-8000-000000000001',p_property:writeProperty,
  p_request:ownerRequest,p_plan:writePlan,p_expected_version:1,p_stay_date:day,
  p_current_rate_minor:14000,p_recommended_rate_minor:16100,p_minimum_rate_minor:7000,
  p_maximum_rate_minor:50000,p_competitor_rate_minor:null,p_event_uplift_basis_points:0,
  p_effective_units:10,p_reserved_units:8,p_occupancy_tenths_percent:800,
  p_adjustment_basis_points:1500,p_guardrail:'none',p_explanations:['Synthetic audited HTTP qualification'],...patch,
 });
}
export function nextChicagoDay(now:Date){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:string)=>parts.find(p=>p.type===type)!.value;
 const date=new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`);
 date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10);
}
