import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { canonicalFlightJson, sha256FlightEvidence } from "../runtime-safety";
import { deriveFlightConsumerProductionDuffelLiveOfferIdSha256 } from
  "./duffel-live-offer-reprice.server";
import {
  buildFlightConsumerProductionDuffelPublicShoppingRequestBody,
  deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256,
  projectFlightConsumerProductionDuffelPublicOffers,
} from "./duffel-live-public-offer-projection.server";
import { validateDuffelLiveAccessToken } from "../duffel/credentials.server";
import type { FlightConsumerLiveDuffelOfferReferenceEncryptionPort } from
  "./public-offer-reference-encryption-port.server";
import { flightConsumerProductionPublicShoppingSearchSchema } from
  "./public-shopping-contract";
import { requireFlightConsumerProductionPublicShoppingAdmissionRuntime } from
  "./public-shopping-admission.server";
import { deriveFlightConsumerProductionDuffelAccountSha256,
  deriveFlightConsumerProductionDuffelCredentialSha256 } from
  "./shopping-runtime.server";
import type { FlightConsumerProductionPublicShoppingDispatchClaimInput } from
  "./public-shopping-dispatch-persistence.server";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_URL =
  "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=10000&view=offers" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_TIMEOUT_MS = 15_000;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_MAX_BYTES = 4_194_304;

const responseSchema = z.object({ data: z.object({
  offers: z.array(z.object({
    id: z.string().regex(/^off_[A-Za-z0-9]{8,252}$/),
    expires_at: z.string().datetime({ offset: true }),
  }).passthrough()).max(1_000),
}).passthrough() }).passthrough();

type ClaimInput = Omit<FlightConsumerProductionPublicShoppingDispatchClaimInput,
  "shoppingIdempotencySha256" | "requestBodySha256" | "dispatchNotAfter">;

const dispatchRuntimeBrand: unique symbol = Symbol("public-shopping-dispatch-runtime");
type DispatchRuntime = Readonly<{ [dispatchRuntimeBrand]: true; accessToken: string;
  shoppingExecutionScopeSha256: string; admissionExecutionScopeSha256: string;
  policySha256: string; admissionPolicySha256: string; cohortSha256: string }>;
export function createFlightConsumerProductionPublicShoppingDispatchRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DispatchRuntime {
  const snapshot = Object.freeze({ ...env });
  const decision = requireFlightConsumerProductionPublicShoppingAdmissionRuntime(snapshot);
  if (snapshot.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_ENABLED !== "true"
    || snapshot.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED !== "false") {
    throw new FlightConsumerProductionPublicShoppingDispatchError("runtime_disabled");
  }
  const digestPattern = /^[0-9a-f]{64}$/;
  const equalDigest = (left: string, right: string) => digestPattern.test(left)
    && digestPattern.test(right)
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  const accessToken = validateDuffelLiveAccessToken(snapshot.DUFFEL_LIVE_ACCESS_TOKEN);
  const accountId = snapshot.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID ?? "";
  const accountSha256 = deriveFlightConsumerProductionDuffelAccountSha256(accountId);
  const credentialSha256 = deriveFlightConsumerProductionDuffelCredentialSha256(accessToken);
  if (!equalDigest(accountSha256,
    snapshot.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256 ?? "")
    || !equalDigest(credentialSha256,
      snapshot.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256 ?? "")) {
    throw new FlightConsumerProductionPublicShoppingDispatchError(
      "provider_binding_refused",
    );
  }
  const shoppingExecutionScopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-public-shopping-dispatch-runtime-v1",
    admissionExecutionScopeSha256: decision.binding.executionScopeSha256,
    providerCode: "duffel", providerEnvironment: "live",
    operation: "create_offer_request", providerAccountSha256: accountSha256,
    providerCredentialSha256: credentialSha256,
    policySha256: decision.binding.policySha256,
    admissionPolicySha256: decision.binding.admissionPolicySha256,
    cohortSha256: decision.binding.cohortSha256,
    sourceCommitSha: snapshot.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA ?? "",
  });
  return Object.freeze({ [dispatchRuntimeBrand]: true as const, accessToken,
    shoppingExecutionScopeSha256,
    admissionExecutionScopeSha256: decision.binding.executionScopeSha256,
    policySha256: decision.binding.policySha256,
    admissionPolicySha256: decision.binding.admissionPolicySha256,
    cohortSha256: decision.binding.cohortSha256 });
}

