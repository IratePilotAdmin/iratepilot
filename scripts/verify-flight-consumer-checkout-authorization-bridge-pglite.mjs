import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const pgliteDist = process.env.PGLITE_DIST;
if (!pgliteDist) {
  throw new Error("PGLITE_DIST must point to the @electric-sql/pglite dist directory.");
}

const { PGlite } = await import(pathToFileURL(`${pgliteDist}/index.js`).href);
const { pgcrypto } = await import(
  pathToFileURL(`${pgliteDist}/contrib/pgcrypto.js`).href
);

const migrationNames = [
  "202608260101_flight_consumer_live_duffel_shopping_journal.sql",
  "202608260102_flight_consumer_live_duffel_shopping_rpc_qualification_repair.sql",
  "202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql",
  "202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql",
  "202608260106_flight_consumer_live_stripe_payment_execution_journal.sql",
  "202608260107_flight_consumer_live_checkout_evidence_aggregate.sql",
  "202608260108_flight_consumer_live_duffel_order_execution_journal.sql",
  "202608260109_flight_consumer_live_stripe_confirmation_journal.sql",
  "202608260110_flight_consumer_checkout_authorization_bridge.sql",
];

const digest = (value) => value.toString(16).padStart(64, "0");
const now = Date.now();
const at = (offsetMilliseconds) => new Date(now + offsetMilliseconds).toISOString();
const ids = Object.freeze({
  customer: "00000000-0000-4000-8000-000000000001",
  order: "00000000-0000-4000-8000-000000000002",
  shopping: "00000000-0000-4000-8000-000000000003",
  source: "00000000-0000-4000-8000-000000000004",
  refresh: "00000000-0000-4000-8000-000000000005",
  plan: "00000000-0000-4000-8000-000000000006",
  execution: "00000000-0000-4000-8000-000000000007",
  checkout: "00000000-0000-4000-8000-000000000008",
  confirmation: "00000000-0000-4000-8000-000000000009",
});

