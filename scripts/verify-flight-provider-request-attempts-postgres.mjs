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
const SQL_RUNTIME_FILE = path.join(
  REPOSITORY_ROOT,
  "tests",
  "postgres",
  "flight-provider-request-attempts-runtime.sql",
);

const FIXED_FILES = Object.freeze([
  Object.freeze({
    label: "migration 068",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608230068_flight_commerce_foundation.sql",
    ),
    sha256: "29f8cb9a45f69e7da23bffdf185ff6eaab2a514a35a22da4aa4b8c91cf08ef7d",
  }),
  Object.freeze({
    label: "migration 069",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "migrations",
      "202608240069_flight_provider_request_attempts.sql",
    ),
    sha256: "7e966c4fa6f08a92692787dd82fadd4c0205af02826342a3902037438b1bd611",
  }),
  Object.freeze({
    label: "rollback 069",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "rollbacks",
      "202608240069_flight_provider_request_attempts.rollback.sql",
    ),
    sha256: "16fee4c1e7b4fdcf14a68a06f3e09b43947d7dde4643b5ed6b30d43f8c6ba30d",
  }),
  Object.freeze({
    label: "rollback 068",
    path: path.join(
      REPOSITORY_ROOT,
      "supabase",
      "rollbacks",
      "202608230068_flight_commerce_foundation.rollback.sql",
    ),
    sha256: "7013118e4f5a42b8f883f75aaa06abaeb68c51dd489be4844cd86a9cc3a6b1ae",
  }),
  Object.freeze({
    label: "PostgreSQL runtime acceptance SQL",
    path: SQL_RUNTIME_FILE,
    sha256: "3f1893cd92b3f896eb2ed76347dc0b9f5280387bc6be64386061e5da5ec18edb",
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

const CONFIRMATION = "APPLY_068_069_LOCAL_ONLY";
const DATABASE_PATTERN = /^flight_gate_[a-z0-9](?:[a-z0-9_]{6,46}[a-z0-9])$/;
const ROLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ATTEMPT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLUSTER_GUID_PATTERN = /^[0-9a-f]{32}$/;

const ADMIN_PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const HASHES = Object.freeze({
  activation: "a".repeat(64),
  scope: "b".repeat(64),
  adapterVersion: "c".repeat(64),
  providerAccount: "d".repeat(64),
  contentScope: "e".repeat(64),
  adapterSource: "f".repeat(64),
  providerReceipt: "1".repeat(64),
  authorityReceipt: "2".repeat(64),
  terminalReceipt: "9".repeat(64),
});

function usage() {
  return `Usage:
  node scripts/verify-flight-provider-request-attempts-postgres.mjs \\
    --psql <absolute-local-psql-path> \\
    --host 127.0.0.1 \\
    --port <49152-65535> \\
    --admin-role <local-superuser-role> \\
    --primary-db flight_gate_<unique_name> \\
    --rollback-db flight_gate_<different_unique_name> \\
    --cluster-guid <guid-from-codex-flight-pg-temp-path> \\
    --confirm-disposable ${CONFIRMATION}

The runner creates exactly the two named, previously nonexistent databases and
leaves them in place as acceptance evidence. It never accepts a connection URL,
password, environment name, migration path, or remote host.`;
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
  for (const [label, database] of [
    ["primary", parsed.primaryDatabase],
    ["rollback", parsed.rollbackDatabase],
  ]) {
    if (!DATABASE_PATTERN.test(database)) {
      throw new Error(
        `${label} database must be a strict disposable flight_gate_* identifier.`,
      );
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

  if (!path.isAbsolute(parsed.psql)) {
    throw new Error("psql must be supplied as an absolute local filesystem path.");
  }
  if (!existsSync(parsed.psql)) {
    throw new Error("The explicit psql path does not exist.");
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

  const createdbCandidate = path.join(
    path.dirname(psql),
    process.platform === "win32" ? "createdb.exe" : "createdb",
  );
  if (!existsSync(createdbCandidate)) {
    throw new Error("The reviewed psql runtime must include its sibling createdb executable.");
  }
  const createdb = realpathSync(createdbCandidate);
  if (!statSync(createdb).isFile()) {
    throw new Error("The sibling createdb path is not a local file.");
  }

  return Object.freeze({ ...parsed, port, psql, createdb });
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
      throw new Error(
        `${item.label} bytes are not the reviewed acceptance bytes (${actual}).`,
      );
    }
  }
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
    if (typeof value === "string" && value.length > 0) {
      clean[name] = value;
    }
  }

  const nonexistentPassFile = path.join(REPOSITORY_ROOT, ".flight-gate-no-pgpass");
  if (existsSync(nonexistentPassFile)) {
    throw new Error("Reserved no-password sentinel path unexpectedly exists.");
  }
  clean.PGPASSFILE = nonexistentPassFile;
  clean.PGSERVICEFILE = nonexistentPassFile;
  clean.PGSYSCONFDIR = REPOSITORY_ROOT;
  clean.PGSSLMODE = "disable";
  clean.PGCONNECT_TIMEOUT = "5";
  return clean;
}

function startPsql(config, {
  database = "postgres",
  sql,
  file,
  variables = {},
  timeoutMs = 30_000,
  tuplesOnly = false,
} = {}) {
  if ((sql === undefined) === (file === undefined)) {
    throw new Error("Exactly one fixed SQL string or fixed SQL file is required.");
  }
  if (database !== "postgres" && !DATABASE_PATTERN.test(database)) {
    throw new Error("Refusing to connect to a database outside the approved gate names.");
  }
  if (file !== undefined && !FIXED_FILES.some((item) => item.path === file)
      && file !== SQL_RUNTIME_FILE) {
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
  for (const [name, value] of Object.entries(variables)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !/^[A-Za-z0-9_]+$/.test(value)) {
      throw new Error("Refusing an unsafe psql variable.");
    }
    args.push(`--set=${name}=${value}`);
  }
  if (file !== undefined) {
    args.push(`--file=${file}`);
  } else {
    args.push("--command", sql);
  }

  const child = spawn(config.psql, args, {
    env: cleanPsqlEnvironment(),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  const startedAt = Date.now();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

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

  async function waitForOutput(marker, waitMs = 5_000) {
    if (stdout.includes(marker)) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.stdout.off("data", inspect);
        reject(new Error(`Timed out waiting for PostgreSQL marker: ${marker}`));
      }, waitMs);
      function inspect() {
        if (stdout.includes(marker)) {
          clearTimeout(timer);
          child.stdout.off("data", inspect);
          resolve();
        }
      }
      child.stdout.on("data", inspect);
    });
  }

  return { child, completed, waitForOutput };
}

