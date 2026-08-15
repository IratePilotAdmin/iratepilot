import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const REQUIRED_PREVIEW_BASELINE = [
  "202608140050",
  "202608140051",
  "202608140052",
];

export const APPROVED_PREVIEW_PENDING = ["202608140053"];

export const PRODUCTION_PROJECT_REF = "allliumarkejinplrggl";

export function listMigrationVersions(directoryUrl = new URL("../supabase/migrations/", import.meta.url)) {
  return readdirSync(directoryUrl)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => name.split("_")[0]);
}

export function assertPreviewMigrationTarget(env, migrationVersions = listMigrationVersions()) {
  const databaseUrl = env.PREVIEW_SUPABASE_DB_URL?.trim();
  const projectRef = env.PREVIEW_SUPABASE_PROJECT_REF?.trim();
  const additionalBlockedRef = env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();

  if (!databaseUrl || !projectRef) {
    throw new Error("PREVIEW_SUPABASE_DB_URL and PREVIEW_SUPABASE_PROJECT_REF are required.");
  }
  if (projectRef === PRODUCTION_PROJECT_REF || projectRef === additionalBlockedRef) {
    throw new Error("Refusing to reconcile the production Supabase project.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("PREVIEW_SUPABASE_DB_URL must be a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("PREVIEW_SUPABASE_DB_URL must use the PostgreSQL protocol.");
  }

  const targetIdentity = `${parsed.hostname} ${decodeURIComponent(parsed.username)}`;
  if (!targetIdentity.includes(projectRef)) {
    throw new Error("The Preview database URL does not match PREVIEW_SUPABASE_PROJECT_REF.");
  }
  if (targetIdentity.includes(PRODUCTION_PROJECT_REF) || (additionalBlockedRef && targetIdentity.includes(additionalBlockedRef))) {
    throw new Error("Refusing to reconcile a production Supabase database URL.");
  }

  for (const version of REQUIRED_PREVIEW_BASELINE) {
    if (!migrationVersions.includes(version)) {
      throw new Error(`Required Preview migration ${version} is missing from the repository.`);
    }
  }

  return { databaseUrl, projectRef, migrationVersions };
}

export function parseMigrationListOutput(output) {
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.split(/[|│]/).map((column) => column.trim()))
    .filter((columns) => columns.length >= 2)
    .map(([local, remote]) => ({
      local: /^\d+$/.test(local) ? local : undefined,
      remote: /^\d+$/.test(remote) ? remote : undefined,
    }))
    .filter(({ local, remote }) => local || remote);

  if (rows.length === 0) {
    throw new Error("Unable to parse the remote Preview migration ledger.");
  }

  return {
    localVersions: [...new Set(rows.flatMap(({ local }) => local ? [local] : []))],
    remoteVersions: [...new Set(rows.flatMap(({ remote }) => remote ? [remote] : []))],
  };
}

function sameVersions(actual, expected) {
  return actual.length === expected.length && actual.every((version, index) => version === expected[index]);
}

export function assertPreviewRemoteMigrationState(
  output,
  migrationVersions = listMigrationVersions(),
  allowedPendingSets = [APPROVED_PREVIEW_PENDING, []],
) {
  const { localVersions, remoteVersions } = parseMigrationListOutput(output);
  const expectedLocal = [...migrationVersions].sort();
  const listedLocal = [...localVersions].sort();
  const listedRemote = [...remoteVersions].sort();

  if (!sameVersions(listedLocal, expectedLocal)) {
    throw new Error("Preview migration list does not match the repository migration set.");
  }

  const expectedSet = new Set(expectedLocal);
  const unexpectedRemote = listedRemote.filter((version) => !expectedSet.has(version));
  if (unexpectedRemote.length > 0) {
    throw new Error(`Preview migration ledger contains unexpected version(s): ${unexpectedRemote.join(", ")}.`);
  }

  const remoteSet = new Set(listedRemote);
  const pendingVersions = expectedLocal.filter((version) => !remoteSet.has(version));
  const allowed = allowedPendingSets.some((candidate) => sameVersions(
    [...pendingVersions].sort(),
    [...candidate].sort(),
  ));
  if (!allowed) {
    throw new Error(`Preview migration ledger has an unapproved pending set: ${pendingVersions.join(", ") || "none"}.`);
  }

  for (const version of REQUIRED_PREVIEW_BASELINE) {
    if (!remoteSet.has(version)) {
      throw new Error(`Required Preview migration ${version} is missing from the remote ledger.`);
    }
  }

  return { localVersions: listedLocal, remoteVersions: listedRemote, pendingVersions };
}

export function assertPreviewDryRun(output, pendingVersions, migrationVersions = listMigrationVersions()) {
  const mentionedVersions = migrationVersions.filter((version) => (
    new RegExp(`(^|\\D)${version}(?!\\d)`, "m").test(output)
  ));

  if (!sameVersions([...mentionedVersions].sort(), [...pendingVersions].sort())) {
    throw new Error(`Supabase dry run does not match the approved pending set: ${mentionedVersions.join(", ") || "none"}.`);
  }

  return mentionedVersions;
}

function runSupabase(command, args, env, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    env,
    stdio: capture ? "pipe" : "inherit",
    encoding: capture ? "utf8" : undefined,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Supabase CLI exited with status ${result.status}.`);
  return capture ? `${result.stdout ?? ""}\n${result.stderr ?? ""}` : "";
}

export function reconcilePreviewMigrations(
  env = process.env,
  argv = process.argv.slice(2),
  runner = runSupabase,
) {
  const plan = assertPreviewMigrationTarget(env);
  const safeSummary = {
    projectRef: plan.projectRef,
    requiredBaseline: REQUIRED_PREVIEW_BASELINE,
    approvedPendingVersions: APPROVED_PREVIEW_PENDING,
    latestRepositoryMigration: plan.migrationVersions.at(-1),
  };

  if (argv.includes("--plan")) {
    console.log(JSON.stringify(safeSummary, null, 2));
    return safeSummary;
  }

  const command = env.SUPABASE_CLI_PATH?.trim() || "supabase";
  const common = ["--db-url", plan.databaseUrl];
  const beforeOutput = runner(
    command,
    ["migration", "list", ...common],
    env,
    { capture: true },
  );
  const before = assertPreviewRemoteMigrationState(beforeOutput, plan.migrationVersions);

  if (before.pendingVersions.length === 0) {
    return { ...safeSummary, applied: false, pendingBefore: [], pendingAfter: [] };
  }

  const dryRunOutput = runner(
    command,
    ["db", "push", ...common, "--dry-run"],
    env,
    { capture: true },
  );
  assertPreviewDryRun(dryRunOutput, before.pendingVersions, plan.migrationVersions);
  runner(command, ["db", "push", ...common, "--yes"], env);

  const afterOutput = runner(
    command,
    ["migration", "list", ...common],
    env,
    { capture: true },
  );
  const after = assertPreviewRemoteMigrationState(afterOutput, plan.migrationVersions, [[]]);
  return {
    ...safeSummary,
    applied: true,
    pendingBefore: before.pendingVersions,
    pendingAfter: after.pendingVersions,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  reconcilePreviewMigrations();
}
