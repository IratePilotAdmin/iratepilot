import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const source = await readFile(
  "scripts/verify-flight-consumer-checkout-authorization-bridge-pglite.mjs",
  "utf8",
);
const helperPrefix = source.slice(
  0,
  source.indexOf("const behaviorDb = await createDatabase();"),
);
const helperModule = await import(
  `data:text/javascript;base64,${Buffer.from(
    `${helperPrefix}\nexport { createDatabase, applyExactLineage, seedAuthorizedChain, digest, at, ids };`,
  ).toString("base64")}`
);
const {
  createDatabase,
  applyExactLineage,
  seedAuthorizedChain,
  digest,
  at,
  ids,
} = helperModule;

const migrationNames = [
  "202608260111_flight_consumer_live_stripe_capture_execution_journal.sql",
  "202608260112_flight_consumer_live_duffel_support_identity.sql",
  "202608260113_flight_consumer_live_booking_settlement_evidence.sql",
  "202608260114_flight_consumer_live_stripe_capture_support_identity.sql",
];
const migrations = await Promise.all(migrationNames.map((name) => readFile(
  `supabase/production-migrations/${name}`,
  "utf8",
)));
const rollback114 = await readFile(
  "supabase/production-rollbacks/202608260114_flight_consumer_live_stripe_capture_support_identity.rollback.sql",
  "utf8",
);

const sha256 = (value) => createHash("sha256")
  .update(value, "utf8").digest("hex");
const orderClientCorrelationId = `flt_order_${"a".repeat(48)}`;
const duffelRequestId = "req_0000000000000001";
const captureClientCorrelationId = `flt_capture_${digest(76).slice(0, 48)}`;
const stripeRequestId = "req_0000000000000002";

async function applyPgliteCiphertextCompatibility(database) {
  await database.exec(`
    do $pglite_ciphertext_compat$
    declare constraint_record record;
    begin
      for constraint_record in
        select catalog_constraint.conname
          from pg_catalog.pg_constraint as catalog_constraint
         where catalog_constraint.conrelid =
           'public.flight_consumer_live_checkout_evidence_aggregates'::regclass
           and catalog_constraint.contype = 'c'
           and pg_catalog.pg_get_constraintdef(catalog_constraint.oid) like
             '%payload_ciphertext%'
      loop
        execute format(
          'alter table public.flight_consumer_live_checkout_evidence_aggregates drop constraint %I',
          constraint_record.conname
        );
      end loop;
    end;
    $pglite_ciphertext_compat$;
  `);
}

async function initialize(database) {
  await applyExactLineage(database);
  for (const migration of migrations) await database.exec(migration);
  await applyPgliteCiphertextCompatibility(database);
}

