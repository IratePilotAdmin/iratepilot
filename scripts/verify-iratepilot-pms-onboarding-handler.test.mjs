import test from 'node:test';import assert from 'node:assert/strict';
import {createOnboardingHandler} from '../services/hotel-suppliers/iratepilot-pms/onboarding-handler.mjs';
const user='11111111-1111-1111-1111-111111111111',requestId='22222222-2222-2222-2222-222222222222';
const body={requestId,organizationName:' Hotel Group ',propertyName:' Hotel '};
function setup(overrides={}){const calls=[];const handler=createOnboardingHandler({verifyAccessToken:async()=>({id:user,emailVerified:true}),authorizeOnboarding:async()=>true,onboard:async args=>{calls.push(args);return {data:{request_id:args.p_request,owner_id:args.p_owner,tenant_id:'33333333-3333-3333-3333-333333333333',property_id:'44444444-4444-4444-4444-444444444444'}}},...overrides});return {calls,handler}}
const req=(payload=body,headers={})=>new Request('https://pms.test/onboarding',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer verified-test-token',...headers},body:JSON.stringify(payload)});
test('owner derived from verified identity and names trimmed',async()=>{const {handler,calls}=setup();const r=await handler(req());assert.equal(r.status,200);assert.equal(calls[0].p_owner,user);assert.equal(calls[0].p_tenant_name,'Hotel Group');assert.equal(r.headers.get('cache-control'),'no-store')});
test('body cannot choose owner identity',async()=>{const {handler,calls}=setup();assert.equal((await handler(req({...body,ownerId:user}))).status,400);assert.equal(calls.length,0)});
test('missing bearer credential cannot create hotel',async()=>{const {handler,calls}=setup();assert.equal((await handler(req(body,{authorization:''}))).status,401);assert.equal(calls.length,0)});
test('invalid identity and unverified email denied',async()=>{for(const identity of [null,{id:user,emailVerified:false}]){const {handler,calls}=setup({verifyAccessToken:async()=>identity});assert.ok([401,403].includes((await handler(req())).status));assert.equal(calls.length,0)}});
test('pilot admission denied prevents privileged operation',async()=>{const {handler,calls}=setup({authorizeOnboarding:async()=>false});assert.equal((await handler(req())).status,403);assert.equal(calls.length,0)});
test('oversized body rejected',async()=>{const {handler,calls}=setup();assert.equal((await handler(req({...body,organizationName:'x'.repeat(5000)}))).status,413);assert.equal(calls.length,0)});
test('database errors do not leak details',async()=>{const {handler}=setup({onboard:async()=>({error:{code:'XX000',message:'private database details'}})});const r=await handler(req());assert.equal(r.status,503);assert.equal((await r.text()).includes('private'),false)});
test('request collision has explicit conflict response',async()=>{const {handler}=setup({onboard:async()=>({error:{code:'P0001'}})});assert.equal((await handler(req())).status,409)});
test('response from wrong owner is not accepted',async()=>{const {handler}=setup({onboard:async()=>({data:{request_id:requestId,owner_id:'wrong'}})});assert.equal((await handler(req())).status,503)});
test('missing admission adapter fails closed at initialization',()=>assert.throws(()=>createOnboardingHandler({verifyAccessToken:async()=>null,onboard:async()=>null})));
