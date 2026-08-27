import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const dist = process.env.PGLITE_DIST;
if (!dist) throw new Error("PGLITE_DIST is required.");
const { PGlite } = await import(pathToFileURL(`${dist}/index.js`).href);
const { pgcrypto } = await import(pathToFileURL(`${dist}/contrib/pgcrypto.js`).href);

const migrationNames = [
  "202608260101_flight_consumer_live_duffel_shopping_journal.sql",
  "202608260102_flight_consumer_live_duffel_shopping_rpc_qualification_repair.sql",
  "202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql",
  "202608260115_flight_consumer_live_public_shopping_admission.sql",
  "202608260116_flight_consumer_live_public_offer_projection.sql",
  "202608260117_flight_consumer_live_public_offer_reference_retention.sql",
  "202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql",
  "202608260119_flight_consumer_live_public_shopping_dispatch.sql",
  "202608260139_flight_consumer_live_private_preview_foundation.sql",
];
const migrations = await Promise.all(migrationNames.map((name) => readFile(
  `supabase/production-migrations/${name}`, "utf8",
)));
const rollback = await readFile(
  "supabase/production-rollbacks/202608260139_flight_consumer_live_private_preview_foundation.rollback.sql",
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

const admissionScope = fixed(1);
const policy = fixed(2);
const cohort = fixed(3);
const subject = fixed(4);
const shoppingScope = fixed(5);
const admissionPolicy = sha(
  "iratepilot:flight-consumer-production:public-shopping-admission-policy:v1\0"
  + policy
  + ":subjectMinute=2:subjectDay=10:cohortMinute=10:cohortDay=100"
  + ":globalMinute=20:globalDay=250:claimTtlSeconds=60",
);
const search = { adults: 1, cabin: "economy", departureDate: "2026-09-10",
  destination: "LHR", origin: "ORD", returnDate: null };

const membershipExpiry = new Date(Date.now() + 3_600_000).toISOString();
const membershipSql = `select * from
 public.record_flight_consumer_live_private_preview_membership_event_v1(
 $1,$2,$3,$4,$5,$6)`;
const grantArgs = [policy, cohort, subject, fixed(6), "granted", membershipExpiry];
const grant = (await db.query(membershipSql, grantArgs)).rows[0];
if (grant?.decision !== "created" || grant?.membership_active !== true
  || grant?.provider_dispatch_authorized !== false
  || grant?.consumer_exposure_authorized !== false) {
  throw new Error("Gate139 membership grant failed.");
}
const grantReplay = (await db.query(membershipSql, grantArgs)).rows[0];
if (grantReplay?.decision !== "replay"
  || grantReplay?.membership_receipt_sha256 !== grant.membership_receipt_sha256) {
  throw new Error("Gate139 membership exact replay failed.");
}
let membershipCollision = false;
try { await db.query(membershipSql, grantArgs.with(4, "revoked").with(5, null)); }
catch { membershipCollision = true; }
if (!membershipCollision) throw new Error("Gate139 accepted membership collision.");

const expiredCreatedAt = new Date(Date.now() - 120_000).toISOString();
const expiredClaimAt = new Date(Date.now() - 60_000).toISOString();
const expiredIdempotency = fixed(7);
await db.query(`insert into
 public.flight_consumer_live_private_preview_limiter_claims (
  execution_scope_sha256, policy_sha256, admission_policy_sha256,
  cohort_sha256, subject_sha256, idempotency_sha256, request_sha256,
  membership_event_id, membership_receipt_sha256, membership_not_after,
  claim_expires_at, subject_minute_claim_count, subject_day_claim_count,
  cohort_minute_claim_count, cohort_day_claim_count,
  global_minute_claim_count, global_day_claim_count,
  limiter_receipt_sha256, created_at
 ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,1,1,1,1,1,$12,$13)`, [
  admissionScope, policy, admissionPolicy, cohort, subject,
  expiredIdempotency, fixed(8), grant.membership_event_id,
  grant.membership_receipt_sha256, membershipExpiry, expiredClaimAt,
  fixed(9), expiredCreatedAt,
]);
let expiredReplayRefused = false;
try {
  await db.query(`select * from
   public.consume_flight_consumer_live_private_preview_limiter_v1(
    $1,$2,$3,$4,$5,$6)`, [admissionScope, policy, cohort, subject,
    expiredIdempotency, fixed(8)]);
} catch { expiredReplayRefused = true; }
if (!expiredReplayRefused) {
  throw new Error("Gate139 allowed an expired limiter claim replay.");
}

const limiterSql = `select * from
 public.consume_flight_consumer_live_private_preview_limiter_v1(
 $1,$2,$3,$4,$5,$6)`;
const reserveSql = `select * from
 public.reserve_flight_consumer_live_public_shopping_admission_v1(
 $1,$2,$3,$4,$5,$6)`;
const dispatchSql = `select * from
 public.claim_flight_consumer_live_public_shopping_dispatch_v1(
 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`;

async function startFlow(index, deadlineMs) {
  const idempotency = fixed(20 + index);
  const request = sha(canonical({
    version: "flight-consumer-production-public-shopping-admission-request-v1",
    executionScopeSha256: admissionScope,
    policySha256: policy,
    admissionPolicySha256: admissionPolicy,
    cohortSha256: cohort,
    subjectSha256: subject,
    search,
  }));
  const limited = (await db.query(limiterSql, [
    admissionScope, policy, cohort, subject, idempotency, request,
  ])).rows[0];
  if (limited?.decision !== "allowed" || limited?.claim_expires_at == null) {
    throw new Error(`Gate139 limiter claim ${index} failed.`);
  }
  const admission = (await db.query(reserveSql, [
    admissionScope, policy, cohort, subject, idempotency, request,
  ])).rows[0];
  if (admission?.decision !== "created" || admission?.admission_state !== "admitted") {
    throw new Error(`Gate115 admission ${index} failed.`);
  }
  // Gate115 derives the policy digest. Rebind the canonical request to the
  // exact returned digest before Gate119, matching the runtime contract.
  const exactRequest = sha(canonical({
    version: "flight-consumer-production-public-shopping-admission-request-v1",
    executionScopeSha256: admissionScope,
    policySha256: policy,
    admissionPolicySha256: admission.admission_policy_sha256,
    cohortSha256: cohort,
    subjectSha256: subject,
    search,
  }));
  if (exactRequest !== request) {
    // The fixture supplied a placeholder above only to expose a setup error.
    // Real flows must consume and reserve the exact same canonical request.
    throw new Error("Gate139 fixture request binding is invalid.");
  }
  const body = sha(
    '{"data":{"cabin_class":"economy","passengers":[{"type":"adult"}],'
    + '"slices":[{"departure_date":"2026-09-10","destination":"LHR",'
    + '"origin":"ORD"}]}}',
  );
  const shoppingIdempotency = sha(
    "iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1\0"
    + [admission.admission_id, admission.admission_receipt_sha256,
      shoppingScope, request, body].join(":"),
  );
  const deadline = new Date(Date.now() + deadlineMs).toISOString();
  const dispatch = (await db.query(dispatchSql, [
    admission.admission_id, admission.admission_receipt_sha256,
    admissionScope, policy, admission.admission_policy_sha256, cohort,
    subject, idempotency, request, shoppingScope, shoppingIdempotency,
    body, deadline,
  ])).rows[0];
  if (dispatch?.decision !== "created"
    || dispatch?.create_offer_request_dispatch_authorized !== true) {
    throw new Error(`Gate119 dispatch ${index} failed.`);
  }
  return { index, idempotency, request, body, admission, dispatch };
}

async function completeZero(flow) {
  const raw = `{"data":{"id":"orq_${flow.index}2345678","live_mode":true,"offers":[]}}`;
  const response = sha(raw);
  await db.query(`select * from
   public.record_flight_consumer_live_duffel_offer_sources_v1($1,$2,$3,$4::jsonb)`,
  [flow.dispatch.shopping_attempt_id, shoppingScope, response, "[]"]);
  const observedAt = (await db.query(
    "select date_trunc('milliseconds',clock_timestamp()) observed_at",
  )).rows[0].observed_at.toISOString();
  const projectionBatch = sha(canonical({
    version: "flight-consumer-production-public-offer-projection-batch-v1",
    admissionId: flow.admission.admission_id,
    admissionReceiptSha256: flow.admission.admission_receipt_sha256,
    sourceShoppingAttemptId: flow.dispatch.shopping_attempt_id,
    sourceShoppingExecutionScopeSha256: shoppingScope,
    sourceResponseSha256: response,
    sourceRequestBodySha256: flow.body,
    projected: [],
    refused: [],
    observedAt,
  }));
  const completed = (await db.query(`select * from
   public.complete_flight_consumer_live_public_offer_projection_batch_v1(
   $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb)`,
  [flow.admission.admission_id, flow.admission.admission_receipt_sha256,
    admissionScope, policy, flow.admission.admission_policy_sha256, cohort,
    subject, flow.idempotency, flow.request, JSON.stringify(search),
    flow.dispatch.shopping_attempt_id, shoppingScope, response, flow.body,
    projectionBatch, observedAt, Buffer.byteLength(raw), "[]", "[]"])).rows[0];
  if (completed?.projected_offer_count !== 0
    || completed?.refused_offer_count !== 0) {
    throw new Error(`Gate116 zero completion ${flow.index} failed.`);
  }
  return { projectionBatch, completed };
}

const directFlow = await startFlow(1, 10_000);
const directProjection = await completeZero(directFlow);
const previewScope = sha(canonical({
  version: "flight-consumer-production-private-preview-exposure-scope-v1",
  migrationVersion: "202608260139",
  admissionExecutionScopeSha256: admissionScope,
  policySha256: policy,
  admissionPolicySha256: directFlow.admission.admission_policy_sha256,
  cohortSha256: cohort,
  privatePreviewExposureOnly: true,
  consumerPublicReleaseAuthorized: false,
  orderAuthorized: false,
  stripeDispatchAuthorized: false,
  bookingAuthorized: false,
  paymentAuthorized: false,
  captureAuthorized: false,
  refundAuthorized: false,
  settlementAuthorized: false,
  ticketingAuthorized: false,
  servicingAuthorized: false,
  consumerReleaseEnabled: false,
  blindRetryAuthorized: false,
}));
const exposureSql = `select * from
 public.authorize_flight_consumer_live_private_preview_exposure_v1(
 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`;
const directExposureArgs = [previewScope, directFlow.admission.admission_id,
  directFlow.admission.admission_receipt_sha256, subject, directFlow.request,
  directFlow.dispatch.dispatch_id, directFlow.dispatch.dispatch_receipt_sha256,
  directProjection.completed.projection_batch_sha256,
  directProjection.completed.projection_receipt_sha256, 0, 0, 0,
  new Date(Date.now() + 60_000).toISOString()];
const directExposure = (await db.query(exposureSql, directExposureArgs)).rows[0];
if (directExposure?.decision !== "created"
  || directExposure?.reconciliation_mode !== "direct"
  || directExposure?.private_preview_exposure_authorized !== true
  || directExposure?.consumer_public_release_authorized !== false) {
  throw new Error("Gate139 direct zero exposure failed.");
}
const directReplay = (await db.query(exposureSql, directExposureArgs)).rows[0];
if (directReplay?.decision !== "replay"
  || directReplay?.exposure_receipt_sha256
    !== directExposure.exposure_receipt_sha256) {
  throw new Error("Gate139 direct exposure replay failed.");
}
let exposureCollision = false;
try { await db.query(exposureSql,
  directExposureArgs.with(12, new Date(Date.now() + 50_000).toISOString())); }
catch { exposureCollision = true; }
if (!exposureCollision) throw new Error("Gate139 accepted exposure collision.");
const zeroRead = (await db.query(`select * from
 public.read_flight_consumer_live_private_preview_offer_batch_v1($1,$2,$3)`,
[directExposure.exposure_receipt_sha256, subject, directFlow.request])).rows;
if (zeroRead.length !== 0) throw new Error("Gate139 zero safe read failed.");

const lateFlow = await startFlow(2, 2_000);
await new Promise((resolve) => setTimeout(resolve, 2_200));
const classified = (await db.query(`select * from
 public.classify_flight_consumer_live_private_preview_stale_dispatches_v1(25)`)).rows;
if (classified.length !== 1
  || classified[0]?.dispatch_id !== lateFlow.dispatch.dispatch_id
  || classified[0]?.provider_redispatch_authorized !== false) {
  throw new Error("Gate139 bounded stale classification failed.");
}
const stillDispatching = (await db.query(`select attempt_state from
 public.flight_consumer_live_duffel_shopping_attempts where id=$1`,
[lateFlow.dispatch.shopping_attempt_id])).rows[0];
if (stillDispatching?.attempt_state !== "dispatching") {
  throw new Error("Gate139 stale classification terminalized Gate101.");
}
const lateProjection = await completeZero(lateFlow);
const lateExposureArgs = [previewScope, lateFlow.admission.admission_id,
  lateFlow.admission.admission_receipt_sha256, subject, lateFlow.request,
  lateFlow.dispatch.dispatch_id, lateFlow.dispatch.dispatch_receipt_sha256,
  lateProjection.completed.projection_batch_sha256,
  lateProjection.completed.projection_receipt_sha256, 0, 0, 0,
  new Date(Date.now() + 60_000).toISOString()];
const lateExposure = (await db.query(exposureSql, lateExposureArgs)).rows[0];
if (lateExposure?.reconciliation_mode !== "late_success_after_stale"
  || lateExposure?.private_preview_exposure_authorized !== true) {
  throw new Error("Gate139 late-success exposure reconciliation failed.");
}
const noMoreStale = (await db.query(`select * from
 public.classify_flight_consumer_live_private_preview_stale_dispatches_v1(25)`)).rows;
if (noMoreStale.length !== 0) throw new Error("Gate139 stale evidence replayed.");

for (let index = 0; index < 8; index += 1) {
  const refused = (await db.query(limiterSql, [admissionScope, policy, cohort,
    subject, fixed(40 + index), fixed(50 + index)])).rows[0];
  if (refused?.decision !== "refused"
    || refused?.refusal_code !== "subject_minute_budget_exhausted"
    || ["subject_minute_claim_count", "subject_day_claim_count",
      "cohort_minute_claim_count", "cohort_day_claim_count",
      "global_minute_claim_count", "global_day_claim_count"]
      .some((field) => refused?.[field] !== 0)) {
    throw new Error("Gate139 subject budget refusal failed.");
  }
}
const boundedRefusals = (await db.query(`select count(*)::integer count from
 public.flight_consumer_live_private_preview_limiter_refusals`)).rows[0].count;
if (boundedRefusals !== 1) throw new Error("Gate139 refusal evidence is unbounded.");
let limiterCollision = false;
try { await db.query(limiterSql, [admissionScope, policy, cohort, subject,
  directFlow.idempotency, fixed(61)]); } catch { limiterCollision = true; }
if (!limiterCollision) throw new Error("Gate139 accepted limiter replay collision.");

const revoked = (await db.query(membershipSql,
  [policy, cohort, subject, fixed(62), "revoked", null])).rows[0];
if (revoked?.event_type !== "revoked" || revoked?.membership_active !== false) {
  throw new Error("Gate139 membership revocation failed.");
}
const replayedGrantAfterRevoke = (await db.query(membershipSql, grantArgs)).rows[0];
if (replayedGrantAfterRevoke?.decision !== "replay"
  || replayedGrantAfterRevoke?.membership_active !== false) {
  throw new Error("Gate139 old grant replay bypassed the latest revocation.");
}
let revokedRead = false;
try { await db.query(`select * from
 public.read_flight_consumer_live_private_preview_offer_batch_v1($1,$2,$3)`,
[directExposure.exposure_receipt_sha256, subject, directFlow.request]); }
catch { revokedRead = true; }
if (!revokedRead) throw new Error("Gate139 read survived membership revocation.");
const inactive = (await db.query(limiterSql, [admissionScope, policy, cohort,
  subject, fixed(63), fixed(64)])).rows[0];
if (inactive?.decision !== "refused" || inactive?.refusal_code !== "membership_inactive") {
  throw new Error("Gate139 limiter ignored membership revocation.");
}

let acl = false;
try { await db.exec(`set role authenticated;
  select * from public.flight_consumer_live_private_preview_exposures;`); }
catch { acl = true; } finally { await db.exec("reset role;"); }
if (!acl) throw new Error("Gate139 forced RLS/ACL failed.");
let immutable = false;
try { await db.query(`update public.flight_consumer_live_private_preview_exposures
 set exposure_not_after=exposure_not_after where id=$1`, [directExposure.exposure_id]); }
catch { immutable = true; }
if (!immutable) throw new Error("Gate139 exposure evidence is mutable.");
let rollbackRefused = false;
try { await db.exec(rollback); } catch { rollbackRefused = true; }
if (!rollbackRefused) throw new Error("Gate139 rollback did not refuse.");

console.log("Flight Consumer Production private-preview Gate139 PGlite verifier passed.");
