import {describe,it,expect} from 'vitest';
import {evaluateRevenueForecasts,type ForecastEvidence} from '../lib/revenue-forecast-validation';
const scope={tenantId:'tenant',propertyId:'pilot',asOf:'2026-09-30T13:00:00.000Z'};
const sample:ForecastEvidence={tenantId:'tenant',propertyId:'pilot',roomTypeId:'king',stayDate:'2026-09-28',stayStartAt:'2026-09-28T20:00:00.000Z',stayEndAt:'2026-09-29T16:00:00.000Z',issuedAt:'2026-09-27T20:00:00.000Z',sourceMaxObservedAt:'2026-09-27T19:00:00.000Z',modelVersion:'pace-v1',capacity:10,predictedRooms:8,onBooksRooms:4,actual:{observedAt:'2026-09-29T17:00:00.000Z',complete:true,capacity:10,occupiedRooms:10}};
describe('forecast evidence evaluation',()=>{
 it('calculates signed bias, room error and occupancy error against an on-books baseline',()=>{
  const r=evaluateRevenueForecasts([sample],scope);
  expect(r.byModel[0].metrics).toMatchObject({samples:1,roomMae:2,roomRmse:2,roomBias:-2,occupancyMaePercentagePoints:20,onBooksRoomMae:6,improvementAgainstOnBooksPercent:66.667});
  expect(r.byModel[0].byHorizon[0].metrics?.samples).toBe(1);
  expect(r).toMatchObject({accuracyCertified:false,usableForLivePricing:false,writebackEnabled:false});
 });
 it('reports worsening forecasts and does not divide by a perfect baseline',()=>{
  expect(evaluateRevenueForecasts([{...sample,predictedRooms:0}],scope).byModel[0].metrics?.improvementAgainstOnBooksPercent).toBeLessThan(0);
  expect(evaluateRevenueForecasts([{...sample,onBooksRooms:10}],scope).byModel[0].metrics?.improvementAgainstOnBooksPercent).toBeNull();
 });
 it('excludes future information and unfinished or unavailable actuals',()=>{
  for(const row of [{...sample,sourceMaxObservedAt:'2026-09-28T00:00:00.000Z'},{...sample,issuedAt:sample.stayStartAt},{...sample,actual:null},{...sample,actual:{...sample.actual!,complete:false}},{...sample,actual:{...sample.actual!,observedAt:'2026-09-29T15:00:00.000Z'}},{...sample,actual:{...sample.actual!,observedAt:'2026-10-01T00:00:00.000Z'}}])expect(evaluateRevenueForecasts([row],scope).eligibleSamples).toBe(0);
 });
 it('isolates property/tenant scope and rejects invalid capacity, dates and duplicate imports',()=>{
  const r=evaluateRevenueForecasts([{...sample,tenantId:'other'},{...sample,propertyId:'other'},{...sample,capacity:0},{...sample,stayDate:'2026-02-30'},{...sample,actual:{...sample.actual!,capacity:11}}],scope);
  expect(r.excluded).toEqual({outside_scope:2,invalid_forecast:2,capacity_changed:1});
  expect(r.state).toBe('no_final_actuals');
  expect(()=>evaluateRevenueForecasts([sample,sample],scope)).toThrow('Duplicate forecast evidence');
 });
 it('keeps model versions separate and preserves exact horizon boundaries',()=>{
  const rows=[sample,{...sample,modelVersion:'pace-v2',predictedRooms:10},{...sample,issuedAt:'2026-09-25T19:59:59.000Z',sourceMaxObservedAt:'2026-09-25T19:00:00.000Z'}];
  const r=evaluateRevenueForecasts(rows,scope);expect(r.byModel).toHaveLength(2);
  expect(r.byModel[0].byHorizon[2].metrics?.samples).toBe(1);
  expect(r.byModel[1].metrics?.roomMae).toBe(0);
 });
 it('rejects invalid scope and leaves empty evidence uncertified',()=>{
  expect(()=>evaluateRevenueForecasts([],{...scope,asOf:'yesterday'})).toThrow('Invalid evaluation scope');
  expect(evaluateRevenueForecasts([],scope)).toMatchObject({state:'no_final_actuals',eligibleSamples:0,byModel:[],writebackEnabled:false});
 });
});
