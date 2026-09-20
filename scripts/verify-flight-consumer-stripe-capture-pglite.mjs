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

async function removePgliteOnlyCiphertextChecks(database) {
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

const migration111 = await readFile(
  "supabase/production-migrations/202608260111_flight_consumer_live_stripe_capture_execution_journal.sql",
  "utf8",
);
const rollback111 = await readFile(
  "supabase/production-rollbacks/202608260111_flight_consumer_live_stripe_capture_execution_journal.rollback.sql",
  "utf8",
);

const database = await createDatabase();
await applyExactLineage(database);
await database.exec(migration111);
await removePgliteOnlyCiphertextChecks(database);
await seedAuthorizedChain(database);

const finalized = await database.query(`
  select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
    $1,0,$2,$3,$4
  )
`, [ids.checkout, digest(36), digest(38), digest(61)]);
if (finalized.rows[0]?.decision !== "finalized") {
  throw new Error("111 fixture could not finalize the exact 110 checkout.");
}
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
const claimedOrder = await database.query(`
  select * from public.claim_flight_consumer_live_duffel_order_execution_v1(
    $1,0,$2,$3,$4,$5
  )
`, [
  preparedOrder.rows[0].attempt_id, digest(62), digest(64), digest(66),
  digest(67),
]);
if (claimedOrder.rows[0]?.decision !== "claimed") {
  throw new Error("111 fixture could not claim the exact 108 order.");
}
const completedOrder = await database.query(`
  select * from public.complete_flight_consumer_live_duffel_order_execution_v1(
    $1,1,$2,$3,$4,$5,'succeeded',1,1,null,201,$6,
    'enc:v1:ORDERREFERENCE0001',$7,
    'enc:v1:BOOKINGREFERENCE1',$8,$9,null
  )
`, [
  preparedOrder.rows[0].attempt_id, digest(62), digest(64), digest(66),
  digest(67), digest(68), digest(69), digest(70), digest(71),
]);
if (completedOrder.rows[0]?.decision !== "succeeded") {
  throw new Error("111 fixture could not record exact 108 order success.");
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
if (preparedCapture.rows[0]?.decision !== "created") {
  throw new Error("111 exact preparation failed.");
}
const replayCapture = await database.query(`
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
if (replayCapture.rows[0]?.decision !== "replay") {
  throw new Error("111 exact preparation replay failed.");
}
const claimedCapture = await database.query(`
  select * from public.claim_flight_consumer_live_stripe_capture_v1(
    $1,0,$2,$3,$4,$5
  )
`, [
  preparedCapture.rows[0].attempt_id, digest(72), digest(74), digest(76),
  digest(80),
]);
if (claimedCapture.rows[0]?.decision !== "claimed") {
  throw new Error("111 exact capture claim failed.");
}
const ambiguousCapture = await database.query(`
  select * from public.complete_flight_consumer_live_stripe_capture_v1(
    $1,1,$2,$3,$4,$5,'ambiguous',1,1,'response_timeout',null,null,$6,$7,
    null,null,null,null,null,null,null,null
  )
`, [
  preparedCapture.rows[0].attempt_id, digest(72), digest(74), digest(76),
  digest(80), digest(81), digest(82),
]);
if (ambiguousCapture.rows[0]?.decision !== "ambiguous") {
  throw new Error("111 exact ambiguous terminal recording failed.");
}
let wrongReconciledPaymentIntentRefused = false;
try {
  await database.query(`
    select * from public.reconcile_flight_consumer_live_stripe_capture_v1(
      $1,2,$2,$3,$4,'succeeded',1,$5,$6,'succeeded',$7,16914,'usd',true,
      'manual','enc:v1:CHARGEREFERENCE001',$8
    )
  `, [
    preparedCapture.rows[0].attempt_id, digest(72), digest(74), digest(80),
    digest(83), digest(84), digest(86), digest(85),
  ]);
} catch {
  wrongReconciledPaymentIntentRefused = true;
}
if (!wrongReconciledPaymentIntentRefused) {
  throw new Error("111 reconciled success accepted a different PaymentIntent.");
}
const reconciledCapture = await database.query(`
  select * from public.reconcile_flight_consumer_live_stripe_capture_v1(
    $1,2,$2,$3,$4,'succeeded',1,$5,$6,'succeeded',$7,16914,'usd',true,
    'manual','enc:v1:CHARGEREFERENCE001',$8
  )
`, [
  preparedCapture.rows[0].attempt_id, digest(72), digest(74), digest(80),
  digest(83), digest(84), bridge.payment_intent_reference_sha256, digest(85),
]);
if (reconciledCapture.rows[0]?.decision !== "reconciled"
  || reconciledCapture.rows[0]?.stripe_capture_request_count !== 1
  || reconciledCapture.rows[0]?.stripe_retrieval_request_count !== 1
  || reconciledCapture.rows[0]?.capture_authorized
  || reconciledCapture.rows[0]?.payment_authorized
  || reconciledCapture.rows[0]?.consumer_release_enabled) {
  throw new Error("111 retrieval-only reconciliation invariant failed.");
}
const reconciledChronology = (await database.query(`
  select
    dispatch_started_at <= completed_at as completion_ordered,
    completed_at <= reconciled_at as reconciliation_ordered
  from public.flight_consumer_live_stripe_capture_attempts
  where id = $1
`, [preparedCapture.rows[0].attempt_id])).rows[0];
if (!reconciledChronology?.completion_ordered
  || !reconciledChronology?.reconciliation_ordered) {
  throw new Error("111 reconciled capture chronology is invalid.");
}

let blindRedispatchRefused = false;
try {
  await database.query(`
    select * from public.claim_flight_consumer_live_stripe_capture_v1(
      $1,0,$2,$3,$4,$5
    )
  `, [
    preparedCapture.rows[0].attempt_id, digest(72), digest(74), digest(76),
    digest(86),
  ]);
} catch {
  blindRedispatchRefused = true;
}
if (!blindRedispatchRefused) {
  throw new Error("111 accepted a blind second capture dispatch.");
}

// Simulate a durable record observed after its one-shot window is no longer
// dispatch-usable. The fixture-only update keeps absolute table constraints
// valid and proves prepare resolves exact durable identity before freshness.
await database.exec(`
  alter table public.flight_consumer_live_stripe_capture_attempts
    disable trigger flight_consumer_live_stripe_capture_transition_guard;
`);
await database.query(`
  update public.flight_consumer_live_stripe_capture_attempts
     set dispatch_not_after = $2,
         capture_authority_not_after = $3
   where id = $1
`, [preparedCapture.rows[0].attempt_id, at(5_000), at(6_000)]);
await database.exec(`
  alter table public.flight_consumer_live_stripe_capture_attempts
    enable trigger flight_consumer_live_stripe_capture_transition_guard;
`);
const expiredDurableReplay = await database.query(`
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
  digest(78), digest(79), "capture-signing-key-v1", at(6_000), at(5_000),
]);
if (expiredDurableReplay.rows[0]?.decision !== "replay") {
  throw new Error("111 could not observe an expired exact durable attempt.");
}
let evidenceRollbackRefused = false;
try {
  await database.exec(rollback111);
} catch {
  evidenceRollbackRefused = true;
  await database.exec("rollback;");
}
if (!evidenceRollbackRefused || (await database.query(`
  select to_regclass(
    'public.flight_consumer_live_stripe_capture_attempts'
  )::text as attempts
`)).rows[0]?.attempts === null) {
  throw new Error("111 data-preserving rollback guard failed.");
}
await database.close();

// A second disposable database exercises the direct structured-success path
// independently from the ambiguity/retrieval path above.
const successDatabase = await createDatabase();
await applyExactLineage(successDatabase);
await successDatabase.exec(migration111);
await removePgliteOnlyCiphertextChecks(successDatabase);
await seedAuthorizedChain(successDatabase);
const successFinalized = await successDatabase.query(`
  select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
    $1,0,$2,$3,$4
  )
`, [ids.checkout, digest(36), digest(38), digest(61)]);
const successBridge = (await successDatabase.query(`
  select * from public.flight_consumer_live_checkout_authorization_bridges
`)).rows[0];
const successOrderPrepared = await successDatabase.query(`
  select *
    from public.prepare_flight_consumer_live_duffel_order_execution_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      16914,'USD',$17
    )
`, [
  ids.checkout, digest(36), digest(38),
  successFinalized.rows[0].state_receipt_sha256, ids.refresh, digest(8),
  digest(10), digest(14), digest(13), digest(18), digest(19), digest(62),
  digest(63), digest(64), digest(65), digest(66), at(240_000),
]);
await successDatabase.query(`
  select * from public.claim_flight_consumer_live_duffel_order_execution_v1(
    $1,0,$2,$3,$4,$5
  )
`, [
  successOrderPrepared.rows[0].attempt_id, digest(62), digest(64),
  digest(66), digest(67),
]);
const successOrderCompleted = await successDatabase.query(`
  select * from public.complete_flight_consumer_live_duffel_order_execution_v1(
    $1,1,$2,$3,$4,$5,'succeeded',1,1,null,201,$6,
    'enc:v1:ORDERREFERENCE0001',$7,
    'enc:v1:BOOKINGREFERENCE1',$8,$9,null
  )
`, [
  successOrderPrepared.rows[0].attempt_id, digest(62), digest(64),
  digest(66), digest(67), digest(68), digest(69), digest(70), digest(71),
]);
const successCapturePrepared = await successDatabase.query(`
  select * from public.prepare_flight_consumer_live_stripe_capture_v1(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
    $18,16914,'USD',$19,$20
  )
`, [
  ids.checkout, successBridge.authorization_bridge_receipt_sha256,
  ids.confirmation, successBridge.confirmation_state_receipt_sha256,
  successOrderPrepared.rows[0].attempt_id,
  successOrderCompleted.rows[0].state_receipt_sha256,
  digest(69), successBridge.payment_intent_reference_sha256, digest(64),
  digest(72), digest(73), digest(74), digest(75), digest(76), digest(77),
  digest(78), digest(79), "capture-signing-key-v1", at(180_000),
  at(120_000),
]);
await successDatabase.query(`
  select * from public.claim_flight_consumer_live_stripe_capture_v1(
    $1,0,$2,$3,$4,$5
  )
`, [
  successCapturePrepared.rows[0].attempt_id, digest(72), digest(74),
  digest(76), digest(80),
]);
let wrongDirectPaymentIntentRefused = false;
try {
  await successDatabase.query(`
    select * from public.complete_flight_consumer_live_stripe_capture_v1(
      $1,1,$2,$3,$4,$5,'succeeded',1,1,null,200,$6,$7,null,
      'succeeded',$8,16914,'usd',true,'manual',
      'enc:v1:CHARGEREFERENCE001',$9
    )
  `, [
    successCapturePrepared.rows[0].attempt_id, digest(72), digest(74),
    digest(76), digest(80), digest(81), digest(82), digest(86), digest(85),
  ]);
} catch {
  wrongDirectPaymentIntentRefused = true;
}
if (!wrongDirectPaymentIntentRefused) {
  throw new Error("111 direct success accepted a different PaymentIntent.");
}
const directSuccess = await successDatabase.query(`
  select * from public.complete_flight_consumer_live_stripe_capture_v1(
    $1,1,$2,$3,$4,$5,'succeeded',1,1,null,200,$6,$7,null,
    'succeeded',$8,16914,'usd',true,'manual',
    'enc:v1:CHARGEREFERENCE001',$9
  )
`, [
  successCapturePrepared.rows[0].attempt_id, digest(72), digest(74),
  digest(76), digest(80), digest(81), digest(82),
  successBridge.payment_intent_reference_sha256, digest(85),
]);
if (directSuccess.rows[0]?.decision !== "succeeded"
  || directSuccess.rows[0]?.stripe_capture_request_count !== 1
  || directSuccess.rows[0]?.stripe_mutation_count !== 1
  || directSuccess.rows[0]?.stripe_retrieval_request_count !== 0
  || directSuccess.rows[0]?.charge_reference_sha256 !== digest(85)
  || directSuccess.rows[0]?.capture_authorized
  || directSuccess.rows[0]?.settlement_authorized
  || directSuccess.rows[0]?.consumer_release_enabled) {
  throw new Error("111 direct structured-success invariant failed.");
}
const directChronology = (await successDatabase.query(`
  select
    dispatch_started_at <= completed_at as completion_ordered,
    reconciled_at is null as unreconciled
  from public.flight_consumer_live_stripe_capture_attempts
  where id = $1
`, [successCapturePrepared.rows[0].attempt_id])).rows[0];
if (!directChronology?.completion_ordered || !directChronology?.unreconciled) {
  throw new Error("111 direct capture chronology is invalid.");
}
let changedTerminalReplayRefused = false;
try {
  await successDatabase.query(`
    select * from public.complete_flight_consumer_live_stripe_capture_v1(
      $1,1,$2,$3,$4,$5,'succeeded',1,1,null,200,$6,$7,null,
      'succeeded',$8,16914,'usd',true,'manual',
      'enc:v1:CHARGEREFERENCE002',$9
    )
  `, [
    successCapturePrepared.rows[0].attempt_id, digest(72), digest(74),
    digest(76), digest(80), digest(81), digest(82),
    successBridge.payment_intent_reference_sha256, digest(86),
  ]);
} catch {
  changedTerminalReplayRefused = true;
}
if (!changedTerminalReplayRefused) {
  throw new Error("111 accepted drift on a terminal capture replay.");
}
await successDatabase.close();

const rollbackDatabase = await createDatabase();
await applyExactLineage(rollbackDatabase);
await rollbackDatabase.exec(migration111);
await rollbackDatabase.exec(rollback111);
const rollbackState = (await rollbackDatabase.query(`
  select
    to_regclass(
      'public.flight_consumer_live_stripe_capture_attempts'
    )::text as attempts,
    to_regprocedure(
      'public.prepare_flight_consumer_live_stripe_capture_v1(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,text,timestamp with time zone,timestamp with time zone)'
    )::text as prepare_rpc
`)).rows[0];
await rollbackDatabase.close();
if (rollbackState.attempts !== null || rollbackState.prepare_rpc !== null) {
  throw new Error("111 empty rollback did not remove its objects.");
}

process.stdout.write(`${JSON.stringify({
  exactApplyThrough: "202608260111",
  prepared: preparedCapture.rows[0].decision,
  replay: replayCapture.rows[0].decision,
  claimed: claimedCapture.rows[0].decision,
  ambiguous: ambiguousCapture.rows[0].decision,
  reconciled: reconciledCapture.rows[0].decision,
  captureRequestCount:
    reconciledCapture.rows[0].stripe_capture_request_count,
  retrievalRequestCount:
    reconciledCapture.rows[0].stripe_retrieval_request_count,
  blindRedispatchRefused,
  expiredDurableReplay: expiredDurableReplay.rows[0].decision,
  directSuccess: directSuccess.rows[0].decision,
  wrongDirectPaymentIntentRefused,
  wrongReconciledPaymentIntentRefused,
  completionChronologyOrdered: directChronology.completion_ordered,
  reconciliationChronologyOrdered:
    reconciledChronology.reconciliation_ordered,
  changedTerminalReplayRefused,
  evidenceRollbackRefused,
  allAuthoritiesFalse: true,
  emptyRollbackRemovedObjects: true,
})}\n`);