async function createDisposableDatabase(config, database) {
  if (!DATABASE_PATTERN.test(database)) {
    throw new Error("Refusing to create a database outside the approved gate names.");
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
    .slice(-6)
    .join("\n");
  const output = [stderr, stdout].filter(Boolean).join("\n--- stdout tail ---\n");
  return output || `exit=${result.code} signal=${result.signal ?? "none"}`;
}

async function runPsql(config, options, expectation = { succeeds: true }) {
  const result = await startPsql(config, options).completed;
  if (result.timedOut) {
    throw new Error("A bounded local PostgreSQL step timed out.");
  }
  if (expectation.succeeds && result.code !== 0) {
    throw new Error(`Local PostgreSQL step failed:\n${compactFailure(result)}`);
  }
  if (!expectation.succeeds) {
    if (result.code === 0) {
      throw new Error("A PostgreSQL operation that had to fail unexpectedly succeeded.");
    }
    if (!result.stderr.includes(expectation.errorIncludes)) {
      throw new Error(
        `PostgreSQL failed for the wrong reason:\n${compactFailure(result)}`,
      );
    }
  }
  return result;
}

async function scalar(config, database, sql) {
  const result = await runPsql(config, {
    database,
    sql,
    tuplesOnly: true,
  });
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`Expected one PostgreSQL scalar row, received ${lines.length}.`);
  }
  return lines[0];
}

