import {describe,it,expect} from 'vitest';
import {evaluatePmsForecastEvidence} from '../lib/revenue-pms-forecast-evidence';
const scope={tenantId:'t',propertyId:'p',asOf:'2026-10-03T12:00:00.000Z'};
const f={tenantId:'t',propertyId:'p',roomTypeId:'king',stayDate:'2026-10-01',stayStartAt:'2026-10-01T05:00:00.000Z',stayEndAt:'2026-10-02T05:00:00.000Z',issuedAt:'2026-09-30T13:00:00.000Z',sourceMaxObservedAt:'2026-09-30T12:00:00.000Z',modelVersion:'pace-v1',capacity:10,onBooksRooms:1,predictedRooms:2,evidenceState:'recorded' as const};
const snapshot={can_close:true,rows_truncated:false,next_service_date:'2026-10-01',time_zone:'America/Chicago',totals:{complete:true,occupied_nights:1},inventory_snapshot:{schema_version:1,complete:true,basis:'inventory_configuration_at_close',service_date:'2026-10-01',room_types:[{room_type_id:'king',effective_units:10}]},rows:[{room_type_id:'king',physical_room_id:'101',occupied_night:true,blocker:null},{room_type_id:'king',physical_room_id:'102',occupied_night:false,blocker:null}]};
const c={tenantId:'t',propertyId:'p',serviceDate:'2026-10-01',closedAt:'2026-10-02T12:00:00.000Z',snapshot};
describe('PMS finalized occupancy evidence',()=>{
 it('scores overnight rooms only and keeps pricing disabled',()=>{expect(evaluatePmsForecastEvidence([f],[c],scope)).toMatchObject({eligibleSamples:1,pendingHistory:0,rejectedCloses:0,accuracyCertified:false,writebackEnabled:false});});
 it('does not convert missing closes or pending history into zero occupancy',()=>{expect(evaluatePmsForecastEvidence([f],[],scope).eligibleSamples).toBe(0);expect(evaluatePmsForecastEvidence([{...f,predictedRooms:null,evidenceState:'insufficient_history'}],[c],scope)).toMatchObject({pendingHistory:1,eligibleSamples:0});});
 it('rejects incomplete, mismatched and duplicate occupancy snapshots',()=>{
  for(const s of [{...snapshot,can_close:false},{...snapshot,rows_truncated:true},{...snapshot,time_zone:'UTC'},{...snapshot,next_service_date:'2026-10-02'},{...snapshot,totals:{complete:true,occupied_nights:2}},{...snapshot,rows:[snapshot.rows[0],snapshot.rows[0]]},{...snapshot,rows:[{...snapshot.rows[0],blocker:'unresolved'}]},{...snapshot,inventory_snapshot:{...snapshot.inventory_snapshot,room_types:[{room_type_id:'king',effective_units:null}]}}])expect(evaluatePmsForecastEvidence([f],[{...c,snapshot:s}],scope)).toMatchObject({eligibleSamples:0,rejectedCloses:1});
 });
 it('leaves changed capacity and early or future close evidence unscored',()=>{
  const changed={...snapshot,inventory_snapshot:{...snapshot.inventory_snapshot,room_types:[{room_type_id:'king',effective_units:11}]}};
  expect(evaluatePmsForecastEvidence([f],[{...c,snapshot:changed}],scope).excluded.capacity_changed).toBe(1);
  for(const closedAt of ['2026-10-02T04:00:00.000Z','2026-10-04T12:00:00.000Z'])expect(evaluatePmsForecastEvidence([f],[{...c,closedAt}],scope).eligibleSamples).toBe(0);
 });
 it('isolates scope and rejects duplicate close imports',()=>{expect(evaluatePmsForecastEvidence([f],[{...c,tenantId:'other'}],scope).eligibleSamples).toBe(0);expect(()=>evaluatePmsForecastEvidence([f],[c,c],scope)).toThrow('Duplicate service-day close');});
 it('accepts a DST calendar night and rejects guest appointment boundaries',()=>{
  const date='2026-11-01',dst={...f,stayDate:date,stayStartAt:'2026-11-01T05:00:00.000Z',stayEndAt:'2026-11-02T06:00:00.000Z'};
  const close={...c,serviceDate:date,closedAt:'2026-11-02T12:00:00.000Z',snapshot:{...snapshot,next_service_date:date,inventory_snapshot:{...snapshot.inventory_snapshot,service_date:date}}};
  expect(evaluatePmsForecastEvidence([dst],[close],{...scope,asOf:'2026-11-03T12:00:00.000Z'}).eligibleSamples).toBe(1);
  expect(evaluatePmsForecastEvidence([{...f,stayStartAt:'2026-10-01T20:00:00.000Z'}],[c],scope).eligibleSamples).toBe(0);
 });
});
