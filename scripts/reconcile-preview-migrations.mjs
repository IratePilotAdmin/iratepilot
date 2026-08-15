import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const REQUIRED_PREVIEW_BASELINE = [
  "202608140050",
  "202608140051",
  "202608140052",
];

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

function runSupabase(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Supabase CLI exited with status ${result.status}.`);
}

export function reconcilePreviewMigrations(env = process.env, argv = process.argv.slice(2)) {
  const plan = assertPreviewMigrationTarget(env);
  const safeSummary = {
    projectRef: plan.projectRef,
    requiredBaseline: REQUIRED_PREVIEW_BASELINE,
    latestRepositoryMigration: plan.migrationVersions.at(-1),
  };

  if (argv.includes("--plan")) {
    console.log(JSON.stringify(safeSummary, null, 2));
    return safeSummary;
  }

  const command = env.SUPABASE_CLI_PATH?.trim() || "supabase";
  const common = ["--db-url", plan.databaseUrl, "--include-all"];
  runSupabase(command, ["db", "push", ...common, "--dry-run"], env);
  runSupabase(command, ["db", "push", ...common, "--yes"], env);
  runSupabase(command, ["migration", "list", "--db-url", plan.databaseUrl], env);
  return safeSummary;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  reconcilePreviewMigrations();
}
