#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const MIGRATION_FILE = path.join(
  REPOSITORY_ROOT,
  "supabase",
  "production-migrations",
  "202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.sql",
);
const ROLLBACK_FILE = path.join(
  REPOSITORY_ROOT,
  "supabase",
  "production-rollbacks",
  "202608260103_flight_consumer_live_stripe_payment_intent_plan_journal.rollback.sql",
);
const RUNTIME_SQL_FILE = path.join(
  REPOSITORY_ROOT,
  "tests",
  "postgres",
  "flight-consumer-live-stripe-payment-plan-runtime.sql",
);

const FIXED_FILES = Object.freeze([
  Object.freeze({
    label: "Production migration 103",
    path: MIGRATION_FILE,
    sha256: "c4d5dec63faa07b37a2f57dc26a57faf94d698e09cf7f7e5be55a145a052d2cd",
  }),
  Object.freeze({
    label: "Production rollback 103",
    path: ROLLBACK_FILE,
    sha256: "29f22e4a5d9de9aa767695ede19b0026c03f60e9a2c534ac63768e5026492ed3",
  }),
  Object.freeze({
    label: "Production Stripe plan PostgreSQL runtime acceptance SQL",
    path: RUNTIME_SQL_FILE,
    sha256: "a5555a33a350ef9ff27710b3637e0d94c0cf43b94b2094eba468e68f4c50307e",
  }),
]);

const ARGUMENT_NAMES = new Set([
  "--psql",
  "--host",
  "--port",
  "--admin-role",
  "--behavior-db",
  "--rollback-db",
  "--cluster-guid",
  "--confirm-disposable",
]);
const CONFIRMATION = "APPLY_103_LOCAL_ONLY";
const DATABASE_PATTERN =
  /^flight_stripe_gate_[a-z0-9](?:[a-z0-9_]{5,38}[a-z0-9])$/;
const CLUSTER_GUID_PATTERN = /^[0-9a-f]{32}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FUNCTION_SIGNATURE =
  "public.record_flight_consumer_live_stripe_payment_intent_plan_v1(text,text,text,text,text,text,text,text,text,text,text,bigint)";
const ADVISORY_LOCK_KEY = 260103;

function usage() {
  return `Usage:
  node scripts/verify-flight-consumer-live-stripe-payment-plan-postgres.mjs \\
    --psql <absolute-local-psql-path> \\
    --host 127.0.0.1 \\
    --port <49152-65535> \\
    --admin-role postgres \\
    --behavior-db flight_stripe_gate_<unique_name> \\
    --rollback-db flight_stripe_gate_<different_unique_name> \\
    --cluster-guid <guid-from-codex-flight-pg-temp-path> \\
    --confirm-disposable ${CONFIRMATION}

The runner creates exactly the two named, previously nonexistent disposable
databases on one confirmed loopback-only Codex PostgreSQL cluster. It never
accepts a connection URL, password, environment name, remote host, or SQL path.`;
}

