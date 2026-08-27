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

const migration111 = await readFile(
  "supabase/production-migrations/202608260111_flight_consumer_live_stripe_capture_execution_journal.sql",
  "utf8",
);
const migration112 = await readFile(
  "supabase/production-migrations/202608260112_flight_consumer_live_duffel_support_identity.sql",
  "utf8",
);
const rollback112 = await readFile(
  "supabase/production-rollbacks/202608260112_flight_consumer_live_duffel_support_identity.rollback.sql",
  "utf8",
);

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const clientCorrelationId = `flt_order_${"a".repeat(48)}`;
const providerRequestId = "req_0000000000000001";

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
  await database.exec(migration111);
  await database.exec(migration112);
  await applyPgliteCiphertextCompatibility(database);
}

async function claimOrder(database) {
  await seedAuthorizedChain(database);
  const finalized = await database.query(`
    select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
      $1,0,$2,$3,$4
    )
  `, [ids.checkout, digest(36), digest(38), digest(61)]);
  const prepared = await database.query(`
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
  const claimed = await database.query(`
    select * from public.claim_flight_consumer_live_duffel_order_execution_v1(
      $1,0,$2,$3,$4,$5
    )
  `, [
    prepared.rows[0].attempt_id, digest(62), digest(64), digest(66), digest(67),
  ]);
  if (claimed.rows[0]?.decision !== "claimed") {
    throw new Error("112 fixture could not claim exact 108 order.");
  }
  return prepared.rows[0].attempt_id;
}

const successDatabase = await createDatabase();
await initialize(successDatabase);
const successAttemptId = await claimOrder(successDatabase);
const successArgs = [
  successAttemptId, digest(62), digest(64), digest(66), digest(67),
  digest(68), digest(69), digest(70), digest(71), clientCorrelationId,
  sha256(clientCorrelationId), providerRequestId, sha256(providerRequestId),
];
const success = await successDatabase.query(`
  select *
    from public.complete_flight_consumer_live_duffel_order_execution_v2(
      $1,1,$2,$3,$4,$5,'succeeded',1,1,null,201,$6,
      'enc:v1:ORDERREFERENCE0001',$7,
      'enc:v1:BOOKINGREFERENCE1',$8,$9,null,$10,$11,$12,$13
    )
`, successArgs);
if (success.rows[0]?.decision !== "succeeded") {
  throw new Error("112 structured success did not complete.");
}
const storedSuccess = (await successDatabase.query(`
  select client_correlation_id, client_correlation_id_sha256,
         provider_request_id, provider_request_id_sha256,
         provider_dispatch_authorized, booking_authorized,
         payment_authorized, capture_authorized, ticketing_authorized,
         consumer_release_enabled, blind_retry_authorized
    from public.flight_consumer_live_duffel_order_executions
   where id = $1
`, [successAttemptId])).rows[0];
const readSuccess = (await successDatabase.query(`
  select *
    from public.read_flight_consumer_live_duffel_order_support_identity_v1(
      $1,$2,$3,$4
    )
`, [successAttemptId, digest(62), digest(64), digest(66)])).rows[0];
if (storedSuccess?.client_correlation_id !== clientCorrelationId
  || storedSuccess?.client_correlation_id_sha256 !== sha256(clientCorrelationId)
  || storedSuccess?.provider_request_id !== providerRequestId
  || storedSuccess?.provider_request_id_sha256 !== sha256(providerRequestId)
  || storedSuccess?.provider_dispatch_authorized
  || storedSuccess?.booking_authorized
  || storedSuccess?.payment_authorized
  || storedSuccess?.capture_authorized
  || storedSuccess?.ticketing_authorized
  || storedSuccess?.consumer_release_enabled
  || storedSuccess?.blind_retry_authorized
  || readSuccess?.attempt_id !== successAttemptId
  || readSuccess?.attempt_state !== "succeeded"
  || readSuccess?.provider_request_count !== 1
  || readSuccess?.air_orders_post_count !== 1
  || readSuccess?.terminal_http_status !== 201
  || readSuccess?.client_correlation_id !== clientCorrelationId
  || readSuccess?.client_correlation_id_sha256 !== sha256(clientCorrelationId)
  || readSuccess?.provider_request_id !== providerRequestId
  || readSuccess?.provider_request_id_sha256 !== sha256(providerRequestId)
  || readSuccess?.provider_dispatch_authorized
  || readSuccess?.booking_authorized
  || readSuccess?.payment_authorized
  || readSuccess?.capture_authorized
  || readSuccess?.ticketing_authorized
  || readSuccess?.consumer_release_enabled
  || readSuccess?.blind_retry_authorized) {
  throw new Error("112 success support identity or zero-authority invariant failed.");
}
const successReplay = await successDatabase.query(`
  select *
    from public.complete_flight_consumer_live_duffel_order_execution_v2(
      $1,1,$2,$3,$4,$5,'succeeded',1,1,null,201,$6,
      'enc:v1:ORDERREFERENCE0001',$7,
      'enc:v1:BOOKINGREFERENCE1',$8,$9,null,$10,$11,$12,$13
    )
`, successArgs);
if (successReplay.rows[0]?.decision !== "replay") {
  throw new Error("112 exact support identity replay failed.");
}
let changedIdentityRefused = false;
try {
  const changed = [...successArgs];
  changed[11] = "req_0000000000000002";
  changed[12] = sha256(changed[11]);
  await successDatabase.query(`
    select *
      from public.complete_flight_consumer_live_duffel_order_execution_v2(
        $1,1,$2,$3,$4,$5,'succeeded',1,1,null,201,$6,
        'enc:v1:ORDERREFERENCE0001',$7,
        'enc:v1:BOOKINGREFERENCE1',$8,$9,null,$10,$11,$12,$13
      )
  `, changed);
} catch {
  changedIdentityRefused = true;
}
if (!changedIdentityRefused) {
  throw new Error("112 accepted support identity drift on terminal replay.");
}
await successDatabase.close();

const noResponseDatabase = await createDatabase();
await initialize(noResponseDatabase);
const noResponseAttemptId = await claimOrder(noResponseDatabase);
const noResponse = await noResponseDatabase.query(`
  select *
    from public.complete_flight_consumer_live_duffel_order_execution_v2(
      $1,1,$2,$3,$4,$5,'ambiguous',1,1,'duffel_order_outcome_unknown',
      null,null,null,null,null,null,$6,$7,$8,$9,null,null
    )
`, [
  noResponseAttemptId, digest(62), digest(64), digest(66), digest(67),
  digest(72), digest(73), clientCorrelationId, sha256(clientCorrelationId),
]);
const storedNoResponse = (await noResponseDatabase.query(`
  select client_correlation_id, provider_request_id, terminal_http_status
    from public.flight_consumer_live_duffel_order_executions
   where id = $1
`, [noResponseAttemptId])).rows[0];
const readNoResponse = (await noResponseDatabase.query(`
  select *
    from public.read_flight_consumer_live_duffel_order_support_identity_v1(
      $1,$2,$3,$4
    )
`, [noResponseAttemptId, digest(62), digest(64), digest(66)])).rows[0];
if (noResponse.rows[0]?.decision !== "ambiguous"
  || storedNoResponse?.client_correlation_id !== clientCorrelationId
  || storedNoResponse?.provider_request_id !== null
  || storedNoResponse?.terminal_http_status !== null
  || readNoResponse?.attempt_state !== "ambiguous"
  || readNoResponse?.provider_request_count !== 1
  || readNoResponse?.air_orders_post_count !== 1
  || readNoResponse?.client_correlation_id !== clientCorrelationId
  || readNoResponse?.provider_request_id !== null
  || readNoResponse?.terminal_http_status !== null) {
  throw new Error("112 no-response support identity invariant failed.");
}
await noResponseDatabase.close();

const inFlightRollbackDatabase = await createDatabase();
await initialize(inFlightRollbackDatabase);
await claimOrder(inFlightRollbackDatabase);
let inFlightRollbackRefused = false;
try {
  await inFlightRollbackDatabase.exec(rollback112);
} catch {
  inFlightRollbackRefused = true;
}
await inFlightRollbackDatabase.close();
if (!inFlightRollbackRefused) {
  throw new Error("112 rollback accepted a claimed in-flight order execution.");
}

const rollbackDatabase = await createDatabase();
await initialize(rollbackDatabase);
await rollbackDatabase.exec(rollback112);
const rollbackState = (await rollbackDatabase.query(`
  select
    to_regprocedure(
      'public.complete_flight_consumer_live_duffel_order_execution_v2(uuid,integer,text,text,text,text,text,integer,integer,text,integer,text,text,text,text,text,text,text,text,text,text,text)'
    )::text as complete_v2,
    to_regprocedure(
      'public.read_flight_consumer_live_duffel_order_support_identity_v1(uuid,text,text,text)'
    )::text as support_read,
    exists (
      select 1 from pg_catalog.pg_attribute
       where attrelid =
         'public.flight_consumer_live_duffel_order_executions'::regclass
         and attname = 'client_correlation_id'
         and not attisdropped
    ) as support_column
`)).rows[0];
await rollbackDatabase.close();
if (rollbackState.complete_v2 !== null
  || rollbackState.support_read !== null
  || rollbackState.support_column) {
  throw new Error("112 empty rollback did not restore the exact 111 boundary.");
}

process.stdout.write(`${JSON.stringify({
  exactApplyThrough: "202608260112",
  success: success.rows[0].decision,
  successReplay: successReplay.rows[0].decision,
  changedIdentityRefused,
  noResponse: noResponse.rows[0].decision,
  noResponseClientCorrelationRetained: true,
  noResponseProviderRequestIdUnavailable: true,
  httpResponseProviderRequestIdRetained: true,
  controlledReplaySupportReadPassed: true,
  inFlightRollbackRefused,
  allAuthoritiesFalse: true,
  emptyRollbackRestored111: true,
})}\n`);
