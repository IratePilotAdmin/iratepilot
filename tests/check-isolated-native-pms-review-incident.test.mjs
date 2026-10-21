import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { assessIsolatedNativePmsReviewIncident } from "../scripts/check-isolated-native-pms-review-incident.mjs";

const now = Date.parse("2026-10-20T20:00:00Z");
const eventId = "11111111-1111-4111-8111-111111111111";
const source = {
  sourceProject: "onbdizzwwubfdgkgaphx", checkedAt: "2026-10-20T19:59:00Z", dataChanged: false,
  result: {
    event: { eventId, sourceVersion: 3, state: "review", attempts: 5, resultCode: "retry_exhausted",
      connectionId: "SYNTHPMS001", propertyId: "33000000-0000-4000-8000-000000000033",
      tenantId: "b0fee4d2-9c8f-427a-b673-1eefe4cb649b", pmsPropertyId: "9fd1e544-d737-4023-ac51-49408166a15f" },
    disabledSourceScope: 1, disabledCredentialScope: 1, earlierUndelivered: 0,
  },
};
const receiver = {
  receiverProject: "wjosvslkselpauyftias", checkedAt: "2026-10-20T19:58:00Z", dataChanged: false,
  result: { disabledMatchingConnection: 1, receipts: [], otherScopeReceipts: 0 },
};
const worker = {
  workerProject: "iratepilot-cron-rehearsal-20261005", environment: "Production",
  sourceProject: "onbdizzwwubfdgkgaphx", receiverProject: "wjosvslkselpauyftias",
  destinationUrl: "https://wjosvslkselpauyftias.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  deploymentId: "dpl_isolated_test", deploymentState: "Ready", syncEnabled: false,
  checkedAt: "2026-10-20T19:59:30Z", dataChanged: false,
};
const receipt = { eventId, sourceVersion: 3, tenantId: source.result.event.tenantId,
  propertyId: source.result.event.pmsPropertyId, applicationOutcome: "applied", resolutionOutcome: null };

test("classifies a missing receipt as investigation only and fingerprints minimized evidence", () => {
  const report = assessIsolatedNativePmsReviewIncident([{ evidence: source }], { evidence: receiver }, worker, now);
  assert.equal(report.passed, true);
  assert.equal(report.disposition, "no_receipt_investigate");
  assert.equal(report.permitsResend, false);
  assert.match(report.evidenceSha256.source, /^[a-f0-9]{64}$/);
  assert.equal(report.evidenceSha256.source, assessIsolatedNativePmsReviewIncident(source, receiver, worker, now).evidenceSha256.source);
});

test("never recommends resending an already applied, held, or out-of-order event", () => {
  const applied = { ...receiver, result: { ...receiver.result, receipts: [receipt] } };
  assert.equal(assessIsolatedNativePmsReviewIncident(source, applied, worker, now).disposition, "already_applied_do_not_resend");
  const held = { ...receiver, result: { ...receiver.result, receipts: [{ ...receipt, applicationOutcome: "review:sold_out" }] } };
  assert.equal(assessIsolatedNativePmsReviewIncident(source, held, worker, now).disposition, "receiver_outcome_investigate");
  const earlier = { ...source, result: { ...source.result, earlierUndelivered: 1 } };
  assert.equal(assessIsolatedNativePmsReviewIncident(earlier, receiver, worker, now).disposition, "earlier_version_blocked");
  for (const report of [assessIsolatedNativePmsReviewIncident(source, applied, worker, now),
    assessIsolatedNativePmsReviewIncident(source, held, worker, now),
    assessIsolatedNativePmsReviewIncident(earlier, receiver, worker, now)]) assert.equal(report.permitsResend, false);
});

test("rejects stale, switched-on, cross-scope, malformed, and duplicated evidence", () => {
  const invalid = [
    [source, receiver, { ...worker, syncEnabled: true }],
    [{ ...source, checkedAt: "2026-10-20T19:30:00Z" }, receiver, worker],
    [{ ...source, result: { ...source.result, disabledSourceScope: 0 } }, receiver, worker],
    [source, { ...receiver, result: { ...receiver.result, receipts: [receipt, receipt] } }, worker],
    [source, { ...receiver, result: { ...receiver.result, receipts: [{ ...receipt, eventId: "22222222-2222-4222-8222-222222222222" }] } }, worker],
    [source, { ...receiver, result: { ...receiver.result, otherScopeReceipts: 1 } }, worker],
    [{ ...source, result: { ...source.result, event: { ...source.result.event, state: "retry" } } }, receiver, worker],
    [{ ...source, secret: "should-not-accept" }, receiver, worker],
    [source, receiver, { ...worker, secret: "should-not-accept" }],
  ];
  for (const [s, r, w] of invalid) {
    const report = assessIsolatedNativePmsReviewIncident(s, r, w, now);
    assert.equal(report.passed, false);
    assert.equal(report.disposition, "evidence_invalid");
    assert.equal(report.permitsResend, false);
    assert.equal("evidenceSha256" in report, false);
  }
});

test("incident queries are read-only and return no payload, booking identity, or secret", () => {
  for (const name of ["source", "receiver"]) {
    const sql = readFileSync(new URL(`../release/isolated-native-pms-review-${name}.sql`, import.meta.url), "utf8");
    const statement = sql.replace(/^--.*$/gm, "");
    assert.match(statement, /^\s*with\s+target\s+as\s*\(/i);
    assert.doesNotMatch(statement, /\b(insert|update|delete|truncate|alter|drop|grant|revoke|execute)\b/i);
    assert.doesNotMatch(statement, /'(?:event_payload|booking_id|signing_secret|guest_name)'\s*,/i);
    assert.equal((statement.match(/00000000-0000-4000-8000-000000000000/g) || []).length, 1);
  }
});
