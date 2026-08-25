import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APPLY_CONFIRMATION_FLAG,
  applyFlightPreviewMigrations,
  assertExactFlightDryRun,
  assertExactPreviewTarget,
  assertFlightSchemaDump,
  assertPinnedFlightMigrations,
  assertPreviewLedger,
  buildSupabaseChildEnv,
  parseInvocationMode,
  PINNED_FLIGHT_MIGRATIONS,
  PREVIEW_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
  REQUIRED_BASELINE_TIP,
// @ts-expect-error -- The production gate is an executable .mjs module without a declaration file.
} from "../scripts/apply-flight-preview-migrations.mjs";

const previewPassword = "preview-password-never-log";
const previewUrl =
  `postgresql://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
  + "@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const previewEnv = {
  PREVIEW_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
  PREVIEW_SUPABASE_DB_URL: previewUrl,
};
const previewTarget = assertExactPreviewTarget(previewEnv);
const cliPreviewUrl = previewTarget.cliDatabaseUrl;
const pinnedPlan = assertPinnedFlightMigrations();
const repositoryVersions: string[] = pinnedPlan.migrations.map(
  ({ version }: { version: string }) => version,
);

function migrationList(remoteVersions: string[]) {
  const remote = new Set(remoteVersions);
  return [
    "  Local          | Remote         | Time (UTC)",
    " ----------------|----------------|---------------------",
    ...repositoryVersions.map((version) => (
      `  ${version} | ${remote.has(version) ? version : ""} |`
    )),
  ].join("\n");
}

function physicalSchemaDump() {
  return `
CREATE TABLE public.flight_runtime_controls (
  control_key text NOT NULL,
  execution_kill_switch_engaged boolean DEFAULT true NOT NULL,
  provider_sandbox_traffic_enabled boolean DEFAULT false NOT NULL,
  shopping_enabled boolean DEFAULT false NOT NULL,
  production_release_enabled boolean DEFAULT false NOT NULL,
  bound_project_ref text,
  activation_evidence_sha256 text
);
CREATE TABLE public.flight_provider_request_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id text NOT NULL,
  commerce_id text NOT NULL,
  operation text NOT NULL,
  execution_mode text NOT NULL,
  request_sha256 text NOT NULL,
  dispatch_not_after timestamp with time zone NOT NULL,
  state text DEFAULT 'prepared'::text NOT NULL,
  revision integer DEFAULT 0 NOT NULL,
  retry_authorized boolean DEFAULT false NOT NULL,
  terminal_receipt_sha256 text
);
CREATE FUNCTION public.flight_runtime_capability_enabled(
  p_execution_mode text,
  p_capability text,
  p_provider_code text DEFAULT NULL::text,
  p_processor_code text DEFAULT NULL::text,
  p_execution_scope_sha256 text DEFAULT NULL::text
) RETURNS boolean
  LANGUAGE plpgsql AS $$ BEGIN RETURN false; END $$;