async function claimCapture(database, { claim = true } = {}) {
  await seedAuthorizedChain(database);
  const finalized = await database.query(`
    select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
      $1,0,$2,$3,$4
    )
  `, [ids.checkout, digest(36), digest(38), digest(61)]);
  const bridge = (await database.query(`
    select * from public.flight_consumer_live_checkout_authorization_bridges
  `)).rows[0];
  const preparedOrder = await database.query(`
    select *
      from public.prepare_flight_consumer_live_duffel_order_execution_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        16914,'USD',$17
      )
  `, [
    ids.checkout, digest(36), digest(38),
    finalized.rows[0].state_receipt_sha256, ids.refresh, digest(8), digest(10),
    digest(14), digest(13), digest(18), digest(19), digest(62), digest(63),
    digest(64), digest(65), digest(66), at(240_000),
  ]);
  await database.query(`
    select * from public.claim_flight_consumer_live_duffel_order_execution_v1(
      $1,0,$2,$3,$4,$5
    )
  `, [
    preparedOrder.rows[0].attempt_id, digest(62), digest(64), digest(66),
    digest(67),
  ]);
  const completedOrder = await database.query(`
    select *
      from public.complete_flight_consumer_live_duffel_order_execution_v2(
        $1,1,$2,$3,$4,$5,'succeeded',1,1,null,201,$6,
        'enc:v1:ORDERREFERENCE0001',$7,
        'enc:v1:BOOKINGREFERENCE1',$8,$9,null,$10,$11,$12,$13
      )
  `, [
    preparedOrder.rows[0].attempt_id, digest(62), digest(64), digest(66),
    digest(67), digest(68), digest(69), digest(70), digest(71),
    orderClientCorrelationId, sha256(orderClientCorrelationId),
    duffelRequestId, sha256(duffelRequestId),
  ]);
  if (completedOrder.rows[0]?.decision !== "succeeded") {
    throw new Error("114 fixture could not complete exact 112 order evidence.");
  }

  const preparedCapture = await database.query(`
    select * from public.prepare_flight_consumer_live_stripe_capture_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      $18,16914,'USD',$19,$20
    )
  `, [
    ids.checkout, bridge.authorization_bridge_receipt_sha256,
    ids.confirmation, bridge.confirmation_state_receipt_sha256,
    preparedOrder.rows[0].attempt_id,
    completedOrder.rows[0].state_receipt_sha256,
    digest(69), bridge.payment_intent_reference_sha256, digest(64),
    digest(72), digest(73), digest(74), digest(75), digest(76), digest(77),
    digest(78), digest(79), "capture-signing-key-v1", at(180_000),
    at(120_000),
  ]);
  if (claim) {
    const claimedCapture = await database.query(`
      select * from public.claim_flight_consumer_live_stripe_capture_v1(
        $1,0,$2,$3,$4,$5
      )
    `, [
      preparedCapture.rows[0].attempt_id, digest(72), digest(74), digest(76),
      digest(80),
    ]);
    if (claimedCapture.rows[0]?.decision !== "claimed") {
      throw new Error("114 fixture could not claim exact 111 capture evidence.");
    }
  }
  return {
    attemptId: preparedCapture.rows[0].attempt_id,
    paymentIntentReferenceSha256: bridge.payment_intent_reference_sha256,
  };
}

