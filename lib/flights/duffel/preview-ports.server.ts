import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "../../supabase/admin";
import { canonicalFlightJson } from "../runtime-safety";
import type {
  DuffelHttpDispatchRequest,
  DuffelHttpDispatchResponse,
  DuffelInjectedHttpDispatcher,
  DuffelTestHttpTransportDependencies,
} from "./http-transport.server";
import type { DuffelSandboxCredentialProvider } from "./credentials.server";
import type {
  DuffelAuthenticatedRequestJournal,
  DuffelJournalBeginInput,
  DuffelJournalCompletionInput,
  DuffelJournalMarkDispatchingInput,
  DuffelSafeRequestMetadata,
  DuffelSandboxTrafficGate,
} from "./telemetry.server";

const PREVIEW_PROJECT_REF = "eiqmdldjnedqgbtoozqa";
const sha256Pattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export const DUFFEL_PREVIEW_RUNTIME_BINDING = Object.freeze({
  tenantId: "tenant_iratepilot_preview_0001",
  providerCode: "duffel",
  providerAccountSha256: sha256("duffel-test-account:acc_0000B9iZ8kto4H8uYhKSzO"),
  pointOfSale: "US",
  pointOfSaleSha256: sha256("US"),
  contentScopeSha256: sha256("duffel-test-zz-usd-adult-v1"),
  adapterVersionSha256: sha256("iratepilot-duffel-preview-adapter-v1"),
  adapterSourceSha256: sha256("iratepilot-flight-foundation-20260825"),
  executionScopeSha256: sha256("preview:eiqmdldjnedqgbtoozqa:duffel:test:zz:usd:adult:v2:authenticator"),
  activationEvidenceSha256: sha256("flight-preview-activation:2026-08-25:duffel-test-booking-v8"),
  paymentAccountSha256: sha256("duffel-test-balance:acc_0000B9iZ8kto4H8uYhKSzO"),
  paymentSourceSha256: sha256("duffel-provider-balance:test:v1"),
  paymentAdapterVersionSha256: sha256("iratepilot-duffel-balance-adapter-v1"),
});

function previewAuthoritySecret() {
  const value = process.env.FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET;
  if (process.env.VERCEL_ENV !== "preview" || typeof value !== "string" || value.length < 32) {
    throw new Error("Duffel Preview authority is unavailable.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url !== `https://${PREVIEW_PROJECT_REF}.supabase.co`) {
    throw new Error("Duffel Preview database binding is unavailable.");
  }
  return value;
}

function hmac(secret: string, label: string, value: unknown) {
  return createHmac("sha256", secret)
    .update(label)
    .update("\0")
    .update(canonicalFlightJson(value as never))
    .digest("hex");
}

function equalDigest(left: string, right: string) {
  if (!sha256Pattern.test(left) || !sha256Pattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

type AttemptAuthority = Readonly<{
  operation: DuffelSafeRequestMetadata["operation"];
  requestDigest: string;
  authorizationReceiptDigest: string;
  journalReceiptDigest: string;
  dispatchReceiptDigest: string | null;
}>;

class PreviewTrafficGate implements DuffelSandboxTrafficGate {
  async authorize(metadata: DuffelSafeRequestMetadata) {
    const secret = previewAuthoritySecret();
    return Object.freeze({
      version: "duffel-traffic-gate-decision-v1" as const,
      decision: "authorized" as const,
      authorizationReceiptDigest: hmac(secret, "duffel-preview-traffic-v1", metadata),
    });
  }
}

class PreviewCredentialProvider implements DuffelSandboxCredentialProvider {
  async readSandboxAccessToken() {
    previewAuthoritySecret();
    const token = process.env.DUFFEL_TEST_ACCESS_TOKEN;
    if (typeof token !== "string") throw new Error("Duffel Preview credential is unavailable.");
    return token;
  }
}

class PreviewFetchDispatcher implements DuffelInjectedHttpDispatcher {
  async dispatch(request: DuffelHttpDispatchRequest): Promise<DuffelHttpDispatchResponse> {
    previewAuthoritySecret();
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: request.redirect,
      credentials: request.credentials,
      cache: request.cache,
      signal: request.signal,
    });
    const body = response.body === null
      ? null
      : (async function* () {
        const reader = response.body!.getReader();
        try {
          while (true) {
            const item = await reader.read();
            if (item.done) break;
            yield item.value;
          }
        } finally {
          reader.releaseLock();
        }
      })();
    const contentType = response.headers.get("content-type");
    const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? null;
    const contentLength = contentEncoding === null || contentEncoding === "identity"
      ? response.headers.get("content-length")
      : null;
    const headers = Object.freeze({
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === "content-type") return contentType;
        if (normalized === "content-length") return contentLength;
        return null;
      },
    });
    return Object.freeze({
      status: response.status,
      url: response.url,
      redirected: response.redirected,
      headers,
      body,
    });
  }
}

