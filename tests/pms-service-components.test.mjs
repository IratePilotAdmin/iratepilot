import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceComponents,mapServiceComponents} from '../lib/accounting/service-components.ts';
const row=()=>({accommodation_minor:10000,taxes_minor:1000,hotel_fees_minor:2500,ota_fees_minor:0,other_revenue_minor:0,total_minor:13500,details:{taxes:[{code:'city',amount_minor:300},{code:'state',amount_minor:700}],fees:[{code:'resort',amount_minor:2000},{code:'technology',amount_minor:500}]}});
test('preserves named tax and fee amounts for account mapping',()=>{
 assert.deepEqual(Object.fromEntries(serviceComponents(row()).map(x=>[x.component,x.amountMinor])),{accommodation:'10000','fee:resort':'2000','fee:technology':'500','tax:city':'300','tax:state':'700'});
});
test('aggregate records retain explicit unallocated buckets',()=>{const input=row();input.details={};const result=serviceComponents(input);assert(result.some(x=>x.component==='tax:unallocated'&&x.amountMinor==='1000'));assert(result.some(x=>x.component==='fee:unallocated'&&x.amountMinor==='2500'));});
test('rejects over-allocation and mismatched recorded totals',()=>{const input=row();input.details.taxes[0].amount_minor=9999;assert.throws(()=>serviceComponents(input),/exceeds/);const other=row();other.total_minor--;assert.throws(()=>serviceComponents(other),/reconcile/);});
test('rejects malformed itemization instead of replacing it with zero',()=>{for(const value of [null,'bad',{}]){const input=row();input.details.taxes=value;assert.throws(()=>serviceComponents(input));}});
const scope={tenantId:'t',propertyId:'p'},receivable={...scope,id:'11111111-1111-4111-8111-111111111111',active:true,kind:'asset'},income={...scope,id:'22222222-2222-4222-8222-222222222222',active:true,kind:'income'},liability={...scope,id:'33333333-3333-4333-8333-333333333333',active:true,kind:'liability'};
const mappings=()=>({'accommodation':income,'fee:resort':income,'fee:technology':income,'tax:city':liability,'tax:state':liability});
test('mapped source retains category provenance and balances exactly',()=>{const result=mapServiceComponents(row(),scope,receivable,mappings());assert.equal(result.lines[0].amountMinor,'13500');assert.equal(result.lines.slice(1).reduce((a,l)=>a+BigInt(l.amountMinor),0n),13500n);assert(result.lines.some(l=>l.component==='tax:city'));});
test('missing and cross-property account mappings cannot produce journal lines',()=>{const map=mappings();delete map['tax:city'];assert.throws(()=>mapServiceComponents(row(),scope,receivable,map),/mapping/);assert.throws(()=>mapServiceComponents(row(),scope,{...receivable,propertyId:'other'},mappings()),/mapping/);});
test('tax cannot silently become income or receivable',()=>{const map=mappings();map['tax:city']=income;assert.throws(()=>mapServiceComponents(row(),scope,receivable,map),/classification/);map['tax:city']=receivable;assert.throws(()=>mapServiceComponents(row(),scope,receivable,map),/receivable/);});