CREATE FUNCTION public.prepare_flight_provider_request_attempt(
  p_tenant_id text, p_commerce_id text, p_operation text, p_provider_code text,
  p_execution_mode text, p_execution_scope_sha256 text, p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text, p_adapter_source_sha256 text, p_provider_account_sha256 text,
  p_point_of_sale_sha256 text, p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text, p_request_plan_sha256 text,
  p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamp with time zone
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE FUNCTION public.claim_flight_provider_request_attempt_for_dispatch(
  p_attempt_id uuid, p_expected_revision integer
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.complete_flight_provider_request_attempt(
  p_attempt_id uuid, p_expected_revision integer, p_terminal_state text,
  p_terminal_http_status smallint, p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint, p_terminal_receipt_sha256 text
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.prepare_flight_provider_order_attempt(
  p_tenant_id text, p_commerce_id text, p_provider_code text,
  p_execution_scope_sha256 text, p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text, p_adapter_source_sha256 text,
  p_provider_account_sha256 text, p_point_of_sale_sha256 text,
  p_content_scope_sha256 text, p_provider_binding_receipt_sha256 text,
  p_request_plan_sha256 text, p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamp with time zone
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.claim_flight_provider_order_attempt_for_dispatch(
  p_attempt_id uuid, p_expected_revision integer
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.prepare_flight_provider_attempt_rpc(
  p_tenant_id text, p_commerce_id text, p_operation text, p_provider_code text,
  p_execution_mode text, p_execution_scope_sha256 text, p_activation_evidence_sha256 text,
  p_adapter_version_sha256 text, p_adapter_source_sha256 text, p_provider_account_sha256 text,
  p_point_of_sale_sha256 text, p_content_scope_sha256 text,
  p_provider_binding_receipt_sha256 text, p_request_plan_sha256 text,
  p_request_sha256 text, p_request_body_sha256 text,
  p_operation_authority_receipt_sha256 text, p_dispatch_not_after timestamp with time zone
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION public.claim_flight_provider_attempt_rpc(
  p_attempt_id uuid, p_expected_revision integer, p_operation text,
  p_adapter_source_sha256 text, p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
) RETURNS TABLE(attempt_id uuid, attempt_revision integer, attempt_state text)
  LANGUAGE plpgsql AS $$ BEGIN END $$;
ALTER TABLE ONLY public.flight_runtime_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_runtime_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_provider_request_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.flight_provider_request_attempts FORCE ROW LEVEL SECURITY;
`;
}

describe("flight Preview migration gate", () => {
  it("pins the exact 068 through 072 filenames and SHA-256 digests", () => {
    expect(PINNED_FLIGHT_MIGRATIONS).toEqual([
      {
        version: "202608230068",
        filename: "202608230068_flight_commerce_foundation.sql",
        sha256: "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
      },
      {
        version: "202608240069",
        filename: "202608240069_flight_provider_request_attempts.sql",
        sha256: "7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611",
      },
      {
        version: "202608250070",
        filename: "202608250070_flight_duffel_test_order_attempts.sql",
        sha256: "882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe",
      },
      {
        version: "202608250071",
        filename: "202608250071_flight_duffel_preview_rpc_bridge.sql",
        sha256: "bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d",
      },
      {
        version: "202608250072",
        filename: "202608250072_flight_duffel_preview_runtime_assertions.sql",
        sha256: "b8e073508ebe45be717f6d07fe463eae33eaf7d5d168076a903ffc552f08ca0b",
      },
    ]);
    expect(pinnedPlan.baselineVersions.at(-1)).toBe(REQUIRED_BASELINE_TIP);
    expect(pinnedPlan.flightVersions).toEqual([
      "202608230068",
      "202608240069",
      "202608250070",
      "202608250071",
      "202608250072",
    ]);
    expect(repositoryVersions.slice(-5)).toEqual(pinnedPlan.flightVersions);
  });

  it("accepts only the exact Preview ref on a matching official direct or pooler URL", () => {
    expect(previewTarget.databasePassword).toBe(previewPassword);
    expect(cliPreviewUrl).not.toContain(previewPassword);
    expect(new URL(cliPreviewUrl).password).toBe("");
    const directUrl =
      `postgresql://postgres:${previewPassword}@db.${PREVIEW_PROJECT_REF}.supabase.co:5432/postgres`;
    const directTarget = assertExactPreviewTarget({
      PREVIEW_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
      PREVIEW_SUPABASE_DB_URL: directUrl,
    });
    expect(directTarget.databasePassword).toBe(previewPassword);
    expect(directTarget.cliDatabaseUrl).not.toContain(previewPassword);
  });

  it("passes the password through a minimal child environment rather than process arguments", () => {
    const childEnv = buildSupabaseChildEnv({
      Path: "C:\\approved-bin",
      SystemRoot: "C:\\Windows",
      PREVIEW_SUPABASE_DB_URL: previewUrl,
      PREVIEW_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "must-not-inherit",
      UNRELATED_SECRET: "must-not-inherit",
    }, previewPassword);
    expect(childEnv).toEqual({
      Path: "C:\\approved-bin",
      SystemRoot: "C:\\Windows",
      PGPASSWORD: previewPassword,
      SUPABASE_DB_PASSWORD: previewPassword,
      NO_COLOR: "1",
    });
    expect(JSON.stringify(childEnv)).not.toContain(previewUrl);
    expect(Object.values(childEnv)).not.toContain("must-not-inherit");
  });

  it("fails closed for production refs, mismatches, and unapproved URL shapes", () => {
    const cases = [
      {
        ...previewEnv,
        PREVIEW_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
      },
      {
        ...previewEnv,
        PRODUCTION_SUPABASE_PROJECT_REF: PREVIEW_PROJECT_REF,
      },
      {
        ...previewEnv,
        PRODUCTION_SUPABASE_PROJECT_REF: "not-a-valid-ref",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `postgresql://postgres.${PRODUCTION_PROJECT_REF}:${previewPassword}`
          + "@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `postgresql://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
          + "@database.example.com:6543/postgres",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `postgresql://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
          + "@aws-0-us-east-1.pooler.supabase.com:6543/other",
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL: `${previewUrl}?sslmode=require`,
      },
      {
        ...previewEnv,
        PREVIEW_SUPABASE_DB_URL:
          `https://postgres.${PREVIEW_PROJECT_REF}:${previewPassword}`
          + "@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      },
    ];

    for (const env of cases) {
      let message = "";
      try {
        assertExactPreviewTarget(env);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toBe("");
      expect(message).not.toContain(previewPassword);
      expect(message).not.toContain(env.PREVIEW_SUPABASE_DB_URL);
    }
  });

  it("defaults to planning and recognizes only one exact apply confirmation flag", () => {
    expect(parseInvocationMode()).toBe("plan");
    expect(parseInvocationMode([])).toBe("plan");
    expect(parseInvocationMode(["--plan"])).toBe("plan");
    expect(parseInvocationMode([APPLY_CONFIRMATION_FLAG])).toBe("apply");
    for (const argv of [
      ["--apply"],
      ["--yes"],
      [APPLY_CONFIRMATION_FLAG, "--plan"],
      [`${APPLY_CONFIRMATION_FLAG}-typo`],
    ]) {
      expect(() => parseInvocationMode(argv)).toThrow("Invalid arguments");
    }
  });

  it("plans without running a command or revealing a database URL or password", () => {
    const logged: unknown[] = [];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [],
      runner: () => {
        throw new Error("runner must not be called in plan mode");
      },
      log: (value: unknown) => logged.push(value),
    });
    const rendered = JSON.stringify({ summary, logged });
    expect(summary.mode).toBe("plan");
    expect(summary.networkExecuted).toBe(false);
    expect(summary.migrationOrder.map(
      ({ version }: { version: string }) => version,
    )).toEqual([
      "202608230068",
      "202608240069",
      "202608250070",
      "202608250071",
      "202608250072",
    ]);
    expect(rendered).not.toContain(previewUrl);
    expect(rendered).not.toContain(previewPassword);
  });

  it("accepts only a complete remote baseline with all five flight migrations pending or none", () => {
    expect(assertPreviewLedger(
      migrationList(pinnedPlan.baselineVersions),
      pinnedPlan,
    ).pendingVersions).toEqual(pinnedPlan.flightVersions);
    expect(assertPreviewLedger(
      migrationList(repositoryVersions),
      pinnedPlan,
    ).pendingVersions).toEqual([]);
  });

  it("rejects partial flight state, missing history, unexpected history, and local drift", () => {
    const through068 = [...pinnedPlan.baselineVersions, pinnedPlan.flightVersions[0]];
    expect(() => assertPreviewLedger(migrationList(through068), pinnedPlan)).toThrow(
      "either all five flight migrations or none",
    );

    const missingBaseline = pinnedPlan.baselineVersions.filter(
      (version: string) => version !== REQUIRED_BASELINE_TIP,
    );
    expect(() => assertPreviewLedger(migrationList(missingBaseline), pinnedPlan)).toThrow(
      "complete repository through 067",
    );

    const unexpectedRemote = `${migrationList(repositoryVersions)}\n  | 202608240099 |`;
    expect(() => assertPreviewLedger(unexpectedRemote, pinnedPlan)).toThrow(
      "complete repository through 067",
    );

    const localDrift = migrationList(repositoryVersions).replace(
      "202608170067 | 202608170067",
      "               | 202608170067",
    );
    expect(() => assertPreviewLedger(localDrift, pinnedPlan)).toThrow(
      "local side does not exactly match",
    );

    const malformedLongRemote = `${migrationList(pinnedPlan.baselineVersions)}\n  | 20260824009999 |`;
    expect(() => assertPreviewLedger(malformedLongRemote, pinnedPlan)).toThrow(
      "malformed version cell",
    );
    const malformedTextRemote = `${migrationList(pinnedPlan.baselineVersions)}\n  | unexpected_version |`;
    expect(() => assertPreviewLedger(malformedTextRemote, pinnedPlan)).toThrow(
      "malformed version cell",
    );
  });

  it("requires a dry run to mention exactly 068 through 072 once each", () => {
    const exact = [
      "Would push migration 202608230068_flight_commerce_foundation.sql",
      "Would push migration 202608240069_flight_provider_request_attempts.sql",
      "Would push migration 202608250070_flight_duffel_test_order_attempts.sql",
      "Would push migration 202608250071_flight_duffel_preview_rpc_bridge.sql",
      "Would push migration 202608250072_flight_duffel_preview_runtime_assertions.sql",
    ].join("\n");
    expect(assertExactFlightDryRun(exact)).toEqual([
      "202608230068",
      "202608240069",
      "202608250070",
      "202608250071",
      "202608250072",
    ]);
    expect(() => assertExactFlightDryRun(exact.split("\n").reverse().join("\n"))).toThrow();
    expect(() => assertExactFlightDryRun(`${exact}\n202608240070_extra.sql`)).toThrow();
    expect(() => assertExactFlightDryRun(`${exact}\n${exact}`)).toThrow();
    expect(() => assertExactFlightDryRun(exact.split("\n")[0])).toThrow();
    expect(() => assertExactFlightDryRun(
      exact.replace("202608230068_flight_commerce_foundation.sql", "202608230068_wrong.sql"),
    )).toThrow();
  });

  it("verifies the physical column, function-signature, and forced-RLS boundary", () => {
    const dump = physicalSchemaDump();
    expect(assertFlightSchemaDump(dump)).toBe(true);
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "ALTER TABLE ONLY public.flight_provider_request_attempts FORCE ROW LEVEL SECURITY;",
        "",
      ),
    )).toThrow("does not prove forced RLS");
    expect(() => assertFlightSchemaDump(
      dump.replace("CREATE TABLE public.flight_runtime_controls", "CREATE TABLE public.other"),
    )).toThrow("missing a required flight table");
    expect(() => assertFlightSchemaDump(
      dump.replace(
        "p_terminal_response_bytes bigint",
        "p_terminal_response_bytes integer",
      ),
    )).toThrow("unexpected flight function signature");
    expect(() => assertFlightSchemaDump(
      dump.replace("shopping_enabled boolean DEFAULT false NOT NULL,", ""),
    )).toThrow("missing a required flight_runtime_controls column contract");
  });

  it("runs the fixed non-shell CLI sequence and applies only after the exact dry run", () => {
    const calls: string[][] = [];
    const outputs = [
      migrationList(pinnedPlan.baselineVersions),
      [
        "Would push migration 202608230068_flight_commerce_foundation.sql",
        "Would push migration 202608240069_flight_provider_request_attempts.sql",
        "Would push migration 202608250070_flight_duffel_test_order_attempts.sql",
        "Would push migration 202608250071_flight_duffel_preview_rpc_bridge.sql",
        "Would push migration 202608250072_flight_duffel_preview_runtime_assertions.sql",
      ].join("\n"),
      migrationList(pinnedPlan.baselineVersions),
      "applied",
      migrationList(repositoryVersions),
      physicalSchemaDump(),
    ];
    const logged: unknown[] = [];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [APPLY_CONFIRMATION_FLAG],
      runner: (args: string[]) => {
        calls.push(args);
        return outputs[calls.length - 1];
      },
      log: (value: unknown) => logged.push(value),
    });

    const dbUrlArgs = ["--db-url", cliPreviewUrl];
    expect(calls).toEqual([
      ["migration", "list", ...dbUrlArgs],
      ["db", "push", ...dbUrlArgs, "--dry-run"],
      ["migration", "list", ...dbUrlArgs],
      ["db", "push", ...dbUrlArgs, "--yes"],
      ["migration", "list", ...dbUrlArgs],
      ["db", "dump", ...dbUrlArgs, "--schema", "public"],
    ]);
    expect(summary).toMatchObject({
      mode: "apply",
      applied: true,
      pendingBefore: pinnedPlan.flightVersions,
      pendingAfter: [],
      physicalSchemaBoundaryVerified: true,
    });
    const rendered = JSON.stringify(logged);
    expect(rendered).not.toContain(previewUrl);
    expect(rendered).not.toContain(previewPassword);
    expect(JSON.stringify(calls)).not.toContain(previewPassword);
  });

  it("does not push when all five migrations are already installed, but still verifies the schema", () => {
    const calls: string[][] = [];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [APPLY_CONFIRMATION_FLAG],
      runner: (args: string[]) => {
        calls.push(args);
        return calls.length === 1 ? migrationList(repositoryVersions) : physicalSchemaDump();
      },
      log: () => undefined,
    });
    expect(calls.map((args) => args.slice(0, 2))).toEqual([
      ["migration", "list"],
      ["db", "dump"],
    ]);
    expect(summary).toMatchObject({ applied: false, pendingBefore: [], pendingAfter: [] });
  });

  it("rechecks the ledger after dry-run and skips a redundant concurrent push", () => {
    const calls: string[][] = [];
    const outputs = [
      migrationList(pinnedPlan.baselineVersions),
      [
        "Would push migration 202608230068_flight_commerce_foundation.sql",
        "Would push migration 202608240069_flight_provider_request_attempts.sql",
        "Would push migration 202608250070_flight_duffel_test_order_attempts.sql",
        "Would push migration 202608250071_flight_duffel_preview_rpc_bridge.sql",
        "Would push migration 202608250072_flight_duffel_preview_runtime_assertions.sql",
      ].join("\n"),
      migrationList(repositoryVersions),
      physicalSchemaDump(),
    ];
    const summary = applyFlightPreviewMigrations({
      env: previewEnv,
      argv: [APPLY_CONFIRMATION_FLAG],
      runner: (args: string[]) => {
        calls.push(args);
        return outputs[calls.length - 1];
      },
      log: () => undefined,
    });
    expect(calls.some((args) => args.includes("--yes"))).toBe(false);
    expect(summary).toMatchObject({
      applied: false,
      pendingBefore: pinnedPlan.flightVersions,
      pendingAfter: [],
      physicalSchemaBoundaryVerified: true,
    });
  });

  it("uses a fixed Supabase executable with shell execution disabled", () => {
    const source = readFileSync("scripts/apply-flight-preview-migrations.mjs", "utf8");
    expect(source).toContain('spawnSync("supabase", args');
    expect(source).toContain("cwd: REPOSITORY_ROOT_PATH");
    expect(source).toContain("shell: false");
    expect(source).not.toContain("SUPABASE_CLI_PATH");
    expect(source).not.toContain("execSync(");
    expect(source).not.toContain("execFileSync(");
    expect(source).not.toContain("execFile(");
  });
});