class PreviewRequestJournal implements DuffelAuthenticatedRequestJournal {
  readonly #attempts = new Map<string, AttemptAuthority>();

  async begin(input: DuffelJournalBeginInput) {
    const secret = previewAuthoritySecret();
    const metadata = input.metadata;
    const expectedAuthorization = hmac(secret, "duffel-preview-traffic-v1", metadata);
    if (!equalDigest(input.authorizationReceiptDigest, expectedAuthorization)) {
      throw new Error("Duffel Preview authorization receipt is invalid.");
    }
    const providerBindingReceipt = hmac(secret, "duffel-preview-provider-binding-v1", {
      binding: DUFFEL_PREVIEW_RUNTIME_BINDING,
      requestDigest: metadata.requestDigest,
    });
    const requestBodySha256 = metadata.requestBodyDigest ?? sha256("null");
    const dispatchNotAfter = new Date(Date.now() + 4 * 60_000).toISOString();
    const commerceId = `commerce_preview_${metadata.requestDigest.slice(0, 32)}`;
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("prepare_flight_provider_attempt_rpc", {
      p_tenant_id: DUFFEL_PREVIEW_RUNTIME_BINDING.tenantId,
      p_commerce_id: commerceId,
      p_operation: metadata.operation,
      p_provider_code: DUFFEL_PREVIEW_RUNTIME_BINDING.providerCode,
      p_execution_mode: "test",
      p_execution_scope_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.executionScopeSha256,
      p_activation_evidence_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.activationEvidenceSha256,
      p_adapter_version_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.adapterVersionSha256,
      p_adapter_source_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.adapterSourceSha256,
      p_provider_account_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.providerAccountSha256,
      p_point_of_sale_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.pointOfSaleSha256,
      p_content_scope_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.contentScopeSha256,
      p_provider_binding_receipt_sha256: providerBindingReceipt,
      p_request_plan_sha256: metadata.requestDigest,
      p_request_sha256: metadata.requestDigest,
      p_request_body_sha256: requestBodySha256,
      p_operation_authority_receipt_sha256: input.authorizationReceiptDigest,
      p_dispatch_not_after: dispatchNotAfter,
    });
    if (error) {
      const safeCode = typeof error.code === "string" && /^[A-Z0-9]{3,16}$/.test(error.code)
        ? error.code
        : "UNKNOWN";
      throw new Error(`Duffel Preview journal preparation failed:${safeCode}`);
    }
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error("Duffel Preview journal preparation failed:SHAPE");
    }
    const row = data[0] as Record<string, unknown>;
    if (!uuidPattern.test(String(row.attempt_id)) || row.attempt_revision !== 0 || row.attempt_state !== "prepared") {
      throw new Error("Duffel Preview journal preparation receipt is malformed.");
    }
    const attemptId = String(row.attempt_id);
    const journalReceiptDigest = hmac(secret, "duffel-preview-journal-prepared-v1", {
      attemptId,
      requestDigest: metadata.requestDigest,
      authorizationReceiptDigest: input.authorizationReceiptDigest,
    });
    this.#attempts.set(attemptId, Object.freeze({
      operation: metadata.operation,
      requestDigest: metadata.requestDigest,
      authorizationReceiptDigest: input.authorizationReceiptDigest,
      journalReceiptDigest,
      dispatchReceiptDigest: null,
    }));
    return Object.freeze({
      version: "duffel-journal-begin-result-v1" as const,
      state: "prepared" as const,
      attemptId,
      revision: 0 as const,
      journalReceiptDigest,
    });
  }

  async markDispatching(input: DuffelJournalMarkDispatchingInput) {
    const secret = previewAuthoritySecret();
    const attempt = this.#attempts.get(input.attemptId);
    if (
      !attempt
      || attempt.dispatchReceiptDigest !== null
      || attempt.requestDigest !== input.requestDigest
      || !equalDigest(attempt.authorizationReceiptDigest, input.authorizationReceiptDigest)
      || !equalDigest(attempt.journalReceiptDigest, input.journalReceiptDigest)
    ) return Object.freeze({ version: "duffel-journal-mark-dispatching-result-v1" as const, decision: "refused" as const });
    const providerBindingReceipt = hmac(secret, "duffel-preview-provider-binding-v1", {
      binding: DUFFEL_PREVIEW_RUNTIME_BINDING,
      requestDigest: attempt.requestDigest,
    });
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("claim_flight_provider_attempt_rpc", {
      p_attempt_id: input.attemptId,
      p_expected_revision: 0,
      p_operation: attempt.operation,
      p_adapter_source_sha256: DUFFEL_PREVIEW_RUNTIME_BINDING.adapterSourceSha256,
      p_provider_binding_receipt_sha256: providerBindingReceipt,
      p_operation_authority_receipt_sha256: attempt.authorizationReceiptDigest,
    });
    if (error || !Array.isArray(data) || data.length !== 1) throw new Error("Duffel Preview dispatch claim failed.");
    const row = data[0] as Record<string, unknown>;
    if (row.attempt_id !== input.attemptId || row.attempt_revision !== 1 || row.attempt_state !== "dispatching") {
      throw new Error("Duffel Preview dispatch claim receipt is malformed.");
    }
    const dispatchReceiptDigest = hmac(secret, "duffel-preview-journal-dispatch-v1", {
      attemptId: input.attemptId,
      requestDigest: attempt.requestDigest,
      journalReceiptDigest: attempt.journalReceiptDigest,
    });
    this.#attempts.set(input.attemptId, Object.freeze({ ...attempt, dispatchReceiptDigest }));
    return Object.freeze({
      version: "duffel-journal-mark-dispatching-result-v1" as const,
      decision: "claimed" as const,
      state: "dispatching" as const,
      attemptId: input.attemptId,
      revision: 1 as const,
      dispatchReceiptDigest,
    });
  }

  async complete(input: DuffelJournalCompletionInput) {
    const secret = previewAuthoritySecret();
    const attempt = this.#attempts.get(input.attemptId);
    if (!attempt || !equalDigest(attempt.journalReceiptDigest, input.journalReceiptDigest)) {
      throw new Error("Duffel Preview completion identity is invalid.");
    }
    if (input.expectedRevision === 1 && (
      attempt.dispatchReceiptDigest === null
      || input.dispatchReceiptDigest === null
      || !equalDigest(attempt.dispatchReceiptDigest, input.dispatchReceiptDigest)
    )) throw new Error("Duffel Preview dispatch completion receipt is invalid.");
    const completionReceiptDigest = hmac(secret, "duffel-preview-journal-completion-v1", input);
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("complete_flight_provider_request_attempt", {
      p_attempt_id: input.attemptId,
      p_expected_revision: input.expectedRevision,
      p_terminal_state: input.terminalState,
      p_terminal_http_status: input.httpStatus,
      p_terminal_response_sha256: input.responseDigest,
      p_terminal_response_bytes: input.inboundBodyBytes,
      p_terminal_receipt_sha256: completionReceiptDigest,
    });
    if (error || !Array.isArray(data) || data.length !== 1) throw new Error("Duffel Preview journal completion failed.");
    const row = data[0] as Record<string, unknown>;
    const revision = input.expectedRevision === 0 ? 1 : 2;
    if (row.attempt_id !== input.attemptId || row.attempt_revision !== revision || row.attempt_state !== input.terminalState) {
      throw new Error("Duffel Preview journal completion receipt is malformed.");
    }
    return Object.freeze({
      version: "duffel-journal-completion-result-v1" as const,
      state: input.terminalState,
      attemptId: input.attemptId,
      revision,
      completionReceiptDigest,
    });
  }
}

export function createDuffelPreviewTransportDependencies(
  journal: DuffelAuthenticatedRequestJournal = Object.freeze(new PreviewRequestJournal()),
): DuffelTestHttpTransportDependencies {
  previewAuthoritySecret();
  return Object.freeze({
    enabled: true as const,
    trafficGate: Object.freeze(new PreviewTrafficGate()),
    journal,
    credentials: Object.freeze(new PreviewCredentialProvider()),
    dispatcher: Object.freeze(new PreviewFetchDispatcher()),
  });
}
