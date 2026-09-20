import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const helperSource = await readFile(
  "scripts/verify-flight-consumer-checkout-authorization-bridge-pglite.mjs",
  "utf8",
);
const helperPrefix = helperSource.slice(
  0,
  helperSource.indexOf("const behaviorDb = await createDatabase();"),
);
const helperModule = await import(
  `data:text/javascript;base64,${Buffer.from(
    `${helperPrefix}\nexport { createDatabase, applyExactLineage, seedAuthorizedChain, digest, at, ids };`,
  ).toString("base64")}`,
);
const {
  createDatabase,
  applyExactLineage,
  seedAuthorizedChain,
  digest,
  at,
  ids,
} = helperModule;

const migration111 = await readFile(
  "supabase/production-migrations/202608260111_flight_consumer_live_stripe_capture_execution_journal.sql",
  "utf8",
);
const migration112 = await readFile(
  "supabase/production-migrations/202608260112_flight_consumer_live_duffel_support_identity.sql",
  "utf8",
);
const migration113 = await readFile(
  "supabase/production-migrations/202608260113_flight_consumer_live_booking_settlement_evidence.sql",
  "utf8",
);
const rollback113 = await readFile(
  "supabase/production-rollbacks/202608260113_flight_consumer_live_booking_settlement_evidence.rollback.sql",
  "utf8",
);

const sha256Utf8 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const clientCorrelationId = "correlation_000000000001";
const providerRequestId = "req_000000000001";

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

async function seedReconciledOrderAndCapture(database) {
  await removePgliteOnlyCiphertextChecks(database);
  await seedAuthorizedChain(database);

  const finalized = await database.query(`
    select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
      $1,0,$2,$3,$4
    )
  `, [ids.checkout, digest(36), digest(38), digest(61)]);
  if (finalized.rows[0]?.decision !== "finalized") {
    throw new Error("113 fixture could not finalize exact 110 checkout.");
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
    throw new Error("113 fixture could not claim exact 108 order.");
  }
  const ambiguousOrder = await database.query(`
    select * from public.complete_flight_consumer_live_duffel_order_execution_v2(
      $1,1,$2,$3,$4,$5,'ambiguous',1,1,'response_timeout',null,null,
      null,null,null,null,$6,$7,$8,$9,null,null
    )
  `, [
    preparedOrder.rows[0].attempt_id, digest(62), digest(64), digest(66),
    digest(67), digest(68), digest(71), clientCorrelationId,
    sha256Utf8(clientCorrelationId),
  ]);
  if (ambiguousOrder.rows[0]?.decision !== "ambiguous") {
    throw new Error("113 fixture could not record ambiguous 108 order.");
  }
  const reconciledOrder = await database.query(`
    select * from public.reconcile_flight_consumer_live_duffel_order_execution_v1(
      $1,2,$2,$3,$4,'succeeded',$5,$6,
      'enc:v1:ORDERREFERENCE0001',$7,
      'enc:v1:BOOKINGREFERENCE1',$8
    )
  `, [
    preparedOrder.rows[0].attempt_id, digest(62), digest(64), digest(67),
    digest(72), digest(73), digest(69), digest(70),
  ]);
  if (reconciledOrder.rows[0]?.decision !== "reconciled"
    || reconciledOrder.rows[0]?.provider_booking_reference_sha256
      !== digest(70)) {
    throw new Error("113 fixture could not reconcile exact 108 order success.");
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
    reconciledOrder.rows[0].state_receipt_sha256,
    digest(69), bridge.payment_intent_reference_sha256, digest(64),
    digest(74), digest(75), digest(76), digest(77), digest(78), digest(79),
    digest(80), digest(81), "capture-signing-key-v1", at(180_000),
    at(120_000),
  ]);
  if (preparedCapture.rows[0]?.decision !== "created") {
    throw new Error("113 fixture could not prepare exact 111 capture.");
  }
  const claimedCapture = await database.query(`
    select * from public.claim_flight_consumer_live_stripe_capture_v1(
      $1,0,$2,$3,$4,$5
    )
  `, [
    preparedCapture.rows[0].attempt_id, digest(74), digest(76), digest(78),
    digest(82),
  ]);
  if (claimedCapture.rows[0]?.decision !== "claimed") {
    throw new Error("113 fixture could not claim exact 111 capture.");
  }
  const ambiguousCapture = await database.query(`
    select * from public.complete_flight_consumer_live_stripe_capture_v1(
      $1,1,$2,$3,$4,$5,'ambiguous',1,1,'response_timeout',null,null,$6,$7,
      null,null,null,null,null,null,null,null
    )
  `, [
    preparedCapture.rows[0].attempt_id, digest(74), digest(76), digest(78),
    digest(82), digest(83), digest(84),
  ]);
  if (ambiguousCapture.rows[0]?.decision !== "ambiguous") {
    throw new Error("113 fixture could not record ambiguous 111 capture.");
  }
  const reconciledCapture = await database.query(`
    select * from public.reconcile_flight_consumer_live_stripe_capture_v1(
      $1,2,$2,$3,$4,'succeeded',1,$5,$6,'succeeded',$7,16914,'usd',true,
      'manual','enc:v1:CHARGEREFERENCE001',$8
    )
  `, [
    preparedCapture.rows[0].attempt_id, digest(74), digest(76), digest(82),
    digest(85), digest(86), bridge.payment_intent_reference_sha256,
    digest(87),
  ]);
  if (reconciledCapture.rows[0]?.decision !== "reconciled"
    || reconciledCapture.rows[0]?.charge_reference_sha256 !== digest(87)) {
    throw new Error("113 fixture could not reconcile exact 111 capture success.");
  }

  return {
    bridge,
    order: reconciledOrder.rows[0],
    capture: reconciledCapture.rows[0],
  };
}

