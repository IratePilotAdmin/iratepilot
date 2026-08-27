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

export const SOURCE_COMMIT =
  "54b49dc3d4249d4358233a2b102cf12416396eb2";
export const APPLY_RANGE = "202608260115-202608260119";
export const CANONICAL_REPOSITORY_TIP = "202608260140";

export const TARGETS = Object.freeze({
  isolated_uat: Object.freeze({
    kind: "isolated_uat",
    projectRef: "exipwtvyjaihsvdhsbbt",
    projectName: "iratepilot-flight-payment-uat-20260827",
  }),
});

export const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "202608260115",
    path: "supabase/production-migrations/202608260115_flight_consumer_live_public_shopping_admission.sql",
    sha256: "06f956ac88cba042d34ae7ac1c8a628dcdee2ea76936ada1cf7d7577c863cd63",
  }),
  Object.freeze({
    version: "202608260116",
    path: "supabase/production-migrations/202608260116_flight_consumer_live_public_offer_projection.sql",
    sha256: "64237bd6afc967349940805876a1e432c78d21801ac520f6990f2f14053423d0",
  }),
  Object.freeze({
    version: "202608260117",
    path: "supabase/production-migrations/202608260117_flight_consumer_live_public_offer_reference_retention.sql",
    sha256: "1881c1e02e43a8e17129090ff41deb44f1f80feb4277905d40bd349131f727df",
  }),
  Object.freeze({
    version: "202608260118",
    path: "supabase/production-migrations/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.sql",
    sha256: "7bc225346c6b55c8a0c8f7b150a44c20c746bed092ac3a6e4791d89dddeda84f",
    forwardOnly: true,
  }),
  Object.freeze({
    version: "202608260119",
    path: "supabase/production-migrations/202608260119_flight_consumer_live_public_shopping_dispatch.sql",
    sha256: "51329d4d4d95d5b8c0e7a90d239c760c0ce432e8766e3319ae3c02f31cf2269c",
  }),
]);

export const ROLLBACKS = Object.freeze([
  Object.freeze({
    version: "202608260115",
    path: "supabase/production-rollbacks/202608260115_flight_consumer_live_public_shopping_admission.rollback.sql",
    sha256: "f1687425757d5856638a2f97d61d06c31cc77980e35113cbc0fa1ab7c8efc911",
  }),
  Object.freeze({
    version: "202608260116",
    path: "supabase/production-rollbacks/202608260116_flight_consumer_live_public_offer_projection.rollback.sql",
    sha256: "03640a468e17bd8213006a2f726dab40c740a7b6bd5855773e0a808acc90c232",
  }),
  Object.freeze({
    version: "202608260117",
    path: "supabase/production-rollbacks/202608260117_flight_consumer_live_public_offer_reference_retention.rollback.sql",
    sha256: "7e763fbf14350a78d731793bc545c82186f0c6d9f45326062a6aec81bab6d77e",
  }),
  Object.freeze({
    version: "202608260118",
    path: "supabase/production-rollbacks/202608260118_flight_consumer_live_duffel_offer_source_conflict_repair.rollback.sql",
    sha256: "ca145d0d4e0559a3c983fbc0a7b702986d3caaf175292b23d0df5ebf7f8df102",
    forwardOnly: true,
  }),
  Object.freeze({
    version: "202608260119",
    path: "supabase/production-rollbacks/202608260119_flight_consumer_live_public_shopping_dispatch.rollback.sql",
    sha256: "66be858df46aa4495bfef405ec17013598daa57a70bde55d92ae8e480e03f14d",
  }),
]);

export const ARTIFACTS = Object.freeze({
  preflight: Object.freeze({
    path: "scripts/flight-consumer-public-shopping-115-119-managed-uat-preflight.sql",
    sha256: "fe5e9f432a9de751df7d364462960d696ffef65ba082c85541049ed14e17c631",
  }),
  verification: Object.freeze({
    path: "scripts/flight-consumer-public-shopping-115-119-managed-uat-verification.sql",
    sha256: "e0de70e0541008530b0cd43b6828f42d25fc091e1677529467bdbc004e4165f4",
  }),
});

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const OPERATIONS = new Set(["preflight", "verify", "apply-verify"]);
const FLAGS = new Set([
  "--operation",
  "--target",
  "--psql",
  "--apply-confirmation",
  "--forward-only-confirmation",
  "--verify-confirmation",
]);
const CHILD_ENV_ALLOWLIST = new Set([
  "APPDATA", "COMSPEC", "HOME", "LOCALAPPDATA", "PATH", "PATHEXT",
  "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMROOT", "TEMP", "TMP",
  "USERPROFILE", "WINDIR", "XDG_CONFIG_HOME",
]);

