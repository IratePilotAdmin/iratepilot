#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const BASE_RUNNER = path.join(
  REPOSITORY_ROOT,
  "scripts",
  "verify-flight-provider-request-attempts-postgres.mjs",
);
const RUNTIME_SQL = path.join(
  REPOSITORY_ROOT,
  "tests",
  "postgres",
  "flight-duffel-claim-router-runtime.sql",
);

const FIXED_FILES = Object.freeze([
  Object.freeze({
    label: "068 migration",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608230068_flight_commerce_foundation.sql",
    ),
    sha256: "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
    apply: false,
  }),
  Object.freeze({
    label: "069 migration",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608240069_flight_provider_request_attempts.sql",
    ),
    sha256: "7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611",
    apply: false,
  }),
  Object.freeze({
    label: "070 migration",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608250070_flight_duffel_test_order_attempts.sql",
    ),
    sha256: "882c20f4643ca5ed02cb5e5423e7dc140b54b7524a46f53e9c66e9af574e37fe",
    apply: true,
  }),
  Object.freeze({
    label: "071 migration",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608250071_flight_duffel_preview_rpc_bridge.sql",
    ),
    sha256: "bb4f8d4287060d5301e1704073e2d2c15b6dcfa1309cb1a190da9efddefa375d",
    apply: true,
  }),
  Object.freeze({
    label: "072 migration",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608250072_flight_duffel_preview_runtime_assertions.sql",
    ),
    sha256: "b8e073508ebe45be717f6d07fe463eae33eaf7d5d168076a903ffc552f08ca0b",
    apply: true,
  }),
  Object.freeze({
    label: "073 migration",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608250073_flight_duffel_claim_terminal_return.sql",
    ),
    sha256: "b9f6a6a25cf9cd5f1ad46e27a93b572d8e555a37ae08294391f2f575bcd7e045",
    apply: true,
  }),
  Object.freeze({
    label: "base 068/069 PostgreSQL runner",
    path: BASE_RUNNER,
    sha256: "cb3edfb0aec410a1c3fd8f647963f00b6d7b247105bdd75ad621885808d8a9c4",
    apply: false,
  }),
  Object.freeze({
    label: "Duffel claim-router runtime SQL",
    path: RUNTIME_SQL,
    sha256: "5ccccfa1ffe1bb3804fef0ee493894895085e37eb301f1c827fc01336ac5b6d9",
    apply: false,
  }),
]);

const ARGUMENT_NAMES = new Set([
  "--psql",
  "--host",
  "--port",
  "--admin-role",
  "--primary-db",
  "--rollback-db",
  "--cluster-guid",
  "--confirm-disposable",
]);
const CONFIRMATION = "APPLY_068_073_DUFFEL_CLAIM_LOCAL_ONLY";
const BASE_CONFIRMATION = "APPLY_068_069_LOCAL_ONLY";
const DATABASE_PATTERN = /^flight_gate_[a-z0-9](?:[a-z0-9_]{6,46}[a-z0-9])$/;
const ROLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const CLUSTER_GUID_PATTERN = /^[0-9a-f]{32}$/;

function usage() {
  return `Usage:
  node scripts/verify-flight-duffel-claim-router-postgres.mjs \\
    --psql <absolute-disposable-psql-path> \\
    --host 127.0.0.1 \\
    --port <49152-65535> \\
    --admin-role <local-superuser-role> \\
    --primary-db flight_gate_<unique_name> \\
    --rollback-db flight_gate_<different_unique_name> \\
    --cluster-guid <guid-from-codex-flight-pg-temp-path> \\
    --confirm-disposable ${CONFIRMATION}

The runner delegates fresh disposable database creation plus the complete
068/069 gate to the pinned base runner, applies fixed 070-073 bytes only to the
new primary database, and leaves the primary claim evidence in place. It never
accepts a URL, password, Preview database, credential, or arbitrary SQL path.`;
}

