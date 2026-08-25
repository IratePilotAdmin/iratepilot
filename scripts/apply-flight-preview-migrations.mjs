import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PREVIEW_PROJECT_REF = "eiqmdldjnedqgbtoozqa";
export const PRODUCTION_PROJECT_REF = "allliumarkejinplrggl";
export const REQUIRED_BASELINE_TIP = "202608170067";
export const APPLY_CONFIRMATION_FLAG =
  "--apply-confirmation=PREVIEW_eiqmdldjnedqgbtoozqa_FLIGHT_068_072";

export const PINNED_FLIGHT_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: "202608230068",
    filename: "202608230068_flight_commerce_foundation.sql",
    sha256: "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
  }),
  Object.freeze({
    version: "202608240069",
    filename: "202608240069_flight_provider_request_attempts.sql",
    sha256: "7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611",
  }),
  Object.freeze({
    version: "202608250070",
    filename: "202608250070_flight_duffel_test_order_attempts.sql",
    sha256: "882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe",
  }),
  Object.freeze({
    version: "202608250071",
    filename: "202608250071_flight_duffel_preview_rpc_bridge.sql",
    sha256: "bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d",
  }),
  Object.freeze({
    version: "202608250072",
    filename: "202608250072_flight_duffel_preview_runtime_assertions.sql",
    sha256: "b8e073508ebe45be717f6d07fe463eae33eaf7d5d168076a903ffc552f08ca0b",
  }),
]);

const REPOSITORY_ROOT_URL = new URL("../", import.meta.url);
const REPOSITORY_ROOT_PATH = fileURLToPath(REPOSITORY_ROOT_URL);
const MIGRATION_DIRECTORY_URL = new URL("supabase/migrations/", REPOSITORY_ROOT_URL);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
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

function sameValues(actual, expected) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sorted(values) {
  return [...values].sort();
}

export function listRepositoryMigrations() {
  const migrations = readdirSync(MIGRATION_DIRECTORY_URL)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const match = /^(\d{12})_[a-z0-9_]+\.sql$/.exec(filename);
      if (!match) {
        throw new Error("The migration directory contains a non-canonical SQL filename.");
      }
      return { version: match[1], filename };
    });

  const versions = migrations.map(({ version }) => version);
  if (new Set(versions).size !== versions.length) {
    throw new Error("The migration directory contains a duplicate migration version.");
  }
  return migrations;
}

export function assertPinnedFlightMigrations() {
  const repositoryMigrations = listRepositoryMigrations();
  const baselineTipIndex = repositoryMigrations.findIndex(
    ({ version }) => version === REQUIRED_BASELINE_TIP,
  );
  if (baselineTipIndex < 0) {
    throw new Error("Required repository migration 067 is missing.");
  }

  const postBaseline = repositoryMigrations.slice(baselineTipIndex + 1);
  const expectedPostBaseline = PINNED_FLIGHT_MIGRATIONS.map(({ version, filename }) => ({
    version,
    filename,
  }));
  if (JSON.stringify(postBaseline) !== JSON.stringify(expectedPostBaseline)) {
    throw new Error("Only the pinned flight migrations 068 through 072 may follow migration 067.");
  }

  for (const migration of PINNED_FLIGHT_MIGRATIONS) {
    const bytes = readFileSync(new URL(migration.filename, MIGRATION_DIRECTORY_URL));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== migration.sha256) {
      throw new Error(`Pinned migration ${migration.version} failed its SHA-256 check.`);
    }
  }

  return {
    migrations: repositoryMigrations,
    baselineVersions: repositoryMigrations
      .slice(0, baselineTipIndex + 1)
      .map(({ version }) => version),
    flightVersions: PINNED_FLIGHT_MIGRATIONS.map(({ version }) => version),
  };
}

function validatedConfiguredProductionRef(env) {
  const configured = env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();
  if (!configured) return undefined;
  if (!/^[a-z0-9]{20}$/.test(configured)) {
    throw new Error("The configured production project ref is invalid; refusing to continue.");
  }
  return configured;
}