async function createDatabase() {
  const database = new PGlite({ extensions: { pgcrypto } });
  await database.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create role anon;
    create role authenticated;
    create role service_role;
    create function auth.role() returns text
      language sql stable as $$ select 'service_role'::text $$;
    create table public.profiles(id uuid primary key);
  `);
  return database;
}

async function applyExactLineage(database) {
  for (const migrationName of migrationNames) {
    await database.exec(await readFile(
      `supabase/production-migrations/${migrationName}`,
      "utf8",
    ));
  }
}

async function applyPgliteCiphertextCompatibility(database) {
  // PGlite/PostgreSQL 18.3 rejects evaluation of the frozen-107 bounded
  // ciphertext regex because its POSIX engine caps repetition counts below
  // 16,320. Exact DDL application remains unmodified; remove only those
  // unrelated checks in each disposable behavior database.
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

async function seedAuthorizedChain(database) {
  await database.query("insert into public.profiles(id) values ($1)", [
    ids.customer,
  ]);
  await database.query(`
    insert into public.flight_consumer_live_duffel_shopping_attempts (
      id, execution_scope_sha256, idempotency_sha256, request_sha256,
      request_body_sha256, attempt_state, attempt_revision,
      dispatch_not_after, dispatch_started_at, terminal_http_status,
      terminal_response_sha256, terminal_response_bytes, offer_count,
      prepared_at, completed_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,'succeeded',2,$6,$7,200,$8,512,1,$9,$10,$10
    )
  `, [
    ids.shopping, digest(1), digest(2), digest(3), digest(4),
    at(300_000), at(-90_000), digest(5), at(-120_000), at(-60_000),
  ]);
  await database.query(`
    insert into public.flight_consumer_live_duffel_offer_sources (
      id, source_shopping_attempt_id,
      source_shopping_execution_scope_sha256, source_response_sha256,
      offer_id_sha256, source_offer_evidence_sha256, expires_at
    ) values ($1,$2,$3,$4,$5,$6,$7)
  `, [
    ids.source, ids.shopping, digest(1), digest(5), digest(6), digest(7),
    at(600_000),
  ]);
  await database.query(`
    insert into public.flight_consumer_live_duffel_offer_refresh_attempts (
      id, execution_scope_sha256, idempotency_sha256, source_id,
      source_shopping_attempt_id, source_shopping_execution_scope_sha256,
      source_offer_evidence_sha256, offer_id_sha256, offer_binding_sha256,
      authority_sha256, request_sha256, attempt_state, attempt_revision,
      dispatch_not_after, dispatch_started_at, provider_dispatch_count,
      terminal_http_status, terminal_response_sha256,
      normalized_offer_sha256, price_amount_minor, price_currency,
      offer_expires_at, observed_at, owner_name, owner_iata_code,
      owner_identity_sha256, prepared_at, completed_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'succeeded',2,
      $12,$13,1,200,$14,$15,16914,'USD',$16,$17,
      'Test Airline','ZZ',$18,$19,$20,$20
    )
  `, [
    ids.refresh, digest(8), digest(9), ids.source, ids.shopping, digest(1),
    digest(7), digest(6), digest(10), digest(11), digest(12), at(300_000),
    at(-50_000), digest(13), digest(14), at(600_000), at(-40_000),
    digest(15), at(-120_000), at(-30_000),
  ]);
  await database.query(`
    insert into public.flight_consumer_live_stripe_payment_intent_plans (
      id, execution_scope_sha256, payment_binding_sha256,
      order_reference_sha256, customer_reference_sha256,
      payment_attempt_reference_sha256, metadata_sha256,
      request_body_sha256, request_envelope_sha256,
      idempotency_request_sha256, idempotency_key_sha256,
      plan_sha256, amount_cents
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,16914)
  `, [
    ids.plan, digest(16), digest(17), digest(18), digest(19), digest(20),
    digest(21), digest(22), digest(23), digest(24), digest(25), digest(26),
  ]);
  await database.query(`
    insert into public.flight_consumer_live_stripe_payment_executions (
      id, plan_id, execution_scope_sha256, payment_binding_sha256,
      order_reference_sha256, customer_reference_sha256,
      payment_attempt_reference_sha256, metadata_sha256,
      request_body_sha256, request_envelope_sha256,
      idempotency_request_sha256, idempotency_key_sha256, plan_sha256,
      execution_workflow_sha256, execution_prerequisite_sha256,
      amount_cents, attempt_state, attempt_revision, dispatch_not_after,
      lease_token_sha256, lease_seconds, lease_expires_at, claimed_at,
      payment_intent_reference_ciphertext,
      payment_intent_reference_sha256, terminal_response_sha256,
      completion_evidence_sha256, latest_state_receipt_sha256,
      stripe_request_count, stripe_mutation_count,
      payment_intent_create_count, external_request_made,
      created_at, updated_at, completed_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
      16914,'completed',2,$16,$17,60,$18,$19,
      'enc:v1:ABCDEFGHIJKLMNOP',$20,$21,$22,$23,1,1,1,true,$24,$25,$25
    )
  `, [
    ids.execution, ids.plan, digest(27), digest(17), digest(18), digest(19),
    digest(20), digest(21), digest(22), digest(23), digest(24), digest(25),
    digest(26), digest(28), digest(29), at(300_000), digest(30), at(60_000),
    at(-50_000), digest(31), digest(32), digest(33), digest(34),
    at(-120_000), at(-30_000),
  ]);
  await database.query(`
    insert into public.flight_consumer_live_stripe_payment_execution_receipts (
      attempt_id, attempt_revision, receipt_kind, attempt_state,
      previous_receipt_sha256, receipt_sha256
    ) values
      ($1,0,'prepared','prepared',null,$2),
      ($1,2,'completed','completed',$2,$3)
  `, [ids.execution, digest(35), digest(34)]);
  await database.query(`
    insert into public.flight_consumer_live_checkout_evidence_aggregates (
      id, customer_id, order_id, execution_scope_sha256,
      idempotency_sha256, checkout_binding_sha256,
      checkout_prerequisite_sha256, offer_refresh_attempt_id,
      offer_refresh_execution_scope_sha256, offer_binding_sha256,
      normalized_offer_sha256, offer_terminal_response_sha256,
      offer_expires_at, stripe_plan_id, stripe_plan_sha256,
      stripe_execution_attempt_id, stripe_execution_workflow_sha256,
      stripe_execution_prerequisite_sha256,
      stripe_execution_state_receipt_sha256, payment_binding_sha256,
      order_reference_sha256, customer_reference_sha256, amount_cents,
      traveler_payload_ciphertext, traveler_payload_sha256,
      traveler_evidence_sha256, contact_payload_ciphertext,
      contact_payload_sha256, contact_evidence_sha256,
      billing_address_payload_ciphertext, billing_address_payload_sha256,
      billing_address_evidence_sha256, terms_snapshot_sha256,
      terms_acceptance_sha256, terms_accepted_at, latest_state_receipt_sha256,
      prepared_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      $17,$18,$19,$20,$21,$22,16914,
      'enc:v1:ABCDEFGHIJKLMNOP',$23,$24,
      'enc:v1:QRSTUVWXYZabcdef',$25,$26,
      'enc:v1:ghijklmnopqrstuv',$27,$28,$29,$30,$31,$32,$33,$33
    )
  `, [
    ids.checkout, ids.customer, ids.order, digest(36), digest(37), digest(38),
    digest(39), ids.refresh, digest(8), digest(10), digest(14), digest(13),
    at(600_000), ids.plan, digest(26), ids.execution, digest(28), digest(29),
    digest(35), digest(17), digest(18), digest(19), digest(40), digest(41),
    digest(42), digest(43), digest(44), digest(45), digest(46), digest(47),
    at(-180_000), digest(48), at(-120_000),
  ]);
  await database.query(`
    insert into public.flight_consumer_live_checkout_evidence_receipts (
      aggregate_id, checkout_revision, receipt_kind, checkout_state,
      previous_receipt_sha256, receipt_sha256
    ) values ($1,0,'prepared','prepared',null,$2)
  `, [ids.checkout, digest(48)]);
  await database.query(`
    insert into public.flight_consumer_live_stripe_confirmation_attempts (
      id, checkout_aggregate_id, stripe_execution_attempt_id,
      customer_id, order_id, execution_scope_sha256, idempotency_sha256,
      confirmation_binding_sha256, confirmation_workflow_sha256,
      confirmation_prerequisite_sha256, checkout_binding_sha256,
      checkout_state_receipt_sha256, stripe_execution_workflow_sha256,
      stripe_execution_prerequisite_sha256,
      stripe_execution_prepared_receipt_sha256,
      stripe_execution_completed_receipt_sha256,
      payment_binding_sha256, order_reference_sha256,
      customer_reference_sha256, payment_intent_reference_ciphertext,
      payment_intent_reference_sha256, amount_cents, confirmation_not_after,
      confirmation_state, confirmation_revision,
      latest_state_receipt_sha256, handoff_token_sha256, handoff_seconds,
      handoff_expires_at, confirmation_request_sha256,
      provider_response_sha256, confirmation_evidence_sha256,
      observed_payment_intent_status, observed_amount_cents,
      observed_currency, observed_livemode,
      observed_payment_intent_reference_sha256, retrieval_evidence_sha256,
      handoff_count, stripe_confirmation_request_count,
      external_request_made, handoff_claimed_at, terminal_at,
      prepared_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
      $18,$19,'enc:v1:ABCDEFGHIJKLMNOP',$20,16914,$21,
      'authorized_requires_capture',2,$22,$23,60,$24,$25,$26,$27,
      'requires_capture',16914,'usd',true,$20,$28,1,1,true,$29,$30,$31,$30
    )
  `, [
    ids.confirmation, ids.checkout, ids.execution, ids.customer, ids.order,
    digest(49), digest(50), digest(51), digest(52), digest(53), digest(38),
    digest(48), digest(28), digest(29), digest(35), digest(34), digest(17),
    digest(18), digest(19), digest(31), at(480_000), digest(54), digest(55),
    at(60_000), digest(56), digest(57), digest(58), digest(59), at(-50_000),
    at(-20_000), at(-120_000),
  ]);
  await database.query(`
    insert into public.flight_consumer_live_stripe_confirmation_receipts (
      attempt_id, confirmation_revision, receipt_kind, confirmation_state,
      previous_receipt_sha256, receipt_sha256
    ) values ($1,2,'authorized_requires_capture',
      'authorized_requires_capture',$2,$3)
  `, [ids.confirmation, digest(60), digest(54)]);
}

const behaviorDb = await createDatabase();
await applyExactLineage(behaviorDb);
await applyPgliteCiphertextCompatibility(behaviorDb);
await seedAuthorizedChain(behaviorDb);

const finalized = await behaviorDb.query(`
  select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
    $1,0,$2,$3,$4
  )
