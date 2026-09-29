import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
if (!modulePath || !path.isAbsolute(modulePath)) throw new Error("Supply an absolute local PGlite module path");
const { PGlite } = await import(pathToFileURL(modulePath).href);
const root = path.resolve(import.meta.dirname, "..");
const migration = readFileSync(path.join(root, "supabase/hotel-migrations/202609170144_partner_application_review_evidence.sql"), "utf8");
const db = new PGlite();
const admin = "10000000-0000-4000-8000-000000000001";
const customer = "10000000-0000-4000-8000-000000000002";
const approvedApplication = "20000000-0000-4000-8000-000000000001";
const declinedApplication = "20000000-0000-4000-8000-000000000002";
const incompleteApplication = "20000000-0000-4000-8000-000000000003";

async function asUser(id, action) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
  try { return await action(); } finally { await db.exec("reset role"); }
}

async function review(applicationId, status, checks, note) {
  return db.query(
    "select (public.review_partner_application($1,$2,$3,$4,$5,$6,$7,$8)).status as status",
    [applicationId, status, ...checks, note],
  );
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create type public.user_role as enum ('customer','partner','admin');
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema public, auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles (id uuid primary key, role public.user_role not null);
    create table public.partner_applications (
      id uuid primary key,
      status text not null default 'pending',
      legal_business_name text,
      representative_authority_confirmed boolean not null default false,
      commercial_terms_acknowledged boolean not null default false,
      commercial_terms_version_acknowledged text,
      commercial_terms_acknowledged_at timestamptz
    );
    create function public.review_partner_application(p_application_id uuid, p_status text)
    returns public.partner_applications language plpgsql security definer set search_path = '' as $$
    declare result public.partner_applications;
    begin
      update public.partner_applications set status = p_status where id = p_application_id returning * into result;
      if result.id is null then raise exception 'Partner application not found' using errcode = 'P0002'; end if;
      return result;
    end;
    $$;
    revoke all on function public.review_partner_application(uuid,text) from public, anon, service_role;
    grant execute on function public.review_partner_application(uuid,text) to authenticated;
    insert into public.profiles values
      ('${admin}','admin'), ('${customer}','customer');
    insert into public.partner_applications values
      ('${approvedApplication}','pending','Hotel Company LLC',true,true,'hotel_partner_fee_disclosure_13_3_2026-08-22_v1',now()),
      ('${declinedApplication}','pending','Other Hotel LLC',true,true,'hotel_partner_fee_disclosure_13_3_2026-08-22_v1',now()),
      ('${incompleteApplication}','pending',null,false,false,null,null);
  `);
  await db.exec(migration);

  await assert.rejects(
    () => asUser(customer, () => review(approvedApplication, "approved", [true, true, true, true, true], "Verified from official business sources.")),
    (error) => error.code === "42501",
  );
  await assert.rejects(
    () => asUser(admin, () => review(incompleteApplication, "approved", [true, true, true, true, true], "Verified from official business sources.")),
    (error) => error.code === "P0001",
  );
  await assert.rejects(
    () => asUser(admin, () => review(approvedApplication, "approved", [true, true, true, true, false], "Verified from official business sources.")),
    (error) => error.code === "P0001",
  );

  const approved = await asUser(admin, () => review(
    approvedApplication,
    "approved",
    [true, true, true, true, true],
    "Verified legal business, authority, rights, fee disclosure, and private draft scope.",
  ));
  assert.equal(approved.rows[0].status, "approved");
  const declined = await asUser(admin, () => review(
    declinedApplication,
    "declined",
    [false, false, false, false, false],
    "Authority could not be verified.",
  ));
  assert.equal(declined.rows[0].status, "declined");
  const evidence = await db.query("select decision, inactive_draft_scope_confirmed from public.partner_application_review_evidence order by created_at");
  assert.deepEqual(evidence.rows, [
    { decision: "approved", inactive_draft_scope_confirmed: true },
    { decision: "declined", inactive_draft_scope_confirmed: false },
  ]);
  await assert.rejects(
    () => db.exec("update public.partner_application_review_evidence set evidence_summary = 'changed'"),
    (error) => error.code === "55000",
  );
  await assert.rejects(
    () => asUser(admin, () => db.query("select public.review_partner_application($1,$2)", [declinedApplication, "pending"])),
    (error) => error.code === "42501",
  );
  console.log("Partner application review evidence PGlite verification passed.");
} finally {
  await db.close();
}
