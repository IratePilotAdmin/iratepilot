import {describe,it,expect} from 'vitest';
import {handleNativeAriShadow,type NativeAriBatch} from '../lib/native-ari-shadow-receiver';
import {prepareNativeAriShadowRequest,readNativeAriShadowReceipt} from '../lib/native-ari-shadow-sender';
const secret='offline-only-test-secret-at-least-32-characters';
const now=Date.parse('2026-09-30T13:00:00.000Z');
const batch:NativeAriBatch={contractVersion:1,eventId:'shadow_test_1',propertyId:'pilot',connector:'iratepilot',connectionId:'sandbox',sourceVersion:1,generatedAt:new Date(now).toISOString(),updates:[{date:'2026-10-01',roomTypeId:'room1',ratePlanId:'BAR',available:2,rateMinor:10000,currency:'USD',minimumStay:1,maximumStay:null,restrictions:[]}]};
const observation={date:'2026-10-01',roomTypeId:'room1',ratePlanId:'BAR',currency:'USD',inventoryPresent:true,rateMinorObserved:10000,availableObserved:2,taxMinorObserved:1000,mandatoryFeeMinorObserved:0,targetMatches:true};
const receipt=(row:Record<string,unknown>=observation)=>({outcome:'validated',persisted:false,certified:false,mode:'validate_only',eventId:batch.eventId,sourceVersion:1,observations:[row]});
describe('offline native shadow sender',()=>{
 it('authenticates exact sender bytes through the real receiver without HTTP or writes',async()=>{
  const packet=prepareNativeAriShadowRequest(batch,secret,now);let reads=0;
  const response=await handleNativeAriShadow(new Request('https://offline.invalid/api/pms/ari',packet),{mode:'validate_only',signingSecrets:JSON.stringify({sandbox:secret})},async b=>{reads++;expect(b).toEqual(batch);return {outcome:'validated',persisted:false,certified:false,observations:[observation]};},now);
  expect(response.status).toBe(200);expect(reads).toBe(1);
  expect(readNativeAriShadowReceipt(await response.json(),batch)).toMatchObject({matched:1,writebackEnabled:false,persisted:false,certified:false});
  expect(packet.body).not.toContain(secret);
 });
 it('rejects malformed contract and configuration before preparing a request',()=>{
  for(const patch of [{minimumStay:2},{taxMinor:1},{rateMinor:9999.5}])expect(()=>prepareNativeAriShadowRequest({...batch,updates:[{...batch.updates[0],...patch}]},secret,now)).toThrow('invalid_ari_contract');
  expect(()=>prepareNativeAriShadowRequest(batch,'short',now)).toThrow('invalid_signing_configuration');
  expect(()=>prepareNativeAriShadowRequest(batch,secret,NaN)).toThrow('invalid_signing_time');
 });
 it('refuses write-success, stale identity, duplicate identity and fabricated matches',()=>{
  for(const patch of [{outcome:'applied'},{persisted:true},{certified:true},{eventId:'other'},{sourceVersion:2},{observations:[{...observation,roomTypeId:'other'}]},{observations:[{...observation,rateMinorObserved:9000}]}])expect(()=>readNativeAriShadowReceipt({...receipt(),...patch},batch)).toThrow('invalid_shadow_receipt');
  const two={...batch,updates:[batch.updates[0],{...batch.updates[0],roomTypeId:'room2'}]};
  expect(()=>readNativeAriShadowReceipt({...receipt(),observations:[observation,observation]},two)).toThrow('invalid_shadow_receipt');
 });
 it('keeps missing, mismatched and uncertain inventory separate from matches',()=>{
  expect(readNativeAriShadowReceipt(receipt({...observation,rateMinorObserved:9000,targetMatches:false}),batch).mismatched).toBe(1);
  expect(readNativeAriShadowReceipt(receipt({...observation,rateMinorObserved:null,targetMatches:null}),batch).unknown).toBe(1);
  expect(readNativeAriShadowReceipt(receipt({...observation,inventoryPresent:false,rateMinorObserved:null,availableObserved:null,taxMinorObserved:null,mandatoryFeeMinorObserved:null,targetMatches:false}),batch).missing).toBe(1);
 });
});
