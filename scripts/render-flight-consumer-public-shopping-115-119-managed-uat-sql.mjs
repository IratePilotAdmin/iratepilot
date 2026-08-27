import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  TARGETS,
  buildSqlEditorTargetBoundSql,
  readAndAssertArtifacts,
} from "./manage-flight-consumer-public-shopping-115-119-uat.mjs";

const PHASES = new Set(["preflight", "verification"]);

function usage() {
  return `Usage:
  node scripts/render-flight-consumer-public-shopping-115-119-managed-uat-sql.mjs \\
    --target=isolated_uat \\
    --phase=preflight|verification

Only target-bound diagnostic SQL is rendered. Canonical migrations 115-119
must remain exact hash-pinned files and are deliberately not renderable here.`;
}

export function parseRenderArgs(argv) {
  const values = {};
  for (const token of argv) {
    const separator = token.indexOf("=");
    if (separator <= 2) throw new Error(usage());
    const name = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (!["--target", "--phase"].includes(name)) {
      throw new Error(`Unknown renderer flag ${name}.\n\n${usage()}`);
    }
    if (Object.hasOwn(values, name)) throw new Error(`Duplicate flag ${name}.`);
    values[name] = value;
  }
  if (!Object.hasOwn(TARGETS, values["--target"])) {
    throw new Error(`The exact isolated UAT target is required.\n\n${usage()}`);
  }
  if (!PHASES.has(values["--phase"])) {
    throw new Error(`An explicit non-apply render phase is required.\n\n${usage()}`);
  }
  return Object.freeze({
    target: TARGETS[values["--target"]],
    phase: values["--phase"],
  });
}

export function renderManagedSql({
  target,
  phase,
  artifacts = readAndAssertArtifacts(),
}) {
  if (target !== TARGETS.isolated_uat || !PHASES.has(phase)) {
    throw new Error("Refusing an unapproved SQL Editor target or phase.");
  }
  return buildSqlEditorTargetBoundSql(artifacts[phase], target);
}

export function main(argv = process.argv.slice(2)) {
  process.stdout.write(renderManagedSql(parseRenderArgs(argv)));
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
