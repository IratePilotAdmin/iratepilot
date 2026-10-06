export type ForecastEvidence={
 tenantId:string;propertyId:string;roomTypeId:string;stayDate:string;
 stayStartAt:string;stayEndAt:string;issuedAt:string;sourceMaxObservedAt:string;
 modelVersion:string;capacity:number;predictedRooms:number;onBooksRooms:number;
 actual:{observedAt:string;complete:boolean;capacity:number;occupiedRooms:number}|null;
};
export type EvaluationScope={tenantId:string;propertyId:string;asOf:string};
const instant=(s:string)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s?Date.parse(s):NaN;
const count=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const realDay=(s:string)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const rounded=(n:number)=>Math.round(n*1000)/1000;
type Sample={modelVersion:string;hoursAhead:number;error:number;baselineError:number;capacity:number};
function metrics(samples:Sample[]){
 if(!samples.length)return null;
 const average=(f:(s:Sample)=>number)=>samples.reduce((sum,s)=>sum+f(s),0)/samples.length;
 const mae=average(s=>Math.abs(s.error)),baselineMae=average(s=>Math.abs(s.baselineError));
 return {samples:samples.length,roomMae:rounded(mae),roomRmse:rounded(Math.sqrt(average(s=>s.error**2))),roomBias:rounded(average(s=>s.error)),occupancyMaePercentagePoints:rounded(average(s=>Math.abs(s.error)/s.capacity*100)),onBooksRoomMae:rounded(baselineMae),improvementAgainstOnBooksPercent:baselineMae===0?null:rounded((baselineMae-mae)/baselineMae*100)};
}

/** Offline evidence evaluation only. Callers supply authoritative property-local
 * stay boundaries and immutable forecasts; this function cannot certify pricing. */
export function evaluateRevenueForecasts(evidence:ForecastEvidence[],scope:EvaluationScope){
 const asOf=instant(scope.asOf);if(!scope.tenantId||!scope.propertyId||!Number.isFinite(asOf))throw Error('Invalid evaluation scope.');
 const excluded:Record<string,number>={},samples:Sample[]=[],identities=new Set<string>();
 const skip=(reason:string)=>{excluded[reason]=(excluded[reason]??0)+1;};
 for(const row of evidence){
  if(row.tenantId!==scope.tenantId||row.propertyId!==scope.propertyId){skip('outside_scope');continue;}
  const issued=instant(row.issuedAt),source=instant(row.sourceMaxObservedAt),start=instant(row.stayStartAt),end=instant(row.stayEndAt);
  if(!row.roomTypeId||!row.modelVersion||!realDay(row.stayDate)||![issued,source,start,end].every(Number.isFinite)||start>=end||end-start>48*3600000||!count(row.capacity)||row.capacity===0||!count(row.predictedRooms)||!count(row.onBooksRooms)||row.predictedRooms>row.capacity||row.onBooksRooms>row.capacity){skip('invalid_forecast');continue;}
  if(issued>=start||source>issued||issued>asOf){skip('future_information');continue;}
  // One model forecast per room/night/issue instant; repeated imports are not
  // independent evidence. Different model versions are evaluated separately.
  const identity=JSON.stringify([row.roomTypeId,row.stayDate,row.issuedAt,row.modelVersion]);
  if(identities.has(identity))throw Error('Duplicate forecast evidence.');identities.add(identity);
  const actual=row.actual;
  if(!actual||!actual.complete){skip('actual_missing_or_incomplete');continue;}
  const observed=instant(actual.observedAt);
  if(!Number.isFinite(observed)||observed<end||observed>asOf||asOf<end){skip('actual_not_final_at_cutoff');continue;}
  if(!count(actual.capacity)||!count(actual.occupiedRooms)||actual.occupiedRooms>actual.capacity){skip('invalid_actual');continue;}
  if(actual.capacity!==row.capacity){skip('capacity_changed');continue;}
  samples.push({modelVersion:row.modelVersion,hoursAhead:(start-issued)/3600000,error:row.predictedRooms-actual.occupiedRooms,baselineError:row.onBooksRooms-actual.occupiedRooms,capacity:row.capacity});
 }
 const versions=[...new Set(samples.map(s=>s.modelVersion))].sort();
 const byModel=versions.map(modelVersion=>{const selected=samples.filter(s=>s.modelVersion===modelVersion);return {modelVersion,metrics:metrics(selected),byHorizon:[{label:'up_to_1_day',low:0,high:24},{label:'1_to_3_days',low:24,high:72},{label:'3_to_7_days',low:72,high:168},{label:'7_to_14_days',low:168,high:336},{label:'14_to_30_days',low:336,high:720},{label:'over_30_days',low:720,high:Infinity}].map(b=>({horizon:b.label,metrics:metrics(selected.filter(s=>s.hoursAhead>b.low&&s.hoursAhead<=b.high))}))};});
 return {tenantId:scope.tenantId,propertyId:scope.propertyId,asOf:scope.asOf,state:samples.length?'evidence_available':'no_final_actuals',eligibleSamples:samples.length,excluded,byModel,accuracyCertified:false,usableForLivePricing:false,writebackEnabled:false};
}