function usage() {
  return `Usage:
  node scripts/manage-flight-consumer-public-shopping-115-119-uat.mjs \\
    --operation=preflight|verify|apply-verify \\
    --target=isolated_uat \\
    --psql=<absolute-path-to-psql>

Required environment (never command-line arguments):
  FLIGHT_MANAGED_115_119_DB_HOST
  FLIGHT_MANAGED_115_119_DB_PORT=5432
  FLIGHT_MANAGED_115_119_DB_NAME=postgres
  FLIGHT_MANAGED_115_119_DB_USER
  FLIGHT_MANAGED_115_119_DB_PASSWORD

Apply confirmations (both required):
  --apply-confirmation=APPLY_115_119_OBJECTS_ONLY_exipwtvyjaihsvdhsbbt_NO_LEDGER
  --forward-only-confirmation=ACCEPT_118_FORWARD_ONLY_exipwtvyjaihsvdhsbbt_NO_ROLLBACK

Verify-only confirmation:
  --verify-confirmation=VERIFY_115_119_SAVEPOINT_ONLY_exipwtvyjaihsvdhsbbt_ZERO_RESIDUE

There is no default target/operation, Production/Preview target, database URL,
arbitrary SQL path, migration-ledger write, rollback, Gate 139/140 apply, or
provider/Stripe operation.`;
}

export function parseArgs(argv) {
  const parsed = {};
  for (const token of argv) {
    const separator = token.indexOf("=");
    if (separator <= 2) throw new Error(usage());
    const name = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (!FLAGS.has(name)) throw new Error(`Unknown flag ${name}.\n\n${usage()}`);
    if (Object.hasOwn(parsed, name)) throw new Error(`Duplicate flag ${name}.`);
    if (!value) throw new Error(`Flag ${name} cannot be empty.`);
    parsed[name] = value;
  }

  const operation = parsed["--operation"];
  const targetKind = parsed["--target"];
  const psqlInput = parsed["--psql"];
  if (!OPERATIONS.has(operation)) {
    throw new Error(`An explicit approved operation is required.\n\n${usage()}`);
  }
  if (!Object.hasOwn(TARGETS, targetKind)) {
    throw new Error(`The exact isolated UAT target is required.\n\n${usage()}`);
  }
  if (!psqlInput || !path.isAbsolute(psqlInput) || !existsSync(psqlInput)) {
    throw new Error("psql must be an existing absolute local filesystem path.");
  }
  const psql = realpathSync(psqlInput);
  if (!statSync(psql).isFile() || !/^psql(?:\.exe)?$/i.test(path.basename(psql))) {
    throw new Error("The explicit executable must be a local file named psql or psql.exe.");
  }

  const target = TARGETS[targetKind];
  const apply = `APPLY_115_119_OBJECTS_ONLY_${target.projectRef}_NO_LEDGER`;
  const forwardOnly = `ACCEPT_118_FORWARD_ONLY_${target.projectRef}_NO_ROLLBACK`;
  const verify = `VERIFY_115_119_SAVEPOINT_ONLY_${target.projectRef}_ZERO_RESIDUE`;
  if (operation === "apply-verify") {
    if (parsed["--apply-confirmation"] !== apply) {
      throw new Error("The exact object-only apply confirmation is required.");
    }
    if (parsed["--forward-only-confirmation"] !== forwardOnly) {
      throw new Error("The exact Gate 118 forward-only confirmation is required.");
    }
    if (parsed["--verify-confirmation"] !== undefined) {
      throw new Error("apply-verify does not accept verify-only confirmation.");
    }
  } else if (operation === "verify") {
    if (parsed["--verify-confirmation"] !== verify) {
      throw new Error("The exact savepoint-only verification confirmation is required.");
    }
    if (parsed["--apply-confirmation"] !== undefined
      || parsed["--forward-only-confirmation"] !== undefined) {
      throw new Error("verify accepts no apply confirmation.");
    }
  } else if (parsed["--apply-confirmation"] !== undefined
    || parsed["--forward-only-confirmation"] !== undefined
    || parsed["--verify-confirmation"] !== undefined) {
    throw new Error("Read-only preflight accepts no mutation confirmation.");
  }
  return Object.freeze({ operation, target, psql });
}