function parseArguments(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true };
  }
  if (argv.length === 0 || argv.length % 2 !== 0) {
    throw new Error("Every required option must have exactly one explicit value.");
  }

  const parsed = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!ARGUMENT_NAMES.has(name)) {
      throw new Error(`Unknown or prohibited option: ${name}`);
    }
    if (Object.hasOwn(parsed, name)) {
      throw new Error(`Duplicate option: ${name}`);
    }
    if (!value || value.startsWith("--") || value.includes("\0")) {
      throw new Error(`Invalid value for ${name}`);
    }
    parsed[name] = value;
  }
  for (const name of ARGUMENT_NAMES) {
    if (!Object.hasOwn(parsed, name)) {
      throw new Error(`Missing required option: ${name}`);
    }
  }

  return {
    help: false,
    psql: parsed["--psql"],
    host: parsed["--host"],
    portText: parsed["--port"],
    adminRole: parsed["--admin-role"],
    primaryDatabase: parsed["--primary-db"],
    rollbackDatabase: parsed["--rollback-db"],
    clusterGuid: parsed["--cluster-guid"].toLowerCase(),
    confirmation: parsed["--confirm-disposable"],
  };
}

function validateArguments(parsed) {
  if (parsed.host !== "127.0.0.1") {
    throw new Error("Host must be the exact IPv4 loopback address 127.0.0.1.");
  }
  if (!/^[0-9]{5}$/.test(parsed.portText)) {
    throw new Error("Port must be an explicit five-digit high port.");
  }
  const port = Number(parsed.portText);
  if (!Number.isSafeInteger(port) || port < 49152 || port > 65535) {
    throw new Error("Port must be in the disposable high-port range 49152-65535.");
  }
  if (!ROLE_PATTERN.test(parsed.adminRole)) {
    throw new Error("Admin role is not a safe PostgreSQL identifier.");
  }
  for (const database of [parsed.primaryDatabase, parsed.rollbackDatabase]) {
    if (!DATABASE_PATTERN.test(database)) {
      throw new Error("Both databases must be strict disposable flight_gate_* identifiers.");
    }
  }
  if (parsed.primaryDatabase === parsed.rollbackDatabase) {
    throw new Error("Primary and rollback databases must be different.");
  }
  if (!CLUSTER_GUID_PATTERN.test(parsed.clusterGuid)) {
    throw new Error("Cluster GUID must be the exact 32-character temp-cluster hex ID.");
  }
  if (parsed.confirmation !== CONFIRMATION) {
    throw new Error("The exact local-only disposable confirmation is required.");
  }
  if (!path.isAbsolute(parsed.psql) || !existsSync(parsed.psql)) {
    throw new Error("psql must be an existing absolute local filesystem path.");
  }

  const psql = realpathSync(parsed.psql);
  if (!statSync(psql).isFile() || !/^psql(?:\.exe)?$/i.test(path.basename(psql))) {
    throw new Error("The explicit executable must be a local file named psql or psql.exe.");
  }
  const expectedPsql = path.join(
    tmpdir(),
    `codex-flight-pg-${parsed.clusterGuid}`,
    "runtime",
    "bin",
    process.platform === "win32" ? "psql.exe" : "psql",
  );
  if (!existsSync(expectedPsql) || realpathSync(expectedPsql) !== psql) {
    throw new Error(
      "psql must be the executable inside the confirmed Codex disposable cluster runtime.",
    );
  }

  return Object.freeze({ ...parsed, port, psql });
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function validateFixedInputs() {
  for (const item of FIXED_FILES) {
    if (!existsSync(item.path)) {
      throw new Error(`Missing fixed ${item.label} file.`);
    }
    const actual = sha256File(item.path);
    if (actual !== item.sha256) {
      throw new Error(`${item.label} bytes are not the reviewed bytes (${actual}).`);
    }
  }
}

function cleanEnvironment() {
  const clean = Object.create(null);
  for (const name of [
    "COMSPEC",
    "PATHEXT",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR",
  ]) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) {
      clean[name] = value;
    }
  }
  return clean;
}

