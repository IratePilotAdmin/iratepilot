import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { assessIsolatedReplayPreflight } from "../scripts/check-isolated-native-pms-replay.mjs";

const source = JSON.parse(await readFile(new URL("../release/evidence/native-pms-source-replay-preflight-2026-10-18.json", import.meta.url), "utf8"));
const receiver = JSON.parse(await readFile(new URL("../release/evidence/native-pms-receiver-replay-preflight-2026-10-18.json", import.meta.url), "utf8"));
const now = Date.parse("2026-10-18T21:35:00-05:00");
const worker = {
  workerProject: "iratepilot-cron-rehearsal-20261005", environment: "Production",
  sourceProject: "onbdizzwwubfdgkgaphx", receiverProject: "wjosvslkselpauyftias",
  destinationUrl: "https://wjosvslkselpauyftias.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  deploymentId: "dpl_isolated_test", deploymentState: "Ready", syncEnabled: false,
  checkedAt: "2026-10-18T21:29:30-05:00", dataChanged: false,
};

test("replay stays blocked until a disabled encrypted credential is recorded", () => {
  const result = assessIsolatedReplayPreflight(source, receiver, worker, now);
  assert.equal(result.ready, false);
  assert.deepEqual(result.failures, ["source disabledCredentialScope must equal 1"]);
});

test("exact fresh source and receiver baselines qualify only the preflight", () => {
  const readySource = { ...source, result: { ...source.result, disabledCredentialScope: 1 } };
  assert.deepEqual(assessIsolatedReplayPreflight(readySource, receiver, worker, now), { ready: true, failures: [] });
  assert.match(assessIsolatedReplayPreflight(readySource, receiver, worker, now + 16 * 60 * 1000).failures.join(" "), /older than 15 minutes/);
  assert.match(assessIsolatedReplayPreflight(readySource, { ...receiver, result: { ...receiver.result, replayBookingReceipts: 1 } }, worker, now).failures.join(" "), /replayBookingReceipts/);
});

test("preflight rejects an unverified or enabled scheduled worker", () => {
  const readySource = { ...source, result: { ...source.result, disabledCredentialScope: 1 } };
  assert.match(assessIsolatedReplayPreflight(readySource, receiver, null, now).failures.join(" "), /worker/);
  assert.match(assessIsolatedReplayPreflight(readySource, receiver, { ...worker, syncEnabled: true }, now).failures.join(" "), /worker must be disabled/);
});