const successDatabase = await createDatabase();
await initialize(successDatabase);
const successFixture = await claimCapture(successDatabase);
const successArgs = [
  successFixture.attemptId, digest(72), digest(74), digest(76), digest(80),
  digest(81), digest(82), successFixture.paymentIntentReferenceSha256,
  digest(85), captureClientCorrelationId, sha256(captureClientCorrelationId),
  stripeRequestId, sha256(stripeRequestId), "http_response",
];
const success = await successDatabase.query(`
  select * from public.complete_flight_consumer_live_stripe_capture_v2(
    $1,1,$2,$3,$4,$5,'succeeded',1,1,null,200,$6,$7,null,
    'succeeded',$8,16914,'usd',true,'manual',
    'enc:v1:CHARGEREFERENCE001',$9,$10,$11,$12,$13,$14
  )
`, successArgs);
if (success.rows[0]?.decision !== "succeeded") {
  throw new Error("114 structured success did not complete.");
}
const storedSuccess = (await successDatabase.query(`
  select client_correlation_id, client_correlation_id_sha256,
    stripe_request_id, stripe_request_id_sha256, stripe_transport_outcome,
         provider_dispatch_authorized, stripe_dispatch_authorized,
         payment_authorized, capture_authorized, refund_authorized,
         settlement_authorized, ticketing_authorized,
         consumer_release_enabled, blind_retry_authorized
    from public.flight_consumer_live_stripe_capture_attempts
   where id = $1
`, [successFixture.attemptId])).rows[0];
if (storedSuccess?.client_correlation_id !== captureClientCorrelationId
  || storedSuccess?.client_correlation_id_sha256
    !== sha256(captureClientCorrelationId)
  || storedSuccess?.stripe_request_id !== stripeRequestId
  || storedSuccess?.stripe_request_id_sha256 !== sha256(stripeRequestId)
  || storedSuccess?.stripe_transport_outcome !== "http_response"
  || storedSuccess?.provider_dispatch_authorized
  || storedSuccess?.stripe_dispatch_authorized
  || storedSuccess?.payment_authorized
  || storedSuccess?.capture_authorized
  || storedSuccess?.refund_authorized
  || storedSuccess?.settlement_authorized
  || storedSuccess?.ticketing_authorized
  || storedSuccess?.consumer_release_enabled
  || storedSuccess?.blind_retry_authorized) {
  throw new Error("114 success support identity or zero-authority invariant failed.");
}
const observedSupport = (await successDatabase.query(`
  select *
    from public.read_flight_consumer_live_stripe_capture_support_identity_v1(
      $1,$2,$3,$4
    )
`, [
  successFixture.attemptId, digest(72), digest(74), digest(76),
])).rows[0];
if (observedSupport?.decision !== "observed"
  || observedSupport?.attempt_state !== "succeeded"
  || observedSupport?.stripe_capture_request_count !== 1
  || observedSupport?.stripe_mutation_count !== 1
  || observedSupport?.client_correlation_id !== captureClientCorrelationId
  || observedSupport?.stripe_request_id !== stripeRequestId
  || observedSupport?.stripe_transport_outcome !== "http_response") {
  throw new Error("114 exact-bound support identity read failed.");
}
const successReplay = await successDatabase.query(`
  select * from public.complete_flight_consumer_live_stripe_capture_v2(
    $1,1,$2,$3,$4,$5,'succeeded',1,1,null,200,$6,$7,null,
    'succeeded',$8,16914,'usd',true,'manual',
    'enc:v1:CHARGEREFERENCE001',$9,$10,$11,$12,$13,$14
  )
`, successArgs);
if (successReplay.rows[0]?.decision !== "replay") {
  throw new Error("114 exact support identity replay failed.");
}
let changedIdentityRefused = false;
try {
  const changed = [...successArgs];
  changed[11] = "req_0000000000000003";
  changed[12] = sha256(changed[11]);
  await successDatabase.query(`
    select * from public.complete_flight_consumer_live_stripe_capture_v2(
      $1,1,$2,$3,$4,$5,'succeeded',1,1,null,200,$6,$7,null,
      'succeeded',$8,16914,'usd',true,'manual',
      'enc:v1:CHARGEREFERENCE001',$9,$10,$11,$12,$13,$14
    )
  `, changed);
} catch {
  changedIdentityRefused = true;
}
if (!changedIdentityRefused) {
  throw new Error("114 accepted support identity drift on terminal replay.");
}
await successDatabase.exec(`
  alter table public.flight_consumer_live_stripe_capture_receipts
    disable trigger flight_consumer_live_stripe_capture_receipt_append_guard;
`);
await successDatabase.query(`
  delete from public.flight_consumer_live_stripe_capture_receipts
   where attempt_id = $1 and attempt_revision = 2
`, [successFixture.attemptId]);
await successDatabase.exec(`
  alter table public.flight_consumer_live_stripe_capture_receipts
    enable trigger flight_consumer_live_stripe_capture_receipt_append_guard;
`);
let currentReceiptBindingRefused = false;
try {
  await successDatabase.query(`
    select *
      from public.read_flight_consumer_live_stripe_capture_support_identity_v1(
        $1,$2,$3,$4
      )
  `, [successFixture.attemptId, digest(72), digest(74), digest(76)]);
} catch {
  currentReceiptBindingRefused = true;
}
if (!currentReceiptBindingRefused) {
  throw new Error("114 support read accepted a missing current receipt.");
}
await successDatabase.close();

