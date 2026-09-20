import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const pgliteDist = process.env.PGLITE_DIST;
if (!pgliteDist) {
  throw new Error(
    "PGLITE_DIST must point to the @electric-sql/pglite dist directory.",
  );
}

const { PGlite } = await import(pathToFileURL(`${pgliteDist}/index.js`).href);
const { pgcrypto } = await import(
  pathToFileURL(`${pgliteDist}/contrib/pgcrypto.js`).href,
);

const migrationNames = [
  "202608260101_flight_consumer_live_duffel_shopping_journal.sql",
  "202608260102_flight_consumer_live_duffel_shopping_rpc_qualification_repair.sql",
  "202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql",
  "202608260115_flight_consumer_live_public_shopping_admission.sql",
  "202608260116_flight_consumer_live_public_offer_projection.sql",
  "202608260117_flight_consumer_live_public_offer_reference_retention.sql",
  "202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql",
];
const migrations = await Promise.all(migrationNames.map((name) => readFile(
  `supabase/production-migrations/${name}`,
  "utf8",
)));
const rollback = await readFile(
  "supabase/production-rollbacks/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.rollback.sql",
  "utf8",
);

const fixed = (value) => value.toString(16).padStart(64, "0");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const recordSql = `
  select *
    from public.record_flight_consumer_live_duffel_offer_sources_v1(
      $1,$2,$3,$4::jsonb
    )
`;
const listSql = `
  select *
    from public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
      $1,$2,$3
    )
`;
const completeSql = `
  select *
    from public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
      $1,1,'succeeded',200,$2,1024,$3
    )
`;