`, [ids.checkout, digest(36), digest(38), digest(61)]);
if (finalized.rows[0]?.decision !== "finalized") {
  throw new Error("110 failed to finalize an exact authorized checkout.");
}
const replay = await behaviorDb.query(`
  select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
    $1,0,$2,$3,$4
  )
`, [ids.checkout, digest(36), digest(38), digest(61)]);
if (replay.rows[0]?.decision !== "replay") {
  throw new Error("110 exact finalization replay failed.");
}
const bridge = (await behaviorDb.query(`
  select * from public.flight_consumer_live_checkout_authorization_bridges
`)).rows[0];
if (!bridge?.authorization_bridge_receipt_sha256
  || bridge.provider_dispatch_authorized
  || bridge.payment_authorized
  || bridge.order_authorized
  || bridge.capture_authorized) {
  throw new Error("110 bridge receipt or zero-authority invariant failed.");
}

const dispatchNotAfter = at(240_000);
const preparedOrder = await behaviorDb.query(`
  select *
    from public.prepare_flight_consumer_live_duffel_order_execution_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
      16914,'USD',$17
    )
`, [
  ids.checkout, digest(36), digest(38),
  finalized.rows[0].state_receipt_sha256, ids.refresh, digest(8), digest(10),
  digest(14), digest(13), digest(18), digest(19), digest(62), digest(63),
  digest(64), digest(65), digest(66), dispatchNotAfter,
]);
if (preparedOrder.rows[0]?.decision !== "created") {
  throw new Error("108 preparation did not consume the exact 110 bridge.");
}
const claimedOrder = await behaviorDb.query(`
  select * from public.claim_flight_consumer_live_duffel_order_execution_v1(
    $1,0,$2,$3,$4,$5
  )
