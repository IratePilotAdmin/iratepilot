import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkIsolatedWorkerOff } from "./isolated-native-pms-worker-evidence.mjs";

const SOURCE_PROJECT = "onbdizzwwubfdgkgaphx";
const RECEIVER_PROJECT = "wjosvslkselpauyftias";
const CONNECTION = "SYNTHPMS001";
const OTA_PROPERTY = "33000000-0000-4000-8000-000000000033";
const TENANT = "b0fee4d2-9c8f-427a-b673-1eefe4cb649b";
const PMS_PROPERTY = "9fd1e544-d737-4023-ac51-49408166a15f";
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_SKEW_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unwrap(value) {
  if (Array.isArray(value) && value.length === 1) return value[0]?.evidence;
  if (value && typeof value === "object" && "evidence" in value) return value.evidence;
  return value;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

function timestamp(value, label, now, failures) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || parsed > now || now - parsed > MAX_AGE_MS) {
    failures.push(`${label} evidence is missing, future-dated, or older than 15 minutes`);
  }
  return parsed;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assessIsolatedNativePmsReviewIncident(sourceInput, receiverInput, worker, now = Date.now()) {
  const source = unwrap(sourceInput);
  const receiver = unwrap(receiverInput);
  const failures = [];
  if (!exactKeys(source, ["sourceProject", "checkedAt", "dataChanged", "result"])
    || !exactKeys(receiver, ["receiverProject", "checkedAt", "dataChanged", "result"])
    || !exactKeys(worker, ["workerProject", "environment", "sourceProject", "receiverProject", "destinationUrl", "deploymentId", "deploymentState", "syncEnabled", "checkedAt", "dataChanged"])) {
    failures.push("evidence must contain only the documented fields");
  }
  if (source?.sourceProject !== SOURCE_PROJECT || receiver?.receiverProject !== RECEIVER_PROJECT) {
    failures.push("evidence is not from the approved isolated projects");
  }
  if (source?.dataChanged !== false || receiver?.dataChanged !== false) {
    failures.push("source and receiver evidence must be read-only");
  }
  const sourceTime = timestamp(source?.checkedAt, "source", now, failures);
  const receiverTime = timestamp(receiver?.checkedAt, "receiver", now, failures);
  if (Number.isFinite(sourceTime) && Number.isFinite(receiverTime) && Math.abs(sourceTime - receiverTime) > MAX_SKEW_MS) {
    failures.push("source and receiver evidence must be collected within five minutes");
  }
  failures.push(...checkIsolatedWorkerOff(worker, now));
  const s = source?.result;
  const r = receiver?.result;
  if (!exactKeys(s, ["event", "disabledSourceScope", "disabledCredentialScope", "earlierUndelivered"])
    || !exactKeys(r, ["disabledMatchingConnection", "receipts", "otherScopeReceipts"])) {
    failures.push("incident evidence has an unexpected shape");
  }
  const event = s?.event;
  if (!exactKeys(event, ["eventId", "sourceVersion", "state", "attempts", "resultCode", "connectionId", "propertyId", "tenantId", "pmsPropertyId"])
    || !UUID.test(event?.eventId ?? "") || !Number.isSafeInteger(event?.sourceVersion) || event.sourceVersion < 1
    || event.state !== "review" || !Number.isSafeInteger(event.attempts) || event.attempts < 5
    || event.resultCode !== "retry_exhausted" || event.connectionId !== CONNECTION
    || event.propertyId !== OTA_PROPERTY || event.tenantId !== TENANT || event.pmsPropertyId !== PMS_PROPERTY) {
    failures.push("source event is not a scoped, exhausted review event");
  }
  if (s?.disabledSourceScope !== 1 || s?.disabledCredentialScope !== 1 || r?.disabledMatchingConnection !== 1) {
    failures.push("source, credential, and receiver delivery scopes must all be disabled");
  }
  if (!Number.isSafeInteger(s?.earlierUndelivered) || s.earlierUndelivered < 0 || r?.otherScopeReceipts !== 0) {
    failures.push("ordering or receiver scope evidence is invalid");
  }
  const receipts = r?.receipts;
  if (!Array.isArray(receipts) || receipts.length > 1 || receipts.some((receipt) =>
    !exactKeys(receipt, ["eventId", "sourceVersion", "tenantId", "propertyId", "applicationOutcome", "resolutionOutcome"])
    || receipt.eventId !== event?.eventId || receipt.sourceVersion !== event?.sourceVersion
    || receipt.tenantId !== TENANT || receipt.propertyId !== PMS_PROPERTY
    || typeof receipt.applicationOutcome !== "string"
    || !(receipt.resolutionOutcome === null || typeof receipt.resolutionOutcome === "string"))) {
    failures.push("receiver receipt is missing scope, duplicated, or mismatched");
  }
  if (failures.length) return { passed: false, disposition: "evidence_invalid", failures, permitsResend: false };

  const receipt = receipts[0];
  const disposition = !receipt ? s.earlierUndelivered > 0 ? "earlier_version_blocked" : "no_receipt_investigate"
    : receipt.applicationOutcome === "applied" && receipt.resolutionOutcome === null
      ? "already_applied_do_not_resend" : "receiver_outcome_investigate";
  return {
    passed: true,
    disposition,
    permitsResend: false,
    eventId: event.eventId,
    earlierUndelivered: s.earlierUndelivered,
    evidenceSha256: { source: digest(source), receiver: digest(receiver), worker: digest(worker) },
    failures: [],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [sourcePath, receiverPath, workerPath] = process.argv.slice(2);
  if (!sourcePath || !receiverPath || !workerPath) {
    console.error("Usage: node scripts/check-isolated-native-pms-review-incident.mjs SOURCE.json RECEIVER.json WORKER.json");
    process.exitCode = 2;
  } else {
    try {
      const [source, receiver, worker] = await Promise.all([sourcePath, receiverPath, workerPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
      const report = assessIsolatedNativePmsReviewIncident(source, receiver, worker);
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) process.exitCode = 1;
    } catch {
      console.error("Incident evidence could not be read or parsed.");
      process.exitCode = 2;
    }
  }
}