export function assertExactPreviewTarget(env) {
  const projectRef = env.PREVIEW_SUPABASE_PROJECT_REF?.trim();
  const databaseUrl = env.PREVIEW_SUPABASE_DB_URL?.trim();
  const configuredProductionRef = validatedConfiguredProductionRef(env);

  if (projectRef !== PREVIEW_PROJECT_REF) {
    throw new Error("The exact approved Preview project ref is required.");
  }
  if (
    projectRef === PRODUCTION_PROJECT_REF
    || projectRef === configuredProductionRef
  ) {
    throw new Error("Refusing to target a production Supabase project.");
  }
  if (!databaseUrl) {
    throw new Error("PREVIEW_SUPABASE_DB_URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("PREVIEW_SUPABASE_DB_URL is not an approved Supabase PostgreSQL URL.");
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("PREVIEW_SUPABASE_DB_URL must use PostgreSQL.");
  }
  if (parsed.search || parsed.hash || parsed.pathname !== "/postgres") {
    throw new Error("PREVIEW_SUPABASE_DB_URL has an unapproved path or option.");
  }
  if (!parsed.password) {
    throw new Error("PREVIEW_SUPABASE_DB_URL must include a database password.");
  }

  let username;
  let databasePassword;
  try {
    username = decodeURIComponent(parsed.username);
    databasePassword = decodeURIComponent(parsed.password);
  } catch {
    throw new Error("PREVIEW_SUPABASE_DB_URL has invalid encoded credentials.");
  }

  const directHost = `db.${PREVIEW_PROJECT_REF}.supabase.co`;
  const isDirect = parsed.hostname === directHost
    && username === "postgres"
    && (parsed.port === "" || parsed.port === "5432");
  const isPooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsed.hostname)
    && username === `postgres.${PREVIEW_PROJECT_REF}`
    && (parsed.port === "5432" || parsed.port === "6543");

  if (!isDirect && !isPooler) {
    throw new Error("PREVIEW_SUPABASE_DB_URL does not match the exact approved Preview project.");
  }

  const blockedRefs = [PRODUCTION_PROJECT_REF, configuredProductionRef].filter(Boolean);
  const targetIdentity = `${parsed.hostname} ${username}`;
  if (blockedRefs.some((blockedRef) => targetIdentity.includes(blockedRef))) {
    throw new Error("Refusing to target a production Supabase database.");
  }

  const cliUrl = new URL(parsed.href);
  cliUrl.password = "";
  return {
    cliDatabaseUrl: cliUrl.toString(),
    databasePassword,
  };
}

export function parseInvocationMode(argv = []) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--plan")) {
    return "plan";
  }
  if (argv.length === 1 && argv[0] === APPLY_CONFIRMATION_FLAG) {
    return "apply";
  }
  throw new Error("Invalid arguments. Use --plan or the exact documented apply confirmation flag.");
}

export function parseMigrationListOutput(output) {
  const rows = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.split(/[|│]/).map((column) => column.trim());
    if (columns.length < 2) continue;
    const [localCell, remoteCell] = columns;
    if (!localCell && !remoteCell) continue;
    if (/^local$/i.test(localCell) && /^remote$/i.test(remoteCell)) continue;
    if (
      /^[-=─━]+$/.test(localCell)
      && /^[-=─━]+$/.test(remoteCell)
    ) continue;

    const parseCell = (cell) => {
      if (!cell) return undefined;
      if (/^\d{12}$/.test(cell)) return cell;
      throw new Error("The Preview migration ledger contains a malformed version cell.");
    };
    const local = parseCell(localCell);
    const remote = parseCell(remoteCell);
    if (!local && !remote) {
      throw new Error("The Preview migration ledger contains an unrecognized row.");
    }
    rows.push({ local, remote });
  }

  if (rows.length === 0) {
    throw new Error("Unable to parse the Preview migration ledger.");
  }

  const localVersions = rows.flatMap(({ local }) => local ? [local] : []);
  const remoteVersions = rows.flatMap(({ remote }) => remote ? [remote] : []);
  const parsedVersions = new Set([...localVersions, ...remoteVersions]);
  const unparsedNumericVersion = [...output.matchAll(/(?<!\d)(\d{12,})(?!\d)/g)]
    .map((match) => match[1])
    .find((version) => !parsedVersions.has(version));
  if (unparsedNumericVersion) {
    throw new Error("The Preview migration ledger contains an unparsed numeric version.");
  }
  if (
    new Set(localVersions).size !== localVersions.length
    || new Set(remoteVersions).size !== remoteVersions.length
  ) {
    throw new Error("The Preview migration ledger contains duplicate versions.");
  }
  return { localVersions, remoteVersions };
}

