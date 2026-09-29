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
  "202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql",
  "202608260115_flight_consumer_live_public_shopping_admission.sql",
];
const migrations = await Promise.all(migrationNames.map((name) => readFile(
  `supabase/production-migrations/${name}`,
  "utf8",
)));
const rollback115 = await readFile(
  "supabase/production-rollbacks/202608260115_flight_consumer_live_public_shopping_admission.rollback.sql",
  "utf8",
);

const digest = (value) => value.toString(16).padStart(64, "0");
const computeAdmissionPolicySha256 = (policySha256) => createHash("sha256")
  .update(
    "iratepilot:flight-consumer-production:public-shopping-admission-policy:v1",
    "utf8",
  )
  .update("\0", "utf8")
  .update(
    `${policySha256}:subjectMinute=2:subjectDay=10:cohortMinute=10:`
    + "cohortDay=100:globalMinute=20:globalDay=250:claimTtlSeconds=60",
    "utf8",
  )
  .digest("hex");
const admissionPolicySha256 = computeAdmissionPolicySha256(digest(2));
const reserveSql = `
  select *
    from public.reserve_flight_consumer_live_public_shopping_admission_v1(
      $1,$2,$3,$4,$5,$6
    )
`;

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
  `);
  return database;
}

async function applyExact(database) {
  for (const migration of migrations) await database.exec(migration);
}

async function reserve(database, {
  execution = digest(1),
  policy = digest(2),
  cohort = digest(3),
  subject,
  idempotency,
  request,
}) {
  return (await database.query(reserveSql, [
    execution,
    policy,
    cohort,
    subject,
    idempotency,
    request,
  ])).rows[0];
}

const database = await createDatabase();
await applyExact(database);

const first = await reserve(database, {
  subject: digest(10),
  idempotency: digest(11),
  request: digest(12),
});
if (first?.decision !== "created"
  || first?.admission_state !== "admitted"
  || first?.admission_policy_sha256 !== admissionPolicySha256
  || first?.budget_claimed !== true
  || first?.subject_minute_claim_count !== 1
  || first?.global_minute_claim_count !== 1) {
  throw new Error("115 did not create the first bounded admission.");
}
const replay = await reserve(database, {
  subject: digest(10),
  idempotency: digest(11),
  request: digest(12),
});
if (replay?.decision !== "replay"
  || replay?.admission_id !== first.admission_id
  || replay?.admission_receipt_sha256 !== first.admission_receipt_sha256) {
  throw new Error("115 did not exactly replay its admission receipt.");
}

let collisionRefused = false;
try {
  await reserve(database, {
    subject: digest(10),
    idempotency: digest(11),
    request: digest(13),
  });
} catch {
  collisionRefused = true;
}
if (!collisionRefused) {
  throw new Error("115 accepted an idempotency collision.");
}

let pairwiseDigestReuseRefused = false;
try {
  await reserve(database, {
    subject: digest(3),
    idempotency: digest(18),
    request: digest(19),
  });
} catch {
  pairwiseDigestReuseRefused = true;
}
if (!pairwiseDigestReuseRefused) {
  throw new Error("115 accepted one digest in two evidence domains.");
}

const second = await reserve(database, {
  subject: digest(10),
  idempotency: digest(14),
  request: digest(15),
});
const subjectRefusal = await reserve(database, {
  subject: digest(10),
  idempotency: digest(16),
  request: digest(17),
});
const coalescedSubjectRefusal = await reserve(database, {
  subject: digest(10),
  idempotency: digest(21),
  request: digest(22),
});
if (second?.subject_minute_claim_count !== 2
  || subjectRefusal?.decision !== "refused"
  || subjectRefusal?.refusal_code !== "subject_minute_budget_exhausted"
  || subjectRefusal?.budget_claimed !== false
  || coalescedSubjectRefusal?.decision !== "refused"
  || coalescedSubjectRefusal?.admission_id !== subjectRefusal.admission_id
  || coalescedSubjectRefusal?.admission_receipt_sha256
    !== subjectRefusal.admission_receipt_sha256) {
  throw new Error("115 subject budget did not fail closed.");
}

for (let index = 0; index < 8; index += 1) {
  const admitted = await reserve(database, {
    subject: digest(100 + index),
    idempotency: digest(200 + index),
    request: digest(300 + index),
  });
  if (admitted?.decision !== "created") {
    throw new Error("115 cohort budget exhausted before its fixed cap.");
  }
}
const cohortRefusal = await reserve(database, {
  subject: digest(120),
  idempotency: digest(220),
  request: digest(320),
});
if (cohortRefusal?.decision !== "refused"
  || cohortRefusal?.refusal_code !== "cohort_minute_budget_exhausted"
  || cohortRefusal?.cohort_minute_claim_count !== 10) {
  throw new Error("115 cohort budget did not fail closed.");
}

for (let index = 0; index < 10; index += 1) {
  const admitted = await reserve(database, {
    cohort: digest(4),
    subject: digest(400 + index),
    idempotency: digest(500 + index),
    request: digest(600 + index),
  });
  if (admitted?.decision !== "created") {
    throw new Error("115 global budget exhausted before its fixed cap.");
  }
}
const globalRefusal = await reserve(database, {
  cohort: digest(5),
  subject: digest(420),
  idempotency: digest(520),
  request: digest(620),
});
if (globalRefusal?.decision !== "refused"
  || globalRefusal?.refusal_code !== "global_minute_budget_exhausted"
  || globalRefusal?.global_minute_claim_count !== 20) {
  throw new Error("115 global budget did not fail closed.");
}

const state = (await database.query(`
  select
    count(*)::integer as row_count,
    count(*) filter (where budget_claimed)::integer as claimed_count,
    count(*) filter (
      where admission_state = 'refused'
    )::integer as coalesced_refusal_count,
    bool_and(not provider_dispatch_authorized
      and not consumer_exposure_authorized
      and not order_authorized
      and not stripe_dispatch_authorized
      and not booking_authorized
      and not payment_authorized
      and not capture_authorized
      and not refund_authorized
      and not settlement_authorized
      and not ticketing_authorized
      and not servicing_authorized
      and not consumer_release_enabled
      and not blind_retry_authorized) as all_authorities_false,
    bool_and(execution_scope_sha256 ~ '^[0-9a-f]{64}$'
      and policy_sha256 ~ '^[0-9a-f]{64}$'
      and cohort_sha256 ~ '^[0-9a-f]{64}$'
      and subject_sha256 ~ '^[0-9a-f]{64}$'
      and idempotency_sha256 ~ '^[0-9a-f]{64}$'
      and request_sha256 ~ '^[0-9a-f]{64}$'
      and (refusal_bucket_sha256 is null
        or refusal_bucket_sha256 ~ '^[0-9a-f]{64}$')) as digest_only
  from public.flight_consumer_live_public_shopping_admissions
