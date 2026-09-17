import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../supabase/hotel-migrations/202609160143_partner_application_admin_alert.sql",
  import.meta.url,
), "utf8");
const rollback = readFileSync(new URL(
  "../supabase/hotel-rollbacks/202609160143_partner_application_admin_alert.rollback.sql",
  import.meta.url,
), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

describe("partner application admin alert", () => {
  it("queues one CEO alert from every new pending application", () => {
    expect(migration).toContain("after insert on public.partner_applications");
    expect(migration).toContain("'ceo@iratepilot.com'");
    expect(migration).toContain("'partner_application_admin_alert'");
    expect(migration).toContain("'partner-application-admin-alert:' || new.id::text");
    expect(migration).toContain("on conflict (logical_dedupe_key)");
  });

  it("keeps the application authoritative if notification queuing fails", () => {
    expect(migration).toContain("exception when others then");
    expect(migration).toContain("return new;");
    expect(migration).toContain("The protected Admin -> Partners queue remains authoritative.");
  });

  it("keeps sensitive applicant fields out of the email payload", () => {
    const payload = migration.slice(
      migration.indexOf("jsonb_build_object("),
      migration.indexOf("'pending',", migration.indexOf("jsonb_build_object(")),
    );
    expect(payload).toContain("new.property_name");
    expect(payload).toContain("new.star_rating");
    expect(payload).toContain("new.property_type");
    expect(payload).not.toMatch(/new\.(email|phone|address_line1|description|additional_notes)/);
  });

  it("does not grant applicants direct execution access", () => {
    expect(migration).toContain("revoke all on function public.queue_partner_application_admin_alert()\n  from public, anon, authenticated;");
    expect(migration).not.toMatch(/grant execute on function public\.queue_partner_application_admin_alert/);
  });

  it("keeps bootstrap and rollback paths aligned", () => {
    expect(schema).toContain("create trigger queue_partner_application_admin_alert");
    expect(schema).toContain("'partner_application_admin_alert'");
    expect(rollback).toContain("drop trigger if exists queue_partner_application_admin_alert");
    expect(rollback).toContain("drop function if exists public.queue_partner_application_admin_alert()");
  });
});