export function assertPreviewLedger(output, pinnedPlan) {
  const { localVersions, remoteVersions } = parseMigrationListOutput(output);
  const repositoryVersions = pinnedPlan.migrations.map(({ version }) => version);
  const expectedLocal = sorted(repositoryVersions);
  const actualLocal = sorted(localVersions);
  if (!sameValues(actualLocal, expectedLocal)) {
    throw new Error("The Preview ledger local side does not exactly match the repository.");
  }

  const expectedBaseline = sorted(pinnedPlan.baselineVersions);
  const expectedComplete = sorted([
    ...pinnedPlan.baselineVersions,
    ...pinnedPlan.flightVersions,
  ]);
  const actualRemote = sorted(remoteVersions);
  const hasBaselineOnly = sameValues(actualRemote, expectedBaseline);
  const hasCompleteLedger = sameValues(actualRemote, expectedComplete);
  if (!hasBaselineOnly && !hasCompleteLedger) {
    throw new Error(
      "The Preview remote ledger must contain the complete repository through 067 and either all five flight migrations or none.",
    );
  }

  return {
    pendingVersions: hasBaselineOnly ? [...pinnedPlan.flightVersions] : [],
    remoteVersions: actualRemote,
  };
}

export function assertExactFlightDryRun(output) {
  const mentionedVersions = [...output.matchAll(/(?<!\d)(\d{12})(?!\d)/g)]
    .map((match) => match[1]);
  const expected = PINNED_FLIGHT_MIGRATIONS.map(({ version }) => version);
  const mentionedFiles = [...output.matchAll(/(?<![a-z0-9_])(\d{12}_[a-z0-9_]+\.sql)(?![a-z0-9_])/gi)]
    .map((match) => match[1]);
  const expectedFiles = PINNED_FLIGHT_MIGRATIONS.map(({ filename }) => filename);
  if (
    !sameValues(mentionedVersions, expected)
    || !sameValues(mentionedFiles, expectedFiles)
  ) {
    throw new Error("The dry run must mention exactly migrations 068 through 072 in order.");
  }
  return mentionedVersions;
}

function identifierPattern(identifier) {
  return `(?:"${identifier}"|${identifier})`;
}

function tableDefinition(output, table) {
  const pattern = new RegExp(
    `^\\s*CREATE\\s+TABLE\\s+(?:"public"|public)\\.${identifierPattern(table)}\\s*\\(([\\s\\S]*?)^\\s*\\);`,
    "im",
  );
  return pattern.exec(output)?.[1];
}

function assertTableColumn(definition, table, column, typePattern, requiredTokens = []) {
  const linePattern = new RegExp(
    `^\\s*${identifierPattern(column)}\\s+(${typePattern})([^,\\r\\n]*)`,
    "im",
  );
  const line = linePattern.exec(definition)?.[0]?.toLowerCase();
  if (!line || requiredTokens.some((token) => !line.includes(token))) {
    throw new Error(`The post-apply schema dump is missing a required ${table} column contract.`);
  }
}

function normalizedSqlFragment(value) {
  return value
    .replaceAll('"', "")
    .toLowerCase()
    .replace(/timestamp\s+with\s+time\s+zone/g, "timestamptz")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s*,\s*/g, ",")
    .trim();
}

