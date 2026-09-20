import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  TARGETS,
  buildSqlEditorTargetBoundSql,
  readAndAssertArtifacts,
} from "./manage-flight-consumer-stripe-test-journal-104.mjs";

const PHASES = new Set(["preflight", "verification"]);

function usage() {
  return `Usage:
  node scripts/render-flight-consumer-stripe-test-journal-104-managed-sql.mjs \\
    --target=isolated_uat|preview_runtime \\
    --phase=preflight|verification

The renderer writes only exact target-bound SQL to stdout. Migration 104 is
deliberately not renderable: apply its canonical hash-pinned file unchanged.`;
}

export function parseRenderArgs(argv) {
  const values = {};
  for (const token of argv) {
    const separator = token.indexOf("=");
    if (separator <= 2) {
      throw new Error(usage());
    }
    const name = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (!new Set(["--target", "--phase"]).has(name)) {
      throw new Error(`Unknown renderer flag ${name}.\n\n${usage()}`);
    }
    if (Object.hasOwn(values, name)) {
      throw new Error(`Duplicate renderer flag ${name}.`);
    }
    values[name] = value;
  }
  const targetKind = values["--target"];
  const phase = values["--phase"];
  if (!Object.hasOwn(TARGETS, targetKind)) {
    throw new Error(`An explicit approved managed target is required.\n\n${usage()}`);
  }
  if (!PHASES.has(phase)) {
    throw new Error(`An explicit non-apply render phase is required.\n\n${usage()}`);
  }
  return Object.freeze({ target: TARGETS[targetKind], phase });
}

export function renderManagedSql({
  target,
  phase,
  artifacts = readAndAssertArtifacts(),
}) {
  if (!Object.values(TARGETS).includes(target) || !PHASES.has(phase)) {
    throw new Error("Refusing an unapproved SQL Editor render target or phase.");
  }
  return buildSqlEditorTargetBoundSql(artifacts[phase], target);
}

export function main(argv = process.argv.slice(2)) {
  const config = parseRenderArgs(argv);
  process.stdout.write(renderManagedSql(config));
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
