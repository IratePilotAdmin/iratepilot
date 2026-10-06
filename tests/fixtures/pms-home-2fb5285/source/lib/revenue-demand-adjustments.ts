export type RevenueDemandAdjustment={id:string;kind:'event'|'seasonality';label:string;startDate:string;endDate:string;adjustmentBasisPoints:number};
export type RevenueDemandAdjustmentSet={tenant_id:string;property_id:string;version:number;adjustments:RevenueDemandAdjustment[];saved_at?:string};

const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const controls=(value:string)=>{for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code<32||code===127)return true}return false};

/** Validates the server snapshot before it enters a manager's editor. */
export function readRevenueDemandAdjustmentSet(raw:unknown,scope:{tenant:string;property:string}):RevenueDemandAdjustmentSet{
 if(!plain(raw)||raw.tenant_id!==scope.tenant||raw.property_id!==scope.property||!Number.isSafeInteger(raw.version)||Number(raw.version)<0||!Array.isArray(raw.adjustments)||raw.adjustments.length>37)throw Error('Demand planning settings did not match this property.');
 const ids=new Set<string>();let events=0,seasons=0;
 const adjustments=raw.adjustments.map((value):RevenueDemandAdjustment=>{
  if(!plain(value)||!uuid(value.id)||ids.has(value.id)||!['event','seasonality'].includes(String(value.kind))||typeof value.label!=='string'||value.label.trim().length<1||value.label.length>120||controls(value.label)||!date(value.startDate)||!date(value.endDate)||value.endDate<value.startDate||Date.parse(`${value.endDate}T00:00:00Z`)-Date.parse(`${value.startDate}T00:00:00Z`)>366*86_400_000||!Number.isSafeInteger(value.adjustmentBasisPoints)||Number(value.adjustmentBasisPoints)<-5000||Number(value.adjustmentBasisPoints)>10000)throw Error('Demand planning settings contain an invalid adjustment. Refresh and contact the property owner if this continues.');
  ids.add(value.id);if(value.kind==='event')events++;else seasons++;
  return {id:value.id,kind:value.kind as RevenueDemandAdjustment['kind'],label:value.label,startDate:value.startDate,endDate:value.endDate,adjustmentBasisPoints:Number(value.adjustmentBasisPoints)};
 });
 if(events>25||seasons>12)throw Error('Demand planning settings exceed the supported number of events or seasons.');
 if(raw.saved_at!==undefined&&(typeof raw.saved_at!=='string'||!Number.isFinite(Date.parse(raw.saved_at))))throw Error('Demand planning save time could not be verified.');
 return {tenant_id:scope.tenant,property_id:scope.property,version:Number(raw.version),adjustments,...(typeof raw.saved_at==='string'?{saved_at:raw.saved_at}:{})};
}

export function demandForecastInputsForDate(adjustments:RevenueDemandAdjustment[],stayDate:string){
 if(!date(stayDate))throw Error('A valid stay date is required for demand planning.');
 const active=adjustments.filter(item=>item.startDate<=stayDate&&stayDate<=item.endDate);
 return {
  events:active.filter(item=>item.kind==='event').map(({label,startDate,endDate,adjustmentBasisPoints})=>({label,startDate,endDate,adjustmentBasisPoints})),
  seasonality:active.filter(item=>item.kind==='seasonality').map(({label,startDate,endDate,adjustmentBasisPoints})=>({label,startDate,endDate,adjustmentBasisPoints})),
 };
}
