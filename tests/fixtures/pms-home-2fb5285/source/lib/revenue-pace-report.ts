import {pickupBatchSnapshots} from './revenue-pickup-report';
import {compareBookingPace} from './revenue-pace';
export type PaceDatePair={reference:string;current:string};
/** Input batches must come from the authorized property reader. Scope checks here
 * supplement server authorization; the caller explicitly selects each date pair. */
export function bookingPaceReport(input:{tenant:string;property:string;referenceCapture:string;currentCapture:string;reference:unknown;current:unknown;timeZone:string;pairs:PaceDatePair[]}){
 const {tenant,property,referenceCapture,currentCapture,pairs}=input;
 if(!referenceCapture||!currentCapture||referenceCapture===currentCapture)throw Error('Choose two different saved captures.');
 const reference=pickupBatchSnapshots(input.reference,tenant,property,referenceCapture),current=pickupBatchSnapshots(input.current,tenant,property,currentCapture);
 if(!Array.isArray(pairs)||pairs.length<1||pairs.length>31)throw Error('Select 1 to 31 date pairs.');
 const usedReference=new Set<string>(),usedCurrent=new Set<string>();
 for(const pair of pairs){
  if(!pair||typeof pair.reference!=='string'||typeof pair.current!=='string'||usedReference.has(pair.reference)||usedCurrent.has(pair.current)||pair.reference>=pair.current||!reference.some(s=>s.stayDate===pair.reference)||!current.some(s=>s.stayDate===pair.current))throw Error('Each selected stay date must exist in its capture and be paired once with a later date.');
  usedReference.add(pair.reference);usedCurrent.add(pair.current);
 }
 return pairs.flatMap(pair=>{
  const a=reference.filter(s=>s.stayDate===pair.reference),b=current.filter(s=>s.stayDate===pair.current);
  const types=[...new Set([...a,...b].map(s=>s.roomTypeId))].sort();
  return types.map(roomTypeId=>{
   const previous=a.find(s=>s.roomTypeId===roomTypeId),later=b.find(s=>s.roomTypeId===roomTypeId);
   return {tenant,property,referenceCapture,currentCapture,referenceDate:pair.reference,currentDate:pair.current,roomTypeId,
    comparison:compareBookingPace(previous?{...previous,capacityBasis:'maintenance-effective-v1'}:null,later?{...later,capacityBasis:'maintenance-effective-v1'}:null,input.timeZone)};
  });
 });
}