const database = await createDatabase();
await applyExactLineage(database);
await database.exec(migration111);
await database.exec(migration112);
await database.exec(migration113);
const fixture = await seedReconciledOrderAndCapture(database);

const prepareArguments = [
  ids.checkout,
  fixture.bridge.authorization_bridge_receipt_sha256,
  fixture.order.attempt_id,
  fixture.order.state_receipt_sha256,
  fixture.capture.attempt_id,
  fixture.capture.state_receipt_sha256,
  digest(38), digest(10), digest(14), digest(17),
  fixture.bridge.payment_intent_reference_sha256,
  digest(69), digest(70), digest(87), digest(18), digest(19),
  digest(90), digest(91), digest(92), 16914, "USD",
];
const prepareSql = `
  select * from public.prepare_flight_consumer_live_booking_settlement_v1(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
    $19,$20,$21
  )
`;
const prepared = await database.query(prepareSql, prepareArguments);
if (prepared.rows[0]?.decision !== "created"
  || prepared.rows[0]?.booking_state !== "prepared"
  || prepared.rows[0]?.booking_revision !== 0
  || prepared.rows[0]?.ticketing_state !== "pending") {
  throw new Error("113 exact settlement preparation failed.");
}
const preparedReplay = await database.query(prepareSql, prepareArguments);
if (preparedReplay.rows[0]?.decision !== "replay"
  || preparedReplay.rows[0]?.settlement_id !==
    prepared.rows[0]?.settlement_id) {
  throw new Error("113 exact settlement preparation replay failed.");
}

let collisionRefused = false;
try {
  await database.query(prepareSql, [
    ...prepareArguments.slice(0, 18), digest(94),
    ...prepareArguments.slice(19),
  ]);
} catch {
  collisionRefused = true;
}
if (!collisionRefused) {
  throw new Error("113 accepted a colliding settlement envelope.");
}