const noResponseDatabase = await createDatabase();
await initialize(noResponseDatabase);
const noResponseFixture = await claimCapture(noResponseDatabase);
const noResponse = await noResponseDatabase.query(`
  select * from public.complete_flight_consumer_live_stripe_capture_v2(
    $1,1,$2,$3,$4,$5,'ambiguous',1,1,
    'stripe_capture_outcome_unknown',null,null,$6,$7,
    null,null,null,null,null,null,null,null,$8,$9,null,null,'no_response'
  )
`, [
  noResponseFixture.attemptId, digest(72), digest(74), digest(76), digest(80),
  digest(86), digest(87), captureClientCorrelationId,
  sha256(captureClientCorrelationId),
]);
const storedNoResponse = (await noResponseDatabase.query(`
  select client_correlation_id, stripe_request_id, terminal_http_status
    from public.flight_consumer_live_stripe_capture_attempts
   where id = $1
`, [noResponseFixture.attemptId])).rows[0];
if (noResponse.rows[0]?.decision !== "ambiguous"
  || storedNoResponse?.client_correlation_id !== captureClientCorrelationId
  || storedNoResponse?.stripe_request_id !== null
  || storedNoResponse?.terminal_http_status !== null) {
  throw new Error("114 no-response support identity invariant failed.");
}
await noResponseDatabase.close();

const falseNoResponseDatabase = await createDatabase();
await initialize(falseNoResponseDatabase);
const falseNoResponseFixture = await claimCapture(falseNoResponseDatabase);
const wrongClientCorrelationId = `flt_capture_${"c".repeat(48)}`;
let nondeterministicClientCorrelationRefused = false;
try {
  await falseNoResponseDatabase.query(`
    select * from public.complete_flight_consumer_live_stripe_capture_v2(
      $1,1,$2,$3,$4,$5,'ambiguous',1,1,
      'stripe_capture_outcome_unknown',null,null,$6,$7,
      null,null,null,null,null,null,null,null,$8,$9,null,null,'no_response'
    )
  `, [
    falseNoResponseFixture.attemptId, digest(72), digest(74), digest(76),
    digest(80), digest(93), digest(94), wrongClientCorrelationId,
    sha256(wrongClientCorrelationId),
  ]);
} catch {
  nondeterministicClientCorrelationRefused = true;
}
if (!nondeterministicClientCorrelationRefused) {
  throw new Error("114 accepted a nondeterministic client correlation ID.");
}
let responseEvidenceWithoutRequestIdRefused = false;
try {
  await falseNoResponseDatabase.query(`
    select * from public.complete_flight_consumer_live_stripe_capture_v2(
      $1,1,$2,$3,$4,$5,'ambiguous',1,1,
      'stripe_capture_outcome_unknown',null,$6,$7,$8,
      null,null,null,null,null,null,null,null,$9,$10,null,null,'no_response'
    )
  `, [
    falseNoResponseFixture.attemptId, digest(72), digest(74), digest(76),
    digest(80), digest(90), digest(91), digest(92),
    captureClientCorrelationId, sha256(captureClientCorrelationId),
  ]);
} catch {
  responseEvidenceWithoutRequestIdRefused = true;
}
await falseNoResponseDatabase.close();
if (!responseEvidenceWithoutRequestIdRefused) {
  throw new Error("114 accepted HTTP response evidence as no-response.");
}

const bypassDatabase = await createDatabase();
await initialize(bypassDatabase);
const bypassFixture = await claimCapture(bypassDatabase);
let v1BypassRefused = false;
try {
  await bypassDatabase.query(`
    select * from public.complete_flight_consumer_live_stripe_capture_v1(
      $1,1,$2,$3,$4,$5,'ambiguous',1,1,'response_timeout',null,null,$6,$7,
      null,null,null,null,null,null,null,null
    )
  `, [
    bypassFixture.attemptId, digest(72), digest(74), digest(76), digest(80),
    digest(88), digest(89),
  ]);
} catch {
  v1BypassRefused = true;
}
if (!v1BypassRefused) {
  throw new Error("114 accepted a direct v1 completion bypass.");
}
let inFlightRollbackRefused = false;
try {
  await bypassDatabase.exec(rollback114);
} catch {
  inFlightRollbackRefused = true;
}
await bypassDatabase.close();
if (!inFlightRollbackRefused) {
  throw new Error("114 rollback accepted an in-flight capture execution.");
}

