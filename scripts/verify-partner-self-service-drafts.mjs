import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Explicit local PGlite installation; no credentials, network, or persistent DB.
const modulePath = process.argv[2];
if (!modulePath || !path.isAbsolute(modulePath)) throw new Error("Supply an absolute local PGlite module path");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/hotel-migrations/202609160140_partner_self_service_drafts.sql");
const conflictFix = read("supabase/hotel-migrations/202609160141_partner_draft_terminal_conflicts.sql");
const rollback = read("supabase/hotel-rollbacks/202609160140_partner_self_service_drafts.rollback.sql");
const schema = read("supabase/schema.sql");
assert.ok(schema.includes(migration) && schema.endsWith(conflictFix), "schema mirrors draft and terminal-conflict migrations exactly");
const start = schema.indexOf("create or replace function public.submit_partner_application(");
const end = schema.indexOf("-- These exact fields are the forward contract", start);
assert.ok(start > 0 && end > start, "canonical intake RPC block exists");
const db = new PGlite();
const checks = [];
const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const unverified = "10000000-0000-4000-8000-000000000003";
const admin = "10000000-0000-4000-8000-000000000004";
const key = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const registration = (name = "Hotel One") => ({ propertyName:name, firstName:"Test", lastName:"Owner", phone:"+16144396660", countryCode:"US", region:"FL", propertyType:"hotel", roomCount:20, continueOnboarding:true });
const details = { legalBusinessName:"Hotel Company LLC", starRating:4, contactRole:"owner", websiteUrl:"https://hotel.example.com", addressLine1:"123 Main Street", city:"Navarre", postalCode:"32566", description:"A welcoming hotel with spacious rooms, thoughtful amenities, local hospitality and convenient access to beaches, dining, cultural attractions and the surrounding community.", amenities:["WiFi","Parking"], primaryImageUrl:"https://images.example.com/hotel.jpg", supportContactEmail:"support@example.com", representativeAuthorityConfirmed:true, contentRightsConfirmed:true, informationAccurate:true, commercialTermsAcknowledged:true };
async function user(id, fn, role = "authenticated") {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
  await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function rpc(name, values, casts) {
  const params = values.map((_, i) => `$${i+1}::${casts[i]}`).join(",");
  return (await db.query(`select public.${name}(${params}) as result`, values)).rows[0].result;
}
const create = (n, data = registration()) => rpc("create_partner_onboarding_draft", [key(n),JSON.stringify(data)], ["uuid","jsonb"]);
const save = (id, revision, data) => rpc("save_partner_onboarding_draft", [id,revision,JSON.stringify(data)], ["uuid","integer","jsonb"]);
const submit = (id, revision) => rpc("submit_partner_onboarding_draft", [id,revision], ["uuid","integer"]);
async function denied(fn, code, label) { await assert.rejects(fn, (error) => error.code === code, label); checks.push(label); }
async function scalar(sql) { return Object.values((await db.query(sql)).rows[0])[0]; }
try {
  await db.exec(read("tests/postgres/partner-self-service-drafts-fixture.sql"));
  await db.exec(schema.slice(start, end));
  await db.exec(migration);
  await db.exec(conflictFix);
  await denied(() => user(a, () => create(1)), "55000", "disabled database control refuses mutations");
  await db.exec("update public.partner_onboarding_controls set enabled = true");
  await denied(() => user(null, () => create(1), "anon"), "42501", "anonymous RPC denied");
  await denied(() => user(null, () => db.exec("select * from public.partner_onboarding_drafts"), "anon"), "42501", "anonymous draft read denied");
  await denied(() => user(unverified, () => create(1)), "42501", "unverified account denied");
  const first = await user(a, () => create(1));
  assert.equal(first.revision, 1); assert.equal("owner_id" in first, false);
  assert.deepEqual(await user(a, () => create(1, registration("Changed name"))), first);
  checks.push("idempotent key returns original draft");
  const second = await user(a, () => create(2, registration("Hotel Two")));
  assert.notEqual(first.id, second.id); checks.push("multiple properties per verified owner");
  assert.equal(await user(b, () => scalar("select count(*)::integer from public.partner_onboarding_drafts")), 0);
  await denied(() => user(b, () => save(first.id, 1, {})), "42501", "other owner cannot save");
  await denied(() => user(b, () => submit(first.id, 1)), "42501", "other owner cannot submit");
  assert.equal(await user(admin, () => scalar("select count(*)::integer from public.partner_onboarding_drafts")), 2);
  checks.push("owner and admin RLS reads");
  await denied(() => user(a, () => db.exec("update public.partner_onboarding_drafts set revision = revision + 1")), "42501", "direct client draft DML denied");
  await denied(() => user(a, () => db.exec("update public.partner_onboarding_controls set enabled = false")), "42501", "client control changes denied");
  await denied(() => user(a, () => save(first.id, 1, {owner_id:b})), "22023", "unexpected fields rejected");
  await denied(() => user(a, () => save(first.id, 1, {starRating:3})), "22023", "eligibility remains four or five stars");
  await denied(() => user(a, () => save(first.id, 1, {contactRole:""})), "22023", "present empty contact role rejected");
  const partial = await user(a, () => save(first.id, 1, {websiteUrl:"htt",supportContactEmail:"x",amenities:[""]}));
  assert.equal(partial.revision, 2); checks.push("incomplete bounded fields survive autosave");
  await denied(() => user(a, () => save(first.id, 1, {})), "PT409", "stale save is a terminal HTTP conflict, not a retryable serialization failure");
  await denied(() => user(a, () => submit(first.id, 1)), "PT409", "stale submission is a terminal HTTP conflict");
  await denied(() => user(a, () => submit(first.id, 2)), "22023", "incomplete submission rejected");
  const unsafe = await user(a, () => save(first.id, 2, {...details, websiteUrl:"https://user:pass@example.com"}));
  await denied(() => user(a, () => submit(first.id, unsafe.revision)), "22023", "credential-bearing URL rejected on submission");
  const ready = await user(a, () => save(first.id, unsafe.revision, {...details,websiteUrl:` ${details.websiteUrl} `,primaryImageUrl:` ${details.primaryImageUrl} `,supportContactEmail:` ${details.supportContactEmail} `}));
  const submitted = await user(a, () => submit(first.id, ready.revision));
  assert.equal(submitted.status, "submitted"); assert.ok(submitted.application_id);
  assert.equal((await db.query("select status from public.partner_applications where id=$1",[submitted.application_id])).rows[0].status,"pending");
  assert.deepEqual(await user(a, () => submit(first.id, 1)), submitted);
  await denied(() => user(a, () => save(first.id, submitted.revision, details)), "55000", "submitted draft immutable");
  const application = (await db.query("select * from public.partner_applications where id=$1", [submitted.application_id])).rows[0];
  assert.equal(application.email, "owner-a@example.com"); assert.equal(application.hotel_authorized,true);
  assert.equal(application.country,"US"); assert.equal(application.photo_source_url, details.primaryImageUrl);
  assert.equal(application.website_url,details.websiteUrl); assert.equal(application.support_contact_email,details.supportContactEmail);
  checks.push("pasted URL and email surrounding spaces normalized");
  assert.equal(application.commercial_terms_version_acknowledged,"hotel_partner_fee_disclosure_13_3_2026-08-22_v1");
  assert.ok(application.commercial_terms_acknowledged_at); checks.push("canonical pending queue and disclosure evidence linked atomically");
  const sameProperty = await user(a, () => create(3));
  const sameReady = await user(a, () => save(sameProperty.id, 1, details));
  await denied(() => user(a, () => submit(sameProperty.id,sameReady.revision)), "23505", "another draft cannot claim linked application");
  await db.exec(`insert into public.partner_applications select (jsonb_populate_record(null::public.partner_applications,
    to_jsonb(a) || jsonb_build_object('id',gen_random_uuid(),'property_name','Conflicting Hotel','legal_business_name','Other Company LLC'))).* from public.partner_applications a limit 1`);
  const conflict = await user(a, () => create(4, registration("Conflicting Hotel")));
  const conflictReady = await user(a, () => save(conflict.id,1,details));
  await denied(() => user(a, () => submit(conflict.id,conflictReady.revision)), "23505", "different prior application is not silently linked");
  assert.equal(await scalar("select count(*)::integer from public.partner_applications"),2);
  await db.query(`insert into public.partner_applications select (jsonb_populate_record(null::public.partner_applications,
    to_jsonb(a) || jsonb_build_object('id',gen_random_uuid(),'property_name','Matching Hotel'))).* from public.partner_applications a where id=$1`,[submitted.application_id]);
  const matching = await user(a, () => create(5, registration("Matching Hotel")));
  const matchingReady = await user(a, () => save(matching.id,1,details));
  const matchingSubmitted = await user(a, () => submit(matching.id,matchingReady.revision));
  assert.equal(matchingSubmitted.status,"submitted");
  assert.equal(await scalar("select count(*)::integer from public.partner_applications"),3);
  checks.push("exact matching prior pending application links without duplicate");
  await db.exec("update auth.users set email_confirmed_at = null where id='10000000-0000-4000-8000-000000000001'");
  await denied(() => user(a, () => save(second.id,1,{})), "42501", "email verification rechecked before save");
  await denied(() => user(a, () => submit(first.id,1)), "42501", "email verification rechecked before submit replay");
  await db.exec("update auth.users set email_confirmed_at = now() where id='10000000-0000-4000-8000-000000000001'");
  for (let n=6;n<=10;n++) await user(a, () => create(n,registration(`Hotel ${n}`)));
  await denied(() => user(a, () => create(11)), "54000", "owner draft capacity enforced");
  assert.equal(await scalar("select count(*)::integer from public.profiles where role='customer'"),3);
  for (const table of ["properties","partners","hotel_commercial_agreement_execution_evidence"]) assert.equal(await scalar(`select count(*)::integer from public.${table}`),0);
  checks.push("no role promotion, property creation or executed agreement fabricated");
  await db.exec(rollback);
  await denied(() => user(a, () => save(second.id,1,{})), "55000", "rollback stops mutations");
  assert.equal(await user(a, () => scalar("select count(*)::integer from public.partner_onboarding_drafts")),10);
  assert.equal(await scalar("select count(*)::integer from public.partner_applications"),3);
  checks.push("rollback preserves drafts and submitted applications");
  console.log(JSON.stringify({result:"PASS",engine:"in-memory PGlite PostgreSQL",checks},null,2));
} catch (error) {
  console.error(JSON.stringify({result:"FAIL",code:error.code,message:error.message,position:error.position,detail:error.detail,completedChecks:checks},null,2));
  process.exitCode = 1;
} finally { await db.close(); }
