import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIGRATION_VERSION = "202608260104";
export const FORWARD_SHA256 =
  "50dcca75f06111de027833ca138519dbe7f71e91bfd5ca9839fa9425699dfa1b";
export const ROLLBACK_SHA256 =
  "10d9095be8250a1f50247534aa98e8fc35f51a06211458b5f19f1df43d9d2328";

export const TARGETS = Object.freeze({
  isolated_uat: Object.freeze({
    kind: "isolated_uat",
    projectRef: "exipwtvyjaihsvdhsbbt",
    projectName: "iratepilot-flight-payment-uat-20260827",
  }),
  preview_runtime: Object.freeze({
    kind: "preview_runtime",
    projectRef: "eiqmdldjnedqgbtoozqa",
    projectName: "iRatePilot Flight Preview runtime",
  }),
});

export const ARTIFACTS = Object.freeze({
  preflight: Object.freeze({
    path: "scripts/flight-consumer-stripe-test-journal-104-managed-preflight.sql",
    sha256: "3f29163d5b5cdf73a484a710e0bc19bcb60fda806eb4ec173984c8869bd83ef0",
  }),
  migration: Object.freeze({
    path:
      "supabase/production-migrations/202608260104_flight_consumer_stripe_test_execution_journal.sql",
    sha256: FORWARD_SHA256,
  }),
  verification: Object.freeze({
    path:
      "scripts/flight-consumer-stripe-test-journal-104-managed-verification.sql",
    sha256: "4e8a19e5960208aedbb639fcfacdf6c6a22246b7dc12ce383cf410e36298b65b",
  }),
  rollback: Object.freeze({
    path:
      "supabase/production-rollbacks/202608260104_flight_consumer_stripe_test_execution_journal.rollback.sql",
    sha256: ROLLBACK_SHA256,
  }),
});

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ALLOWED_OPERATIONS = new Set(["preflight", "verify", "apply-verify"]);
const ALLOWED_FLAGS = new Set([
  "--operation",
  "--target",
  "--psql",
  "--apply-confirmation",
  "--verify-confirmation",
]);
const CHILD_ENV_ALLOWLIST = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
  "XDG_CONFIG_HOME",
]);

function usage() {
  return `Usage:
  node scripts/manage-flight-consumer-stripe-test-journal-104.mjs \\
    --operation=preflight|verify|apply-verify \\
    --target=isolated_uat|preview_runtime \\
    --psql=<absolute-path-to-psql>

Required environment (never command-line arguments):
  FLIGHT_MANAGED_104_DB_HOST
  FLIGHT_MANAGED_104_DB_PORT=5432
  FLIGHT_MANAGED_104_DB_NAME=postgres
  FLIGHT_MANAGED_104_DB_USER
  FLIGHT_MANAGED_104_DB_PASSWORD

The connection must identify the selected Supabase project either as:
  direct:  host db.<project-ref>.supabase.co, user postgres
  pooler:  host *.pooler.supabase.com, user postgres.<project-ref>

Apply confirmation (target-specific):
  --apply-confirmation=APPLY_104_OBJECTS_ONLY_<project-ref>_NO_LEDGER

Verify-only confirmation (synthetic rows are savepoint-rolled-back):
  --verify-confirmation=VERIFY_104_SAVEPOINT_ONLY_<project-ref>_ZERO_RESIDUE

There is no default operation or target. The runner never accepts a database
URL, arbitrary SQL path, migration-ledger write, local/disposable database, or
rollback request.`;
}

function parseFlag(token) {
  const separator = token.indexOf("=");
  if (separator <= 2) {
    throw new Error(`Every flag must use --name=value syntax.\n\n${usage()}`);
  }
  return [token.slice(0, separator), token.slice(separator + 1)];
}

