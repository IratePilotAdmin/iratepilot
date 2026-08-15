import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertPreviewMigrationTarget,
  listMigrationVersions,
  PRODUCTION_PROJECT_REF,
  REQUIRED_PREVIEW_BASELINE,
} from "../scripts/reconcile-preview-migrations.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/202608140053_direct_checkout_payment_mode.sql", import.meta.url),
  "utf8",
);

const previewRef = "tztrvyhqyhkjhjwhrbaa";
const previewUrl = `postgresql://postgres.${previewRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

describe("direct-checkout payment mode and Preview migration reconciliation", () => {
  it("persists test mode in the same transaction that creates the paid booking", () => {
    expect(migration).toContain("create or replace function public.complete_paid_test_booking");
    expect(migration).toContain("status, stripe_payment_intent_id, stripe_payment_mode");
    expect(migration).toContain("'confirmed', p_payment_intent_id, 'test'");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("requires migrations 050 through 052 before reconciling Preview", () => {
    const versions = listMigrationVersions();
    expect(versions).toEqual(expect.arrayContaining(REQUIRED_PREVIEW_BASELINE));
    expect(versions.at(-1)).toBe("202608140053");
    expect(assertPreviewMigrationTarget({
      PREVIEW_SUPABASE_DB_URL: previewUrl,
      PREVIEW_SUPABASE_PROJECT_REF: previewRef,
    }, versions)).toMatchObject({ projectRef: previewRef, migrationVersions: versions });
  });

  it("fails closed for production and mismatched database targets", () => {
    const productionUrl = `postgresql://postgres.${PRODUCTION_PROJECT_REF}:password@pooler.supabase.com:6543/postgres`;
    expect(() => assertPreviewMigrationTarget({
      PREVIEW_SUPABASE_DB_URL: productionUrl,
      PREVIEW_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
    })).toThrow("Refusing to reconcile the production Supabase project.");
    expect(() => assertPreviewMigrationTarget({
      PREVIEW_SUPABASE_DB_URL: previewUrl,
      PREVIEW_SUPABASE_PROJECT_REF: "differentpreviewref01",
    })).toThrow("does not match");
  });
});