const booked = await database.query(`
  select * from public.finalize_flight_consumer_live_booking_settlement_v1(
    $1,0,$2,$3,$4
  )
`, [
  prepared.rows[0].settlement_id, digest(90),
  prepared.rows[0].state_receipt_sha256, digest(93),
]);
if (booked.rows[0]?.decision !== "booked"
  || booked.rows[0]?.booking_state !== "booked"
  || booked.rows[0]?.booking_revision !== 1
  || booked.rows[0]?.ticketing_state !== "pending"
  || booked.rows[0]?.duffel_livemode !== true
  || booked.rows[0]?.stripe_livemode !== true) {
  throw new Error("113 exact booked evidence finalization failed.");
}
const bookedReplay = await database.query(`
  select * from public.finalize_flight_consumer_live_booking_settlement_v1(
    $1,0,$2,$3,$4
  )
`, [
  prepared.rows[0].settlement_id, digest(90),
  prepared.rows[0].state_receipt_sha256, digest(93),
]);
if (bookedReplay.rows[0]?.decision !== "replay") {
  throw new Error("113 exact booked finalization replay failed.");
}
let inexactBookedReplayRefused = false;
try {
  await database.query(`
    select * from public.finalize_flight_consumer_live_booking_settlement_v1(
      $1,0,$2,$3,$4
    )
  `, [
    prepared.rows[0].settlement_id, digest(90), digest(94), digest(93),
  ]);
} catch {
  inexactBookedReplayRefused = true;
}
if (!inexactBookedReplayRefused) {
  throw new Error("113 replay accepted a different prepared receipt.");
}

const settlementState = (await database.query(`
  select
    booking_state,
    ticketing_state,
    ticket_evidence_sha256,
    ticket_issued_at,
    ticket_count,
    provider_request_count,
    stripe_request_count,
    order_request_count,
    payment_request_count,
    capture_request_count,
    ticket_request_count,
    provider_dispatch_authorized,
    stripe_dispatch_authorized,
    booking_authorized,
    payment_authorized,
    capture_authorized,
    settlement_authorized,
    ticketing_authorized,
    consumer_release_enabled,
    blind_retry_authorized,
    order_terminal_at <= prepared_at as order_before_prepare,
    capture_terminal_at <= prepared_at as capture_before_prepare,
    prepared_at <= booked_at as prepare_before_booked
  from public.flight_consumer_live_booking_settlements
`)).rows[0];
if (settlementState?.booking_state !== "booked"
  || settlementState?.ticketing_state !== "pending"
  || settlementState?.ticket_evidence_sha256 !== null
  || settlementState?.ticket_issued_at !== null
  || settlementState?.ticket_count !== 0
  || settlementState?.provider_request_count !== 0
  || settlementState?.stripe_request_count !== 0
  || settlementState?.order_request_count !== 0
  || settlementState?.payment_request_count !== 0
  || settlementState?.capture_request_count !== 0
  || settlementState?.ticket_request_count !== 0
  || settlementState?.provider_dispatch_authorized
  || settlementState?.stripe_dispatch_authorized
  || settlementState?.booking_authorized
  || settlementState?.payment_authorized
  || settlementState?.capture_authorized
  || settlementState?.settlement_authorized
  || settlementState?.ticketing_authorized
  || settlementState?.consumer_release_enabled
  || settlementState?.blind_retry_authorized
  || !settlementState?.order_before_prepare
  || !settlementState?.capture_before_prepare
  || !settlementState?.prepare_before_booked) {
  throw new Error("113 dark settlement/ticket/chronology invariants failed.");
}

const receiptCount = Number((await database.query(`
  select count(*)::integer as count
    from public.flight_consumer_live_booking_settlement_receipts
`)).rows[0]?.count);
if (receiptCount !== 2) {
  throw new Error("113 did not preserve one prepared and one booked receipt.");
}