function parseArguments(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
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
    behaviorDatabase: parsed["--behavior-db"],
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
  if (parsed.adminRole !== "postgres") {
    throw new Error("Admin role must be the exact disposable-cluster postgres role.");
  }
  for (const [label, database] of [
    ["behavior", parsed.behaviorDatabase],
    ["rollback", parsed.rollbackDatabase],
  ]) {
    if (!DATABASE_PATTERN.test(database)) {
      throw new Error(
        `${label} database must be a strict disposable flight_stripe_gate_* identifier.`,
      );
    }
  }
  if (parsed.behaviorDatabase === parsed.rollbackDatabase) {
    throw new Error("Behavior and rollback databases must be different.");
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
  const clusterRoot = path.join(tmpdir(), `codex-flight-pg-${parsed.clusterGuid}`);
  const expectedPsql = path.join(
    clusterRoot,
    "runtime",
    "bin",
    process.platform === "win32" ? "psql.exe" : "psql",
  );
  if (!existsSync(expectedPsql) || realpathSync(expectedPsql) !== psql) {
    throw new Error(
      "psql must be the executable inside the confirmed Codex disposable cluster runtime.",
    );
  }
  const createdbCandidate = path.join(
    path.dirname(psql),
    process.platform === "win32" ? "createdb.exe" : "createdb",
  );
  if (!existsSync(createdbCandidate)) {
    throw new Error("The reviewed psql runtime must include its sibling createdb executable.");
  }
  const createdb = realpathSync(createdbCandidate);
  if (
    !statSync(createdb).isFile()
    || !/^createdb(?:\.exe)?$/i.test(path.basename(createdb))
  ) {
    throw new Error("The sibling createdb path is not a local file.");
  }
  const expectedDataDirectory = path.join(clusterRoot, "data");
  for (const reviewedPath of [
    clusterRoot,
    path.join(clusterRoot, "runtime"),
    path.dirname(psql),
    psql,
    createdb,
    expectedDataDirectory,
  ]) {
    if (!existsSync(reviewedPath) || lstatSync(reviewedPath).isSymbolicLink()) {
      throw new Error("Disposable cluster paths must exist without symlink or junction indirection.");
    }
  }
  const canonicalRoot = realpathSync(clusterRoot);
  const canonicalExpectedRoot = path.resolve(tmpdir(), `codex-flight-pg-${parsed.clusterGuid}`);
  const sameRoot = process.platform === "win32"
    ? canonicalRoot.toLowerCase() === canonicalExpectedRoot.toLowerCase()
    : canonicalRoot === canonicalExpectedRoot;
  if (!sameRoot) {
    throw new Error("Disposable cluster root escaped the exact reviewed temporary path.");
  }
  return Object.freeze({
    ...parsed,
    port,
    psql,
    createdb,
    clusterRoot: canonicalRoot,
    dataDirectory: realpathSync(expectedDataDirectory),
  });
}

function loadFixedInputs() {
  const inputs = new Map();
  for (const item of FIXED_FILES) {
    if (!existsSync(item.path)) {
      throw new Error(`Missing fixed ${item.label} file.`);
    }
    const bytes = readFileSync(item.path);
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== item.sha256) {
      throw new Error(
        `${item.label} bytes are not the reviewed acceptance bytes (${actual}).`,
      );
    }
    inputs.set(item.path, bytes);
  }
  return inputs;
}

function cleanPsqlEnvironment() {
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
    if (typeof value === "string" && value.length > 0) clean[name] = value;
  }
  const sentinel = path.join(REPOSITORY_ROOT, ".flight-stripe-gate-no-pgpass");
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

function sameCanonicalPath(left, right) {
  const canonicalLeft = realpathSync(left);
  const canonicalRight = realpathSync(right);
  return process.platform === "win32"
    ? canonicalLeft.toLowerCase() === canonicalRight.toLowerCase()
    : canonicalLeft === canonicalRight;
}

function acquireExclusiveRunLock(config) {
  const lockPath = path.join(config.clusterRoot, "flight-stripe-gate.lock");
  const token = `${process.pid}:${randomUUID()}`;
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
    writeSync(descriptor, token, null, "utf8");
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
      if (existsSync(lockPath)) unlinkSync(lockPath);
    }
    throw new Error(
      `Could not acquire the exclusive disposable-cluster gate lock: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return Object.freeze({ descriptor, lockPath, token });
}

function releaseExclusiveRunLock(lock) {
  try {
    closeSync(lock.descriptor);
  } catch (error) {
    throw new Error(
      `Could not close the exclusive gate lock: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!existsSync(lock.lockPath)) {
    throw new Error("The exclusive gate lock disappeared before reviewed release.");
  }
  const recordedToken = readFileSync(lock.lockPath, "utf8");
  if (recordedToken !== lock.token) {
    throw new Error("The exclusive gate lock ownership token changed unexpectedly.");
  }
  unlinkSync(lock.lockPath);
}

