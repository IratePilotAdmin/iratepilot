import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkIsolatedWorkerOff } from "./isolated-native-pms-worker-evidence.mjs";

const SOURCE_PROJECT = "onbdizzwwubfdgkgaphx";
const RECEIVER_PROJECT = "wjosvslkselpauyftias";
const MAX_AGE_MS = 15 * 60 * 1000;

function exactResults(actual, expected, label, failures) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    failures.push(`${label} result is missing`);
    return;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) failures.push(`${label} ${key} must equal ${value}`);
  }
}

export function assessIsolatedReplayPreflight(source, receiver, worker, now = Date.now()) {
  const failures = [];
  if (source?.sourceProject !== SOURCE_PROJECT || receiver?.receiverProject !== RECEIVER_PROJECT) {
    failures.push("isolated project IDs do not match the approved replay");
  }
  if (source?.dataChanged !== false || receiver?.dataChanged !== false) {
    failures.push("preflight must be read-only");
  }
  for (const [label, report] of [["source", source], ["receiver", receiver]]) {
    const checkedAt = Date.parse(report?.checkedAt ?? "");
    if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > MAX_AGE_MS) {
      failures.push(`${label} preflight is missing, future-dated, or older than 15 minutes`);
    }
  }
  exactResults(source?.result, {
    disabledSourceScope: 1,
    disabledCredentialScope: 1,
    cancelledSyntheticBooking: 1,
    restoredSourceNight: 1,
    duePendingEvents: 2,
    dueDistinctVersions: 2,
    unexpectedEventStates: 0,
  }, "source", failures);
  exactResults(receiver?.result, {
    disabledMatchingConnection: 1,
    activeMappedPlan: 1,
    mappedNightlyRate: 1,
    availableUnit: 1,
    replayBookingReceipts: 0,
    stayChangeCommands: 0,
  }, "receiver", failures);
  failures.push(...checkIsolatedWorkerOff(worker, now));
  return { ready: failures.length === 0, failures };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [sourcePath, receiverPath, workerPath] = process.argv.slice(2);
  if (!sourcePath || !receiverPath || !workerPath) {
    console.error("Usage: node scripts/check-isolated-native-pms-replay.mjs SOURCE_EVIDENCE.json RECEIVER_EVIDENCE.json WORKER_EVIDENCE.json");
    process.exitCode = 2;
  } else {
    try {
      const [source, receiver, worker] = await Promise.all([sourcePath, receiverPath, workerPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
      const result = assessIsolatedReplayPreflight(source, receiver, worker);
      console.log(result.ready ? "Isolated two-event replay preflight ready; delivery remains disabled until supervised activation." : `Replay blocked:\n${result.failures.map((failure) => `- ${failure}`).join("\n")}`);
      if (!result.ready) process.exitCode = 1;
    } catch {
      console.error("Replay blocked: evidence files could not be read or parsed.");
      process.exitCode = 2;
    }
  }
}
