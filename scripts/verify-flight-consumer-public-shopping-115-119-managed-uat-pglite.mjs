import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const dist = process.env.PGLITE_DIST;
if (!dist) throw new Error("PGLITE_DIST is required.");
const { PGlite } = await import(pathToFileURL(`${dist}/index.js`).href);
const { pgcrypto } = await import(
  pathToFileURL(`${dist}/contrib/pgcrypto.js`).href
);

const migrationNames = [
  "202608260101_flight_consumer_live_duffel_shopping_journal.sql",
  "202608260102_flight_consumer_live_duffel_shopping_rpc_qualification_repair.sql",
  "202608260105_flight_consumer_live_duffel_offer_refresh_journal.sql",
  "202608260115_flight_consumer_live_public_shopping_admission.sql",
  "202608260116_flight_consumer_live_public_offer_projection.sql",
  "202608260117_flight_consumer_live_public_offer_reference_retention.sql",
  "202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql",
  "202608260119_flight_consumer_live_public_shopping_dispatch.sql",
];
const migrations = await Promise.all(migrationNames.map((name) => readFile(
  `supabase/production-migrations/${name}`,
  "utf8",
)));
let verification = await readFile(
  "scripts/flight-consumer-public-shopping-115-119-managed-uat-verification.sql",
  "utf8",
);

// PGlite currently reports PostgreSQL 18 while the managed target is pinned to
// 17. Alter only the two exact major-version bounds in the local verifier; all
// catalog, ACL, synthetic, savepoint, and zero-residue SQL remains exact.
const lower = "current_setting('server_version_num')::integer < 170000";
const upper = "current_setting('server_version_num')::integer >= 180000";
if (verification.split(lower).length !== 2
  || verification.split(upper).length !== 2) {
  throw new Error("Managed verifier PostgreSQL major overlay is not exact.");
}
verification = verification
  .replace(lower, "current_setting('server_version_num')::integer < 180000")
  .replace(upper, "current_setting('server_version_num')::integer >= 190000");

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create schema auth;
  create schema supabase_migrations;
  grant usage on schema auth, extensions, supabase_migrations to postgres;
  create table supabase_migrations.schema_migrations(version text primary key);
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  grant service_role to postgres;
  create function auth.role() returns text language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    )
  $$;
  grant usage on schema auth to service_role;
  grant execute on function auth.role() to service_role;
`);
for (const migration of migrations) await db.exec(migration);
await db.exec(`
  grant usage on schema auth, extensions to service_role;
  grant execute on function auth.role() to service_role;
`);
await db.exec(`
  select set_config(
    'app.flight_managed_115_119_target_kind', 'isolated_uat', false
  );
  select set_config(
    'app.flight_managed_115_119_project_ref', 'bzxqbvmrkmjyvudlspss', false
  );
`);
await db.exec(verification);

const residue = (await db.query(`select
  (select count(*)::integer from
    public.flight_consumer_live_public_shopping_admissions) as admissions,
  (select count(*)::integer from
    public.flight_consumer_live_public_shopping_dispatches) as dispatches,
  (select count(*)::integer from
    public.flight_consumer_live_public_offer_projection_batches) as batches,
  (select count(*)::integer from
    public.flight_consumer_live_public_offer_reference_purge_receipts) as purges
`)).rows[0];
if (Object.values(residue).some((count) => count !== 0)) {
  throw new Error("Managed UAT verification left persistent PGlite residue.");
}
console.log(
  "Flight Consumer managed UAT Gates 115-119 PGlite verifier passed.",
);