export type FlightConsumerProductionPublicShoppingDispatchDependencies = Readonly<{
  runtime: DispatchRuntime | null;
  fetch: typeof fetch;
  now?: () => Date;
  claim: (input: FlightConsumerProductionPublicShoppingDispatchClaimInput) => Promise<Readonly<{
    decision: "created" | "replay"; shopping_attempt_id: string;
    attempt_state: "dispatching" | "succeeded" | "failed" | "ambiguous";
    attempt_revision: 1 | 2;
    create_offer_request_dispatch_authorized: boolean;
  }>>;
  terminalize: (input: Readonly<{ attemptId: string;
    state: "failed" | "ambiguous"; httpStatus: number | null;
    responseSha256: string | null; responseBytes: number | null;
  }>) => Promise<void>;
  recordSources: (input: Readonly<{ attemptId: string; executionScopeSha256: string;
    responseSha256: string; sources: readonly Readonly<{
      offerIdSha256: string; expiresAt: string;
    }>[] }>) => Promise<void>;
  listPendingSources: (input: Readonly<{ sourceShoppingAttemptId: string;
    sourceShoppingExecutionScopeSha256: string; sourceResponseSha256: string;
  }>) => Promise<readonly Readonly<{ source_id: string; offer_id_sha256: string;
    source_offer_evidence_sha256: string; expires_at: string; }>[] >;
  completeProjection: (input: Readonly<Record<string, unknown>>) => Promise<unknown>;
  readSafe: (input: Readonly<{ admissionId: string; admissionReceiptSha256: string;
    subjectSha256: string; requestSha256: string; }>) => Promise<readonly unknown[]>;
  encryption: FlightConsumerLiveDuffelOfferReferenceEncryptionPort;
}>;

export class FlightConsumerProductionPublicShoppingDispatchError extends Error {
  constructor(readonly reason: string) {
    super("Public live-flight shopping is unavailable.");
    this.name = "FlightConsumerProductionPublicShoppingDispatchError";
  }
}

async function boundedIdentityBody(response: Response, controller: AbortController) {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  const declared = response.headers.get("content-length");
  if (response.redirected
    || (response.url !== "" && response.url !== FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_URL)
    || type !== "application/json" || (encoding && encoding !== "identity")
    || (declared !== null && (!/^\d+$/.test(declared)
      || Number(declared) > FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_MAX_BYTES))
    || response.body === null) {
    controller.abort();
    await response.body?.cancel().catch(() => undefined);
    throw new FlightConsumerProductionPublicShoppingDispatchError("provider_response_refused");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || part.value.length === 0) {
        part.value?.fill(0);
        throw new Error();
      }
      length += part.value.length;
      if (length > FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_MAX_BYTES
        || chunks.length >= 4_096) {
        part.value.fill(0);
        throw new Error();
      }
      chunks.push(part.value);
    }
    if (declared !== null && Number(declared) !== length) throw new Error();
    const raw = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
    return raw;
  } catch {
    controller.abort();
    await reader.cancel().catch(() => undefined);
    throw new FlightConsumerProductionPublicShoppingDispatchError("provider_response_refused");
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
}