`)).rows[0];
if (state?.row_count !== 23
  || state?.claimed_count !== 20
  || state?.coalesced_refusal_count !== 3
  || state?.all_authorities_false !== true
  || state?.digest_only !== true) {
  throw new Error("115 persisted an invalid admission boundary.");
}

const access = (await database.query(`
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
      'public.reserve_flight_consumer_live_public_shopping_admission_v1(text,text,text,text,text,text)',
      'EXECUTE'
    ) as anon_function_execute,
    has_function_privilege(
      'authenticated',
      'public.reserve_flight_consumer_live_public_shopping_admission_v1(text,text,text,text,text,text)',
      'EXECUTE'
    ) as authenticated_function_execute,
    has_function_privilege(
      'service_role',
      'public.reserve_flight_consumer_live_public_shopping_admission_v1(text,text,text,text,text,text)',
      'EXECUTE'
    ) as service_function_execute
  from pg_catalog.pg_class as catalog_class
  where catalog_class.oid =
    'public.flight_consumer_live_public_shopping_admissions'::regclass
`)).rows[0];
if (!access?.row_security
  || !access?.force_row_security
  || access?.anon_table_select
  || access?.authenticated_table_select
  || access?.service_table_select
  || access?.anon_function_execute
  || access?.authenticated_function_execute
  || !access?.service_function_execute) {
  throw new Error("115 ACL or forced-RLS boundary is invalid.");
}

let mutationRefused = false;
try {
  await database.query(`
    update public.flight_consumer_live_public_shopping_admissions
       set refusal_code = 'global_day_budget_exhausted'
     where id = $1
  `, [first.admission_id]);
} catch {
  mutationRefused = true;
}
if (!mutationRefused) {
  throw new Error("115 accepted an evidence mutation.");
}

let populatedRollbackRefused = false;
try {
  await database.exec(rollback115);
} catch {
  populatedRollbackRefused = true;
  await database.exec("rollback;");
}
if (!populatedRollbackRefused) {
  throw new Error("115 removed populated admission evidence.");
}
await database.close();

async function seedHistoricalClaims(target, {
  count,
  execution,
  policy,
  cohort,
  subject,
  prefix,
  varyCohort = false,
  varySubject = false,
}) {
  await target.query(`
    with seeds as (
      select series,
             clock_timestamp() - interval '2 minutes' as created_at
        from generate_series(1, $1::integer) as series
    )
    insert into public.flight_consumer_live_public_shopping_admissions (
      execution_scope_sha256,
      policy_sha256,
      admission_policy_sha256,
      cohort_sha256,
      subject_sha256,
      idempotency_sha256,
      request_sha256,
      admission_state,
      refusal_code,
      budget_claimed,
      claim_expires_at,
      subject_minute_claim_count,
      subject_day_claim_count,
      cohort_minute_claim_count,
      cohort_day_claim_count,
      global_minute_claim_count,
      global_day_claim_count,
      admission_receipt_sha256,
      created_at
    )
    select
      $2,
      $3,
      $4,
      case when $8::boolean then encode(extensions.digest(
        convert_to($7 || ':cohort:' || series::text, 'UTF8'), 'sha256'
      ), 'hex') else $5 end,
      case when $9::boolean then encode(extensions.digest(
        convert_to($7 || ':subject:' || series::text, 'UTF8'), 'sha256'
      ), 'hex') else $6 end,
      encode(extensions.digest(
        convert_to($7 || ':idempotency:' || series::text, 'UTF8'), 'sha256'
      ), 'hex'),
      encode(extensions.digest(
        convert_to($7 || ':request:' || series::text, 'UTF8'), 'sha256'
      ), 'hex'),
      'admitted',
      null,
      true,
      seeds.created_at + interval '60 seconds',
      1, 1, 1, 1, series::integer, series::integer,
      encode(extensions.digest(
        convert_to($7 || ':receipt:' || series::text, 'UTF8'), 'sha256'
      ), 'hex'),
      seeds.created_at
    from seeds
  `, [
    count,
    execution,
    policy,
    computeAdmissionPolicySha256(policy),
    cohort,
    subject,
    prefix,
    varyCohort,
    varySubject,
  ]);
}

const dayBudgetDatabase = await createDatabase();
await applyExact(dayBudgetDatabase);

await seedHistoricalClaims(dayBudgetDatabase, {
  count: 10,
  execution: digest(1_000),
  policy: digest(1_001),
  cohort: digest(1_002),
  subject: digest(1_003),
  prefix: "subject-day",
});
const subjectDayRefusal = await reserve(dayBudgetDatabase, {
  execution: digest(1_000),
  policy: digest(1_001),
  cohort: digest(1_002),
  subject: digest(1_003),
  idempotency: digest(1_004),
  request: digest(1_005),
});

await seedHistoricalClaims(dayBudgetDatabase, {
  count: 100,
  execution: digest(2_000),
  policy: digest(2_001),
  cohort: digest(2_002),
  subject: digest(2_003),
  prefix: "cohort-day",
  varySubject: true,
});
const cohortDayRefusal = await reserve(dayBudgetDatabase, {
  execution: digest(2_000),
  policy: digest(2_001),
  cohort: digest(2_002),
  subject: digest(2_004),
  idempotency: digest(2_005),
  request: digest(2_006),
});

await seedHistoricalClaims(dayBudgetDatabase, {
  count: 250,
  execution: digest(3_000),
  policy: digest(3_001),
  cohort: digest(3_002),
  subject: digest(3_003),
  prefix: "global-day",
  varyCohort: true,
  varySubject: true,
});
const globalDayRefusal = await reserve(dayBudgetDatabase, {
  execution: digest(3_000),
  policy: digest(3_001),
  cohort: digest(3_004),
  subject: digest(3_005),
  idempotency: digest(3_006),
  request: digest(3_007),
});
await dayBudgetDatabase.close();

if (subjectDayRefusal?.refusal_code !== "subject_day_budget_exhausted"
  || cohortDayRefusal?.refusal_code !== "cohort_day_budget_exhausted"
  || globalDayRefusal?.refusal_code !== "global_day_budget_exhausted") {
  throw new Error("115 rolling-day budgets did not fail closed.");
}

const rollbackDatabase = await createDatabase();
await applyExact(rollbackDatabase);
await rollbackDatabase.exec(rollback115);
const rollbackState = (await rollbackDatabase.query(`
  select
    to_regclass(
      'public.flight_consumer_live_public_shopping_admissions'
    ) as admissions,
    to_regprocedure(
      'public.reserve_flight_consumer_live_public_shopping_admission_v1(text,text,text,text,text,text)'
    ) as reserve_rpc,
    to_regclass(
      'public.flight_consumer_live_duffel_shopping_attempts'
    ) as shopping_101,
    to_regclass(
      'public.flight_consumer_live_duffel_offer_sources'
    ) as sources_105