// PNR/booking references are airline-issued record locators, not globally
// unique Duffel resource IDs. In a rolled-back disposable probe, clone the
// otherwise distinct exact settlement while preserving only its PNR hash.
await database.exec("begin;");
let sharedBookingReferenceAccepted = false;
try {
  await database.exec("set local session_replication_role = replica;");
  await database.query(`
    insert into public.flight_consumer_live_booking_settlements
    select (
      jsonb_populate_record(
        null::public.flight_consumer_live_booking_settlements,
        to_jsonb(settlement) || jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000000101',
          'checkout_aggregate_id', '00000000-0000-4000-8000-000000000102',
          'authorization_bridge_receipt_sha256', $2::text,
          'duffel_order_execution_id', '00000000-0000-4000-8000-000000000103',
          'duffel_order_state_receipt_sha256', $3::text,
          'stripe_capture_attempt_id', '00000000-0000-4000-8000-000000000104',
          'stripe_capture_state_receipt_sha256', $4::text,
          'order_id', '00000000-0000-4000-8000-000000000105',
          'checkout_binding_sha256', $5::text,
          'order_reference_sha256', $6::text,
          'payment_intent_reference_sha256', $7::text,
          'provider_order_reference_sha256', $8::text,
          'charge_reference_sha256', $9::text,
          'booking_binding_sha256', $10::text,
          'settlement_evidence_sha256', $11::text,
          'final_booking_evidence_sha256', $12::text,
          'latest_state_receipt_sha256', $13::text
        )
      )
    ).*
      from public.flight_consumer_live_booking_settlements as settlement
     where settlement.id = $1
  `, [
    prepared.rows[0].settlement_id,
    digest(201), digest(202), digest(203), digest(204), digest(205),
    digest(206), digest(207), digest(208), digest(209), digest(210),
    digest(211), digest(212),
  ]);
  const sharedPnrCount = Number((await database.query(`
    select count(*)::integer as count
      from public.flight_consumer_live_booking_settlements
     where provider_booking_reference_sha256 = $1
  `, [digest(70)])).rows[0]?.count);
  sharedBookingReferenceAccepted = sharedPnrCount === 2;
} finally {
  await database.exec("rollback;");
}
if (!sharedBookingReferenceAccepted) {
  throw new Error("113 incorrectly treated an airline PNR as globally unique.");
}

let mutationRefused = false;
try {
  await database.query(`
    update public.flight_consumer_live_booking_settlements
       set ticketing_state = 'issued'
     where id = $1
  `, [prepared.rows[0].settlement_id]);
} catch {
  mutationRefused = true;
}
if (!mutationRefused) {
  throw new Error("113 accepted an unauthorized ticketing mutation.");
}

let populatedRollbackRefused = false;
await database.exec("begin;");
try {
  await database.exec(rollback113);
} catch {
  populatedRollbackRefused = true;
  await database.exec("rollback;");
}
if (!populatedRollbackRefused) {
  throw new Error("113 rollback removed populated settlement evidence.");
}
await database.close();

