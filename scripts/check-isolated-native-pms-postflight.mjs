import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_PROJECT = "onbdizzwwubfdgkgaphx";
const RECEIVER_PROJECT = "wjosvslkselpauyftias";
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_SKEW_MS = 5 * 60 * 1000;
const ackCodes = ["pms_reservation-staged", "pms_cancellation-staged", "pms_duplicate"];

function evidence(value) {
  // Supabase SQL Editor export can contain the single `evidence` column.
  if (Array.isArray(value) && value.length === 1) return value[0]?.evidence;
  if (value && typeof value === "object" && "evidence" in value) return value.evidence;
  return value;
}

function time(report, label, now, failures) {
  const checkedAt = Date.parse(report?.checkedAt ?? "");
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > MAX_AGE_MS) {
    failures.push(`${label} postflight is missing, future-dated, or older than 15 minutes`);
  }
  return checkedAt;
}

function count(actual, expected, label, failures) {
  if (actual !== expected) failures.push(`${label} must equal ${expected}`);
}

export function assessIsolatedReplayPostflight(sourceInput, receiverInput, now = Date.now()) {
  const source = evidence(sourceInput);
  const receiver = evidence(receiverInput);
  const failures = [];
  if (source?.sourceProject !== SOURCE_PROJECT || receiver?.receiverProject !== RECEIVER_PROJECT) {
    failures.push("isolated project IDs do not match the approved replay");
  }
  if (source?.dataChanged !== false || receiver?.dataChanged !== false) {
    failures.push("postflight evidence must come from read-only queries");
  }
  const sourceTime = time(source, "source", now, failures);
  const receiverTime = time(receiver, "receiver", now, failures);
  if (Number.isFinite(sourceTime) && Number.isFinite(receiverTime) && Math.abs(sourceTime - receiverTime) > MAX_SKEW_MS) {
    failures.push("source and receiver postflight checks must be within five minutes of each other");
  }

  const s = source?.result;
  const r = receiver?.result;
  count(s?.disabledSourceScope, 1, "source disabledSourceScope", failures);
  count(s?.disabledCredentialScope, 1, "source disabledCredentialScope", failures);
  count(s?.cancelledSyntheticBooking, 1, "source cancelledSyntheticBooking", failures);
  count(s?.otherConnectionEvents, 0, "source otherConnectionEvents", failures);
  count(r?.disabledMatchingConnection, 1, "receiver disabledMatchingConnection", failures);
  count(r?.stayChangeCommands, 0, "receiver stayChangeCommands", failures);

  const events = s?.events;
  const receipts = r?.receipts;
  if (!Array.isArray(events) || events.length !== 2 || !Array.isArray(receipts) || receipts.length !== 2) {
    failures.push("exactly two source events and two receiver receipts are required");
  } else {
    const eventIds = new Set();
    const receiptIds = new Set();
    for (const version of [1, 2]) {
      const event = events.find((item) => item?.sourceVersion === version);
      const receipt = receipts.find((item) => item?.sourceVersion === version);
      if (!event || !receipt || typeof event.eventId !== "string" || event.eventId.length === 0
        || event.eventId !== receipt.eventId || eventIds.has(event.eventId) || receiptIds.has(receipt.eventId)) {
        failures.push(`version ${version} event and receipt identities must match exactly`);
        continue;
      }
      eventIds.add(event.eventId);
      receiptIds.add(receipt.eventId);
      if (event.state !== "delivered" || !Number.isInteger(event.attempts) || event.attempts < 1
        || !ackCodes.includes(event.resultCode) || (event.resultCode !== "pms_duplicate" && event.resultCode !== (version === 1 ? "pms_reservation-staged" : "pms_cancellation-staged"))) {
        failures.push(`source version ${version} needs an acknowledged delivery`);
      }
      if (receipt.applicationOutcome !== "applied" || receipt.resolutionOutcome !== null) {
        failures.push(`receiver version ${version} must be applied without review resolution`);
      }
    }
    if (eventIds.size !== 2 || receiptIds.size !== 2) failures.push("event versions or IDs are duplicated or missing");
  }
  const reservations = r?.reservation;
  if (!Array.isArray(reservations) || reservations.length !== 1
    || reservations[0]?.sourceVersion !== 2 || reservations[0]?.status !== "Cancelled") {
    failures.push("receiver must hold one cancelled reservation at source version 2");
  }
  return { passed: failures.length === 0, failures };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [sourcePath, receiverPath] = process.argv.slice(2);
  if (!sourcePath || !receiverPath) {
    console.error("Usage: node scripts/check-isolated-native-pms-postflight.mjs SOURCE_EVIDENCE.json RECEIVER_EVIDENCE.json");
    process.exitCode = 2;
  } else {
    try {
      const [source, receiver] = await Promise.all([sourcePath, receiverPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))));
      const result = assessIsolatedReplayPostflight(source, receiver);
      console.log(result.passed ? "Isolated two-event replay verified; all delivery switches are disabled." : `Replay unverified:\n${result.failures.map((failure) => `- ${failure}`).join("\n")}`);
      if (!result.passed) process.exitCode = 1;
    } catch {
      console.error("Replay unverified: evidence files could not be read or parsed.");
      process.exitCode = 2;
    }
  }
}
