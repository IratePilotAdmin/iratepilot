import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fees } from "../config/fees";
import { calculatePartnerFinancials } from "../lib/finance";

const migration = readFileSync(
  "supabase/migrations/202608090033_raise_marketplace_commission.sql",
  "utf8",
);
const rollback = readFileSync(
  "supabase/rollbacks/202608090033_raise_marketplace_commission.rollback.sql",
  "utf8",
);

describe("14% marketplace commission", () => {
  it("uses the same rate in application accounting", () => {
    expect(fees.defaultCommissionRate).toBe(0.14);
    expect(calculatePartnerFinancials(250)).toEqual({
      gross: 250,
      commission: 35,
      partnerNet: 215,
    });
  });

  it("enforces the rate for every newly inserted financial record", () => {
    expect(migration).toContain("new.gross_room_revenue * 0.14");
    expect(migration).toContain("before insert on public.booking_financials");
    expect(migration).toContain("new.partner_net := new.gross_room_revenue - new.partner_commission");
  });

  it("provides a rollback without rewriting historical financial records", () => {
    expect(rollback).toContain("drop trigger if exists apply_marketplace_commission_before_insert");
    expect(rollback).toContain("drop function if exists public.apply_marketplace_commission()");
    expect(migration).not.toMatch(/update\s+public\.booking_financials/i);
  });
});