`)).rows[0];
await rollbackDatabase.close();
if (rollbackState?.admissions !== null
  || rollbackState?.reserve_rpc !== null
  || rollbackState?.shopping_101 === null
  || rollbackState?.sources_105 === null) {
  throw new Error("115 empty rollback did not restore the exact 105 boundary.");
}

console.log(JSON.stringify({
  exactApply: "101/105/115",
  created: first.decision,
  replay: replay.decision,
  collisionRefused,
  pairwiseDigestReuseRefused,
  subjectBudgetRefusal: subjectRefusal.refusal_code,
  refusalEvidenceCoalesced: true,
  cohortBudgetRefusal: cohortRefusal.refusal_code,
  globalBudgetRefusal: globalRefusal.refusal_code,
  subjectDayBudgetRefusal: subjectDayRefusal.refusal_code,
  cohortDayBudgetRefusal: cohortDayRefusal.refusal_code,
  globalDayBudgetRefusal: globalDayRefusal.refusal_code,
  claimedCount: state.claimed_count,
  forcedRls: true,
  serviceRoleRpcOnly: true,
  allAuthoritiesFalse: true,
  mutationRefused,
  populatedRollbackRefused,
  emptyRollbackRestored105: true,
  providerRequests: 0,
  stripeRequests: 0,
}));
