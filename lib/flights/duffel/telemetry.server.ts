import "server-only";

import type { DuffelSandboxContractOperation } from "../duffel-sandbox-contract";

export const DUFFEL_SERVER_TRANSPORT_ENVIRONMENT = "sandbox" as const;

export type DuffelDispatchableSandboxOperation = Exclude<DuffelSandboxContractOperation, "create_order">;

export type DuffelSafeEndpointClass =
  | "offer_requests_collection"
  | "offer_resource"
  | "orders_collection";

/**
 * Metadata intentionally excludes URLs, query values, headers, bodies, tokens,
 * provider resource identifiers, and passenger data.
 */
export type DuffelSafeRequestMetadata = Readonly<{
  version: "duffel-safe-request-metadata-v1";
  environment: typeof DUFFEL_SERVER_TRANSPORT_ENVIRONMENT;
  operation: DuffelDispatchableSandboxOperation;
  endpointClass: DuffelSafeEndpointClass;
  method: "GET" | "POST";
  requestDigest: string;
  requestBodyDigest: string | null;
  outboundBodyBytes: number;
  timeoutMs: number;
}>;

export type DuffelTrafficGateDecision =
  | Readonly<{
    version: "duffel-traffic-gate-decision-v1";
    decision: "authorized";
    authorizationReceiptDigest: string;
  }>
  | Readonly<{
    version: "duffel-traffic-gate-decision-v1";
    decision: "denied";
  }>;

/** Persisted implementations belong to a later gate; this package provides only the port. */
export interface DuffelSandboxTrafficGate {
  authorize(metadata: DuffelSafeRequestMetadata): Promise<DuffelTrafficGateDecision>;
}

export const denyAllDuffelSandboxTrafficGate: DuffelSandboxTrafficGate = Object.freeze({
  async authorize(): Promise<DuffelTrafficGateDecision> {
    return Object.freeze({
      version: "duffel-traffic-gate-decision-v1" as const,
      decision: "denied" as const,
    });
  },
});

export type DuffelJournalBeginInput = Readonly<{
  version: "duffel-journal-begin-v1";
  metadata: DuffelSafeRequestMetadata;
  authorizationReceiptDigest: string;
}>;

/** Mirrors the durable 069 prepared state; the attempt ID is journal authority, not provider data. */
export type DuffelJournalBeginResult = Readonly<{
  version: "duffel-journal-begin-result-v1";
  state: "prepared";
  attemptId: string;
  revision: 0;
  journalReceiptDigest: string;
}>;

export type DuffelJournalMarkDispatchingInput = Readonly<{
  version: "duffel-journal-mark-dispatching-v1";
  attemptId: string;
  expectedRevision: 0;
  journalReceiptDigest: string;
  requestDigest: string;
  authorizationReceiptDigest: string;
}>;

export type DuffelJournalMarkDispatchingResult =
  | Readonly<{
    version: "duffel-journal-mark-dispatching-result-v1";
    decision: "claimed";
    state: "dispatching";
    attemptId: string;
    revision: 1;
    dispatchReceiptDigest: string;
  }>
  | Readonly<{
    version: "duffel-journal-mark-dispatching-result-v1";
    decision: "refused";
  }>;

export type DuffelJournalTerminalState = "blocked" | "succeeded" | "failed" | "ambiguous";

export type DuffelJournalDetailCode =
  | "credential_unavailable"
  | "dispatch_claim_refused"
  | "completed"
  | "provider_http_status"
  | "dispatch_failed"
  | "dispatch_timed_out"
  | "redirect_refused"
  | "response_origin_refused"
  | "response_invalid"
  | "response_too_large"
  | "response_body_failed"
  | "response_media_type_refused"
  | "response_utf8_refused"
  | "response_json_refused";

type DuffelJournalCompletionIdentity = Readonly<{
  version: "duffel-journal-completion-v1";
  attemptId: string;
  journalReceiptDigest: string;
  requestDigest: string;
}>;

export type DuffelJournalCompletionInput =
  | Readonly<DuffelJournalCompletionIdentity & {
    expectedRevision: 0;
    dispatchReceiptDigest: null;
    terminalState: "blocked";
    detailCode: "credential_unavailable" | "dispatch_claim_refused";
    httpStatus: null;
    inboundBodyBytes: null;
    responseDigest: null;
  }>
  | Readonly<DuffelJournalCompletionIdentity & {
    expectedRevision: 1;
    dispatchReceiptDigest: string;
    terminalState: "succeeded";
    detailCode: "completed";
    httpStatus: number;
    inboundBodyBytes: number;
    responseDigest: string;
  }>
  | Readonly<DuffelJournalCompletionIdentity & {
    expectedRevision: 1;
    dispatchReceiptDigest: string;
    terminalState: "failed";
    detailCode: "provider_http_status";
    httpStatus: number;
    inboundBodyBytes: number;
    responseDigest: string;
  }>
  | Readonly<DuffelJournalCompletionIdentity & {
    expectedRevision: 1;
    dispatchReceiptDigest: string;
    terminalState: "ambiguous";
    detailCode: Exclude<
      DuffelJournalDetailCode,
      "credential_unavailable" | "dispatch_claim_refused" | "completed" | "provider_http_status"
    >;
    httpStatus: null;
    inboundBodyBytes: null;
    responseDigest: null;
  }>;

export type DuffelJournalCompletionResult = Readonly<{
  version: "duffel-journal-completion-result-v1";
  state: DuffelJournalTerminalState;
  attemptId: string;
  revision: 1 | 2;
  completionReceiptDigest: string;
}>;

/**
 * Authenticated durable port only. Implementations must map exactly to 069 CAS:
 * prepared -> blocked, prepared -> dispatching, and dispatching -> succeeded,
 * failed, or ambiguous. This package deliberately supplies no database adapter.
 */
export interface DuffelAuthenticatedRequestJournal {
  begin(input: DuffelJournalBeginInput): Promise<DuffelJournalBeginResult>;
  markDispatching(input: DuffelJournalMarkDispatchingInput): Promise<DuffelJournalMarkDispatchingResult>;
  complete(input: DuffelJournalCompletionInput): Promise<DuffelJournalCompletionResult>;
}