function processExecutablePath(pid) {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR;
    if (!systemRoot) {
      throw new Error("Windows system root is unavailable for process attestation.");
    }
    const powershell = path.join(
      systemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    if (!existsSync(powershell)) {
      throw new Error("The reviewed Windows process-attestation utility is unavailable.");
    }
    const result = spawnSync(
      powershell,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Process -Id ${pid} -ErrorAction Stop).Path`,
      ],
      {
        encoding: "utf8",
        env: cleanPsqlEnvironment(),
        shell: false,
        windowsHide: true,
        timeout: 5_000,
      },
    );
    if (result.status !== 0 || !result.stdout.trim()) {
      throw new Error("Could not attest the disposable PostgreSQL server process.");
    }
    return result.stdout.trim();
  }
  const procExecutable = `/proc/${pid}/exe`;
  if (!existsSync(procExecutable)) {
    throw new Error("Could not attest the disposable PostgreSQL server process.");
  }
  return realpathSync(procExecutable);
}

function validateLoopbackListenerOwner(config, pid) {
  if (process.platform !== "win32") {
    throw new Error("This gate requires reviewed Windows TCP listener-owner attestation.");
  }
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (!systemRoot) {
    throw new Error("Windows system root is unavailable for listener attestation.");
  }
  const netstat = path.join(systemRoot, "System32", "netstat.exe");
  if (!existsSync(netstat) || !statSync(netstat).isFile()) {
    throw new Error("The reviewed Windows socket-attestation utility is unavailable.");
  }
  const result = spawnSync(netstat, ["-ano", "-p", "TCP"], {
    encoding: "utf8",
    env: cleanPsqlEnvironment(),
    shell: false,
    windowsHide: true,
    timeout: 5_000,
  });
  if (result.status !== 0) {
    throw new Error("Windows socket-table attestation failed before connecting.");
  }
  const localEndpoint = `127.0.0.1:${config.port}`;
  const listeners = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => (
      fields.length >= 5
      && fields[0].toUpperCase() === "TCP"
      && fields[1] === localEndpoint
      && fields[2] === "0.0.0.0:0"
      && /^[1-9][0-9]*$/.test(fields.at(-1) ?? "")
    ));
  if (listeners.length !== 1 || Number(listeners[0].at(-1)) !== pid) {
    throw new Error(
      "The exact loopback listening socket is not owned by the attested PostgreSQL PID.",
    );
  }
}

function validatePreconnectServer(config) {
  const pidFile = path.join(config.dataDirectory, "postmaster.pid");
  if (!existsSync(pidFile) || lstatSync(pidFile).isSymbolicLink()) {
    throw new Error("The exact disposable cluster postmaster.pid is unavailable.");
  }
  const lines = readFileSync(pidFile, "utf8").split(/\r?\n/);
  if (lines.length < 8 || !/^[1-9][0-9]*$/.test(lines[0])) {
    throw new Error("The disposable PostgreSQL postmaster.pid has an invalid shape.");
  }
  const pid = Number(lines[0]);
  if (
    !Number.isSafeInteger(pid)
    || !existsSync(lines[1])
    || !sameCanonicalPath(lines[1], config.dataDirectory)
    || lines[3] !== String(config.port)
    || lines[5] !== "127.0.0.1"
    || lines[7].trim() !== "ready"
  ) {
    throw new Error("The pre-connect PostgreSQL server identity is not the reviewed local cluster.");
  }
  try {
    process.kill(pid, 0);
  } catch {
    throw new Error("The disposable PostgreSQL server PID is not running.");
  }
  const postgres = path.join(
    config.clusterRoot,
    "runtime",
    "bin",
    process.platform === "win32" ? "postgres.exe" : "postgres",
  );
  if (
    !existsSync(postgres)
    || lstatSync(postgres).isSymbolicLink()
    || !statSync(postgres).isFile()
    || !sameCanonicalPath(processExecutablePath(pid), postgres)
  ) {
    throw new Error("The listener process is not the exact disposable PostgreSQL executable.");
  }
  validateLoopbackListenerOwner(config, pid);
  return Object.freeze({ pid, postgres: realpathSync(postgres) });
}

function compactFailure(result) {
  const stderr = result.stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join("\n");
  const stdout = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join("\n");
  return [stderr, stdout].filter(Boolean).join("\n--- stdout tail ---\n")
    || `exit=${result.code} signal=${result.signal ?? "none"}`;
}

function startPsql(config, {
  database = "postgres",
  sql,
  file,
  timeoutMs = 30_000,
  tuplesOnly = false,
} = {}) {
  if ((sql === undefined) === (file === undefined)) {
    throw new Error("Exactly one fixed SQL string or fixed SQL file is required.");
  }
  if (database !== "postgres" && !DATABASE_PATTERN.test(database)) {
    throw new Error("Refusing to connect to a database outside approved gate names.");
  }
  const fixedBytes = file === undefined ? undefined : config.fixedInputs.get(file);
  if (file !== undefined && fixedBytes === undefined) {
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
    `--dbname=${database}`,
  ];
  if (tuplesOnly) {
    args.push("--quiet", "--no-align", "--tuples-only", "--field-separator=|");
  }
  args.push(file === undefined ? "--command" : "--file=-");
  if (file === undefined) args.push(sql);

  const child = spawn(config.psql, args, {
    env: cleanPsqlEnvironment(),
    shell: false,
    stdio: [file === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  const startedAt = Date.now();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  if (fixedBytes !== undefined) {
    child.stdin.on("error", () => {});
    child.stdin.end(fixedBytes);
  }
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  const completed = new Promise((resolve, reject) => {
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        code,
        signal,
        stdout,
        stderr,
        elapsedMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
  return { child, completed };
}

async function runPsql(config, options, expectation = { succeeds: true }) {
  const result = await startPsql(config, options).completed;
  if (result.timedOut) throw new Error("A bounded local PostgreSQL step timed out.");
  if (expectation.succeeds && result.code !== 0) {
    throw new Error(`Local PostgreSQL step failed:\n${compactFailure(result)}`);
  }
  if (!expectation.succeeds) {
    if (result.code === 0) {
      throw new Error("A PostgreSQL operation that had to fail unexpectedly succeeded.");
    }
    if (!result.stderr.includes(expectation.errorIncludes)) {
      throw new Error(`PostgreSQL failed for the wrong reason:\n${compactFailure(result)}`);
    }
  }
  return result;
}

async function scalar(config, database, sql) {
  const result = await runPsql(config, { database, sql, tuplesOnly: true });
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`Expected one PostgreSQL scalar row, received ${lines.length}.`);
  }
  return lines[0];
}

async function createDisposableDatabase(config, database) {
  if (!DATABASE_PATTERN.test(database)) {
    throw new Error("Refusing to create a database outside approved gate names.");
  }
  const child = spawn(config.createdb, [
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--username=${config.adminRole}`,
    "--no-password",
    "--maintenance-db=postgres",
    database,
  ], {
    env: cleanPsqlEnvironment(),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 15_000);
  const result = await new Promise((resolve, reject) => {
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
  if (result.timedOut || result.code !== 0) {
    throw new Error(`Disposable database creation failed:\n${compactFailure(result)}`);
  }
}

function validateClusterProbe(config, row) {
  const fields = row.split("|");
  if (fields.length !== 12) {
    throw new Error("The PostgreSQL identity probe returned an unexpected shape.");
  }
  const [address, port, sessionUser, currentUser, database, dataDirectory,
    versionNumber, versionText, listenAddresses, ssl, superuser, recovery] = fields;
  if (
    !["127.0.0.1", "127.0.0.1/32"].includes(address)
    || port !== String(config.port)
    || sessionUser !== config.adminRole
    || currentUser !== config.adminRole
    || database !== "postgres"
    || listenAddresses !== "127.0.0.1"
    || ssl !== "off"
    || !["t", "true"].includes(superuser)
    || !["f", "false"].includes(recovery)
  ) {
    throw new Error("PostgreSQL server identity does not match the disposable local gate.");
  }
  if (
    !/^\d+$/.test(versionNumber)
    || Number(versionNumber) < 170000
    || Number(versionNumber) >= 180000
  ) {
    throw new Error("PostgreSQL major version 17 is required for this acceptance gate.");
  }
  const expectedDataDirectory = path.join(
    tmpdir(),
    `codex-flight-pg-${config.clusterGuid}`,
    "data",
  );
  if (!existsSync(dataDirectory) || !existsSync(expectedDataDirectory)) {
    throw new Error("PostgreSQL data_directory is missing from the disposable temp root.");
  }
  const actualDataDirectory = realpathSync(dataDirectory);
  const reviewedDataDirectory = realpathSync(expectedDataDirectory);
  const sameDirectory = process.platform === "win32"
    ? actualDataDirectory.toLowerCase() === reviewedDataDirectory.toLowerCase()
    : actualDataDirectory === reviewedDataDirectory;
  if (!sameDirectory) {
    throw new Error(
      "PostgreSQL data_directory is not the exact confirmed Codex disposable data path.",
    );
  }
  return Object.freeze({ versionNumber, versionText, listenAddresses, ssl });
}

const CLUSTER_ROLE_SQL = `
do $flight_stripe_gate_roles$
declare
  v_role record;
begin
  for v_role in
    select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
           rolreplication, rolbypassrls
      from pg_roles
     where rolname in ('anon', 'authenticated', 'service_role')
  loop
    if v_role.rolcanlogin or v_role.rolsuper or v_role.rolcreatedb
      or v_role.rolcreaterole or v_role.rolreplication
      or (v_role.rolname = 'service_role' and not v_role.rolbypassrls)
      or (v_role.rolname <> 'service_role' and v_role.rolbypassrls) then
      raise exception 'Existing gate role % has unsafe attributes', v_role.rolname;
    end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin noinherit nobypassrls';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin noinherit nobypassrls';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin noinherit bypassrls';
  end if;
end;
$flight_stripe_gate_roles$;
`;

const DATABASE_BOOTSTRAP_SQL = `
begin;
create schema auth;
create function auth.role()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
revoke all on function auth.role() from public;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
commit;
`;

function serviceSessionSql(body, applicationName) {
  if (!/^[a-z][a-z0-9_]{5,47}$/.test(applicationName)) {
    throw new Error("Invalid fixed concurrency application name.");
  }
  return `
select set_config('application_name', '${applicationName}', false);
select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;
${body}
reset role;
`;
}

function concurrentRecordSql(values) {
  return `
select concat_ws('|', 'PLAN_RESULT', decision, plan_id::text,
                 recorded_plan_sha256, plan_mode)
  from public.record_flight_consumer_live_stripe_payment_intent_plan_v1(
    '${values.executionScope}',
    '${values.paymentBinding}',
    '${values.orderReference}',
    '${values.customerReference}',
    '${values.paymentAttemptReference}',
    '${values.metadata}',
    '${values.requestBody}',
    '${values.requestEnvelope}',
    '${values.idempotencyRequest}',
    '${values.idempotencyKey}',
    '${values.plan}',
    ${values.amountCents}
  );`;
}

function parsePlanResult(result, label) {
  const line = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith("PLAN_RESULT|"));
  if (!line) throw new Error(`${label} did not emit a plan result.`);
  const fields = line.split("|");
  if (
    fields.length !== 5
    || !["created", "replay"].includes(fields[1])
    || !UUID_PATTERN.test(fields[2])
    || !/^[0-9a-f]{64}$/.test(fields[3])
    || fields[4] !== "zero_dispatch"
  ) {
    throw new Error(`${label} emitted a malformed plan result: ${line}`);
  }
  return Object.freeze({
    decision: fields[1],
    planId: fields[2],
    planSha256: fields[3],
    mode: fields[4],
  });
}

async function observeWinnerLock(config, applicationName, advisoryLockKey) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const count = await scalar(
      config,
      config.behaviorDatabase,
      `select count(*)::text from pg_locks as held_lock
        join pg_stat_activity as activity on activity.pid = held_lock.pid
       where held_lock.locktype = 'advisory'
         and held_lock.database = (select oid from pg_database where datname = current_database())
         and held_lock.classid = 0 and held_lock.objid = ${advisoryLockKey}
         and held_lock.granted
         and activity.application_name = '${applicationName}'`,
    );
    if (count === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Could not observe the winner's uncommitted-row advisory lock.");
}

async function observeTransactionWait(
  config,
  winnerApplicationName,
  loserApplicationName,
) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const count = await scalar(
      config,
      config.behaviorDatabase,
      `select count(*)::text
         from pg_locks as waiting_lock
         join pg_stat_activity as waiting_activity
           on waiting_activity.pid = waiting_lock.pid
         join pg_locks as held_lock
           on held_lock.locktype = 'transactionid'
          and held_lock.transactionid = waiting_lock.transactionid
          and held_lock.granted
         join pg_stat_activity as held_activity
           on held_activity.pid = held_lock.pid
        where waiting_lock.locktype = 'transactionid'
          and not waiting_lock.granted
          and waiting_activity.application_name = '${loserApplicationName}'
          and held_activity.application_name = '${winnerApplicationName}'`,
    );
    if (count === "1") return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function runExactConcurrencyProof(config) {
  const values = Object.freeze({
    executionScope: "d".repeat(64),
    paymentBinding: "e".repeat(64),
    orderReference: "f".repeat(64),
    customerReference: "0".repeat(64),
    paymentAttemptReference: "1".repeat(64),
    metadata: "2".repeat(64),
    requestBody: "3".repeat(64),
    requestEnvelope: "4".repeat(64),
    idempotencyRequest: "5".repeat(64),
    idempotencyKey: "6".repeat(64),
    plan: "7".repeat(64),
    amountCents: 27000,
  });
  const winnerApplicationName = "flight_stripe_gate_exact_winner";
  const loserApplicationName = "flight_stripe_gate_exact_loser";
  const winnerSql = serviceSessionSql(`
begin;
${concurrentRecordSql(values)}
select pg_advisory_xact_lock(${ADVISORY_LOCK_KEY});
select 'WINNER_LOCKED';
select pg_sleep(4);
commit;`, winnerApplicationName);
  const loserSql = serviceSessionSql(
    concurrentRecordSql(values),
    loserApplicationName,
  );
  const winner = startPsql(config, {
    database: config.behaviorDatabase,
    sql: winnerSql,
    tuplesOnly: true,
    timeoutMs: 15_000,
  });
  try {
    await observeWinnerLock(config, winnerApplicationName, ADVISORY_LOCK_KEY);
  } catch (error) {
    winner.child.kill();
    throw error;
  }
  const loser = startPsql(config, {
    database: config.behaviorDatabase,
    sql: loserSql,
    tuplesOnly: true,
    timeoutMs: 15_000,
  });
  const transactionWaitObserved = await observeTransactionWait(
    config,
    winnerApplicationName,
    loserApplicationName,
  );
  if (!transactionWaitObserved) {
    winner.child.kill();
    loser.child.kill();
    await Promise.allSettled([winner.completed, loser.completed]);
    throw new Error("The exact loser never blocked on the winner's transaction ID.");
  }
  const [winnerResult, loserResult] = await Promise.all([
    winner.completed,
    loser.completed,
  ]);
  for (const [label, result] of [["winner", winnerResult], ["loser", loserResult]]) {
    if (result.code !== 0 || result.timedOut) {
      throw new Error(`Concurrent ${label} failed:\n${compactFailure(result)}`);
    }
  }
  const winnerPlan = parsePlanResult(winnerResult, "Concurrent winner");
  const loserPlan = parsePlanResult(loserResult, "Concurrent loser");
  if (
    winnerPlan.decision !== "created"
    || loserPlan.decision !== "replay"
    || winnerPlan.planId !== loserPlan.planId
    || winnerPlan.planSha256 !== loserPlan.planSha256
  ) {
    throw new Error("The two-session unique-violation replay proof did not converge exactly.");
  }
  const cardinality = await scalar(
    config,
    config.behaviorDatabase,
    `select
       (select count(*) from public.flight_consumer_live_stripe_payment_intent_plans
         where plan_sha256 = '${"7".repeat(64)}')::text
       || '|'
       || (select count(*) from public.flight_consumer_live_stripe_payment_intent_plans)::text`,
  );
  if (cardinality !== "1|3") {
    throw new Error(`Concurrent replay cardinality is invalid: ${cardinality}`);
  }
  return Object.freeze({
    winner: winnerPlan,
    loser: loserPlan,
    transactionWaitObserved,
  });
}

async function runDriftConcurrencyProof(config) {
  const winnerValues = Object.freeze({
    executionScope: "8".repeat(64),
    paymentBinding: "9".repeat(64),
    orderReference: "a".repeat(64),
    customerReference: "b".repeat(64),
    paymentAttemptReference: "c".repeat(64),
    metadata: "d".repeat(64),
    requestBody: "e".repeat(64),
    requestEnvelope: "f".repeat(64),
    idempotencyRequest: "0".repeat(64),
    idempotencyKey: "1".repeat(64),
    plan: "2".repeat(64),
    amountCents: 28000,
  });
  const loserValues = Object.freeze({ ...winnerValues, metadata: "3".repeat(64) });
  const winnerApplicationName = "flight_stripe_gate_drift_winner";
  const loserApplicationName = "flight_stripe_gate_drift_loser";
  const advisoryLockKey = ADVISORY_LOCK_KEY + 1;
  const winner = startPsql(config, {
    database: config.behaviorDatabase,
    sql: serviceSessionSql(`
begin;
${concurrentRecordSql(winnerValues)}
select pg_advisory_xact_lock(${advisoryLockKey});
select 'WINNER_LOCKED';
select pg_sleep(4);
commit;`, winnerApplicationName),
    tuplesOnly: true,
    timeoutMs: 15_000,
  });
  try {
    await observeWinnerLock(config, winnerApplicationName, advisoryLockKey);
  } catch (error) {
    winner.child.kill();
    throw error;
  }
  const loser = startPsql(config, {
    database: config.behaviorDatabase,
    sql: serviceSessionSql(concurrentRecordSql(loserValues), loserApplicationName),
    tuplesOnly: true,
    timeoutMs: 15_000,
  });
  const transactionWaitObserved = await observeTransactionWait(
    config,
    winnerApplicationName,
    loserApplicationName,
  );
  if (!transactionWaitObserved) {
    winner.child.kill();
    loser.child.kill();
    await Promise.allSettled([winner.completed, loser.completed]);
    throw new Error("The drift loser never blocked on the winner's transaction ID.");
  }
  const [winnerResult, loserResult] = await Promise.all([
    winner.completed,
    loser.completed,
  ]);
  if (winnerResult.code !== 0 || winnerResult.timedOut) {
    throw new Error(`Concurrent drift winner failed:\n${compactFailure(winnerResult)}`);
  }
  if (
    loserResult.code === 0
    || loserResult.timedOut
    || !loserResult.stderr.includes("payment plan concurrency collision")
  ) {
    throw new Error(`Concurrent drift loser failed for the wrong reason:\n${compactFailure(loserResult)}`);
  }
  const winnerPlan = parsePlanResult(winnerResult, "Concurrent drift winner");
  if (winnerPlan.decision !== "created" || winnerPlan.planSha256 !== winnerValues.plan) {
    throw new Error("The concurrent drift winner did not create the reviewed plan.");
  }
  const cardinality = await scalar(
    config,
    config.behaviorDatabase,
    `select
       (select count(*) from public.flight_consumer_live_stripe_payment_intent_plans
         where plan_sha256 = '${winnerValues.plan}'
           and metadata_sha256 = '${winnerValues.metadata}')::text
       || '|'
       || (select count(*) from public.flight_consumer_live_stripe_payment_intent_plans)::text`,
  );
  if (cardinality !== "1|4") {
    throw new Error(`Concurrent drift refusal cardinality is invalid: ${cardinality}`);
  }
  return Object.freeze({
    winner: winnerPlan,
    loser: "concurrency_collision_refused",
    transactionWaitObserved,
  });
}

async function runConcurrencyProof(config) {
  const exact = await runExactConcurrencyProof(config);
  const drift = await runDriftConcurrencyProof(config);
  return Object.freeze({ exact, drift });
}

async function cleanupDisposableState(config) {
  const failures = [];
  for (const database of [config.behaviorDatabase, config.rollbackDatabase]) {
    try {
      await runPsql(config, {
        database: "postgres",
        sql: `drop database if exists ${database} with (force)`,
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  try {
    await runPsql(config, {
      database: "postgres",
      sql: "drop role if exists anon, authenticated, service_role",
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (failures.length > 0) {
    throw new Error(`Disposable PostgreSQL cleanup failed:\n${failures.join("\n")}`);
  }
}

async function runAcceptance(config, cluster) {
  await runPsql(config, { database: "postgres", sql: CLUSTER_ROLE_SQL });
  await createDisposableDatabase(config, config.behaviorDatabase);
  await createDisposableDatabase(config, config.rollbackDatabase);
  for (const database of [config.behaviorDatabase, config.rollbackDatabase]) {
    await runPsql(config, { database, sql: DATABASE_BOOTSTRAP_SQL });
    await runPsql(config, { database, file: MIGRATION_FILE });
  }

  const runtime = await runPsql(config, {
    database: config.behaviorDatabase,
    file: RUNTIME_SQL_FILE,
    timeoutMs: 45_000,
  });
  if (!runtime.stdout.includes("FLIGHT_STRIPE_PLAN_POSTGRES_GATE_PASS")) {
    throw new Error("Runtime SQL completed without its final acceptance marker.");
  }
  const concurrency = await runConcurrencyProof(config);

  await runPsql(
    config,
    { database: config.behaviorDatabase, file: ROLLBACK_FILE },
    {
      succeeds: false,
      errorIncludes: "Refusing rollback: Flight Consumer Live Stripe payment evidence exists",
    },
  );
  const preserved = await scalar(
    config,
    config.behaviorDatabase,
    `select (
       to_regclass('public.flight_consumer_live_stripe_payment_intent_plans') is not null
       and to_regprocedure('${FUNCTION_SIGNATURE}') is not null
       and has_function_privilege('service_role', '${FUNCTION_SIGNATURE}', 'EXECUTE')
       and (select relrowsecurity and relforcerowsecurity from pg_class
             where oid = 'public.flight_consumer_live_stripe_payment_intent_plans'::regclass)
       and (select count(*) = 4
              from public.flight_consumer_live_stripe_payment_intent_plans)
     )::text`,
  );
  if (!["t", "true"].includes(preserved)) {
    throw new Error("Evidence rollback refusal did not transactionally preserve the journal.");
  }

  const emptyCount = await scalar(
    config,
    config.rollbackDatabase,
    "select count(*)::text from public.flight_consumer_live_stripe_payment_intent_plans",
  );
  if (emptyCount !== "0") {
    throw new Error("The clean rollback database unexpectedly contains plan evidence.");
  }
  await runPsql(config, { database: config.rollbackDatabase, file: ROLLBACK_FILE });
  const cleanRollback = await scalar(
    config,
    config.rollbackDatabase,
    `select (
       to_regclass('public.flight_consumer_live_stripe_payment_intent_plans') is null
       and to_regprocedure('${FUNCTION_SIGNATURE}') is null
       and to_regprocedure('auth.role()') is not null
       and not exists (
         select 1 from pg_class as relation
          join pg_namespace as namespace on namespace.oid = relation.relnamespace
         where namespace.nspname = 'public'
           and relation.relname like 'flight_consumer_live_stripe_payment_intent_plans%'
       )
     )::text`,
  );
  if (!["t", "true"].includes(cleanRollback)) {
    throw new Error("Clean rollback retained migration-103 objects or removed prerequisites.");
  }

  return {
    result: "PASS",
    network: "loopback-only",
    postgresVersion: cluster.versionText,
    serverVersionNumber: cluster.versionNumber,
    listenAddresses: cluster.listenAddresses,
    ssl: cluster.ssl,
    providerTraffic: false,
    credentialsRead: false,
    serverProcessAttestedBeforeConnect: true,
    fixedSqlBytesPipedFromReviewedBuffers: true,
    migration103Sha256: FIXED_FILES[0].sha256,
    rollback103Sha256: FIXED_FILES[1].sha256,
    runtimeSqlSha256: FIXED_FILES[2].sha256,
    exactReplay: "created_then_replay",
    driftRefusals: 12,
    concurrency: {
      exactWinner: concurrency.exact.winner.decision,
      exactLoser: concurrency.exact.loser.decision,
      exactTransactionWaitObserved: concurrency.exact.transactionWaitObserved,
      driftWinner: concurrency.drift.winner.decision,
      driftLoser: concurrency.drift.loser,
      driftTransactionWaitObserved: concurrency.drift.transactionWaitObserved,
    },
    evidenceRollback: "refused_and_preserved",
    emptyRollback: "succeeded",
    behaviorRowsPreserved: 4,
  };
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const validated = validateArguments(parsed);
  const config = Object.freeze({ ...validated, fixedInputs: loadFixedInputs() });
  const lock = acquireExclusiveRunLock(config);
  let evidence;
  let primaryError;
  let cleanupArmed = false;
  try {
    validatePreconnectServer(config);
    const probe = await scalar(
      config,
      "postgres",
      `select inet_server_addr()::text, inet_server_port()::text,
              session_user::text, current_user::text, current_database()::text,
              current_setting('data_directory'), current_setting('server_version_num'),
              current_setting('server_version'), current_setting('listen_addresses'),
              current_setting('ssl'), role_row.rolsuper::text, pg_is_in_recovery()::text
         from pg_roles as role_row
        where role_row.rolname = session_user`,
    );
    const cluster = validateClusterProbe(config, probe);

    const existingTargets = await scalar(
      config,
      "postgres",
      `select count(*)::text from pg_database
        where datname in ('${config.behaviorDatabase}', '${config.rollbackDatabase}')`,
    );
    if (existingTargets !== "0") {
      throw new Error("One or both disposable target databases already exist; refusing reuse.");
    }
    const existingRoles = await scalar(
      config,
      "postgres",
      "select count(*)::text from pg_roles where rolname in ('anon', 'authenticated', 'service_role')",
    );
    if (existingRoles !== "0") {
      throw new Error("Disposable API roles already exist; refusing a non-fresh cluster.");
    }

    cleanupArmed = true;
    evidence = await runAcceptance(config, cluster);
  } catch (error) {
    primaryError = error;
  }

  let cleanupError;
  if (cleanupArmed) {
    try {
      await cleanupDisposableState(config);
    } catch (error) {
      cleanupError = error;
    }
  }
  let lockReleaseError;
  try {
    releaseExclusiveRunLock(lock);
  } catch (error) {
    lockReleaseError = error;
  }
  if (primaryError || cleanupError || lockReleaseError) {
    const messages = [primaryError, cleanupError, lockReleaseError]
      .filter(Boolean)
      .map((error) => error instanceof Error ? error.message : String(error));
    throw new Error(messages.join("\n--- gate-finalization ---\n"));
  }
  evidence.exclusiveClusterRunLockHeldThroughCleanup = true;
  evidence.disposableDatabasesDropped = true;
  evidence.disposableRolesDropped = true;
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown fail-closed error";
  process.stderr.write(`FLIGHT_STRIPE_POSTGRES_GATE_FAIL: ${message}\n`);
  process.exitCode = 1;
});