function validateClusterProbe(config, row) {
  const fields = row.split("|");
  if (fields.length !== 9) {
    throw new Error("The PostgreSQL identity probe returned an unexpected shape.");
  }
  const [address, port, sessionUser, currentUser, database, dataDirectory,
    versionNumber, superuser, recovery] = fields;
  if (
    !["127.0.0.1", "127.0.0.1/32"].includes(address)
    || port !== String(config.port)
    || sessionUser !== config.adminRole
    || currentUser !== config.adminRole
    || database !== "postgres"
    || !["t", "true"].includes(superuser)
    || !["f", "false"].includes(recovery)
  ) {
    throw new Error("PostgreSQL server identity does not match the disposable local gate.");
  }
  if (!/^\d+$/.test(versionNumber) || Number(versionNumber) < 140000) {
    throw new Error("PostgreSQL 14 or newer is required for this acceptance gate.");
  }

  const normalized = dataDirectory.replaceAll("\\", "/").toLowerCase();
  const escapedGuid = config.clusterGuid.replaceAll("-", "\\-");
  const sameSegment = new RegExp(
    `(?:^|/)codex-flight-pg-[^/]*${escapedGuid}[^/]*(?:/|$)`,
  );
  const nestedSegment = new RegExp(
    `(?:^|/)codex-flight-pg/${escapedGuid}(?:/|$)`,
  );
  if (!sameSegment.test(normalized) && !nestedSegment.test(normalized)) {
    throw new Error(
      "PostgreSQL data_directory is not inside the confirmed codex-flight-pg GUID path.",
    );
  }
}

const CLUSTER_ROLE_SQL = `
do $flight_gate_roles$
declare
  v_role record;
begin
  if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) then
    for v_role in
      select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
             rolreplication, rolbypassrls
        from pg_roles
       where rolname in ('anon', 'authenticated', 'service_role')
    loop
      if v_role.rolcanlogin or v_role.rolsuper or v_role.rolcreatedb
        or v_role.rolcreaterole or v_role.rolreplication
        or (v_role.rolname <> 'service_role' and v_role.rolbypassrls)
        or (v_role.rolname = 'service_role' and not v_role.rolbypassrls) then
        raise exception 'Existing Supabase-compatible role % has unsafe attributes', v_role.rolname;
      end if;
    end loop;
  end if;

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
$flight_gate_roles$;
`;

const DATABASE_BOOTSTRAP_SQL = `
begin;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

create function auth.uid()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.role()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create function auth.jwt()
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is not null
      then current_setting('request.jwt.claims', true)::jsonb
    else jsonb_build_object(
      'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
      'role', nullif(current_setting('request.jwt.claim.role', true), '')
    )
  end
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt()
  to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('customer', 'agent', 'admin'))
);
grant select on table public.profiles to authenticated, service_role;

insert into auth.users (id, email)
values ('${ADMIN_PROFILE_ID}', 'flight-gate-admin.invalid');
insert into public.profiles (id, role)
values ('${ADMIN_PROFILE_ID}', 'admin');
commit;
`;

function serviceSessionSql(body) {
  return `
select set_config('request.jwt.claim.role', 'service_role', false);
select set_config('app.flight_execution_authorized', 'true', false);
select set_config('app.flight_environment', 'test', false);
select set_config('app.flight_project_ref', 'flight_gate_local', false);
select set_config('app.flight_activation_evidence_sha256', '${HASHES.activation}', false);
select set_config('app.flight_adapter_source_sha256', '${HASHES.adapterSource}', false);
select set_config('app.flight_provider_binding_receipt_sha256', '${HASHES.providerReceipt}', false);
select set_config('app.flight_request_authority_receipt_sha256', '${HASHES.authorityReceipt}', false);
set role service_role;
${body}
reset role;
`;
}

async function applyReviewedMigrations(config, database) {
  await runPsql(config, {
    database,
    file: FIXED_FILES[0].path,
    timeoutMs: 45_000,
  });
  await runPsql(config, {
    database,
    file: FIXED_FILES[1].path,
    timeoutMs: 30_000,
  });
}