export function parseArgs(argv) {
  const parsed = {};
  for (const token of argv) {
    const [name, value] = parseFlag(token);
    if (!ALLOWED_FLAGS.has(name)) {
      throw new Error(`Unknown flag ${name}.\n\n${usage()}`);
    }
    if (Object.hasOwn(parsed, name)) {
      throw new Error(`Duplicate flag ${name}.`);
    }
    if (value.length === 0) {
      throw new Error(`Flag ${name} cannot be empty.`);
    }
    parsed[name] = value;
  }

  const operation = parsed["--operation"];
  const targetKind = parsed["--target"];
  const psqlInput = parsed["--psql"];
  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new Error(`An explicit approved operation is required.\n\n${usage()}`);
  }
  if (!Object.hasOwn(TARGETS, targetKind)) {
    throw new Error(`An explicit approved managed target is required.\n\n${usage()}`);
  }
  if (!psqlInput || !path.isAbsolute(psqlInput) || !existsSync(psqlInput)) {
    throw new Error("psql must be an existing absolute local filesystem path.");
  }
  const psql = realpathSync(psqlInput);
  if (!statSync(psql).isFile() || !/^psql(?:\.exe)?$/i.test(path.basename(psql))) {
    throw new Error("The explicit executable must be a local file named psql or psql.exe.");
  }

  const target = TARGETS[targetKind];
  const applyConfirmation =
    `APPLY_104_OBJECTS_ONLY_${target.projectRef}_NO_LEDGER`;
  const verifyConfirmation =
    `VERIFY_104_SAVEPOINT_ONLY_${target.projectRef}_ZERO_RESIDUE`;
  if (operation === "apply-verify") {
    if (parsed["--apply-confirmation"] !== applyConfirmation) {
      throw new Error("The exact target-specific apply confirmation is required.");
    }
    if (parsed["--verify-confirmation"] !== undefined) {
      throw new Error("apply-verify does not accept a separate verify confirmation.");
    }
  } else if (operation === "verify") {
    if (parsed["--verify-confirmation"] !== verifyConfirmation) {
      throw new Error("The exact target-specific verify confirmation is required.");
    }
    if (parsed["--apply-confirmation"] !== undefined) {
      throw new Error("verify does not accept an apply confirmation.");
    }
  } else if (
    parsed["--apply-confirmation"] !== undefined
    || parsed["--verify-confirmation"] !== undefined
  ) {
    throw new Error("Read-only preflight accepts no mutation confirmation.");
  }

  return Object.freeze({ operation, target, psql });
}

