const repriceMessageCategories = Object.freeze([
  ["Flight reprice terminal evidence does not match", "terminal_evidence_mismatch"],
  ["Refreshed encrypted offer evidence is malformed", "refreshed_evidence_invalid"],
  ["Refreshed flight evidence predecessor does not match", "evidence_predecessor_mismatch"],
  ["Flight reprice completion replay collides", "completion_replay_collision"],
  ["Flight reprice idempotency evidence is unavailable", "idempotency_evidence_unavailable"],
  ["Flight reprice terminal failure evidence does not match", "failure_evidence_mismatch"],
  ["Flight reprice failure CAS failed", "failure_cas_failed"],
  ["column reference \"offer_id\" is ambiguous", "sql_identifier_ambiguous"],
] as const);

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? value as Readonly<Record<string, unknown>>
    : null;
}

export function safeFlightConsumerPreviewRepriceDiagnostic(error: unknown) {
  const record = recordValue(error);
  const rawCode = record?.code;
  const code = typeof rawCode === "string" && /^[A-Z0-9]{5}$/.test(rawCode)
    ? rawCode
    : "unknown";
  const message = typeof record?.message === "string" ? record.message : "";
  const knownCategory = repriceMessageCategories.find(([marker]) => message.includes(marker))?.[1];
  const constraintMatch = /\bconstraint\s+"([a-z][a-z0-9_]{1,127})"/i.exec(message);
  const constraint = constraintMatch?.[1]?.toLowerCase();
  const safeConstraint = constraint !== undefined && /^flight_[a-z0-9_]+$/.test(constraint)
    ? constraint
    : null;

  return Object.freeze({
    code,
    category: knownCategory ?? (safeConstraint === null
      ? "unclassified"
      : `constraint:${safeConstraint}`),
  });
}
