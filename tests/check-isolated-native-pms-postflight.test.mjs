import assert from "node:assert/strict";
import { test } from "vitest";
import { assessIsolatedReplayPostflight } from "../scripts/check-isolated-native-pms-postflight.mjs";

const now = Date.parse("2026-10-20T20:00:00Z");
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const source = {
  sourceProject: "onbdizzwwubfdgkgaphx", checkedAt: "2026-10-20T19:59:00Z", dataChanged: false,
  result: {
    disabledSourceScope: 1, disabledCredentialScope: 1, cancelledSyntheticBooking: 1, otherScopeEvents: 0,
    events: ids.map((eventId, index) => ({ eventId, sourceVersion: index + 1, state: "delivered", attempts: 1,
      resultCode: index === 0 ? "pms_reservation-staged" : "pms_cancellation-staged" })),
  },
};
const receiver = {
  receiverProject: "wjosvslkselpauyftias", checkedAt: "2026-10-20T19:58:00Z", dataChanged: false,
  result: {
    disabledMatchingConnection: 1, otherScopeReceipts: 0, stayChangeCommands: 0,
    receipts: ids.map((eventId, index) => ({ eventId, sourceVersion: index + 1, applicationOutcome: "applied", resolutionOutcome: null })),
    reservation: [{ sourceVersion: 2, status: "Cancelled" }],
  },
};
const worker = {
  workerProject: "iratepilot-cron-rehearsal-20261005", environment: "Production",
  sourceProject: "onbdizzwwubfdgkgaphx", receiverProject: "wjosvslkselpauyftias",
  destinationUrl: "https://wjosvslkselpauyftias.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  deploymentId: "dpl_isolated_test", deploymentState: "Ready", syncEnabled: false,
  checkedAt: "2026-10-20T19:59:30Z", dataChanged: false,
};

test("verifies exact, fresh, disabled source, receiver, and worker evidence", () => {
  assert.deepEqual(assessIsolatedReplayPostflight(source, receiver, worker, now), { passed: true, failures: [] });
  assert.equal(assessIsolatedReplayPostflight([{ evidence: source }], { evidence: receiver }, worker, now).passed, true);
  assert.equal(assessIsolatedReplayPostflight({ ...source, result: { ...source.result, events: source.result.events.map((e) => ({ ...e, resultCode: "pms_duplicate" })) } }, receiver, worker, now).passed, true);
});

test("rejects missing, crossed, stale, or held receipts", () => {
  const changed = [
    [{ ...source, result: { ...source.result, events: source.result.events.slice(0, 1) } }, receiver],
    [source, { ...receiver, result: { ...receiver.result, receipts: receiver.result.receipts.map((r) => ({ ...r, eventId: ids[1 - (r.sourceVersion - 1)] })) } }],
    [source, { ...receiver, result: { ...receiver.result, receipts: receiver.result.receipts.map((r) => r.sourceVersion === 2 ? { ...r, applicationOutcome: "review:sold_out" } : r) } }],
    [{ ...source, checkedAt: "2026-10-20T19:40:00Z" }, receiver],
    [source, { ...receiver, result: { ...receiver.result, reservation: [{ sourceVersion: 1, status: "Confirmed" }] } }],
  ];
  for (const [s, r] of changed) assert.equal(assessIsolatedReplayPostflight(s, r, worker, now).passed, false);
});

test("rejects any enabled switch, wrong project, extra event, or replayed side effect", () => {
  const changed = [
    [{ ...source, result: { ...source.result, disabledSourceScope: 0 } }, receiver],
    [source, { ...receiver, result: { ...receiver.result, disabledMatchingConnection: 0 } }],
    [{ ...source, sourceProject: "live" }, receiver],
    [{ ...source, result: { ...source.result, otherScopeEvents: 1 } }, receiver],
    [source, { ...receiver, result: { ...receiver.result, otherScopeReceipts: 1 } }],
    [source, { ...receiver, result: { ...receiver.result, stayChangeCommands: 1 } }],
  ];
  for (const [s, r] of changed) assert.equal(assessIsolatedReplayPostflight(s, r, worker, now).passed, false);
});

test("rejects a running, wrong, stale, or unverified scheduled worker", () => {
  for (const value of [null, { ...worker, syncEnabled: true }, { ...worker, workerProject: "live" },
    { ...worker, checkedAt: "2026-10-20T19:40:00Z" }, { ...worker, deploymentState: "Building" }]) {
    assert.equal(assessIsolatedReplayPostflight(source, receiver, value, now).passed, false);
  }
});
