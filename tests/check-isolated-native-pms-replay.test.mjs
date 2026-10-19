import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { assessIsolatedReplayPreflight } from "../scripts/check-isolated-native-pms-replay.mjs";

const source = JSON.parse(await readFile(new URL("../release/evidence/native-pms-source-replay-preflight-2026-10-18.json", import.meta.url), "utf8"));
const receiver = JSON.parse(await readFile(new URL("../release/evidence/native-pms-receiver-replay-preflight-2026-10-18.json", import.meta.url), "utf8"));
const now = Date.parse("2026-10-18T21:35:00-05:00");

test("replay stays blocked until a disabled encrypted credential is recorded", () => {
  const result = assessIsolatedReplayPreflight(source, receiver, now);
  assert.equal(result.ready, false);
  assert.deepEqual(result.failures, ["source disabledCredentialScope must equal 1"]);
});

test("exact fresh source and receiver baselines qualify only the preflight", () => {
  const readySource = { ...source, result: { ...source.result, disabledCredentialScope: 1 } };
  assert.deepEqual(assessIsolatedReplayPreflight(readySource, receiver, now), { ready: true, failures: [] });
  assert.match(assessIsolatedReplayPreflight(readySource, receiver, now + 16 * 60 * 1000).failures.join(" "), /older than 15 minutes/);
  assert.match(assessIsolatedReplayPreflight(readySource, { ...receiver, result: { ...receiver.result, replayBookingReceipts: 1 } }, now).failures.join(" "), /replayBookingReceipts/);
});