async function makeDatabase() {
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
  `);
  return database;
}

async function prepareAttempt(database, sequence) {
  const scope = fixed(1_000 + sequence * 10);
  const idempotency = fixed(1_001 + sequence * 10);
  const request = fixed(1_002 + sequence * 10);
  const body = fixed(1_003 + sequence * 10);
  const response = fixed(1_004 + sequence * 10);
  const prepared = (await database.query(`
    select *
      from public.prepare_flight_consumer_live_duffel_shopping_attempt_v1(
        $1,$2,$3,$4,$5
      )
  `, [
    scope,
    idempotency,
    request,
    body,
    new Date(Date.now() + 90_000).toISOString(),
  ])).rows[0];
  await database.query(`
    select *
      from public.claim_flight_consumer_live_duffel_shopping_attempt_v1(
        $1,0,$2
      )
  `, [prepared.attempt_id, scope]);
  return Object.freeze({
    attemptId: prepared.attempt_id,
    scope,
    response,
  });
}

async function record(database, attempt, sources, overrides = {}) {
  return (await database.query(recordSql, [
    attempt.attemptId,
    overrides.scope ?? attempt.scope,
    overrides.response ?? attempt.response,
    JSON.stringify(sources),
  ])).rows[0];
}

async function expectRefusal(action, message, expectedCode = null) {
  try {
    await action();
  } catch (error) {
    if (expectedCode !== null && error?.code !== expectedCode) {
      throw new Error(`${message} returned ${String(error?.code)}.`);
    }
    return true;
  }
  throw new Error(message);
}

async function sourceCount(database, attemptId) {
  return (await database.query(`
    select count(*)::integer as count
      from public.flight_consumer_live_duffel_offer_sources as source
     where source.source_shopping_attempt_id = $1
  `, [attemptId])).rows[0]?.count;
}

async function complete(database, attempt, response, count) {
  return (await database.query(completeSql, [
    attempt.attemptId,
    response,
    count,
  ])).rows[0];
}

async function header(database, attemptId) {
  return (await database.query(`
    select *
      from public.flight_consumer_live_duffel_offer_source_batches as batch
     where batch.source_shopping_attempt_id = $1
  `, [attemptId])).rows[0] ?? null;
}

const database = await makeDatabase();
for (const migration of migrations.slice(0, -1)) {
  await database.exec(migration);
}

const baselineAttempt = await prepareAttempt(database, 1);
const baselineExpiry = new Date(Date.now() + 3_600_000).toISOString();
const baselineSource = Object.freeze({
  offerIdSha256: fixed(2_001),
  expiresAt: baselineExpiry,
});
const baseline42702Refused = await expectRefusal(
  () => record(database, baselineAttempt, [baselineSource]),
  "The unmodified Gate 105 RPC unexpectedly accepted a source.",
  "42702",
);
if (await sourceCount(database, baselineAttempt.attemptId) !== 0) {
  throw new Error("The baseline 42702 failure persisted partial evidence.");
}

// The pre-118 journal permits a safe historical zero-offer success without a
// row-level source artifact. Gate 118 must deterministically backfill its empty
// batch header while refusing any history whose non-zero count is unbound.
const historicalZeroAttempt = await prepareAttempt(database, 90);
await complete(
  database,
  historicalZeroAttempt,
  historicalZeroAttempt.response,
  0,
);

await database.exec(migrations.at(-1));

const historicalZeroHeader = await header(
  database,
  historicalZeroAttempt.attemptId,
);
const safeZeroHistoryBackfilled = historicalZeroHeader?.source_offer_count === 0
  && historicalZeroHeader?.source_response_sha256
    === historicalZeroAttempt.response
  && /^[0-9a-f]{64}$/.test(historicalZeroHeader?.source_set_sha256 ?? "")
  && /^[0-9a-f]{64}$/.test(
    historicalZeroHeader?.source_batch_receipt_sha256 ?? "",
  );
if (!safeZeroHistoryBackfilled) {
  throw new Error("Gate 118 did not safely backfill zero-offer history.");
}

const zeroAttempt = await prepareAttempt(database, 2);
const zeroReceipt = await record(database, zeroAttempt, []);
const zeroReplay = await record(database, zeroAttempt, []);
const zeroListed = (await database.query(listSql, [
  zeroAttempt.attemptId,
  zeroAttempt.scope,
  zeroAttempt.response,
])).rows;
const zeroOfferRecorded = zeroReceipt?.recorded_source_count === 0
  && zeroReplay?.recorded_source_count === 0
  && zeroListed.length === 0;
if (!zeroOfferRecorded) {
  throw new Error("Gate 118 did not preserve an exact zero-offer receipt.");
}
const zeroHeader = await header(database, zeroAttempt.attemptId);
const zeroCompletion = await complete(
  database,
  zeroAttempt,
  zeroAttempt.response,
  0,
);
const zeroTerminal = (await database.query(`
  select attempt_state, terminal_response_sha256, offer_count
    from public.flight_consumer_live_duffel_shopping_attempts
   where id = $1
`, [zeroAttempt.attemptId])).rows[0];
const zeroHeaderCompleted = zeroHeader?.source_offer_count === 0
  && zeroHeader?.source_response_sha256 === zeroAttempt.response
  && /^[0-9a-f]{64}$/.test(zeroHeader?.source_set_sha256 ?? "")
  && /^[0-9a-f]{64}$/.test(zeroHeader?.source_batch_receipt_sha256 ?? "")
  && zeroCompletion?.attempt_state === "succeeded"
  && zeroTerminal?.attempt_state === "succeeded"
  && zeroTerminal?.terminal_response_sha256 === zeroAttempt.response
  && zeroTerminal?.offer_count === 0;
if (!zeroHeaderCompleted) {
  throw new Error("Gate 118 did not header-bind and complete zero offers.");
}

const oneReceipt = await record(database, baselineAttempt, [baselineSource]);
const oneRows = (await database.query(listSql, [
  baselineAttempt.attemptId,
  baselineAttempt.scope,
  baselineAttempt.response,
])).rows;
const oneOfferRecorded = oneReceipt?.recorded_source_count === 1
  && oneRows.length === 1
  && oneRows[0]?.offer_id_sha256 === baselineSource.offerIdSha256
  && new Date(oneRows[0]?.expires_at).toISOString() === baselineExpiry;
if (!oneOfferRecorded) {
  throw new Error("Gate 118 did not record one exact source.");
}
const gate116WrongResponseRefused = await expectRefusal(
  () => database.query(listSql, [
    baselineAttempt.attemptId,
    baselineAttempt.scope,
    fixed(8_888),
  ]),
  "Gate 116 source listing accepted the wrong response digest.",
);

const oneHeaderBeforeReplay = await header(database, baselineAttempt.attemptId);
const oneReplay = await record(database, baselineAttempt, [baselineSource]);
const oneHeaderAfterReplay = await header(database, baselineAttempt.attemptId);
const exactReplayAccepted = oneReplay?.recorded_source_count === 1
  && await sourceCount(database, baselineAttempt.attemptId) === 1;
if (!exactReplayAccepted) {
  throw new Error("Gate 118 did not converge an exact replay.");
}
const headerExactReplayAccepted = oneHeaderBeforeReplay !== null
  && oneHeaderAfterReplay !== null
  && oneHeaderAfterReplay.source_batch_receipt_sha256
    === oneHeaderBeforeReplay.source_batch_receipt_sha256
  && oneHeaderAfterReplay.source_set_sha256
    === oneHeaderBeforeReplay.source_set_sha256
  && new Date(oneHeaderAfterReplay.recorded_at).toISOString()
    === new Date(oneHeaderBeforeReplay.recorded_at).toISOString();
if (!headerExactReplayAccepted) {
  throw new Error("Gate 118 mutated its exact batch-header replay.");
}

const manyAttempt = await prepareAttempt(database, 3);
const manySources = [0, 1, 2].map((offset) => ({
  offerIdSha256: fixed(2_100 + offset),
  expiresAt: new Date(Date.now() + (4_000 + offset) * 1_000).toISOString(),
}));
const manyReceipt = await record(database, manyAttempt, manySources);
const manyRows = (await database.query(listSql, [
  manyAttempt.attemptId,
  manyAttempt.scope,
  manyAttempt.response,
])).rows;
const manyOffersRecorded = manyReceipt?.recorded_source_count === 3
  && manyRows.length === 3
  && new Set(manyRows.map((row) => row.offer_id_sha256)).size === 3;
if (!manyOffersRecorded) {
  throw new Error("Gate 118 did not record a complete many-offer set.");
}

const duplicateAttempt = await prepareAttempt(database, 4);
const duplicate = {
  offerIdSha256: fixed(2_200),
  expiresAt: new Date(Date.now() + 5_000_000).toISOString(),
};
const duplicateInputRefused = await expectRefusal(
  () => record(database, duplicateAttempt, [duplicate, duplicate]),
  "Gate 118 accepted duplicate source input.",
);
if (await sourceCount(database, duplicateAttempt.attemptId) !== 0) {
  throw new Error("Duplicate input persisted partial evidence.");
}

const changedExpiryRefused = await expectRefusal(
  () => record(database, baselineAttempt, [{
    ...baselineSource,
    expiresAt: new Date(Date.parse(baselineExpiry) + 1_000).toISOString(),
  }]),
  "Gate 118 accepted a changed-expiry replay.",
);
const changedScopeRefused = await expectRefusal(
  () => record(database, baselineAttempt, [baselineSource], {
    scope: fixed(9_001),
  }),
  "Gate 118 accepted a changed-scope replay.",
);
const changedResponseRefused = await expectRefusal(
  () => record(database, baselineAttempt, [baselineSource], {
    response: fixed(9_002),
  }),
  "Gate 118 accepted a changed-response replay.",
);
if (await sourceCount(database, baselineAttempt.attemptId) !== 1) {
  throw new Error("A replay collision mutated the exact stored source.");
}

const wrongTerminalAttempt = await prepareAttempt(database, 5);
const wrongTerminalSource = {
  offerIdSha256: fixed(2_300),
  expiresAt: new Date(Date.now() + 6_000_000).toISOString(),
};
await record(database, wrongTerminalAttempt, [wrongTerminalSource]);
const wrongTerminalResponseRefused = await expectRefusal(
  () => complete(database, wrongTerminalAttempt, fixed(9_100), 1),
  "Gate 118 accepted the wrong terminal response.",
);
const wrongTerminalCountRefused = await expectRefusal(
  () => complete(
    database,
    wrongTerminalAttempt,
    wrongTerminalAttempt.response,
    2,
  ),
  "Gate 118 accepted the wrong terminal source count.",
);
const stillDispatching = (await database.query(`
  select attempt_state, attempt_revision
    from public.flight_consumer_live_duffel_shopping_attempts
   where id = $1
`, [wrongTerminalAttempt.attemptId])).rows[0];
if (stillDispatching?.attempt_state !== "dispatching"
  || stillDispatching?.attempt_revision !== 1) {
  throw new Error("A refused terminal mismatch changed the attempt state.");
}
await complete(
  database,
  wrongTerminalAttempt,
  wrongTerminalAttempt.response,
  1,
);

const crossResponseAttempt = await prepareAttempt(database, 6);
const crossResponseExpiry = new Date(Date.now() + 7_000_000).toISOString();
await record(database, crossResponseAttempt, [{
  offerIdSha256: fixed(2_400),
  expiresAt: crossResponseExpiry,
}]);
const orphanResponse = fixed(9_200);
const orphanOffer = fixed(2_401);
const orphanEvidence = sha(
  "iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1\0"
  + [
    crossResponseAttempt.attemptId,
    crossResponseAttempt.scope,
    orphanResponse,
    orphanOffer,
    new Date(crossResponseExpiry).toISOString()
      .replace(/\.(\d{3})Z$/, ".$1000Z"),
  ].join(":"),
);
await database.query(`
  insert into public.flight_consumer_live_duffel_offer_sources (
    source_shopping_attempt_id,
    source_shopping_execution_scope_sha256,
    source_response_sha256,
    offer_id_sha256,
    source_offer_evidence_sha256,
    expires_at
  ) values ($1,$2,$3,$4,$5,$6)
`, [
  crossResponseAttempt.attemptId,
  crossResponseAttempt.scope,
  orphanResponse,
  orphanOffer,
  orphanEvidence,
  crossResponseExpiry,
]);
const crossResponseListRefused = await expectRefusal(
  () => database.query(listSql, [
    crossResponseAttempt.attemptId,
    crossResponseAttempt.scope,
    crossResponseAttempt.response,
  ]),
  "Gate 116 listing accepted a cross-response orphan.",
);
const crossResponseCompletionRefused = await expectRefusal(
  () => complete(
    database,
    crossResponseAttempt,
    crossResponseAttempt.response,
    1,
  ),
  "Gate 101 completion accepted a cross-response orphan.",
);
const crossResponseSourceRefused = crossResponseListRefused
  && crossResponseCompletionRefused;

const crossScopeAttempt = await prepareAttempt(database, 7);
const crossScopeExpiry = new Date(Date.now() + 8_000_000).toISOString();
await record(database, crossScopeAttempt, [{
  offerIdSha256: fixed(2_500),
  expiresAt: crossScopeExpiry,
}]);
const orphanScope = fixed(9_300);
const orphanScopeOffer = fixed(2_501);
const orphanScopeEvidence = sha(
  "iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1\0"
  + [
    crossScopeAttempt.attemptId,
    orphanScope,
    crossScopeAttempt.response,
    orphanScopeOffer,
    new Date(crossScopeExpiry).toISOString()
      .replace(/\.(\d{3})Z$/, ".$1000Z"),
  ].join(":"),
);
await database.query(`
  insert into public.flight_consumer_live_duffel_offer_sources (
    source_shopping_attempt_id,
    source_shopping_execution_scope_sha256,
    source_response_sha256,
    offer_id_sha256,
    source_offer_evidence_sha256,
    expires_at
  ) values ($1,$2,$3,$4,$5,$6)
`, [
  crossScopeAttempt.attemptId,
  orphanScope,
  crossScopeAttempt.response,
  orphanScopeOffer,
  orphanScopeEvidence,
  crossScopeExpiry,
]);
const crossScopeListRefused = await expectRefusal(
  () => database.query(listSql, [
    crossScopeAttempt.attemptId,
    crossScopeAttempt.scope,
    crossScopeAttempt.response,
  ]),
  "Gate 118 listing accepted a cross-scope orphan.",
);
const crossScopeCompletionRefused = await expectRefusal(
  () => complete(
    database,
    crossScopeAttempt,
    crossScopeAttempt.response,
    1,
  ),
  "Gate 101 completion accepted a cross-scope orphan.",
);
const crossScopeSourceRefused = crossScopeListRefused
  && crossScopeCompletionRefused;

const expectedEvidence = sha(
  "iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1\0"
  + [
    baselineAttempt.attemptId,
    baselineAttempt.scope,
    baselineAttempt.response,
    baselineSource.offerIdSha256,
    new Date(baselineExpiry).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
  ].join(":"),
);
if (oneRows[0]?.source_offer_evidence_sha256 !== expectedEvidence) {
  throw new Error("Gate 118 did not retain the exact domain-separated evidence.");
}

const posture = (await database.query(`
  select
    catalog_class.relrowsecurity as row_security,
    catalog_class.relforcerowsecurity as force_row_security,
    has_table_privilege(
      'anon', catalog_class.oid, 'SELECT'
    ) as anon_table_select,
    has_table_privilege(
      'authenticated', catalog_class.oid, 'SELECT'
    ) as authenticated_table_select,
    has_table_privilege(
      'service_role', catalog_class.oid, 'SELECT'
    ) as service_table_select,
    has_function_privilege(
      'anon',
      'public.record_flight_consumer_live_duffel_offer_sources_v1(uuid,text,text,jsonb)',
      'EXECUTE'
    ) as anon_function_execute,
    has_function_privilege(
      'authenticated',
      'public.record_flight_consumer_live_duffel_offer_sources_v1(uuid,text,text,jsonb)',
      'EXECUTE'
    ) as authenticated_function_execute,
    has_function_privilege(
      'service_role',
      'public.record_flight_consumer_live_duffel_offer_sources_v1(uuid,text,text,jsonb)',
      'EXECUTE'
    ) as service_function_execute
  from pg_catalog.pg_class as catalog_class
  where catalog_class.oid =
    'public.flight_consumer_live_duffel_offer_sources'::regclass
`)).rows[0];
const forcedRls = posture?.row_security === true
  && posture?.force_row_security === true;
const serviceRoleOnly = posture?.anon_table_select === false
  && posture?.authenticated_table_select === false
  && posture?.service_table_select === false
  && posture?.anon_function_execute === false
  && posture?.authenticated_function_execute === false
  && posture?.service_function_execute === true;
if (!forcedRls || !serviceRoleOnly) {
  throw new Error("Gate 118 changed the Gate 105 RLS or ACL boundary.");
}

const headerPosture = (await database.query(`
  select
    catalog_class.relrowsecurity as row_security,
    catalog_class.relforcerowsecurity as force_row_security,
    has_table_privilege(
      'anon', catalog_class.oid, 'SELECT'
    ) as anon_table_select,
    has_table_privilege(
      'authenticated', catalog_class.oid, 'SELECT'
    ) as authenticated_table_select,
    has_table_privilege(
      'service_role', catalog_class.oid, 'SELECT'
    ) as service_table_select,
    has_function_privilege(
      'service_role',
      'public.refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1()',
      'EXECUTE'
    ) as service_mutation_execute,
    has_function_privilege(
      'service_role',
      'public.guard_flight_consumer_live_duffel_shopping_success_sources_v1()',
      'EXECUTE'
    ) as service_guard_execute
  from pg_catalog.pg_class as catalog_class
  where catalog_class.oid =
    'public.flight_consumer_live_duffel_offer_source_batches'::regclass
`)).rows[0];
const headerServiceRoleHidden = headerPosture?.row_security === true
  && headerPosture?.force_row_security === true
  && headerPosture?.anon_table_select === false
  && headerPosture?.authenticated_table_select === false
  && headerPosture?.service_table_select === false
  && headerPosture?.service_mutation_execute === false
  && headerPosture?.service_guard_execute === false;
if (!headerServiceRoleHidden) {
  throw new Error("Gate 118 exposed its immutable source batch header.");
}

const headerImmutable = await expectRefusal(
  () => database.query(`
    update public.flight_consumer_live_duffel_offer_source_batches
       set source_offer_count = source_offer_count + 1
     where source_shopping_attempt_id = $1
  `, [baselineAttempt.attemptId]),
  "Gate 118 accepted a source batch header mutation.",
);

const constraint = (await database.query(`
  select constraint_record.conname,
         constraint_record.contype,
         index_record.indisunique,
         index_record.indisvalid,
         index_record.indisready,
         array_agg(attribute.attname order by key_column.ordinality) as columns
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_index as index_record
      on index_record.indexrelid = constraint_record.conindid
    join lateral unnest(constraint_record.conkey) with ordinality
      as key_column(attnum, ordinality) on true
    join pg_catalog.pg_attribute as attribute
      on attribute.attrelid = constraint_record.conrelid
     and attribute.attnum = key_column.attnum
   where constraint_record.conrelid =
     'public.flight_consumer_live_duffel_offer_sources'::regclass
     and constraint_record.conname =
       'flight_consumer_duffel_offer_source_attempt_offer_uniq'
   group by constraint_record.conname, constraint_record.contype,
            index_record.indisunique, index_record.indisvalid,
            index_record.indisready
`)).rows[0];
if (constraint?.contype !== "u"
  || constraint?.indisunique !== true
  || constraint?.indisvalid !== true
  || constraint?.indisready !== true
  || JSON.stringify(constraint?.columns) !== JSON.stringify([
    "source_shopping_attempt_id",
    "offer_id_sha256",
  ])) {
  throw new Error("Gate 118 did not stabilize the exact unique constraint.");
}

const gate116SourceListingEnabled = zeroListed.length === 0
  && oneRows.length === 1
  && manyRows.length === 3;
if (!gate116SourceListingEnabled) {
  throw new Error("Gate 118 did not enable the real Gate 116 source-list RPC.");
}

let rollbackRefused = false;
try {
  await database.exec(rollback);
} catch {
  rollbackRefused = true;
  await database.exec("rollback;");
}
if (!rollbackRefused) {
  throw new Error("Gate 118 permitted a regressive rollback.");
}

await database.close();

const unsafeHistoryDatabase = await makeDatabase();
for (const migration of migrations.slice(0, -1)) {
  await unsafeHistoryDatabase.exec(migration);
}
const unsafeHistoryAttempt = await prepareAttempt(unsafeHistoryDatabase, 91);
await complete(
  unsafeHistoryDatabase,
  unsafeHistoryAttempt,
  unsafeHistoryAttempt.response,
  1,
);
let unsafeSucceededHistoryRefused = false;
try {
  await unsafeHistoryDatabase.exec(migrations.at(-1));
} catch {
  unsafeSucceededHistoryRefused = true;
  await unsafeHistoryDatabase.exec("rollback;");
}
const refusedHistoryState = (await unsafeHistoryDatabase.query(`
  select to_regclass(
    'public.flight_consumer_live_duffel_offer_source_batches'
  ) as source_batches
`)).rows[0];
await unsafeHistoryDatabase.close();
if (!unsafeSucceededHistoryRefused
  || refusedHistoryState?.source_batches !== null) {
  throw new Error("Gate 118 accepted or partially applied unsafe history.");
}

console.log(JSON.stringify({
  exactApply: "101/102/105/115/116/117/118",
  baseline42702Refused,
  safeZeroHistoryBackfilled,
  unsafeSucceededHistoryRefused,
  zeroOfferRecorded,
  zeroHeaderCompleted,
  oneOfferRecorded,
  manyOffersRecorded,
  exactReplayAccepted,
  headerExactReplayAccepted,
  duplicateInputRefused,
  changedExpiryRefused,
  changedScopeRefused,
  changedResponseRefused,
  wrongTerminalResponseRefused,
  wrongTerminalCountRefused,
  crossResponseSourceRefused,
  crossScopeSourceRefused,
  gate116WrongResponseRefused,
  gate116SourceListingEnabled,
  forcedRls,
  serviceRoleOnly,
  headerImmutable,
  headerServiceRoleHidden,
  rollbackRefused,
  providerRequests: 0,
  stripeRequests: 0,
}));