`, [
  preparedOrder.rows[0].attempt_id, digest(62), digest(64), digest(66),
  digest(67),
]);
if (claimedOrder.rows[0]?.decision !== "claimed") {
  throw new Error("108 claim did not retain the exact fresh 110 bridge.");
}

// Move only the synthetic 109 deadline behind the disposable database clock
// to prove the 110 wrapper resolves the already-durable exact replay before
// consulting new-attempt freshness. Production immutability remains enabled
// in the migration; this fixture-only clock simulation temporarily disables
// and immediately restores the frozen guard.
const expiredDeadline = at(-60_000);
await behaviorDb.exec(`
  alter table public.flight_consumer_live_stripe_confirmation_attempts
    disable trigger flight_consumer_live_stripe_confirmation_guard;
`);
await behaviorDb.query(`
  update public.flight_consumer_live_stripe_confirmation_attempts
     set confirmation_not_after = $2
   where id = $1
`, [ids.confirmation, expiredDeadline]);
await behaviorDb.exec(`
  alter table public.flight_consumer_live_stripe_confirmation_attempts
    enable trigger flight_consumer_live_stripe_confirmation_guard;
`);
const expiredExactReplay = await behaviorDb.query(`
  select *
    from public.prepare_flight_consumer_live_stripe_confirmation_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
    )
`, [
  ids.checkout, ids.execution, digest(49), digest(50), digest(51), digest(52),
  digest(53), digest(48), digest(34), expiredDeadline,
]);
if (expiredExactReplay.rows[0]?.decision !== "replay") {
  throw new Error("110 did not recover an expired exact durable 109 replay.");
}

let shortNewAttemptRefused = false;
try {
  await behaviorDb.query(`
    select *
      from public.prepare_flight_consumer_live_stripe_confirmation_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
      )
  `, [
    "00000000-0000-4000-8000-00000000000a",
    "00000000-0000-4000-8000-00000000000b",
    digest(70), digest(71), digest(72), digest(73), digest(74), digest(75),
    digest(76), at(4_000),
  ]);
} catch {
  shortNewAttemptRefused = true;
}
if (!shortNewAttemptRefused) {
  throw new Error("110 accepted a new non-finalizable four-second 109 window.");
}
await behaviorDb.close();

// Exercise the final pre-CAS clock refresh independently from the earlier
// prerequisite check. The disposable fixture narrows both deadlines to just
// over the 15-second floor, then wraps pgcrypto's bytea digest with two
// one-second delays after all FOR UPDATE locks have already been acquired.
// The initial (pre-delay) checks pass, while the immediate pre-CAS refresh must
// reject and leave both the checkout and bridge untouched.
const finalizeFreshnessDb = await createDatabase();
await applyExactLineage(finalizeFreshnessDb);
await applyPgliteCiphertextCompatibility(finalizeFreshnessDb);
await seedAuthorizedChain(finalizeFreshnessDb);
const finalizeDeadlines = (await finalizeFreshnessDb.query(`
  select
    clock_timestamp() + interval '16 seconds' as authorization_deadline,
    clock_timestamp() + interval '16.2 seconds' as offer_deadline