// Exercise the direct terminal-success branches independently from the two
// retrieval-reconciled success branches above.
const directDatabase = await createDatabase();
await applyExactLineage(directDatabase);
await directDatabase.exec(migration111);
await directDatabase.exec(migration112);
await directDatabase.exec(migration113);
await removePgliteOnlyCiphertextChecks(directDatabase);
await seedAuthorizedChain(directDatabase);
const directFinalized = await directDatabase.query(`
  select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
    $1,0,$2,$3,$4
  )
`, [ids.checkout, digest(36), digest(38), digest(61)]);
const directBridge = (await directDatabase.query(`
  select * from public.flight_consumer_live_checkout_authorization_bridges
`)).rows[0];
const directOrderPrepared = await directDatabase.query(`
  select *
    from public.prepare_flight_consumer_live_duffel_order_execution_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      16914,'USD',$17
    )
`, [
  ids.checkout, digest(36), digest(38),
  directFinalized.rows[0].state_receipt_sha256, ids.refresh, digest(8),
  digest(10), digest(14), digest(13), digest(18), digest(19), digest(62),
  digest(63), digest(64), digest(65), digest(66), at(240_000),
]);
await directDatabase.query(`
  select * from public.claim_flight_consumer_live_duffel_order_execution_v1(
    $1,0,$2,$3,$4,$5
  )
`, [
  directOrderPrepared.rows[0].attempt_id, digest(62), digest(64),
  digest(66), digest(67),
]);
const directOrder = await directDatabase.query(`
  select * from public.complete_flight_consumer_live_duffel_order_execution_v2(
    $1,1,$2,$3,$4,$5,'succeeded',1,1,null,201,$6,
    'enc:v1:ORDERREFERENCE0001',$7,
    'enc:v1:BOOKINGREFERENCE1',$8,$9,null,$10,$11,$12,$13
  )
`, [
  directOrderPrepared.rows[0].attempt_id, digest(62), digest(64),
  digest(66), digest(67), digest(68), digest(69), digest(70), digest(71),
  clientCorrelationId, sha256Utf8(clientCorrelationId), providerRequestId,
  sha256Utf8(providerRequestId),
]);
const directCapturePrepared = await directDatabase.query(`
  select * from public.prepare_flight_consumer_live_stripe_capture_v1(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
    $18,16914,'USD',$19,$20
  )
`, [
  ids.checkout, directBridge.authorization_bridge_receipt_sha256,
  ids.confirmation, directBridge.confirmation_state_receipt_sha256,
  directOrderPrepared.rows[0].attempt_id,
  directOrder.rows[0].state_receipt_sha256,
  digest(69), directBridge.payment_intent_reference_sha256, digest(64),
  digest(74), digest(75), digest(76), digest(77), digest(78), digest(79),
  digest(80), digest(81), "capture-signing-key-v1", at(180_000), at(120_000),
]);
await directDatabase.query(`
  select * from public.claim_flight_consumer_live_stripe_capture_v1(
    $1,0,$2,$3,$4,$5
  )
`, [
  directCapturePrepared.rows[0].attempt_id, digest(74), digest(76),
  digest(78), digest(82),
]);
const directCapture = await directDatabase.query(`
  select * from public.complete_flight_consumer_live_stripe_capture_v1(
    $1,1,$2,$3,$4,$5,'succeeded',1,1,null,200,$6,$7,null,
    'succeeded',$8,16914,'usd',true,'manual',
    'enc:v1:CHARGEREFERENCE001',$9
  )
`, [
  directCapturePrepared.rows[0].attempt_id, digest(74), digest(76),
  digest(78), digest(82), digest(83), digest(84),
  directBridge.payment_intent_reference_sha256, digest(87),
]);
const directSettlement = await directDatabase.query(prepareSql, [
  ids.checkout, directBridge.authorization_bridge_receipt_sha256,
  directOrder.rows[0].attempt_id, directOrder.rows[0].state_receipt_sha256,
  directCapture.rows[0].attempt_id,
  directCapture.rows[0].state_receipt_sha256,
  digest(38), digest(10), digest(14), digest(17),
  directBridge.payment_intent_reference_sha256,
  digest(69), digest(70), digest(87), digest(18), digest(19),
  digest(95), digest(96), digest(97), 16914, "USD",
]);
if (directOrder.rows[0]?.attempt_state !== "succeeded"
  || directCapture.rows[0]?.attempt_state !== "succeeded"
  || directSettlement.rows[0]?.decision !== "created"
  || directSettlement.rows[0]?.ticketing_state !== "pending") {
  throw new Error("113 direct order/capture success branches failed.");
}
await directDatabase.close();

const rollbackDatabase = await createDatabase();
await applyExactLineage(rollbackDatabase);
await rollbackDatabase.exec(migration111);
await rollbackDatabase.exec(migration112);
await rollbackDatabase.exec(migration113);
await rollbackDatabase.exec(rollback113);
const rollbackState = (await rollbackDatabase.query(`
  select
    to_regclass('public.flight_consumer_live_booking_settlements') as aggregate,
    to_regclass('public.flight_consumer_live_booking_settlement_receipts')
      as receipts,
    to_regprocedure(
      'public.prepare_flight_consumer_live_booking_settlement_v1(uuid,text,uuid,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,text)'
    ) as prepare_rpc
`)).rows[0];
await rollbackDatabase.close();
if (rollbackState.aggregate !== null
  || rollbackState.receipts !== null
  || rollbackState.prepare_rpc !== null) {
  throw new Error("113 empty rollback did not remove its objects.");
}

console.log(JSON.stringify({
  exactApply: "108/110/111/112/113",
  orderSourceState: "reconciled_succeeded",
  captureSourceState: "reconciled_succeeded",
  directSourceState: "succeeded",
  prepare: prepared.rows[0]?.decision,
  prepareReplay: preparedReplay.rows[0]?.decision,
  finalize: booked.rows[0]?.decision,
  finalizeReplay: bookedReplay.rows[0]?.decision,
  ticketingState: settlementState.ticketing_state,
  receiptCount,
  collisionRefused,
  inexactBookedReplayRefused,
  sharedBookingReferenceAccepted,
  mutationRefused,
  populatedRollbackRefused,
  emptyRollbackRestored111: true,
}));