export async function dispatchFlightConsumerProductionPublicShopping(
  input: ClaimInput & Readonly<{ search: unknown }>,
  dependencies: FlightConsumerProductionPublicShoppingDispatchDependencies,
) {
  const runtime = dependencies.runtime;
  const digestPattern = /^[0-9a-f]{64}$/;
  const equalDigest = (left: string, right: string) => digestPattern.test(left)
    && digestPattern.test(right)
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  if (runtime === null || runtime[dispatchRuntimeBrand] !== true
    || !equalDigest(input.shoppingExecutionScopeSha256,
      runtime.shoppingExecutionScopeSha256)
    || !equalDigest(input.admissionExecutionScopeSha256,
      runtime.admissionExecutionScopeSha256)
    || !equalDigest(input.policySha256, runtime.policySha256)
    || !equalDigest(input.admissionPolicySha256, runtime.admissionPolicySha256)
    || !equalDigest(input.cohortSha256, runtime.cohortSha256)) {
    throw new FlightConsumerProductionPublicShoppingDispatchError("runtime_disabled");
  }
  const search = flightConsumerProductionPublicShoppingSearchSchema.parse(input.search);
  const expectedPublicRequestSha256 =
    deriveFlightConsumerProductionPublicShoppingAdmissionRequestSha256({
      executionScopeSha256: input.admissionExecutionScopeSha256,
      policySha256: input.policySha256,
      admissionPolicySha256: input.admissionPolicySha256,
      cohortSha256: input.cohortSha256, subjectSha256: input.subjectSha256,
      search,
    });
  if (!equalDigest(expectedPublicRequestSha256, input.publicRequestSha256)) {
    throw new FlightConsumerProductionPublicShoppingDispatchError(
      "admission_request_binding_refused",
    );
  }
  const request = buildFlightConsumerProductionDuffelPublicShoppingRequestBody(search);
  const requestBytes = new TextEncoder().encode(canonicalFlightJson(request));
  const requestBodySha256 = createHash("sha256").update(requestBytes).digest("hex");
  const shoppingIdempotencySha256 = createHash("sha256").update(
    "iratepilot:flight-consumer-production:public-shopping-dispatch-idempotency:v1\0"
    + [input.admissionId, input.admissionReceiptSha256,
      input.shoppingExecutionScopeSha256, input.publicRequestSha256,
      requestBodySha256].join(":"),
  ).digest("hex");
  let claim;
  try {
    const now = (dependencies.now ?? (() => new Date()))();
    const dispatchNotAfter = new Date(now.getTime() + 15_000).toISOString();
    claim = await dependencies.claim({ ...input, shoppingIdempotencySha256,
      requestBodySha256, dispatchNotAfter });
  } catch (error) {
    requestBytes.fill(0);
    throw error;
  }
  if (claim.decision === "replay") {
    requestBytes.fill(0);
    if (claim.create_offer_request_dispatch_authorized) throw new FlightConsumerProductionPublicShoppingDispatchError("replay_authority_refused");
    if (claim.attempt_state !== "succeeded" || claim.attempt_revision !== 2) {
      throw new FlightConsumerProductionPublicShoppingDispatchError(
        `replay_${claim.attempt_state}`,
      );
    }
    return Object.freeze({ replay: true as const, offers: await dependencies.readSafe({
      admissionId: input.admissionId, admissionReceiptSha256: input.admissionReceiptSha256,
      subjectSha256: input.subjectSha256, requestSha256: input.publicRequestSha256,
    }), providerReferenceExposed: false as const, orderAuthorized: false as const,
      paymentAuthorized: false as const });
  }
  if (!claim.create_offer_request_dispatch_authorized) {
    requestBytes.fill(0);
    throw new FlightConsumerProductionPublicShoppingDispatchError("dispatch_authority_refused");
  }

  let raw: Uint8Array | null = null;
  let responseSha256: string | null = null;
  let responseStatus: number | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await dependencies.fetch(FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_DISPATCH_URL, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${runtime.accessToken}`,
          "Duffel-Version": "v2", Accept: "application/json",
          "Accept-Encoding": "identity", "Content-Type": "application/json" },
        body: requestBytes,
      });
      responseStatus = response.status;
      raw = await boundedIdentityBody(response, controller);
    } finally { clearTimeout(timeout); requestBytes.fill(0); }
    responseSha256 = createHash("sha256").update(raw).digest("hex");
    if (responseStatus !== 200) {
      throw new FlightConsumerProductionPublicShoppingDispatchError(
        "provider_http_failed",
      );
    }
    const decoded = responseSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)));
    const sources = decoded.data.offers.map((offer) => ({
      offerIdSha256: deriveFlightConsumerProductionDuffelLiveOfferIdSha256(offer.id),
      expiresAt: new Date(offer.expires_at).toISOString(),
    }));
    await dependencies.recordSources({ attemptId: claim.shopping_attempt_id,
      executionScopeSha256: input.shoppingExecutionScopeSha256,
      responseSha256, sources });
    const persistedSources = await dependencies.listPendingSources({
      sourceShoppingAttemptId: claim.shopping_attempt_id,
      sourceShoppingExecutionScopeSha256: input.shoppingExecutionScopeSha256,
      sourceResponseSha256: responseSha256,
    });
    const observedAt = (dependencies.now ?? (() => new Date()))().toISOString();
    const projected = await projectFlightConsumerProductionDuffelPublicOffers({
      admissionId: input.admissionId,
      admissionExecutionScopeSha256: input.admissionExecutionScopeSha256,
      policySha256: input.policySha256, admissionPolicySha256: input.admissionPolicySha256,
      cohortSha256: input.cohortSha256, subjectSha256: input.subjectSha256,
      idempotencySha256: input.admissionIdempotencySha256,
      requestSha256: input.publicRequestSha256,
      admissionReceiptSha256: input.admissionReceiptSha256,
      sourceShoppingAttemptId: claim.shopping_attempt_id,
      sourceShoppingExecutionScopeSha256: input.shoppingExecutionScopeSha256,
      sourceResponseSha256: responseSha256, search, rawBody: raw, observedAt,
      sources: persistedSources.map((source) => ({ sourceId: source.source_id,
        offerIdSha256: source.offer_id_sha256,
        sourceOfferEvidenceSha256: source.source_offer_evidence_sha256,
        expiresAt: source.expires_at })), encryption: dependencies.encryption,
    });
    await dependencies.completeProjection({
      admissionId: input.admissionId, admissionReceiptSha256: input.admissionReceiptSha256,
      admissionExecutionScopeSha256: input.admissionExecutionScopeSha256,
      policySha256: input.policySha256, admissionPolicySha256: input.admissionPolicySha256,
      cohortSha256: input.cohortSha256, subjectSha256: input.subjectSha256,
      idempotencySha256: input.admissionIdempotencySha256,
      requestSha256: input.publicRequestSha256, search,
      sourceShoppingAttemptId: claim.shopping_attempt_id,
      sourceShoppingExecutionScopeSha256: input.shoppingExecutionScopeSha256,
      sourceResponseSha256: responseSha256, sourceRequestBodySha256: requestBodySha256,
      projectionBatchSha256: projected.safeBatch.projectionBatchSha256, observedAt,
      terminalResponseBytes: raw.byteLength, projected: projected.projected,
      refused: projected.refused,
    });
    return Object.freeze({ replay: false as const, offers: await dependencies.readSafe({
      admissionId: input.admissionId, admissionReceiptSha256: input.admissionReceiptSha256,
      subjectSha256: input.subjectSha256, requestSha256: input.publicRequestSha256,
    }), providerReferenceExposed: false as const, orderAuthorized: false as const,
      paymentAuthorized: false as const });
  } catch (error) {
    try {
      await dependencies.terminalize({ attemptId: claim.shopping_attempt_id,
        state: responseSha256 === null ? "ambiguous" : "failed",
        httpStatus: responseSha256 === null ? null : responseStatus,
        responseSha256, responseBytes: raw?.byteLength ?? null });
    } catch { /* terminal evidence failure must never trigger a blind retry */ }
    if (error instanceof FlightConsumerProductionPublicShoppingDispatchError) throw error;
    throw new FlightConsumerProductionPublicShoppingDispatchError("dispatch_failed");
  } finally { raw?.fill(0); requestBytes.fill(0); }
}
