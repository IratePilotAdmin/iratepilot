const completionMessageCategories = Object.freeze([
  ["Successful flight search terminal evidence does not match", "terminal_evidence_mismatch"],
  ["Flight normalized offers must be an array of at most five", "normalized_offer_array_invalid"],
  ["Flight normalized offer contains missing or unknown keys", "normalized_offer_keys_invalid"],
  ["Flight local offer identity is malformed", "local_offer_identity_invalid"],
  ["Flight normalized segments are invalid", "normalized_segments_invalid"],
  ["Flight normalized fare terms contain missing or unknown keys", "fare_terms_keys_invalid"],
  ["Initial encrypted offer evidence is malformed", "initial_evidence_invalid"],
  ["Flight normalized segment contains missing or unknown keys", "segment_keys_invalid"],
  ["Flight offer search evidence is required", "offer_search_missing"],
  ["Flight offer execution scope does not match its search", "offer_scope_mismatch"],
  ["Flight offer search evidence is not active", "offer_search_inactive"],
  ["Flight offer cannot outlive its search", "offer_outlives_search"],
  ["Flight offer snapshot execution mode does not match its offer", "snapshot_scope_mismatch"],
  ["Flight offer snapshot provider is not the bound runtime provider", "snapshot_provider_mismatch"],
  ["Flight offer snapshot can only be captured for an active offer", "snapshot_offer_inactive"],
  ["Flight segment sequence exceeds the offer segment count", "segment_sequence_invalid"],
  ["Flight offer segments overlap or are out of chronological order", "segment_order_invalid"],
  ["Flight search completion CAS failed", "search_completion_cas_failed"],
] as const);

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? value as Readonly<Record<string, unknown>>
    : null;
}

export function safeFlightConsumerPreviewCompletionDiagnostic(error: unknown) {
  const record = recordValue(error);
  const rawCode = record?.code;
  const code = typeof rawCode === "string" && /^[A-Z0-9]{5}$/.test(rawCode)
    ? rawCode
    : "unknown";
  const message = typeof record?.message === "string" ? record.message : "";
  const knownCategory = completionMessageCategories.find(([marker]) => message.includes(marker))?.[1];
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