`)).rows[0];
await finalizeFreshnessDb.exec(`
  alter table public.flight_consumer_live_checkout_evidence_aggregates
    disable trigger flight_consumer_live_checkout_evidence_guard;
  alter table public.flight_consumer_live_stripe_confirmation_attempts
    disable trigger flight_consumer_live_stripe_confirmation_guard;
`);
await finalizeFreshnessDb.query(`
  update public.flight_consumer_live_duffel_offer_refresh_attempts
     set offer_expires_at = $1
   where id = $2
`, [finalizeDeadlines.offer_deadline, ids.refresh]);
await finalizeFreshnessDb.query(`
  update public.flight_consumer_live_checkout_evidence_aggregates
     set offer_expires_at = $1
   where id = $2
`, [finalizeDeadlines.offer_deadline, ids.checkout]);
await finalizeFreshnessDb.query(`
  update public.flight_consumer_live_stripe_confirmation_attempts
     set confirmation_not_after = $1
   where id = $2
`, [finalizeDeadlines.authorization_deadline, ids.confirmation]);
await finalizeFreshnessDb.exec(`
  alter table public.flight_consumer_live_stripe_confirmation_attempts
    enable trigger flight_consumer_live_stripe_confirmation_guard;
  alter table public.flight_consumer_live_checkout_evidence_aggregates
    enable trigger flight_consumer_live_checkout_evidence_guard;

  alter function extensions.digest(bytea,text)
    rename to digest_native_for_110_test;
  create function extensions.digest(p_data bytea, p_type text)
  returns bytea
  language plpgsql
  as $delayed_digest_for_110_test$
  declare
    v_wait_until timestamptz := clock_timestamp() + interval '1 second';
  begin
    while clock_timestamp() < v_wait_until loop
      null;
    end loop;
    return extensions.digest_native_for_110_test(p_data, p_type);
  end;
  $delayed_digest_for_110_test$;
`);
let finalPreCasFreshnessRefused = false;
try {
  await finalizeFreshnessDb.query(`
    select * from public.finalize_flight_consumer_live_checkout_evidence_v1(
      $1,0,$2,$3,$4
    )
  `, [ids.checkout, digest(36), digest(38), digest(61)]);
} catch (error) {
  finalPreCasFreshnessRefused = String(error).includes(
    "finalization window expired while waiting for locks",
  );
}
const finalPreCasWrites = (await finalizeFreshnessDb.query(`
  select
    (select checkout_state
       from public.flight_consumer_live_checkout_evidence_aggregates
      where id = $1) as checkout_state,
    (select checkout_revision
       from public.flight_consumer_live_checkout_evidence_aggregates
      where id = $1) as checkout_revision,
    (select count(*)::int
       from public.flight_consumer_live_checkout_authorization_bridges)
      as bridges
`, [ids.checkout])).rows[0];
await finalizeFreshnessDb.close();
if (!finalPreCasFreshnessRefused
  || finalPreCasWrites.checkout_state !== "prepared"
  || finalPreCasWrites.checkout_revision !== 0
  || finalPreCasWrites.bridges !== 0) {
  throw new Error(
    "110 did not reject stale finalization immediately before its CAS.",
  );
}

// Prove that elapsed time inside the delegated frozen-109 path is checked
// again after the delegate returns. A fixture-only BEFORE INSERT trigger
// consumes 900 ms after the wrapper's pre-check. The attempted deadline starts
// just above the one-minute floor, crosses it while the delegate runs, and the
// wrapper exception must roll back both the attempt and its receipt.
const delegateFreshnessDb = await createDatabase();
await applyExactLineage(delegateFreshnessDb);
await applyPgliteCiphertextCompatibility(delegateFreshnessDb);
await seedAuthorizedChain(delegateFreshnessDb);
await delegateFreshnessDb.exec(`
  alter table public.flight_consumer_live_stripe_confirmation_receipts
    disable trigger flight_consumer_live_stripe_confirmation_receipt_guard;
  alter table public.flight_consumer_live_stripe_confirmation_attempts
    disable trigger flight_consumer_live_stripe_confirmation_guard;
  delete from public.flight_consumer_live_stripe_confirmation_receipts;
  delete from public.flight_consumer_live_stripe_confirmation_attempts;
  alter table public.flight_consumer_live_stripe_confirmation_attempts
    enable trigger flight_consumer_live_stripe_confirmation_guard;
  alter table public.flight_consumer_live_stripe_confirmation_receipts
    enable trigger flight_consumer_live_stripe_confirmation_receipt_guard;

  create function public.delay_flight_confirmation_insert_for_110_test()
  returns trigger
  language plpgsql
  as $delay_flight_confirmation_insert_for_110_test$
  declare
    v_wait_until timestamptz := clock_timestamp() + interval '900 milliseconds';
  begin
    while clock_timestamp() < v_wait_until loop
      null;
    end loop;
    return new;
  end;
  $delay_flight_confirmation_insert_for_110_test$;
  create trigger delay_flight_confirmation_insert_for_110_test
    before insert on public.flight_consumer_live_stripe_confirmation_attempts
    for each row execute function
      public.delay_flight_confirmation_insert_for_110_test();
