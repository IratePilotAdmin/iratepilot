import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APPROVED_PREVIEW_PENDING,
  assertPreviewDryRun,
  assertPreviewMigrationTarget,
  assertPreviewRemoteMigrationState,
  listMigrationVersions,
  PRODUCTION_PROJECT_REF,
  reconcilePreviewMigrations,
  REQUIRED_PREVIEW_BASELINE,
} from "../scripts/reconcile-preview-migrations.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/202608140053_direct_checkout_payment_mode.sql", import.meta.url),
  "utf8",
);

const previewRef = "tztrvyhqyhkjhjwhrbaa";
const previewUrl = `postgresql://postgres.${previewRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
const migrationVersions = ["001", ...REQUIRED_PREVIEW_BASELINE, ...APPROVED_PREVIEW_PENDING];

function migrationList(localVersions: string[], remoteVersions: string[]) {
  const versions = [...new Set([...localVersions, ...remoteVersions])].sort();
  return [
    "  Local          | Remote         | Time (UTC)",
    " ----------------|----------------|---------------------",
    ...versions.map((version) => (
      `  ${localVersions.includes(version) ? version : ""} | ${remoteVersions.includes(version) ? version : ""} |`
    )),
  ].join("\n");
}

describe("direct-checkout payment mode and Preview migration reconciliation", () => {
  it("persists test mode in the same transaction that creates the paid booking", () => {
    expect(migration).toContain("create or replace function public.complete_paid_test_booking");
    expect(migration).toContain("status, stripe_payment_intent_id, stripe_payment_mode");
    expect(migration).toContain("'confirmed', p_payment_intent_id, 'test'");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("requires migrations 050 through 053 before reconciling Preview", () => {
    const versions = listMigrationVersions();
    expect(versions).toEqual(expect.arrayContaining(REQUIRED_PREVIEW_BASELINE));
    expect(versions.at(-1)).toBe("202608150054");
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

  it("accepts only an exact remote ledger with migration 054 pending or already applied", () => {
    const appliedThrough053 = migrationVersions.slice(0, -1);
    expect(assertPreviewRemoteMigrationState(
      migrationList(migrationVersions, appliedThrough053),
      migrationVersions,
    ).pendingVersions).toEqual(APPROVED_PREVIEW_PENDING);
    expect(assertPreviewRemoteMigrationState(
      migrationList(migrationVersions, migrationVersions),
      migrationVersions,
    ).pendingVersions).toEqual([]);
  });

  it("rejects missing history, unexpected remote versions, and unexpected pending migrations", () => {
    expect(() => assertPreviewRemoteMigrationState(
      migrationList(migrationVersions, REQUIRED_PREVIEW_BASELINE),
      migrationVersions,
    )).toThrow("unapproved pending set");
    expect(() => assertPreviewRemoteMigrationState(
      migrationList(migrationVersions, [...migrationVersions, "202608140099"]),
      migrationVersions,
    )).toThrow("unexpected version");
    expect(() => assertPreviewRemoteMigrationState(
      migrationList(migrationVersions, migrationVersions.filter((version) => version !== "202608140052")),
      migrationVersions,
    )).toThrow("unapproved pending set");
  });

  it("requires the dry run to name exactly the approved pending migration", () => {
    expect(assertPreviewDryRun(
      "Would push migration 202608150054_partner_team_hotel_management.sql",
      APPROVED_PREVIEW_PENDING,
      migrationVersions,
    )).toEqual(APPROVED_PREVIEW_PENDING);
    expect(() => assertPreviewDryRun(
      "Would push 202608140053_direct_checkout_payment_mode.sql and 202608150054_partner_team_hotel_management.sql",
      APPROVED_PREVIEW_PENDING,
      migrationVersions,
    )).toThrow("does not match");
  });

  it("validates the remote ledger before push and never uses include-all", () => {
    const repoMigrationVersions = listMigrationVersions();
    const calls: Array<{ args: string[]; capture?: boolean }> = [];
    const outputs = [
      migrationList(repoMigrationVersions, repoMigrationVersions.slice(0, -1)),
      "Would push migration 202608150054_partner_team_hotel_management.sql",
      "",
      migrationList(repoMigrationVersions, repoMigrationVersions),
    ];
    const runner = (_command: string, args: string[], _env: Record<string, string | undefined>, options?: { capture?: boolean }) => {
      calls.push({ args, capture: options?.capture });
      return outputs.shift() ?? "";
    };

    expect(reconcilePreviewMigrations({
      PREVIEW_SUPABASE_DB_URL: previewUrl,
      PREVIEW_SUPABASE_PROJECT_REF: previewRef,
    }, [], runner)).toMatchObject({ applied: true, pendingAfter: [] });
    expect(calls.map(({ args }) => args.slice(0, 2))).toEqual([
      ["migration", "list"],
      ["db", "push"],
      ["db", "push"],
      ["migration", "list"],
    ]);
    expect(calls.flatMap(({ args }) => args)).not.toContain("--include-all");
    expect(calls[0].capture).toBe(true);
  });

  it("performs no push when the remote ledger is already current or invalid", () => {
    const repoMigrationVersions = listMigrationVersions();
    const currentCalls: string[][] = [];
    const currentRunner = (_command: string, args: string[]) => {
      currentCalls.push(args);
      return migrationList(repoMigrationVersions, repoMigrationVersions);
    };
    expect(reconcilePreviewMigrations({
      PREVIEW_SUPABASE_DB_URL: previewUrl,
      PREVIEW_SUPABASE_PROJECT_REF: previewRef,
    }, [], currentRunner)).toMatchObject({ applied: false, pendingBefore: [] });
    expect(currentCalls).toHaveLength(1);

    const invalidCalls: string[][] = [];
    const invalidRunner = (_command: string, args: string[]) => {
      invalidCalls.push(args);
      return migrationList(repoMigrationVersions, REQUIRED_PREVIEW_BASELINE);
    };
    expect(() => reconcilePreviewMigrations({
      PREVIEW_SUPABASE_DB_URL: previewUrl,
      PREVIEW_SUPABASE_PROJECT_REF: previewRef,
    }, [], invalidRunner)).toThrow("unapproved pending set");
    expect(invalidCalls).toHaveLength(1);
  });
});