function requireEnvironment(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Required environment variable ${name} is absent.`);
  }
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`Environment variable ${name} contains unsafe characters.`);
  }
  return value;
}

export function validateConnectionEnvironment(environment, target) {
  const host = requireEnvironment(
    environment, "FLIGHT_MANAGED_115_119_DB_HOST",
  ).toLowerCase();
  const port = requireEnvironment(environment, "FLIGHT_MANAGED_115_119_DB_PORT");
  const database = requireEnvironment(environment, "FLIGHT_MANAGED_115_119_DB_NAME");
  const user = requireEnvironment(environment, "FLIGHT_MANAGED_115_119_DB_USER");
  const password = requireEnvironment(
    environment, "FLIGHT_MANAGED_115_119_DB_PASSWORD",
  );
  if (port !== "5432" || database !== "postgres") {
    throw new Error("Managed Gates 115-119 require port 5432 and database postgres.");
  }
  const direct = host === `db.${target.projectRef}.supabase.co`
    && user === "postgres";
  const pooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(host)
    && user === `postgres.${target.projectRef}`;
  if (!direct && !pooler) {
    throw new Error("Connection host/user do not label the exact isolated UAT project.");
  }
  if (/(?:localhost|127\.0\.0\.1|::1|\.local|\.internal)$/i.test(host)
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error("Local, private, and raw-IP targets are forbidden.");
  }
  return Object.freeze({ host, port, database, user, password });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readAndAssertArtifacts({
  repositoryRoot = REPOSITORY_ROOT,
  readBytes = (artifactPath) => readFileSync(path.join(repositoryRoot, artifactPath)),
} = {}) {
  const artifacts = {};
  const all = [
    ...Object.entries(ARTIFACTS).map(([name, artifact]) => ({ name, ...artifact })),
    ...MIGRATIONS.map((artifact) => ({ name: `migration_${artifact.version}`, ...artifact })),
    ...ROLLBACKS.map((artifact) => ({ name: `rollback_${artifact.version}`, ...artifact })),
  ];
  for (const artifact of all) {
    const bytes = readBytes(artifact.path);
    if (sha256(bytes) !== artifact.sha256) {
      throw new Error(`Pinned ${artifact.name} artifact failed its SHA-256 check.`);
    }
    artifacts[artifact.name] = bytes;
  }
  const preflight = artifacts.preflight.toString("utf8");
  const verification = artifacts.verification.toString("utf8");
  if (!/^begin read only;/im.test(preflight)) {
    throw new Error("Managed preflight is not explicitly read-only.");
  }
  if (!/^savepoint flight_public_shopping_115_119_synthetic_rows;$/im.test(verification)
    || !/^rollback to savepoint flight_public_shopping_115_119_synthetic_rows;$/im.test(verification)
    || /create\s+(?:schema|table|function).*harness/i.test(verification)) {
    throw new Error("Managed verification is not savepoint-contained/harness-free.");
  }
  for (const migration of MIGRATIONS) {
    const sql = artifacts[`migration_${migration.version}`].toString("utf8");
    if (!/^begin;[\s\S]*^commit;\s*$/im.test(sql)) {
      throw new Error(`Migration ${migration.version} is not one exact transaction.`);
    }
  }
  const rollback118 = artifacts.rollback_202608260118.toString("utf8");
  if (!/(?:rollback refused|refusing rollback)/i.test(rollback118)
    || /drop\s+(?:table|function)|truncate|delete\s+from/i.test(rollback118)) {
    throw new Error("Gate 118 rollback no longer enforces its forward-only boundary.");
  }
  for (const bytes of Object.values(artifacts)) {
    const sql = bytes.toString("utf8");
    if (/\b(?:dblink|http_get|http_post|pg_notify|lo_import|lo_export)\b|\bnet\./i.test(sql)) {
      throw new Error("A pinned artifact contains forbidden external transport.");
    }
    if (/(?:insert\s+into|update|delete\s+from)\s+supabase_migrations\.schema_migrations/i.test(sql)) {
      throw new Error("A pinned artifact attempts to mutate the migration ledger.");
    }
  }
  return Object.freeze(artifacts);
}

function targetPrefix(target, expectedLedger = null, psql = true) {
  const lines = psql ? [
    "\\set ON_ERROR_STOP on",
    "\\set VERBOSITY terse",
  ] : [];
  lines.push(
    `select set_config('app.flight_managed_115_119_target_kind', '${target.kind}', false);`,
    `select set_config('app.flight_managed_115_119_project_ref', '${target.projectRef}', false);`,
  );
  if (expectedLedger) {
    if (!/^\d+$/.test(expectedLedger.count)
      || !/^[0-9a-f]{64}$/.test(expectedLedger.sha256)) {
      throw new Error("Preflight ledger receipt is malformed.");
    }
    lines.push(
      `select set_config('app.flight_managed_115_119_expected_ledger_count', '${expectedLedger.count}', false);`,
      `select set_config('app.flight_managed_115_119_expected_ledger_sha256', '${expectedLedger.sha256}', false);`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function buildTargetBoundSql(bytes, target, expectedLedger = null) {
  return Buffer.concat([
    Buffer.from(targetPrefix(target, expectedLedger, true), "utf8"),
    bytes,
  ]);
}

export function buildSqlEditorTargetBoundSql(bytes, target) {
  return Buffer.concat([
    Buffer.from(targetPrefix(target, null, false), "utf8"),
    bytes,
  ]);
}

function childEnvironment(environment, connection) {
  const child = {};
  for (const [name, value] of Object.entries(environment)) {
    if (CHILD_ENV_ALLOWLIST.has(name) && typeof value === "string") {
      child[name] = value;
    }
  }
  return Object.assign(child, {
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGDATABASE: connection.database,
    PGUSER: connection.user,
    PGPASSWORD: connection.password,
    PGSSLMODE: "verify-full",
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "iratepilot-flight-managed-115-119-uat",
  });
}

export function executePsql({ psql, input, environment, spawn = spawnSync }) {
  const result = spawn(psql, [
    "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--no-align",
    "--tuples-only", "--quiet", "--file", "-",
  ], {
    env: environment,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = String(result.stderr || result.stdout || "")
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
      .slice(-4000);
    throw new Error(`Managed psql gate failed.\n${diagnostic}`);
  }
  return String(result.stdout ?? "");
}

export function parseReceipt(output, expectedGate) {
  for (const line of output.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const value = JSON.parse(trimmed);
      if (value.gate === expectedGate && value.result === "PASS") return value;
    } catch {
      // Continue to the next candidate without echoing database output.
    }
  }
  throw new Error(`Managed ${expectedGate} receipt is absent or malformed.`);
}

export function runManagedGate({
  config,
  environment = process.env,
  artifacts = readAndAssertArtifacts(),
  spawn = spawnSync,
}) {
  const connection = validateConnectionEnvironment(environment, config.target);
  const env = childEnvironment(environment, connection);
  const run = (input) => executePsql({
    psql: config.psql, input, environment: env, spawn,
  });
  const outputs = [];
  let preflightReceipt = null;
  if (config.operation === "preflight" || config.operation === "apply-verify") {
    const output = run(buildTargetBoundSql(artifacts.preflight, config.target));
    outputs.push(output);
    preflightReceipt = parseReceipt(
      output, "flight_consumer_public_shopping_115_119_managed_uat_preflight",
    );
  }
  if (config.operation === "apply-verify") {
    for (const migration of MIGRATIONS) {
      outputs.push(run(artifacts[`migration_${migration.version}`]));
    }
  }
  if (config.operation === "verify" || config.operation === "apply-verify") {
    const expectedLedger = preflightReceipt ? {
      count: String(preflightReceipt.ledger_version_count),
      sha256: preflightReceipt.ledger_versions_sha256,
    } : null;
    const output = run(buildTargetBoundSql(
      artifacts.verification, config.target, expectedLedger,
    ));
    outputs.push(output);
    parseReceipt(
      output, "flight_consumer_public_shopping_115_119_managed_uat_verification",
    );
  }
  return Object.freeze({
    operation: config.operation,
    targetKind: config.target.kind,
    projectRef: config.target.projectRef,
    sourceCommit: SOURCE_COMMIT,
    applyRange: APPLY_RANGE,
    canonicalRepositoryTip: CANONICAL_REPOSITORY_TIP,
    migrationLedgerMutation: false,
    productionAccessed: false,
    outputs,
  });
}

export function main(argv = process.argv.slice(2), environment = process.env) {
  const result = runManagedGate({ config: parseArgs(argv), environment });
  for (const output of result.outputs) {
    if (output.trim()) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
  process.stdout.write(`${JSON.stringify({
    gate: "flight_consumer_public_shopping_115_119_managed_uat_runner",
    result: "PASS",
    operation: result.operation,
    target_kind: result.targetKind,
    project_ref: result.projectRef,
    source_commit: result.sourceCommit,
    apply_range: result.applyRange,
    canonical_repository_tip: result.canonicalRepositoryTip,
    migration_ledger_mutation: false,
    production_accessed: false,
  })}\n`);
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
