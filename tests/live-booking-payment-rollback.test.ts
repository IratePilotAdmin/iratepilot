import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const rollback = readFileSync(
  new URL("../supabase/rollbacks/202608060028_live_booking_payment_modes.rollback.sql", import.meta.url),
  "utf8",
);

describe("live booking payment migration rollback", () => {
  it("is operator-only and requires the application rollback first", () => {
    expect(rollback).toContain("OPERATOR-ONLY ROLLBACK");
    expect(rollback).toContain("Roll Vercel production back to the commit before PR #145");
  });

  it("fails closed when live payment records exist", () => {
    expect(rollback).toContain("where stripe_payment_mode = 'live'");
    expect(rollback).toContain("Rollback blocked: live payment records exist");
  });

  it("restores service-role-only test payment and refund functions", () => {
    expect(rollback).toContain("create or replace function public.complete_approved_booking_test_payment");
    expect(rollback).toContain("create or replace function public.finalize_test_booking_refund");
    expect(rollback).toContain("from public, anon, authenticated");
    expect(rollback).toContain("to service_role");
  });

  it("removes only migration 028 database objects inside one transaction", () => {
    expect(rollback.trimStart().startsWith("-- OPERATOR-ONLY ROLLBACK")).toBe(true);
    expect(rollback).toContain("begin;");
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).toContain("drop function if exists public.complete_approved_booking_payment");
    expect(rollback).toContain("drop function if exists public.finalize_booking_refund");
    expect(rollback).toContain("drop column if exists stripe_payment_mode");
  });
});