`);
const delegatedDeadline = (await delegateFreshnessDb.query(`
  select clock_timestamp() + interval '60.45 seconds' as deadline
`)).rows[0].deadline;
let postDelegateFreshnessRefused = false;
let postDelegateFreshnessError = null;
try {
  await delegateFreshnessDb.query(`
    select *
      from public.prepare_flight_consumer_live_stripe_confirmation_v1(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
      )
  `, [
    ids.checkout, ids.execution, digest(49), digest(50), digest(51), digest(52),
    digest(53), digest(48), digest(34), delegatedDeadline,
  ]);
} catch (error) {
  postDelegateFreshnessError = String(error);
  postDelegateFreshnessRefused = postDelegateFreshnessError.includes(
    "new-attempt window expired during preparation",
  );
}
const delegatedWrites = (await delegateFreshnessDb.query(`
  select
    (select count(*)::int
       from public.flight_consumer_live_stripe_confirmation_attempts)
      as attempts,
    (select count(*)::int
       from public.flight_consumer_live_stripe_confirmation_receipts)
      as receipts
`)).rows[0];
await delegateFreshnessDb.close();
if (!postDelegateFreshnessRefused
  || delegatedWrites.attempts !== 0
  || delegatedWrites.receipts !== 0) {
  throw new Error(
    `110 did not roll back a new 109 attempt that aged inside the delegate: ${JSON.stringify({
      postDelegateFreshnessRefused,
      postDelegateFreshnessError,
      delegatedWrites,
    })}`,
  );
}

const rollbackDb = await createDatabase();
await applyExactLineage(rollbackDb);
await rollbackDb.exec(await readFile(
  "supabase/production-rollbacks/202608260110_flight_consumer_checkout_authorization_bridge.rollback.sql",
  "utf8",
));
const rollbackState = (await rollbackDb.query(`
  select
    to_regclass(
      'public.flight_consumer_live_checkout_authorization_bridges'
    )::text as bridge,
    to_regprocedure(
      'public.prepare_flight_consumer_live_stripe_confirmation_frozen109(uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone)'
    )::text as frozen109,
    to_regprocedure(
      'public.prepare_flight_consumer_live_stripe_confirmation_v1(uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone)'
    )::text as prepare109
`)).rows[0];
await rollbackDb.close();
if (rollbackState.bridge !== null
  || rollbackState.frozen109 !== null
  || rollbackState.prepare109 === null) {
  throw new Error("110 empty rollback did not restore frozen 109 cleanly.");
}

process.stdout.write(`${JSON.stringify({
  exactApply: migrationNames.length,
  finalized: finalized.rows[0].decision,
  replay: replay.rows[0].decision,
  authorizationBridgeReceiptSha256:
    bridge.authorization_bridge_receipt_sha256,
  orderPreparation: preparedOrder.rows[0].decision,
  orderClaim: claimedOrder.rows[0].decision,
  expiredExact109Replay: expiredExactReplay.rows[0].decision,
  shortNewAttemptRefused,
  finalPreCasFreshnessRefused,
  finalPreCasWritesRolledBack:
    finalPreCasWrites.checkout_state === "prepared"
      && finalPreCasWrites.checkout_revision === 0
      && finalPreCasWrites.bridges === 0,
  postDelegateFreshnessRefused,
  postDelegateWritesRolledBack:
    delegatedWrites.attempts === 0 && delegatedWrites.receipts === 0,
  allAuthoritiesFalse: true,
  emptyRollbackRestoredFrozen109: true,
})}\n`);
