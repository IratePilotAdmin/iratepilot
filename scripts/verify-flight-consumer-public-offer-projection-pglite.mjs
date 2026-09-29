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
];
const migrations = await Promise.all(names.map((name) => readFile(
  `supabase/production-migrations/${name}`, "utf8",
)));
const rollback = await readFile(
  "supabase/production-rollbacks/202608260116_flight_consumer_live_public_offer_projection.rollback.sql",
  "utf8",
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fixed = (value) => value.toString(16).padStart(64, "0");
const canonical = (value) => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const evidence = (value) => sha(canonical(value));
async function makeDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create role anon; create role authenticated; create role service_role;
    create function auth.role() returns text language sql stable as $$ select 'service_role' $$;`);
  return db;
}
async function apply(db) { for (const migration of migrations) await db.exec(migration); }

const db = await makeDb(); await apply(db);
const search = { adults: 1, cabin: "economy", departureDate: "2026-09-10",
  destination: "LHR", origin: "ORD", returnDate: null };
const admissionScope = fixed(1), policy = fixed(2), cohort = fixed(3), subject = fixed(4);
const admissionPolicy = sha(
  "iratepilot:flight-consumer-production:public-shopping-admission-policy:v1\0"
  + `${policy}:subjectMinute=2:subjectDay=10:cohortMinute=10:`
  + "cohortDay=100:globalMinute=20:globalDay=250:claimTtlSeconds=60",
);
const request = evidence({ version: "flight-consumer-production-public-shopping-admission-request-v1",
  executionScopeSha256: admissionScope, policySha256: policy,
  admissionPolicySha256: admissionPolicy, cohortSha256: cohort,
  subjectSha256: subject, search });
const admission = (await db.query(`select * from
 public.reserve_flight_consumer_live_public_shopping_admission_v1($1,$2,$3,$4,$5,$6)`,
[admissionScope, policy, cohort, subject, fixed(5), request])).rows[0];
if (admission?.admission_state !== "admitted") throw new Error("115 fixture failed.");

const sourceScope = fixed(6);
const requestBody = { data: { cabin_class: "economy", passengers: [{ type: "adult" }],
  slices: [{ departure_date: "2026-09-10", destination: "LHR", origin: "ORD" }] } };
const bodySha = sha(canonical(requestBody));
const prepared = (await db.query(`select * from
 public.prepare_flight_consumer_live_duffel_shopping_attempt_v1($1,$2,$3,$4,$5)`,
[sourceScope, fixed(7), fixed(8), bodySha,
  new Date(Date.now() + 60_000).toISOString()])).rows[0];
await db.query("select * from public.claim_flight_consumer_live_duffel_shopping_attempt_v1($1,0,$2)",
  [prepared.attempt_id, sourceScope]);
const responseSha = fixed(9), providerOfferId = "off_12345678";
const offerIdSha = sha(
  `iratepilot:flight-consumer-production:duffel-live:offer-id:v1\0${providerOfferId}`,
);
const expiry = new Date(Date.now() + 3_600_000).toISOString();
const sourceId = "00000000-0000-4000-8000-000000000010";
const sourceEvidence = sha(
  "iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1\0"
  + [prepared.attempt_id, sourceScope, responseSha, offerIdSha,
    new Date(expiry).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z")].join(":"),
);
// Exact Gate 105 row shape is inserted directly because its original RPC has a
// separately tracked PostgreSQL output-variable ambiguity in ON CONFLICT.
await db.query(`insert into public.flight_consumer_live_duffel_offer_sources(
 id,source_shopping_attempt_id,source_shopping_execution_scope_sha256,
 source_response_sha256,offer_id_sha256,source_offer_evidence_sha256,expires_at)
 values($1,$2,$3,$4,$5,$6,$7)`, [sourceId, prepared.attempt_id, sourceScope,
  responseSha, offerIdSha, sourceEvidence, expiry]);
const crossScopeSourceId = "00000000-0000-4000-8000-000000000012";
await db.query(`insert into public.flight_consumer_live_duffel_offer_sources(
 id,source_shopping_attempt_id,source_shopping_execution_scope_sha256,
 source_response_sha256,offer_id_sha256,source_offer_evidence_sha256,expires_at)
 values($1,$2,$3,$4,$5,$6,$7)`, [crossScopeSourceId, prepared.attempt_id,
  fixed(96), responseSha, fixed(97), fixed(98), expiry]);
let crossScopeAccepted = false;
try {
  await db.query(`select * from
 public.list_flight_consumer_live_duffel_pending_offer_sources_v1($1,$2,$3)`,
  [prepared.attempt_id, sourceScope, responseSha]);
  crossScopeAccepted = true;
} catch {}
if (crossScopeAccepted) throw new Error("116 cross-scope source row was accepted.");
await db.query(`delete from public.flight_consumer_live_duffel_offer_sources
 where id = $1`, [crossScopeSourceId]);
const pending = (await db.query(`select * from
 public.list_flight_consumer_live_duffel_pending_offer_sources_v1($1,$2,$3)`,
[prepared.attempt_id, sourceScope, responseSha])).rows;
if (pending.length !== 1) throw new Error("116 source list failed.");

const owner = { name: "Example Air", iataCode: "EA" };
const termsSummarySha256 = evidence({
  version: "flight-consumer-production-public-offer-terms-v1", owner,
  change: { allowed: true, penaltyAmountMinor: 5000 },
  refund: { allowed: true, penaltyAmountMinor: 7000 },
});
const localOfferId = "00000000-0000-4000-8000-000000000011";
const projection = { localOfferId, displayRank: 1, providerCode: "duffel", owner,
  price: { currency: "USD", baseAmountMinor: 10000, taxAmountMinor: 2000,
    totalAmountMinor: 12000 }, passengerIdentityDocumentsRequired: false,
  requiresInstantPayment: true, offerExpiresAt: expiry,
  presentationExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  terms: { changeable: true, refundable: true, changePenaltyAmountMinor: 5000,
    refundPenaltyAmountMinor: 7000, termsSummarySha256 },
  segments: [{ sliceSequence: 1, segmentSequence: 1, journeyDirection: "outbound",
    originIata: "ORD", destinationIata: "LHR",
    departingAtLocal: "2026-09-10T10:00:00", arrivingAtLocal: "2026-09-10T22:00:00",
    originTimeZone: "America/Chicago", destinationTimeZone: "Europe/London",
    marketingCarrierName: "Example Air", marketingCarrierIataCode: "EA",
    operatingCarrierName: "Example Air", operatingCarrierIataCode: "EA",
    marketingFlightNumber: "123", durationMinutes: 480, cabin: "economy" }] };
const projectionSha = evidence({
  version: "flight-consumer-production-public-offer-projection-v1",
  admissionId: admission.admission_id, sourceId: pending[0].source_id,
  sourceOfferEvidenceSha256: pending[0].source_offer_evidence_sha256,
  offerIdSha256: offerIdSha, projection });
const ciphertext = "enc:v1:abcdefghijklmnop";
const expiryMicros = new Date(expiry).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
const aadSha = sha("iratepilot:flight-consumer-production:duffel-offer-reference-aad:v1\0"
  + [admission.admission_receipt_sha256, subject, request, localOfferId,
    pending[0].source_id, pending[0].source_offer_evidence_sha256, projectionSha,
    expiryMicros, "kms-v1"].join(":"));
const projected = [{ sourceId: pending[0].source_id,
  sourceOfferEvidenceSha256: pending[0].source_offer_evidence_sha256,
  offerIdSha256: offerIdSha, projectionSha256: projectionSha, projection,
  encryptedReference: {
    version: "flight-consumer-live-duffel-offer-reference-encryption-v1",
    ciphertext, plaintextReferenceSha256: offerIdSha, keyVersion: "kms-v1",
    aadSha256: aadSha,
    ciphertextSha256: sha(
      `iratepilot:flight-consumer-production:duffel-offer-reference-ciphertext:v1\0${ciphertext}`,
    ), recordHmacSha256: fixed(15),
  } }];
const observed = new Date().toISOString();
const projectionBatchSha = evidence({
  version: "flight-consumer-production-public-offer-projection-batch-v1",
  admissionId: admission.admission_id,
  admissionReceiptSha256: admission.admission_receipt_sha256,
  sourceShoppingAttemptId: prepared.attempt_id,
  sourceShoppingExecutionScopeSha256: sourceScope,
  sourceResponseSha256: responseSha, sourceRequestBodySha256: bodySha,
  projected: projected.map((item) => ({ sourceId: item.sourceId,
    sourceOfferEvidenceSha256: item.sourceOfferEvidenceSha256,
    offerIdSha256: item.offerIdSha256, projectionSha256: item.projectionSha256 })),
  refused: [], observedAt: observed,
});
const args = [admission.admission_id, admission.admission_receipt_sha256,
  admissionScope, policy, admissionPolicy, cohort, subject, fixed(5), request,
  JSON.stringify(search), prepared.attempt_id, sourceScope, responseSha, bodySha,
  projectionBatchSha, observed, 1024, JSON.stringify(projected), JSON.stringify([])];
const sql = `select * from public.complete_flight_consumer_live_public_offer_projection_batch_v1(
 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,
 $18::jsonb,$19::jsonb)`;
const variant = (changedProjection) => {
  const changedSha = evidence({
    version: "flight-consumer-production-public-offer-projection-v1",
    admissionId: admission.admission_id, sourceId: pending[0].source_id,
    sourceOfferEvidenceSha256: pending[0].source_offer_evidence_sha256,
    offerIdSha256: offerIdSha, projection: changedProjection,
  });
  const changedAad = sha(
    "iratepilot:flight-consumer-production:duffel-offer-reference-aad:v1\0"
    + [admission.admission_receipt_sha256, subject, request, localOfferId,
      pending[0].source_id, pending[0].source_offer_evidence_sha256, changedSha,
      expiryMicros, "kms-v1"].join(":"),
  );
  return [{ ...projected[0], projectionSha256: changedSha,
    projection: changedProjection,
    encryptedReference: { ...projected[0].encryptedReference, aadSha256: changedAad } }];
};
for (const invalidProjection of [
  { ...projection, segments: [{ ...projection.segments[0], cabin: "business" }] },
  { ...projection, segments: [{ ...projection.segments[0], sliceSequence: 2,
    journeyDirection: "return" }] },
  { ...projection, passengerIdentityDocumentsRequired: null },
  { ...projection, requiresInstantPayment: null },
  { ...projection, providerCode: null },
  { ...projection, displayRank: "1" },
  { ...projection, price: { ...projection.price, totalAmountMinor: "12000" } },
  { ...projection, segments: [{ ...projection.segments[0],
    departingAtLocal: "2026-09-11T10:00:00" }] },
  { ...projection, price: { ...projection.price, currency: "EUR" } },
  { ...projection, terms: { ...projection.terms, changeable: null,
    changePenaltyAmountMinor: null,
    termsSummarySha256: evidence({
      version: "flight-consumer-production-public-offer-terms-v1", owner,
      change: { allowed: null, penaltyAmountMinor: null },
      refund: { allowed: true, penaltyAmountMinor: 7000 },
    }) } },
]) {
  const invalidItems = variant(invalidProjection);
  const invalidBatch = evidence({
    version: "flight-consumer-production-public-offer-projection-batch-v1",
    admissionId: admission.admission_id,
    admissionReceiptSha256: admission.admission_receipt_sha256,
    sourceShoppingAttemptId: prepared.attempt_id,
    sourceShoppingExecutionScopeSha256: sourceScope,
    sourceResponseSha256: responseSha, sourceRequestBodySha256: bodySha,
    projected: invalidItems.map((item) => ({ sourceId: item.sourceId,
      sourceOfferEvidenceSha256: item.sourceOfferEvidenceSha256,
      offerIdSha256: item.offerIdSha256,
      projectionSha256: item.projectionSha256 })),
    refused: [], observedAt: observed,
  });
  let rejected = false;
  try { await db.query(sql, args.with(14, invalidBatch)
    .with(17, JSON.stringify(invalidItems))); }
  catch { rejected = true; }
  if (!rejected) throw new Error("116 accepted an invalid cabin/slice topology.");
}
const created = (await db.query(sql, args)).rows[0];
if (created?.decision !== "created" || created?.projected_offer_count !== 1) {
  throw new Error("116 non-empty create failed.");
}
const safe = (await db.query(`select * from
 public.read_flight_consumer_live_public_offer_projection_batch_v1($1,$2,$3,$4)`,
[admission.admission_id, admission.admission_receipt_sha256, subject, request])).rows;
if (safe.length !== 1 || safe[0].local_offer_id !== localOfferId
  || JSON.stringify(safe).includes(providerOfferId)
  || JSON.stringify(safe).includes(ciphertext)) throw new Error("116 safe read failed.");
const replay = (await db.query(sql, args)).rows[0];
if (replay?.decision !== "replay" || replay.batch_id !== created.batch_id) {
  throw new Error("116 replay failed.");
}
for (const invalidArgs of [args.with(1, null), args.with(14, fixed(14))]) {
  let rejected = false;
  try { await db.query(sql, invalidArgs); } catch { rejected = true; }
  if (!rejected) throw new Error("116 accepted a null/forged replay binding.");
}
let collision = false;
try { await db.query(sql, args.with(16, 1025)); } catch { collision = true; }
if (!collision) throw new Error("116 replay collision accepted.");
const posture = (await db.query(`select relrowsecurity, relforcerowsecurity,
 has_function_privilege('anon',
 'public.complete_flight_consumer_live_public_offer_projection_batch_v1(uuid,text,text,text,text,text,text,text,text,jsonb,uuid,text,text,text,text,timestamptz,integer,jsonb,jsonb)',
 'EXECUTE') as anon_execute from pg_class where oid =
 'public.flight_consumer_live_public_offer_reference_vaults'::regclass`)).rows[0];
if (!posture.relrowsecurity || !posture.relforcerowsecurity || posture.anon_execute) {
  throw new Error("116 RLS/ACL posture failed.");
}
let refused = false; try { await db.exec(rollback); } catch { refused = true; }
if (!refused) throw new Error("116 populated rollback succeeded.");
const empty = await makeDb(); await apply(empty); await empty.exec(rollback);
console.log("Flight Consumer Production public-offer projection behavioral PGlite verifier passed.");