function cleanPsqlEnvironment() {
  const clean = cleanEnvironment();
  const sentinel = path.join(REPOSITORY_ROOT, ".flight-duffel-claim-gate-no-pgpass");
  if (existsSync(sentinel)) {
    throw new Error("Reserved no-password sentinel path unexpectedly exists.");
  }
  clean.PGPASSFILE = sentinel;
  clean.PGSERVICEFILE = sentinel;
  clean.PGSYSCONFDIR = REPOSITORY_ROOT;
  clean.PGSSLMODE = "disable";
  clean.PGCONNECT_TIMEOUT = "5";
  return clean;
}

function compactFailure(result) {
  const lines = `${result.stderr}\n${result.stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-18);
  return lines.join("\n") || `exit=${result.code} signal=${result.signal ?? "none"}`;
}

function run(command, args, { env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

async function runBaseGate(config) {
  const result = await run(process.execPath, [
    BASE_RUNNER,
    "--psql", config.psql,
    "--host", config.host,
    "--port", config.portText,
    "--admin-role", config.adminRole,
    "--primary-db", config.primaryDatabase,
    "--rollback-db", config.rollbackDatabase,
    "--cluster-guid", config.clusterGuid,
    "--confirm-disposable", BASE_CONFIRMATION,
  ], {
    env: cleanEnvironment(),
    timeoutMs: 180_000,
  });
  if (result.timedOut || result.code !== 0) {
    throw new Error(`Pinned 068/069 base gate failed:\n${compactFailure(result)}`);
  }
  if (!result.stdout.includes('"result": "PASS"')) {
    throw new Error("Pinned 068/069 base gate omitted its PASS evidence.");
  }
}

async function runPsqlFile(config, file, variables = {}) {
  if (file !== RUNTIME_SQL
    && !FIXED_FILES.some((item) => item.apply && item.path === file)) {
    throw new Error("Refusing to execute an unreviewed SQL file.");
  }
  const args = [
    "-X",
    "--no-password",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=terse",
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.adminRole}`,
    `--dbname=${config.primaryDatabase}`,
  ];
  for (const [name, value] of Object.entries(variables)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !/^[A-Za-z0-9_]+$/.test(value)) {
      throw new Error("Refusing an unsafe psql variable.");
    }
    args.push(`--set=${name}=${value}`);
  }
  args.push(`--file=${file}`);

  const result = await run(config.psql, args, {
    env: cleanPsqlEnvironment(),
    timeoutMs: 60_000,
  });
  if (result.timedOut || result.code !== 0) {
    throw new Error(`Disposable PostgreSQL step failed:\n${compactFailure(result)}`);
  }
  return result;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const config = validateArguments(parsed);
  validateFixedInputs();
  await runBaseGate(config);

  for (const item of FIXED_FILES.filter((candidate) => candidate.apply)) {
    await runPsqlFile(config, item.path);
  }
  const runtime = await runPsqlFile(config, RUNTIME_SQL, {
    gate_database: config.primaryDatabase,
    gate_admin_role: config.adminRole,
  });
  if (!runtime.stdout.includes("FLIGHT_DUFFEL_CLAIM_ROUTER_RUNTIME_PASS")) {
    throw new Error("Claim-router runtime SQL omitted its final acceptance marker.");
  }

  const evidence = {
    result: "PASS",
    network: "loopback-only",
    providerTraffic: false,
    credentialsRead: false,
    previewDatabaseTouched: false,
    primaryDatabase: config.primaryDatabase,
    rollbackDatabase: config.rollbackDatabase,
    primaryDisposition: "preserved with one committed dispatching revision-one order claim",
    secondClaim: "exact Duffel order CAS failure; winner preserved",
    migrationOrder: FIXED_FILES
      .filter((item) => /^(?:068|069|070|071|072|073) migration$/.test(item.label))
      .map((item) => ({ label: item.label, sha256: item.sha256 })),
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown fail-closed error";
  process.stderr.write(`FLIGHT_DUFFEL_CLAIM_GATE_FAIL: ${message}\n`);
  process.exitCode = 1;
});
