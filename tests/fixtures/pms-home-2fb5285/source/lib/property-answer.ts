import {propertyFacts} from '@/lib/property-facts';
export type PropertyAnswer={businessDate:string;timeZone:string;receivedAt:string;unsupported:boolean;facts:{id:string;label:string;value:number|string|string[]}[];limitations:string[]};
export function readPropertyAnswer(value:Record<string,unknown>,scope:{tenant:string;property:string;requestId:string}):PropertyAnswer{
 if(value.scope!=='property-facts'||value.tenant!==scope.tenant||value.property!==scope.property||value.requestId!==scope.requestId||typeof value.businessDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.businessDate)||typeof value.timeZone!=='string'||typeof value.receivedAt!=='string'||!Number.isFinite(Date.parse(value.receivedAt))||typeof value.unsupported!=='boolean'||!Array.isArray(value.facts)||value.facts.length>10)throw Error('Property answer could not be verified.');
 try{new Intl.DateTimeFormat('en-US',{timeZone:value.timeZone}).format()}catch{throw Error('Property time zone could not be verified.')}
 if(!Array.isArray(value.limitations)||value.limitations.length>10||!value.limitations.every(v=>typeof v==='string'&&v.trim().length>0&&v.length<=1000))throw Error('Property answer limitations could not be verified.');
 const seen=new Set<string>();
 const facts=value.facts.map(raw=>{
  if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!Object.hasOwn(propertyFacts,raw.id)||seen.has(raw.id))throw Error('Property fact could not be verified.');seen.add(raw.id);
  const list=['roomsAwaitingInspection','dirtyRooms','roomsToPrepare','maintenanceRoomsToday','readyVacantRooms'].includes(raw.id),balanceList=raw.id==='knownPositiveGuestBalances',attentionList=raw.id==='managerAttentionItems',channelList=raw.id==='channelBookedValueBySource',rateDecisionList=raw.id==='recentRateDecisionExplanations',occupancyText=['tonightCommittedOccupancy','tomorrowBookedOccupancy'].includes(raw.id);
  const balanceRow=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12} · (Confirmed|In house|Checked out|Cancelled) · (\d{4}-\d{2}-\d{2}|arrival unavailable) to (\d{4}-\d{2}-\d{2}|departure unavailable) · \$\d+\.\d{2}$/i;
  const valid=occupancyText?typeof raw.value==='string'&&raw.value.length>0&&raw.value.length<=240:list?Array.isArray(raw.value)&&raw.value.length<=100000&&raw.value.every((x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=40):balanceList?Array.isArray(raw.value)&&raw.value.length<=1000&&raw.value.every((x:unknown)=>typeof x==='string'&&x.length<=200&&balanceRow.test(x)):attentionList?Array.isArray(raw.value)&&raw.value.length<=32&&raw.value.every((x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=160):channelList?Array.isArray(raw.value)&&raw.value.length<=8&&raw.value.every((x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=300):rateDecisionList?Array.isArray(raw.value)&&raw.value.length<=10&&raw.value.every((x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=3200):Number.isSafeInteger(raw.value)&&Number(raw.value)>=0;
  if(!valid)throw Error('Property value could not be verified.');
  return {id:raw.id,label:propertyFacts[raw.id as keyof typeof propertyFacts],value:raw.value as number|string|string[]};
 });
 if(value.unsupported&&facts.length||!value.unsupported&&!facts.length)throw Error('Property answer coverage is inconsistent.');
 return {businessDate:value.businessDate,timeZone:value.timeZone,receivedAt:value.receivedAt,unsupported:value.unsupported,facts,limitations:value.limitations};
}