const preparedRollbackDatabase = await createDatabase();
await initialize(preparedRollbackDatabase);
await claimCapture(preparedRollbackDatabase, { claim: false });
let preparedRollbackRefused = false;
try {
  await preparedRollbackDatabase.exec(rollback114);
} catch {
  preparedRollbackRefused = true;
}
await preparedRollbackDatabase.close();
if (!preparedRollbackRefused) {
  throw new Error("114 rollback accepted a prepared capture execution.");
}

const rollbackDatabase = await createDatabase();
await initialize(rollbackDatabase);
const catalog = (await rollbackDatabase.query(`
  select catalog_class.relrowsecurity, catalog_class.relforcerowsecurity,
    has_function_privilege(
      'service_role',
      'public.complete_flight_consumer_live_stripe_capture_v2(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text,text,text,text,text,text)',
      'EXECUTE'
    ) as service_v2_execute,
    has_function_privilege(
      'service_role',
      'public.complete_flight_consumer_live_stripe_capture_v1(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text)',
      'EXECUTE'
    ) as service_v1_execute,
    has_function_privilege(
      'anon',
      'public.complete_flight_consumer_live_stripe_capture_v2(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text,text,text,text,text,text)',
      'EXECUTE'
    ) as anon_v2_execute
    ,has_function_privilege(
      'service_role',
      'public.read_flight_consumer_live_stripe_capture_support_identity_v1(uuid,text,text,text)',
      'EXECUTE'
    ) as service_read_execute
    ,has_function_privilege(
      'anon',
      'public.read_flight_consumer_live_stripe_capture_support_identity_v1(uuid,text,text,text)',
      'EXECUTE'
    ) as anon_read_execute
    from pg_catalog.pg_class as catalog_class
   where catalog_class.oid =
     'public.flight_consumer_live_stripe_capture_attempts'::regclass
`)).rows[0];
if (!catalog?.relrowsecurity || !catalog?.relforcerowsecurity
  || !catalog?.service_v2_execute || catalog?.service_v1_execute
  || catalog?.anon_v2_execute || !catalog?.service_read_execute
  || catalog?.anon_read_execute) {
  throw new Error("114 forced-RLS or service-only RPC ACL invariant failed.");
}
await rollbackDatabase.exec(rollback114);
const rollbackState = (await rollbackDatabase.query(`
  select
    to_regprocedure(
      'public.complete_flight_consumer_live_stripe_capture_v2(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text,text,text,text,text,text)'
    )::text as complete_v2,
    to_regprocedure(
      'public.complete_flight_consumer_live_stripe_capture_v1(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,bigint,text,boolean,text,text,text)'
    )::text as complete_v1,
    to_regprocedure(
      'public.read_flight_consumer_live_stripe_capture_support_identity_v1(uuid,text,text,text)'
    )::text as support_read,
    exists (
      select 1 from pg_catalog.pg_attribute
       where attrelid =
         'public.flight_consumer_live_stripe_capture_attempts'::regclass
         and attname = 'client_correlation_id'
         and not attisdropped
    ) as support_column
`)).rows[0];
await rollbackDatabase.close();
if (rollbackState.complete_v2 !== null
  || rollbackState.complete_v1 === null
  || rollbackState.support_read !== null
  || rollbackState.support_column) {
  throw new Error("114 empty rollback did not restore the exact 113 boundary.");
}

process.stdout.write(`${JSON.stringify({
  exactApplyThrough: "202608260114",
  success: success.rows[0].decision,
  successReplay: successReplay.rows[0].decision,
  changedIdentityRefused,
  currentReceiptBindingRefused,
  noResponse: noResponse.rows[0].decision,
  noResponseClientCorrelationRetained: true,
  noResponseStripeRequestIdUnavailable: true,
  responseEvidenceWithoutRequestIdRefused,
  nondeterministicClientCorrelationRefused,
  httpResponseStripeRequestIdRetained: true,
  exactSupportIdentityRead: true,
  v1BypassRefused,
  inFlightRollbackRefused,
  preparedRollbackRefused,
  forcedRls: true,
  allAuthoritiesFalse: true,
  emptyRollbackRestored113: true,
})}\n`);