async function runConcurrencyProof(config) {
  const attemptId = await scalar(
    config,
    config.primaryDatabase,
    `select id::text from public.flight_provider_request_attempts
      where request_sha256 = '${"8".repeat(64)}' and state = 'prepared'`,
  );
  if (!ATTEMPT_UUID_PATTERN.test(attemptId)) {
    throw new Error("Concurrency fixture did not resolve to one prepared attempt UUID.");
  }

  const winnerSql = serviceSessionSql(`
begin;
select attempt_state
  from public.claim_flight_provider_request_attempt_for_dispatch('${attemptId}', 0);
select pg_advisory_xact_lock(688069);
select pg_sleep(1.5);
commit;`);
  const loserSql = serviceSessionSql(`
select attempt_state
  from public.claim_flight_provider_request_attempt_for_dispatch('${attemptId}', 0);`);

  const winner = startPsql(config, {
    database: config.primaryDatabase,
    sql: winnerSql,
    timeoutMs: 12_000,
  });
  let claimLockObserved = false;
  for (let check = 0; check < 20; check += 1) {
    const lockCount = await scalar(
      config,
      config.primaryDatabase,
      `select count(*)::text from pg_locks
        where locktype = 'advisory' and classid = 0 and objid = 688069 and granted`,
    );
    if (lockCount === "1") {
      claimLockObserved = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!claimLockObserved) {
    throw new Error("Could not observe the winner's post-claim transaction lock.");
  }
  const loser = startPsql(config, {
    database: config.primaryDatabase,
    sql: loserSql,
    timeoutMs: 12_000,
  });

  const [winnerResult, loserResult] = await Promise.all([
    winner.completed,
    loser.completed,
  ]);
  if (winnerResult.code !== 0 || winnerResult.timedOut) {
    throw new Error(`Concurrent claim winner failed:\n${compactFailure(winnerResult)}`);
  }
  if (
    loserResult.code === 0
    || loserResult.timedOut
    || !loserResult.stderr.includes("Flight provider request dispatch CAS failed")
    || loserResult.elapsedMs < 500
  ) {
    throw new Error(`Concurrent loser did not block then fail exact CAS:\n${compactFailure(loserResult)}`);
  }

  await runPsql(config, {
    database: config.primaryDatabase,
    sql: serviceSessionSql(`
select attempt_state
  from public.complete_flight_provider_request_attempt(
    '${attemptId}', 1, 'ambiguous', null, null, null, '${HASHES.terminalReceipt}'
  );`),
  });
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const config = validateArguments(parsed);
  validateFixedInputs();

  const probe = await scalar(
    config,
    "postgres",
    `select inet_server_addr()::text, inet_server_port()::text,
            session_user::text, current_user::text, current_database()::text,
            current_setting('data_directory'), current_setting('server_version_num'),
            r.rolsuper::text, pg_is_in_recovery()::text
       from pg_roles r
      where r.rolname = session_user`,
  );
  validateClusterProbe(config, probe);

  await runPsql(config, { database: "postgres", sql: CLUSTER_ROLE_SQL });

  const existingTargets = await scalar(
    config,
    "postgres",
    `select count(*)::text from pg_database
      where datname in ('${config.primaryDatabase}', '${config.rollbackDatabase}')`,
  );
  if (existingTargets !== "0") {
    throw new Error("One or both disposable target databases already exist; refusing reuse.");
  }

  await createDisposableDatabase(config, config.primaryDatabase);
  await createDisposableDatabase(config, config.rollbackDatabase);

  for (const database of [config.primaryDatabase, config.rollbackDatabase]) {
    await runPsql(config, { database, sql: DATABASE_BOOTSTRAP_SQL });
    await applyReviewedMigrations(config, database);
  }

  await runPsql(
    config,
    { database: config.rollbackDatabase, file: FIXED_FILES[3].path },
    {
      succeeds: false,
      errorIncludes: "Refusing rollback: flight provider request-attempt migration 069 is still installed",
    },
  );
  const dependencyRefusalPreserved = await scalar(
    config,
    config.rollbackDatabase,
    `select (
       to_regclass('public.flight_runtime_controls') is not null
       and to_regclass('public.flight_provider_request_attempts') is not null
     )::text`,
  );
  if (dependencyRefusalPreserved !== "true" && dependencyRefusalPreserved !== "t") {
    throw new Error("068 dependency-order rollback refusal did not preserve both migrations.");
  }

  const runtime = await runPsql(config, {
    database: config.primaryDatabase,
    file: SQL_RUNTIME_FILE,
    variables: {
      gate_database: config.primaryDatabase,
      gate_admin_role: config.adminRole,
    },
    timeoutMs: 45_000,
  });
  if (!runtime.stdout.includes("FLIGHT_GATE_RUNTIME_SQL_PASS")) {
    throw new Error("Runtime SQL completed without its final acceptance marker.");
  }

  await runConcurrencyProof(config);

  const terminalSummary = await scalar(
    config,
    config.primaryDatabase,
    `select string_agg(state || ':' || count::text, ',' order by state)
       from (
         select state, count(*) from public.flight_provider_request_attempts group by state
       ) states`,
  );
  for (const requiredState of ["ambiguous:2", "blocked:1", "failed:1", "succeeded:1"]) {
    if (!terminalSummary.split(",").includes(requiredState)) {
      throw new Error(`Final lifecycle evidence is incomplete: ${terminalSummary}`);
    }
  }

  await runPsql(
    config,
    { database: config.primaryDatabase, file: FIXED_FILES[2].path },
    {
      succeeds: false,
      errorIncludes: "Refusing rollback: flight provider request-attempt evidence exists",
    },
  );
  await runPsql(
    config,
    { database: config.primaryDatabase, file: FIXED_FILES[3].path },
    {
      succeeds: false,
      errorIncludes: "Refusing rollback: flight provider request-attempt migration 069 is still installed",
    },
  );

  const preserved = await scalar(
    config,
    config.primaryDatabase,
    `select (
       to_regclass('public.flight_provider_request_attempts') is not null
       and to_regclass('public.flight_runtime_controls') is not null
       and (select count(*) from public.flight_provider_request_attempts) = 5
     )::text`,
  );
  if (preserved !== "true" && preserved !== "t") {
    throw new Error("Rollback-refusal evidence was not transactionally preserved.");
  }

  await runPsql(config, {
    database: config.rollbackDatabase,
    file: FIXED_FILES[2].path,
  });
  await runPsql(config, {
    database: config.rollbackDatabase,
    file: FIXED_FILES[3].path,
    timeoutMs: 45_000,
  });

  const cleanRollback = await scalar(
    config,
    config.rollbackDatabase,
    `select (
       not exists (
         select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname like 'flight\\_%' escape '\\'
       )
       and not exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like '%flight%'
       )
       and to_regclass('public.profiles') is not null
       and to_regclass('auth.users') is not null
     )::text`,
  );
  if (cleanRollback !== "true" && cleanRollback !== "t") {
    throw new Error("Clean rollback database retained flight migration objects.");
  }

  const evidence = {
    result: "PASS",
    network: "loopback-only",
    providerTraffic: false,
    credentialsRead: false,
    primaryDatabase: config.primaryDatabase,
    rollbackDatabase: config.rollbackDatabase,
    primaryDisposition: "preserved with lifecycle and rollback-refusal evidence",
    rollbackDisposition: "069 and 068 cleanly rolled back; prerequisites preserved",
    migration068Sha256: FIXED_FILES[0].sha256,
    migration069Sha256: FIXED_FILES[1].sha256,
    rollback069Sha256: FIXED_FILES[2].sha256,
    rollback068Sha256: FIXED_FILES[3].sha256,
    terminalStates: terminalSummary,
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown fail-closed error";
  process.stderr.write(`FLIGHT_POSTGRES_GATE_FAIL: ${message}\n`);
  process.exitCode = 1;
});