function assertFunctionSignature(output, functionName, parameterTypes, returnContract) {
  const pattern = new RegExp(
    `^\\s*CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+(?:"public"|public)\\.${identifierPattern(functionName)}\\s*\\(([\\s\\S]*?)\\)\\s+RETURNS\\s+([\\s\\S]*?)\\n\\s+LANGUAGE\\b`,
    "im",
  );
  const match = pattern.exec(output);
  if (!match) {
    throw new Error("The post-apply schema dump is missing a required flight function.");
  }
  const parameters = match[1].trim()
    ? match[1].split(",").map((parameter) => normalizedSqlFragment(
      parameter.replace(/\s+default\s+[\s\S]*$/i, ""),
    ))
    : [];
  if (
    parameters.length !== parameterTypes.length
    || parameters.some((parameter, index) => !parameter.endsWith(` ${parameterTypes[index]}`))
    || normalizedSqlFragment(match[2]) !== returnContract
  ) {
    throw new Error("The post-apply schema dump has an unexpected flight function signature.");
  }
}

export function assertFlightSchemaDump(output) {
  const requiredTables = ["flight_runtime_controls", "flight_provider_request_attempts"];

  for (const table of requiredTables) {
    if (!tableDefinition(output, table)) {
      throw new Error("The post-apply schema dump is missing a required flight table.");
    }
  }

  const controls = tableDefinition(output, "flight_runtime_controls");
  assertTableColumn(controls, "flight_runtime_controls", "control_key", "text", ["not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "execution_kill_switch_engaged", "boolean", ["default true", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "provider_sandbox_traffic_enabled", "boolean", ["default false", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "shopping_enabled", "boolean", ["default false", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "production_release_enabled", "boolean", ["default false", "not null"]);
  assertTableColumn(controls, "flight_runtime_controls", "bound_project_ref", "text");
  assertTableColumn(controls, "flight_runtime_controls", "activation_evidence_sha256", "text");

  const attempts = tableDefinition(output, "flight_provider_request_attempts");
  for (const column of [
    "tenant_id",
    "commerce_id",
    "operation",
    "execution_mode",
    "request_sha256",
    "terminal_receipt_sha256",
  ]) {
    assertTableColumn(attempts, "flight_provider_request_attempts", column, "text");
  }
  assertTableColumn(attempts, "flight_provider_request_attempts", "id", "uuid", ["not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "dispatch_not_after", "(?:timestamptz|timestamp\\s+with\\s+time\\s+zone)", ["not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "state", "text", ["default 'prepared'", "not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "revision", "integer", ["default 0", "not null"]);
  assertTableColumn(attempts, "flight_provider_request_attempts", "retry_authorized", "boolean", ["default false", "not null"]);

  assertFunctionSignature(
    output,
    "flight_runtime_capability_enabled",
    ["text", "text", "text", "text", "text"],
    "boolean",
  );
  assertFunctionSignature(
    output,
    "prepare_flight_provider_request_attempt",
    [...Array(17).fill("text"), "timestamptz"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "claim_flight_provider_request_attempt_for_dispatch",
    ["uuid", "integer"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "complete_flight_provider_request_attempt",
    ["uuid", "integer", "text", "smallint", "text", "bigint", "text"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "prepare_flight_provider_order_attempt",
    [...Array(15).fill("text"), "timestamptz"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "claim_flight_provider_order_attempt_for_dispatch",
    ["uuid", "integer"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "prepare_flight_provider_attempt_rpc",
    [...Array(17).fill("text"), "timestamptz"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  assertFunctionSignature(
    output,
    "claim_flight_provider_attempt_rpc",
    ["uuid", "integer", "text", "text", "text", "text"],
    "table(attempt_id uuid,attempt_revision integer,attempt_state text)",
  );
  for (const table of requiredTables) {
    for (const mode of ["ENABLE", "FORCE"]) {
      const pattern = new RegExp(
        `^\\s*ALTER\\s+TABLE(?:\\s+ONLY)?\\s+(?:"public"|public)\\.${identifierPattern(table)}\\s+${mode}\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`,
        "im",
      );
      if (!pattern.test(output)) {
        throw new Error("The post-apply schema dump does not prove forced RLS on required flight tables.");
      }
    }
  }

  return true;
}

export function buildSupabaseChildEnv(sourceEnv, databasePassword) {
  const childEnv = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (typeof value === "string" && CHILD_ENV_ALLOWLIST.has(key.toUpperCase())) {
      childEnv[key] = value;
    }
  }
  childEnv.PGPASSWORD = databasePassword;
  childEnv.SUPABASE_DB_PASSWORD = databasePassword;
  childEnv.NO_COLOR = "1";
  return childEnv;
}

export function runSupabaseCli(args, databasePassword, sourceEnv = process.env) {
  const result = spawnSync("supabase", args, {
    cwd: REPOSITORY_ROOT_PATH,
    env: buildSupabaseChildEnv(sourceEnv, databasePassword),
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  if (result.error) {
    throw new Error("The Supabase CLI could not be started.");
  }
  if (result.status !== 0) {
    throw new Error(`The Supabase CLI exited with status ${result.status}.`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function safeSummary(mode, pinnedPlan, extra = {}) {
  return {
    gate: "flight-preview-migrations-068-072",
    mode,
    approvedPreviewProjectRef: PREVIEW_PROJECT_REF,
    requiredRemoteBaselineTip: REQUIRED_BASELINE_TIP,
    migrationOrder: PINNED_FLIGHT_MIGRATIONS.map(({ version, filename, sha256 }) => ({
      version,
      filename,
      sha256,
    })),
    repositoryMigrationCount: pinnedPlan.migrations.length,
    applyConfirmationFlag: APPLY_CONFIRMATION_FLAG,
    ...extra,
  };
}

export function applyFlightPreviewMigrations({
  env = process.env,
  argv = process.argv.slice(2),
  runner,
  log = (value) => console.log(JSON.stringify(value, null, 2)),
} = {}) {
  const mode = parseInvocationMode(argv);
  const pinnedPlan = assertPinnedFlightMigrations();
  const { cliDatabaseUrl, databasePassword } = assertExactPreviewTarget(env);

  if (mode === "plan") {
    const summary = safeSummary(mode, pinnedPlan, {
      networkExecuted: false,
      allowedPendingSets: [pinnedPlan.flightVersions, []],
    });
    log(summary);
    return summary;
  }

  const execute = runner ?? ((args) => runSupabaseCli(args, databasePassword, env));
  const dbUrlArgs = ["--db-url", cliDatabaseUrl];
  const beforeOutput = execute(["migration", "list", ...dbUrlArgs]);
  const before = assertPreviewLedger(beforeOutput, pinnedPlan);
  let applied = false;

  if (before.pendingVersions.length > 0) {
    const dryRunOutput = execute([
      "db", "push", ...dbUrlArgs, "--dry-run",
    ]);
    assertExactFlightDryRun(dryRunOutput);

    // Close the largest local-file and remote-ledger race windows before the mutating call.
    assertPinnedFlightMigrations();
    const preApplyOutput = execute(["migration", "list", ...dbUrlArgs]);
    const preApply = assertPreviewLedger(preApplyOutput, pinnedPlan);
    if (preApply.pendingVersions.length > 0) {
      execute(["db", "push", ...dbUrlArgs, "--yes"]);
      applied = true;

      assertPinnedFlightMigrations();
      const afterOutput = execute(["migration", "list", ...dbUrlArgs]);
      const after = assertPreviewLedger(afterOutput, pinnedPlan);
      if (after.pendingVersions.length !== 0) {
        throw new Error("The post-apply Preview ledger is incomplete.");
      }
    }
  }

  const schemaOutput = execute(["db", "dump", ...dbUrlArgs, "--schema", "public"]);
  assertFlightSchemaDump(schemaOutput);

  const summary = safeSummary(mode, pinnedPlan, {
    applied,
    pendingBefore: before.pendingVersions,
    pendingAfter: [],
    physicalSchemaBoundaryVerified: true,
  });
  log(summary);
  return summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  applyFlightPreviewMigrations();
}
