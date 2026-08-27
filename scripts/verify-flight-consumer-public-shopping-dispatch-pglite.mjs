import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const dist = process.env.PGLITE_DIST;
if (!dist) throw new Error("PGLITE_DIST is required.");
const { PGlite } = await import(pathToFileURL(`${dist}/index.js`).href);
const { pgcrypto } = await import(pathToFileURL(`${dist}/contrib/pgcrypto.js`).href);
const names = [
  "202608260101_flight_consumer_live_duffel_shopping_journal.sql",
  "202608260102_flight_consumer_live_duffel_shopping_rpc_qualification_repair.sql",
  "202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql",
  "202608260115_flight_consumer_live_public_shopping_admission.sql",
  "202608260116_flight_consumer_live_public_offer_projection.sql",
  "202608260117_flight_consumer_live_public_offer_reference_retention.sql",
  "202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql",
  "202608260119_flight_consumer_live_public_shopping_dispatch.sql",
];
const migrations = await Promise.all(names.map((name) => readFile(
  `supabase/production-migrations/${name}`, "utf8",
)));
const rollback = await readFile(
  "supabase/production-rollbacks/202608260119_flight_consumer_live_public_shopping_dispatch.rollback.sql",
  "utf8",
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fixed = (value) => value.toString(16).padStart(64, "0");
const canonical = (value) => value === null || typeof value !== "object"
  ? JSON.stringify(value) : Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
  create schema auth; create role anon; create role authenticated; create role service_role;
  create function auth.role() returns text language sql stable as $$ select 'service_role' $$;`);
for (const migration of migrations) await db.exec(migration);

const admissionScope = fixed(1), policy = fixed(2), admissionPolicy = fixed(3);
const cohort = fixed(4), subject = fixed(5), admissionIdempotency = fixed(6);
const search = { adults: 1, cabin: "economy", departureDate: "2026-09-10",
  destination: "LHR", origin: "ORD", returnDate: null };
const publicRequest = sha(canonical({
  version: "flight-consumer-production-public-shopping-admission-request-v1",
  executionScopeSha256: admissionScope, policySha256: policy,
  admissionPolicySha256: admissionPolicy, cohortSha256: cohort,
  subjectSha256: subject, search,
}));
const shoppingScope = fixed(8);
const body = sha('{"data":{"cabin_class":"economy","passengers":[{"type":"adult"}],"slices":[{"departure_date":"2026-09-10","destination":"LHR","origin":"ORD"}]}}');
const admissionId = "00000000-0000-4000-8000-000000000001";
const admissionReceipt = fixed(10);
const admissionCreatedAt = new Date();
await db.query(`insert into public.flight_consumer_live_public_shopping_admissions (
  id,execution_scope_sha256,policy_sha256,admission_policy_sha256,cohort_sha256,
  subject_sha256,idempotency_sha256,request_sha256,admission_state,refusal_code,
  budget_claimed,claim_expires_at,refusal_bucket_sha256,
  subject_minute_claim_count,subject_day_claim_count,cohort_minute_claim_count,
  cohort_day_claim_count,global_minute_claim_count,global_day_claim_count,
  admission_receipt_sha256,created_at)
 values ($1,$2,$3,$4,$5,$6,$7,$8,'admitted',null,true,
   $10::timestamptz+interval '60 seconds',null,
   1,1,1,1,1,1,$9,$10::timestamptz)`,
[admissionId,admissionScope,policy,admissionPolicy,cohort,subject,
 admissionIdempotency,publicRequest,admissionReceipt,admissionCreatedAt]);
const idempotency = sha(
  "iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1\0"
  + [admissionId, admissionReceipt, shoppingScope, publicRequest, body].join(":"),
);
const deadline = new Date(Date.now() + 10_000).toISOString();
const sql = `select * from public.claim_flight_consumer_live_public_shopping_dispatch_v1(
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`;
const args = [admissionId,admissionReceipt,admissionScope,policy,admissionPolicy,
  cohort,subject,admissionIdempotency,publicRequest,shoppingScope,idempotency,body,deadline];
const created = (await db.query(sql,args)).rows[0];
if (created?.decision !== "created"
  || created?.create_offer_request_dispatch_authorized !== true
  || created?.attempt_state !== "dispatching" || created?.attempt_revision !== 1) {
  throw new Error("Gate119 atomic create/claim failed.");
}
const raw = '{"data":{"id":"orq_12345678","live_mode":true,"offers":[]}}';
const responseSha = sha(raw);
await db.query(`select * from public.record_flight_consumer_live_duffel_offer_sources_v1(
  $1,$2,$3,$4::jsonb)`, [created.shopping_attempt_id,shoppingScope,responseSha,"[]"]);
const pending = (await db.query(`select * from
 public.list_flight_consumer_live_duffel_pending_offer_sources_v1($1,$2,$3)`,
[created.shopping_attempt_id,shoppingScope,responseSha])).rows;
if (pending.length !== 0) throw new Error("Gate119 zero-offer source batch failed.");
const observedAt = (await db.query(
  "select date_trunc('milliseconds',clock_timestamp()) observed_at",
)).rows[0].observed_at.toISOString();
const projectionBatch = sha(canonical({
  version: "flight-consumer-production-public-offer-projection-batch-v1",
  admissionId, admissionReceiptSha256: admissionReceipt,
  sourceShoppingAttemptId: created.shopping_attempt_id,
  sourceShoppingExecutionScopeSha256: shoppingScope,
  sourceResponseSha256: responseSha, sourceRequestBodySha256: body,
  projected: [], refused: [], observedAt,
}));
const completed = (await db.query(`select * from
 public.complete_flight_consumer_live_public_offer_projection_batch_v1(
 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb)`,
[admissionId,admissionReceipt,admissionScope,policy,admissionPolicy,cohort,subject,
 admissionIdempotency,publicRequest,JSON.stringify(search),created.shopping_attempt_id,
 shoppingScope,responseSha,body,projectionBatch,observedAt,Buffer.byteLength(raw),"[]","[]"])).rows[0];
if (completed?.decision !== "created" || completed?.projected_offer_count !== 0)
  throw new Error("Gate119 zero-offer projection completion failed.");
const safe = (await db.query(`select * from
 public.read_flight_consumer_live_public_offer_projection_batch_v1($1,$2,$3,$4)`,
[admissionId,admissionReceipt,subject,publicRequest])).rows;
if (safe.length !== 0) throw new Error("Gate119 zero-offer safe read failed.");
const replay = (await db.query(sql,args.with(12,new Date(Date.now()+11_000).toISOString()))).rows[0];
if (replay?.decision !== "replay"
  || replay?.create_offer_request_dispatch_authorized !== false
  || replay?.shopping_attempt_id !== created.shopping_attempt_id
  || replay?.attempt_state !== "succeeded" || replay?.attempt_revision !== 2) {
  throw new Error("Gate119 exact replay failed.");
}
let collision = false;
try { await db.query(sql,args.with(11,fixed(11))); } catch { collision = true; }
if (!collision) throw new Error("Gate119 accepted a replay collision.");
const concurrentAdmission = "00000000-0000-4000-8000-000000000011";
const concurrentReceipt = fixed(20);
const concurrentScope = fixed(21), concurrentAdmissionIdempotency = fixed(22);
const concurrentRequest = sha(canonical({
  version: "flight-consumer-production-public-shopping-admission-request-v1",
  executionScopeSha256: concurrentScope, policySha256: policy,
  admissionPolicySha256: admissionPolicy, cohortSha256: cohort,
  subjectSha256: subject, search,
}));
const concurrentCreatedAt = new Date();
await db.query(`insert into public.flight_consumer_live_public_shopping_admissions (
  id,execution_scope_sha256,policy_sha256,admission_policy_sha256,cohort_sha256,
  subject_sha256,idempotency_sha256,request_sha256,admission_state,refusal_code,
  budget_claimed,claim_expires_at,refusal_bucket_sha256,
  subject_minute_claim_count,subject_day_claim_count,cohort_minute_claim_count,
  cohort_day_claim_count,global_minute_claim_count,global_day_claim_count,
  admission_receipt_sha256,created_at)
 values ($1,$2,$3,$4,$5,$6,$7,$8,'admitted',null,true,
   $10::timestamptz+interval '60 seconds',null,
   1,1,1,1,1,1,$9,$10::timestamptz)`,
[concurrentAdmission,concurrentScope,policy,admissionPolicy,cohort,subject,
 concurrentAdmissionIdempotency,concurrentRequest,concurrentReceipt,concurrentCreatedAt]);
const concurrentIdempotency = sha(
  "iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1\0"
  + [concurrentAdmission, concurrentReceipt, shoppingScope, concurrentRequest, body].join(":"),
);
const concurrentArgs = [concurrentAdmission,concurrentReceipt,concurrentScope,policy,
  admissionPolicy,cohort,subject,concurrentAdmissionIdempotency,concurrentRequest,shoppingScope,
  concurrentIdempotency,body,new Date(Date.now()+10_000).toISOString()];
const concurrent = await Promise.all([db.query(sql,concurrentArgs), db.query(sql,concurrentArgs)]);
if (concurrent.map((result) => result.rows[0]?.decision).sort().join(",")
  !== "created,replay") throw new Error("Gate119 concurrent exact claim failed.");
const nonzeroClaim = concurrent.map((result) => result.rows[0])
  .find((row) => row.decision === "created");
const providerOfferId = "off_12345678";
const offerIdSha = sha(
  `iratepilot:flight-consumer-production:duffel-live:offer-id:v1\0${providerOfferId}`,
);
const nonzeroResponseSha = fixed(40);
const expiry = new Date(Date.now()+3_600_000).toISOString();
await db.query(`select * from public.record_flight_consumer_live_duffel_offer_sources_v1(
 $1,$2,$3,$4::jsonb)`, [nonzeroClaim.shopping_attempt_id,shoppingScope,
 nonzeroResponseSha,JSON.stringify([{offerIdSha256:offerIdSha,expiresAt:expiry}])]);
const nonzeroSources = (await db.query(`select * from
 public.list_flight_consumer_live_duffel_pending_offer_sources_v1($1,$2,$3)`,
[nonzeroClaim.shopping_attempt_id,shoppingScope,nonzeroResponseSha])).rows;
if (nonzeroSources.length !== 1) throw new Error("Gate119 nonzero source list failed.");
const owner = {name:"Example Air",iataCode:"EA"};
const termsSummarySha256 = sha(canonical({
  version:"flight-consumer-production-public-offer-terms-v1",owner,
  change:{allowed:true,penaltyAmountMinor:5000},
  refund:{allowed:true,penaltyAmountMinor:7000},
}));
const localOfferId = "00000000-0000-4000-8000-000000000041";
const projection = {localOfferId,displayRank:1,providerCode:"duffel",owner,
  price:{currency:"USD",baseAmountMinor:10000,taxAmountMinor:2000,totalAmountMinor:12000},
  passengerIdentityDocumentsRequired:false,requiresInstantPayment:true,
  offerExpiresAt:expiry,presentationExpiresAt:new Date(Date.now()+300_000).toISOString(),
  terms:{changeable:true,refundable:true,changePenaltyAmountMinor:5000,
    refundPenaltyAmountMinor:7000,termsSummarySha256},segments:[{sliceSequence:1,
    segmentSequence:1,journeyDirection:"outbound",originIata:"ORD",destinationIata:"LHR",
    departingAtLocal:"2026-09-10T10:00:00",arrivingAtLocal:"2026-09-10T22:00:00",
    originTimeZone:"America/Chicago",destinationTimeZone:"Europe/London",
    marketingCarrierName:"Example Air",marketingCarrierIataCode:"EA",
    operatingCarrierName:"Example Air",operatingCarrierIataCode:"EA",
    marketingFlightNumber:"123",durationMinutes:480,cabin:"economy"}]};
const projectionSha = sha(canonical({
  version:"flight-consumer-production-public-offer-projection-v1",
  admissionId:concurrentAdmission,sourceId:nonzeroSources[0].source_id,
  sourceOfferEvidenceSha256:nonzeroSources[0].source_offer_evidence_sha256,
  offerIdSha256:offerIdSha,projection,
}));
const ciphertext="enc:v1:abcdefghijklmnop";
const expiryMicros=new Date(expiry).toISOString().replace(/\.(\d{3})Z$/,".$1000Z");
const aadSha=sha("iratepilot:flight-consumer-production:duffel-offer-reference-aad:v1\0"+
 [concurrentReceipt,subject,concurrentRequest,localOfferId,nonzeroSources[0].source_id,
  nonzeroSources[0].source_offer_evidence_sha256,projectionSha,expiryMicros,"kms-v1"].join(":"));
const projected=[{sourceId:nonzeroSources[0].source_id,
  sourceOfferEvidenceSha256:nonzeroSources[0].source_offer_evidence_sha256,
  offerIdSha256:offerIdSha,projectionSha256:projectionSha,projection,
  encryptedReference:{version:"flight-consumer-live-duffel-offer-reference-encryption-v1",
    ciphertext,plaintextReferenceSha256:offerIdSha,keyVersion:"kms-v1",aadSha256:aadSha,
    ciphertextSha256:sha(`iratepilot:flight-consumer-production:duffel-offer-reference-ciphertext:v1\0${ciphertext}`),
    recordHmacSha256:fixed(41)}}];
const nonzeroObserved=(await db.query(
  "select date_trunc('milliseconds',clock_timestamp()) observed_at",
)).rows[0].observed_at.toISOString();
const nonzeroBatch=sha(canonical({
  version:"flight-consumer-production-public-offer-projection-batch-v1",
  admissionId:concurrentAdmission,admissionReceiptSha256:concurrentReceipt,
  sourceShoppingAttemptId:nonzeroClaim.shopping_attempt_id,
  sourceShoppingExecutionScopeSha256:shoppingScope,
  sourceResponseSha256:nonzeroResponseSha,sourceRequestBodySha256:body,
  projected:projected.map((item)=>({sourceId:item.sourceId,
    sourceOfferEvidenceSha256:item.sourceOfferEvidenceSha256,
    offerIdSha256:item.offerIdSha256,projectionSha256:item.projectionSha256})),
  refused:[],observedAt:nonzeroObserved,
}));
const nonzeroComplete=(await db.query(`select * from
 public.complete_flight_consumer_live_public_offer_projection_batch_v1(
 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb)`,
[concurrentAdmission,concurrentReceipt,concurrentScope,policy,admissionPolicy,cohort,subject,
 concurrentAdmissionIdempotency,concurrentRequest,JSON.stringify(search),
 nonzeroClaim.shopping_attempt_id,shoppingScope,nonzeroResponseSha,body,nonzeroBatch,
 nonzeroObserved,1024,JSON.stringify(projected),"[]"])).rows[0];
if (nonzeroComplete?.projected_offer_count!==1)
  throw new Error("Gate119 nonzero projection completion failed.");

const expiredAdmission = "00000000-0000-4000-8000-000000000021";
const expiredReceipt = fixed(30), expiredScope = fixed(31), expiredRequest = fixed(32);
const expiredCreatedAt = new Date(Date.now()-120_000);
await db.query(`insert into public.flight_consumer_live_public_shopping_admissions (
  id,execution_scope_sha256,policy_sha256,admission_policy_sha256,cohort_sha256,
  subject_sha256,idempotency_sha256,request_sha256,admission_state,refusal_code,
  budget_claimed,claim_expires_at,refusal_bucket_sha256,
  subject_minute_claim_count,subject_day_claim_count,cohort_minute_claim_count,
  cohort_day_claim_count,global_minute_claim_count,global_day_claim_count,
  admission_receipt_sha256,created_at)
 values ($1,$2,$3,$4,$5,$6,$7,$8,'admitted',null,true,
   $10::timestamptz+interval '60 seconds',null,
   1,1,1,1,1,1,$9,$10::timestamptz)`,
[expiredAdmission,expiredScope,policy,admissionPolicy,cohort,subject,
 fixed(33),expiredRequest,expiredReceipt,expiredCreatedAt]);
const expiredIdempotency = sha(
  "iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1\0"
  + [expiredAdmission,expiredReceipt,shoppingScope,expiredRequest,body].join(":"),
);
let expired = false;
try { await db.query(sql,[expiredAdmission,expiredReceipt,expiredScope,policy,
  admissionPolicy,cohort,subject,fixed(33),expiredRequest,shoppingScope,
  expiredIdempotency,body,new Date(Date.now()+10_000).toISOString()]); }
catch { expired = true; }
if (!expired) throw new Error("Gate119 accepted an expired admission.");
const counts = (await db.query(`select
 (select count(*)::integer from public.flight_consumer_live_public_shopping_dispatches) dispatches,
 (select count(*)::integer from public.flight_consumer_live_duffel_shopping_attempts) attempts`)).rows[0];
if (counts?.dispatches !== 2 || counts?.attempts !== 2) throw new Error("Gate119 one-shot accounting failed.");
let direct = false;
try { await db.exec("set role authenticated; select * from public.flight_consumer_live_public_shopping_dispatches; reset role;"); }
catch { direct = true; await db.exec("reset role;"); }
if (!direct) throw new Error("Gate119 forced RLS/ACL failed.");
let populatedRollback = false;
try { await db.exec(rollback); } catch { populatedRollback = true; }
if (!populatedRollback) throw new Error("Gate119 populated rollback did not refuse.");

console.log("Flight Consumer Production public-shopping dispatch PGlite verifier passed.");