function requireEnvironmentValue(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Required environment variable ${name} is absent.`);
  }
  if (/\r|\n|\0/.test(value)) {
    throw new Error(`Environment variable ${name} contains unsafe characters.`);
  }
  return value;
}

export function validateConnectionEnvironment(environment, target) {
  const host = requireEnvironmentValue(
    environment,
    "FLIGHT_MANAGED_104_DB_HOST",
  ).toLowerCase();
  const port = requireEnvironmentValue(
    environment,
    "FLIGHT_MANAGED_104_DB_PORT",
  );
  const database = requireEnvironmentValue(
    environment,
    "FLIGHT_MANAGED_104_DB_NAME",
  );
  const user = requireEnvironmentValue(
    environment,
    "FLIGHT_MANAGED_104_DB_USER",
  );
  const password = requireEnvironmentValue(
    environment,
    "FLIGHT_MANAGED_104_DB_PASSWORD",
  );

  if (port !== "5432" || database !== "postgres") {
    throw new Error("Managed migration 104 requires port 5432 and database postgres.");
  }
  const directHost = `db.${target.projectRef}.supabase.co`;
  const isDirect = host === directHost && user === "postgres";
  const isPooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host)
    && user === `postgres.${target.projectRef}`;
  if (!isDirect && !isPooler) {
    throw new Error(
      "Connection host/user do not cryptographically label the selected managed Supabase project.",
    );
  }
  if (
    /(?:localhost|127\.0\.0\.1|::1|\.local|\.internal)$/i.test(host)
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
  ) {
    throw new Error("Local, private, and raw-IP database targets are forbidden.");
  }

  return Object.freeze({ host, port, database, user, password });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readAndAssertArtifacts({
  repositoryRoot = REPOSITORY_ROOT,
  readBytes = (artifactPath) => readFileSync(
    path.join(repositoryRoot, artifactPath),
  ),
} = {}) {
  const bytesByName = {};
  for (const [name, artifact] of Object.entries(ARTIFACTS)) {
    const bytes = readBytes(artifact.path);
    const actualHash = sha256(bytes);
    if (actualHash !== artifact.sha256) {
      throw new Error(`Pinned ${name} artifact failed its SHA-256 check.`);
    }
    bytesByName[name] = bytes;
  }

  const preflight = bytesByName.preflight.toString("utf8");
  const migration = bytesByName.migration.toString("utf8");
  const verification = bytesByName.verification.toString("utf8");
  const rollback = bytesByName.rollback.toString("utf8");
  if (!/^begin read only;/im.test(preflight)) {
    throw new Error("Pinned managed preflight is not explicitly read-only.");
  }
  if (!/^begin;[\s\S]*^commit;\s*$/im.test(migration)) {
    throw new Error("Pinned migration 104 is not one exact transaction.");
  }
  if (
    !/^savepoint flight_stripe_test_104_synthetic_rows;$/im.test(verification)
    || !/^rollback to savepoint flight_stripe_test_104_synthetic_rows;$/im.test(
      verification,
    )
    || /create\s+(?:schema|table|function).*harness/i.test(verification)
  ) {
    throw new Error("Managed verification is not savepoint-contained and harness-free.");
  }
  for (const sql of [preflight, migration, verification, rollback]) {
    if (
      /\b(?:dblink|http_get|http_post|pg_notify|lo_import|lo_export)\b|\bnet\./i
        .test(sql)
    ) {
      throw new Error("A pinned artifact contains forbidden external transport.");
    }
  }
  for (const sql of [preflight, migration, verification]) {
    if (
      /insert\s+into\s+supabase_migrations\.schema_migrations/i.test(sql)
      || /update\s+supabase_migrations\.schema_migrations/i.test(sql)
      || /delete\s+from\s+supabase_migrations\.schema_migrations/i.test(sql)
    ) {
      throw new Error("A managed gate artifact attempts to mutate the migration ledger.");
    }
  }

  return Object.freeze(bytesByName);
}

function buildTargetSettingsPrefix(target) {
  return [
    `select set_config('app.flight_managed_104_target_kind', '${target.kind}', false);`,
    `select set_config('app.flight_managed_104_project_ref', '${target.projectRef}', false);`,
    "",
  ].join("\n");
}

export function buildTargetBoundSql(sqlBytes, target) {
  const prefix = [
    "\\set ON_ERROR_STOP on",
    "\\set VERBOSITY terse",
    buildTargetSettingsPrefix(target),
  ].join("\n");
  return Buffer.concat([Buffer.from(prefix, "utf8"), sqlBytes]);
}

export function buildSqlEditorTargetBoundSql(sqlBytes, target) {
  const prefix = buildTargetSettingsPrefix(target);
  return Buffer.concat([Buffer.from(prefix, "utf8"), sqlBytes]);
}

function buildChildEnvironment(environment, connection) {
  const childEnvironment = {};
  for (const [name, value] of Object.entries(environment)) {
    if (CHILD_ENV_ALLOWLIST.has(name) && typeof value === "string") {
      childEnvironment[name] = value;
    }
  }
  Object.assign(childEnvironment, {
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGDATABASE: connection.database,
    PGUSER: connection.user,
    PGPASSWORD: connection.password,
    PGSSLMODE: "verify-full",
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "iratepilot-flight-managed-104",
  });
  return childEnvironment;
}

export function executePsql({
  psql,
  input,
  childEnvironment,
  spawn = spawnSync,
}) {
  const result = spawn(
    psql,
    ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--file", "-"],
    {
      env: childEnvironment,
      input,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const diagnostic = String(result.stderr || result.stdout || "")
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
      .slice(-4000);
    throw new Error(`Managed psql gate failed.\n${diagnostic}`);
  }
  return String(result.stdout ?? "");
}

export function runManagedGate({
  config,
  environment = process.env,
  artifacts = readAndAssertArtifacts(),
  spawn = spawnSync,
}) {
  const connection = validateConnectionEnvironment(environment, config.target);
  const childEnvironment = buildChildEnvironment(environment, connection);
  const run = (input) => executePsql({
    psql: config.psql,
    input,
    childEnvironment,
    spawn,
  });
  const receipts = [];

  if (config.operation === "preflight" || config.operation === "apply-verify") {
    receipts.push(run(buildTargetBoundSql(artifacts.preflight, config.target)));
  }
  if (config.operation === "apply-verify") {
    receipts.push(run(artifacts.migration));
  }
  if (config.operation === "verify" || config.operation === "apply-verify") {
    receipts.push(run(buildTargetBoundSql(artifacts.verification, config.target)));
  }

  return Object.freeze({
    operation: config.operation,
    targetKind: config.target.kind,
    projectRef: config.target.projectRef,
    migrationVersion: MIGRATION_VERSION,
    forwardSha256: FORWARD_SHA256,
    rollbackSha256: ROLLBACK_SHA256,
    migrationLedgerMutation: false,
    receipts,
  });
}

export function main(argv = process.argv.slice(2), environment = process.env) {
  const config = parseArgs(argv);
  const result = runManagedGate({ config, environment });
  for (const receipt of result.receipts) {
    if (receipt.trim().length > 0) {
      process.stdout.write(receipt.endsWith("\n") ? receipt : `${receipt}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify({
    gate: "flight_consumer_stripe_test_journal_104_managed_runner",
    result: "PASS",
    operation: result.operation,
    target_kind: result.targetKind,
    project_ref: result.projectRef,
    migration_version: result.migrationVersion,
    forward_sha256: result.forwardSha256,
    rollback_sha256: result.rollbackSha256,
    migration_ledger_mutation: false,
  })}\n`);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
