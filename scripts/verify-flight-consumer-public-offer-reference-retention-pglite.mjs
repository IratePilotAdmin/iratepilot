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
  "202608260117_flight_consumer_live_public_offer_reference_retention.sql",
];
const migrations = await Promise.all(names.map((name) => readFile(
  `supabase/production-migrations/${name}`, "utf8",
)));
const rollback = await readFile(
  "supabase/production-rollbacks/202608260117_flight_consumer_live_public_offer_reference_retention.rollback.sql",
  "utf8",
);
async function makeDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
    create schema auth; create role anon; create role authenticated; create role service_role;
    create function auth.role() returns text language sql stable as $$ select 'service_role' $$;`);
  for (const migration of migrations) await db.exec(migration);
  return db;
}

const db = await makeDb();
await db.exec("set session_replication_role = replica");
await db.exec(`insert into public.flight_consumer_live_public_offer_reference_vaults(
 projection_id,offer_id_sha256,provider_offer_reference_ciphertext,key_version,
 aad_sha256,ciphertext_sha256,record_hmac_sha256,retention_expires_at,created_at)
 values('00000000-0000-4000-8000-000000000001','${"1".repeat(64)}',
 'enc:v1:abcdefghijklmnop','kms-v1','${"2".repeat(64)}','${"3".repeat(64)}',
 '${"4".repeat(64)}',statement_timestamp()-interval '1 day',
 statement_timestamp()-interval '8 days')`);
await db.exec("set session_replication_role = origin");
const purgeSql = "select * from public.purge_flight_consumer_live_expired_offer_references_v1($1)";
const purged = (await db.query(purgeSql, [500])).rows[0];
if (purged?.decision !== "purged" || purged?.purged_count !== 1
  || purged?.purge_receipt_id === null
  || Object.entries(purged).some(([key, value]) =>
    (key.endsWith("authorized") || key.endsWith("enabled")) && value !== false)) {
  throw new Error("117 populated purge receipt failed.");
}
const counts = (await db.query(`select
 (select count(*)::int from public.flight_consumer_live_public_offer_reference_vaults) as vaults,
 (select count(*)::int from public.flight_consumer_live_public_offer_reference_purge_receipts) as receipts`)).rows[0];
if (counts.vaults !== 0 || counts.receipts !== 1) throw new Error("117 purge accounting failed.");
const empty = (await db.query(purgeSql, [500])).rows[0];
const afterEmpty = (await db.query(`select count(*)::int as count from
 public.flight_consumer_live_public_offer_reference_purge_receipts`)).rows[0];
if (empty?.decision !== "empty" || empty?.purged_count !== 0
  || empty?.purge_receipt_id !== null || afterEmpty.count !== 1) {
  throw new Error("117 empty purge grew evidence.");
}
const posture = (await db.query(`select relrowsecurity,relforcerowsecurity,
 has_function_privilege('anon',
 'public.purge_flight_consumer_live_expired_offer_references_v1(integer)',
 'EXECUTE') as anon_execute from pg_class where oid =
 'public.flight_consumer_live_public_offer_reference_purge_receipts'::regclass`)).rows[0];
if (!posture.relrowsecurity || !posture.relforcerowsecurity || posture.anon_execute) {
  throw new Error("117 RLS/ACL posture failed.");
}
let rollbackRefused = false;
try { await db.exec(rollback); } catch { rollbackRefused = true; }
if (!rollbackRefused) throw new Error("117 rollback ignored purge evidence.");
const reversible = await makeDb(); await reversible.exec(rollback);
const restored = (await reversible.query(`select pg_get_triggerdef(oid) as definition
 from pg_trigger where tgrelid =
 'public.flight_consumer_live_public_offer_reference_vaults'::regclass
 and not tgisinternal`)).rows[0]?.definition ?? "";
if (!restored.includes("BEFORE") || !restored.includes("UPDATE")
  || !restored.includes("DELETE")) {
  throw new Error("117 rollback did not restore delete immutability.");
}
console.log("Flight Consumer Production reference-retention behavioral PGlite verifier passed.");
