import "server-only";

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

import { validateDuffelLiveAccessToken } from "../duffel/credentials.server";
import { sha256FlightEvidence } from "../runtime-safety";
import {
  deriveFlightConsumerProductionDuffelAccountSha256,
  deriveFlightConsumerProductionDuffelCredentialSha256,
} from "./shopping-runtime.server";
import { requireFlightConsumerProductionDarkRuntime } from "./runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION =
  "REPRICE_ONE_BOUND_DUFFEL_LIVE_OFFER_WITHOUT_ORDER_OR_PAYMENT" as const;
export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MODE =
  "flight_consumer_production_duffel_live_offer_reprice_dark" as const;
export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_TIMEOUT_MS =
  30_000 as const;
export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MAX_BYTES =
  1_048_576 as const;

const authorityLifetimeMs = 60_000;
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const offerIdSchema = z.string().regex(/^off_[A-Za-z0-9]{8,252}$/);
const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,9})\.\d{2}$/);
const ownerNameSchema = z.string().min(1).max(160).refine(
  (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
);
const ownerIataCodeSchema = z.string().regex(/^[A-Z0-9]{2}$/).nullable();
const utcInstantPattern = /^(?:[2-9]\d{3})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,9}))?Z$/;
const utcInstantSchema = z.string().min(20).max(64).refine((value) => {
  const match = value.match(utcInstantPattern);
  if (match === null) return false;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return false;
  const expectedMillisecondInstant = `${value.slice(0, 19)}.${(match[1] ?? "")
    .padEnd(3, "0")
    .slice(0, 3)}Z`;
  return instant.toISOString() === expectedMillisecondInstant;
});

const authorityInputSchema = z.object({
  confirmation: z.literal(
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  ),
  offerId: offerIdSchema,
  sourceOfferEvidenceSha256: sha256Schema,
  sourceShoppingExecutionScopeSha256: sha256Schema,
}).strict();

const executionInputSchema = z.object({
  confirmation: z.literal(
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  ),
  offerBindingSha256: sha256Schema,
}).strict();

const providerResponseSchema = z.object({
  data: z.object({
    id: offerIdSchema,
    live_mode: z.literal(true),
    partial: z.literal(false),
    total_amount: amountSchema,
    total_currency: z.literal("USD"),
    expires_at: utcInstantSchema,
    passenger_identity_documents_required: z.literal(false),
    payment_requirements: z.object({
      requires_instant_payment: z.literal(true),
    }).passthrough(),
    owner: z.object({
      name: ownerNameSchema,
      iata_code: ownerIataCodeSchema,
    }).passthrough(),
  }).passthrough(),
}).passthrough();

type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

const authorityBrand: unique symbol = Symbol(
  "flight-consumer-production-duffel-live-offer-reprice-authority",
);

export type FlightConsumerProductionDuffelLiveOfferRepriceAuthority = Readonly<{
  version: "flight-consumer-production-duffel-live-offer-reprice-authority-v1";
  mode: typeof FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MODE;
  providerCode: "duffel";
  providerEnvironment: "live";
  executionScopeSha256: string;
  authoritySha256: string;
  offerBindingSha256: string;
  offerIdSha256: string;
  sourceOfferEvidenceSha256: string;
  sourceShoppingExecutionScopeSha256: string;
  dispatchNotAfter: string;
  allowedOperations: readonly ["retrieve_offer"];
  maximumProviderDispatchCount: 1;
  accountBindingVerified: true;
  credentialBindingVerified: true;
  orderAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
  refundAuthorized: false;
  consumerReleaseEnabled: false;
  transactionKillSwitchEngaged: true;
  [authorityBrand]: true;
}>;

export type FlightConsumerProductionDuffelLiveOfferRepriceRequest = Readonly<{
  version: "flight-consumer-production-duffel-live-offer-reprice-request-v1";
  url: string;
  method: "GET";
  headers: Readonly<{
    Accept: "application/json";
    "Accept-Encoding": "identity";
    Authorization: string;
    "Duffel-Version": "v2";
  }>;
  body: null;
  redirect: "error";
  credentials: "omit";
  cache: "no-store";
  signal: AbortSignal;
  executionScopeSha256: string;
  authoritySha256: string;
  offerBindingSha256: string;
  requestSha256: string;
}>;

export type FlightConsumerProductionDuffelLiveOfferRepriceResponse = Readonly<{
  status: number;
  url: string;
  redirected: boolean;
  headers: Readonly<{ get(name: string): string | null }>;
  body: Uint8Array | null;
}>;

export interface FlightConsumerProductionDuffelLiveOfferRepriceTransport {
  retrieveBoundOffer(
    request: FlightConsumerProductionDuffelLiveOfferRepriceRequest,
  ): Promise<FlightConsumerProductionDuffelLiveOfferRepriceResponse>;
}

export type FlightConsumerProductionDuffelLiveOfferRepriceResult = Readonly<{
  version: "flight-consumer-production-duffel-live-offer-reprice-result-v1";
  state: "repriced";
  providerCode: "duffel";
  providerEnvironment: "live";
  price: Readonly<{
    currency: "USD";
    amountMinor: number;
  }>;
  owner: Readonly<{
    name: string;
    iataCode: string | null;
    identitySha256: string;
  }>;
  expiresAt: string;
  observedAt: string;
  evidence: Readonly<{
    executionScopeSha256: string;
    authoritySha256: string;
    offerBindingSha256: string;
    offerIdSha256: string;
    sourceOfferEvidenceSha256: string;
    requestSha256: string;
    responseSha256: string;
    normalizedOfferSha256: string;
  }>;
  providerRetrieveOfferDispatchCount: 1;
  automaticRetryAttempted: false;
  rawProviderReferencesExposed: false;
  orderAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
  refundAuthorized: false;
  consumerReleaseEnabled: false;
}>;

export type FlightConsumerProductionDuffelLiveOfferRepriceErrorCode =
  | "workflow_unavailable"
  | "authority_refused"
  | "request_refused"
  | "authority_expired"
  | "authority_consumed"
  | "transport_ambiguous"
  | "provider_redirect_refused"
  | "provider_response_refused"
  | "provider_rejected"
  | "provider_contract_refused"
  | "offer_mismatch"
  | "offer_expired";

export class FlightConsumerProductionDuffelLiveOfferRepriceError extends Error {
  readonly code: FlightConsumerProductionDuffelLiveOfferRepriceErrorCode;
  readonly providerOutcome: "not_dispatched" | "ambiguous" | "definitive_failure";
  readonly blindRetryAuthorized = false as const;

  constructor(
    code: FlightConsumerProductionDuffelLiveOfferRepriceErrorCode,
    providerOutcome: "not_dispatched" | "ambiguous" | "definitive_failure",
  ) {
    super("The bound Duffel Production live offer could not be repriced.");
    this.name = "FlightConsumerProductionDuffelLiveOfferRepriceError";
    this.code = code;
    this.providerOutcome = providerOutcome;
  }
}

type PrivateAuthority = Readonly<{
  offerId: string;
  token: string;
  accountSha256: string;
  credentialSha256: string;
  executionScopeSha256: string;
  authoritySha256: string;
  offerBindingSha256: string;
  offerIdSha256: string;
  sourceOfferEvidenceSha256: string;
  dispatchNotAfterMs: number;
}>;

const issuedAuthorities = new WeakMap<object, PrivateAuthority>();
const consumedAuthorities = new WeakSet<object>();

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function domainSha256(domain: string, value: string) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function equalSha256(left: string, right: string) {
  return sha256Schema.safeParse(left).success
    && sha256Schema.safeParse(right).success
    && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function requireExactGate(
  env: ProductionEnvironment,
  name: string,
  expected: string,
) {
  if (env[name] !== expected) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "workflow_unavailable",
      "not_dispatched",
    );
  }
}

function validNow(now: () => Date) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "workflow_unavailable",
      "not_dispatched",
    );
  }
  return value;
}

export function deriveFlightConsumerProductionDuffelLiveOfferIdSha256(
  offerId: string,
) {
  const accepted = offerIdSchema.safeParse(offerId);
  if (!accepted.success) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "authority_refused",
      "not_dispatched",
    );
  }
  return domainSha256(
    "iratepilot:flight-consumer-production:duffel-live:offer-id:v1",
    accepted.data,
  );
}

export function issueFlightConsumerProductionDuffelLiveOfferRepriceAuthority(
  untrustedInput: unknown,
  env: ProductionEnvironment = process.env,
  now: () => Date = () => new Date(),
): FlightConsumerProductionDuffelLiveOfferRepriceAuthority {
  const accepted = authorityInputSchema.safeParse(untrustedInput);
  if (!accepted.success) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "authority_refused",
      "not_dispatched",
    );
  }

  try {
    requireFlightConsumerProductionDarkRuntime(env);
    requireExactGate(
      env,
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED",
      "true",
    );
    requireExactGate(
      env,
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED",
      "false",
    );
    requireExactGate(
      env,
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED",
      "false",
    );
    requireExactGate(
      env,
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED",
      "false",
    );
    requireExactGate(
      env,
      "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED",
      "false",
    );
    requireExactGate(
      env,
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED",
      "false",
    );
    requireExactGate(
      env,
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED",
      "false",
    );
  } catch {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "workflow_unavailable",
      "not_dispatched",
    );
  }

  let token: string;
  let observedAccountSha256: string;
  let observedCredentialSha256: string;
  try {
    token = validateDuffelLiveAccessToken(env.DUFFEL_LIVE_ACCESS_TOKEN);
    observedAccountSha256 =
      deriveFlightConsumerProductionDuffelAccountSha256(
        env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID ?? "",
      );
    observedCredentialSha256 =
      deriveFlightConsumerProductionDuffelCredentialSha256(token);
  } catch {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "workflow_unavailable",
      "not_dispatched",
    );
  }
  if (
    !equalSha256(
      observedAccountSha256,
      env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256 ?? "",
    )
    || !equalSha256(
      observedCredentialSha256,
      env.FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256 ?? "",
    )
  ) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "workflow_unavailable",
      "not_dispatched",
    );
  }

  const issuedAt = validNow(now);
  const dispatchNotAfterMs = issuedAt.getTime() + authorityLifetimeMs;
  const dispatchNotAfter = new Date(dispatchNotAfterMs).toISOString();
  const offerIdSha256 =
    deriveFlightConsumerProductionDuffelLiveOfferIdSha256(
      accepted.data.offerId,
    );
  const offerBindingSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-duffel-live-offer-binding-v1",
    providerCode: "duffel",
    providerEnvironment: "live",
    offerIdSha256,
    sourceOfferEvidenceSha256: accepted.data.sourceOfferEvidenceSha256,
    sourceShoppingExecutionScopeSha256:
      accepted.data.sourceShoppingExecutionScopeSha256,
  });
  const authorityNonceSha256 = createHash("sha256")
    .update(randomBytes(32))
    .digest("hex");
  const executionScopeSha256 = sha256FlightEvidence({
    version: "flight-consumer-production-duffel-live-offer-reprice-scope-v1",
    providerCode: "duffel",
    providerEnvironment: "live",
    operation: "retrieve_offer",
    accountSha256: observedAccountSha256,
    credentialSha256: observedCredentialSha256,
    offerBindingSha256,
    authorityNonceSha256,
    dispatchNotAfter,
    orderAuthorized: false,
    paymentAuthorized: false,
    ticketingAuthorized: false,
    consumerReleaseEnabled: false,
    transactionKillSwitchEngaged: true,
  });
  const authoritySha256 = sha256FlightEvidence({
    version: "flight-consumer-production-duffel-live-offer-reprice-authority-receipt-v1",
    executionScopeSha256,
    offerBindingSha256,
    authorityNonceSha256,
    dispatchNotAfter,
    confirmation:
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_CONFIRMATION,
  });
  const authority = deepFreeze({
    version:
      "flight-consumer-production-duffel-live-offer-reprice-authority-v1" as const,
    mode: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MODE,
    providerCode: "duffel" as const,
    providerEnvironment: "live" as const,
    executionScopeSha256,
    authoritySha256,
    offerBindingSha256,
    offerIdSha256,
    sourceOfferEvidenceSha256: accepted.data.sourceOfferEvidenceSha256,
    sourceShoppingExecutionScopeSha256:
      accepted.data.sourceShoppingExecutionScopeSha256,
    dispatchNotAfter,
    allowedOperations: ["retrieve_offer"] as const,
    maximumProviderDispatchCount: 1 as const,
    accountBindingVerified: true as const,
    credentialBindingVerified: true as const,
    orderAuthorized: false as const,
    paymentAuthorized: false as const,
    settlementAuthorized: false as const,
    ticketingAuthorized: false as const,
    refundAuthorized: false as const,
    consumerReleaseEnabled: false as const,
    transactionKillSwitchEngaged: true as const,
    [authorityBrand]: true as const,
  });
  issuedAuthorities.set(authority, Object.freeze({
    offerId: accepted.data.offerId,
    token,
    accountSha256: observedAccountSha256,
    credentialSha256: observedCredentialSha256,
    executionScopeSha256,
    authoritySha256,
    offerBindingSha256,
    offerIdSha256,
    sourceOfferEvidenceSha256: accepted.data.sourceOfferEvidenceSha256,
    dispatchNotAfterMs,
  }));
  return authority;
}

function copyResponseBody(body: Uint8Array | null) {
  if (
    !(body instanceof Uint8Array)
    || body.byteLength === 0
    || body.byteLength > FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_MAX_BYTES
    || (
      typeof SharedArrayBuffer !== "undefined"
      && body.buffer instanceof SharedArrayBuffer
    )
  ) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "provider_response_refused",
      "ambiguous",
    );
  }
  const copy = new Uint8Array(body.byteLength);
  copy.set(body);
  return copy;
}

function amountMinor(amount: string) {
  const [whole, fraction] = amount.split(".");
  const value = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "provider_contract_refused",
      "definitive_failure",
    );
  }
  return value;
}

function captureTransport(
  transport: FlightConsumerProductionDuffelLiveOfferRepriceTransport,
) {
  if (
    transport === null
    || typeof transport !== "object"
    || typeof transport.retrieveBoundOffer !== "function"
  ) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "authority_refused",
      "not_dispatched",
    );
  }
  return transport.retrieveBoundOffer.bind(transport);
}

class DisabledFlightConsumerProductionDuffelLiveOfferRepriceAdapter {
  async execute(): Promise<FlightConsumerProductionDuffelLiveOfferRepriceResult> {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "workflow_unavailable",
      "not_dispatched",
    );
  }
}

const disabledAdapter = Object.freeze(
  new DisabledFlightConsumerProductionDuffelLiveOfferRepriceAdapter(),
);

export function createDisabledFlightConsumerProductionDuffelLiveOfferRepriceAdapter() {
  return disabledAdapter;
}

export function deriveFlightConsumerProductionDuffelLiveOfferRepriceRequestSha256(
  authority: FlightConsumerProductionDuffelLiveOfferRepriceAuthority,
) {
  const privateAuthority = issuedAuthorities.get(authority);
  if (privateAuthority === undefined) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "authority_refused",
      "not_dispatched",
    );
  }
  const url = `https://api.duffel.com/air/offers/${privateAuthority.offerId}?return_available_services=false`;
  return sha256FlightEvidence({
    version: "flight-consumer-production-duffel-live-offer-reprice-request-v1",
    executionScopeSha256: privateAuthority.executionScopeSha256,
    authoritySha256: privateAuthority.authoritySha256,
    offerBindingSha256: privateAuthority.offerBindingSha256,
    accountSha256: privateAuthority.accountSha256,
    credentialSha256: privateAuthority.credentialSha256,
    method: "GET",
    url,
  });
}

export function createFlightConsumerProductionDuffelLiveOfferRepriceAdapter(
  dependencies?: Readonly<{
    authority: FlightConsumerProductionDuffelLiveOfferRepriceAuthority;
    transport: FlightConsumerProductionDuffelLiveOfferRepriceTransport;
    now?: () => Date;
  }>,
) {
  if (dependencies === undefined) return disabledAdapter;
  if (dependencies === null || typeof dependencies !== "object") {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "authority_refused",
      "not_dispatched",
    );
  }
  const authority = dependencies.authority;
  const privateAuthority = issuedAuthorities.get(authority);
  if (privateAuthority === undefined) {
    throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
      "authority_refused",
      "not_dispatched",
    );
  }
  const retrieveBoundOffer = captureTransport(dependencies.transport);
  const now = dependencies.now ?? (() => new Date());

  return Object.freeze({
    async execute(
      untrustedInput: unknown,
    ): Promise<FlightConsumerProductionDuffelLiveOfferRepriceResult> {
      const accepted = executionInputSchema.safeParse(untrustedInput);
      if (
        !accepted.success
        || !equalSha256(
          accepted.data.offerBindingSha256,
          privateAuthority.offerBindingSha256,
        )
      ) {
        throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
          "request_refused",
          "not_dispatched",
        );
      }
      if (consumedAuthorities.has(authority)) {
        throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
          "authority_consumed",
          "not_dispatched",
        );
      }
      const dispatchAt = validNow(now);
      if (dispatchAt.getTime() > privateAuthority.dispatchNotAfterMs) {
        throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
          "authority_expired",
          "not_dispatched",
        );
      }

      const url = `https://api.duffel.com/air/offers/${privateAuthority.offerId}?return_available_services=false`;
      const requestSha256 =
        deriveFlightConsumerProductionDuffelLiveOfferRepriceRequestSha256(
          authority,
        );
      const abortController = new AbortController();
      const request = Object.freeze({
        version:
          "flight-consumer-production-duffel-live-offer-reprice-request-v1" as const,
        url,
        method: "GET" as const,
        headers: Object.freeze({
          Accept: "application/json" as const,
          "Accept-Encoding": "identity" as const,
          Authorization: `Bearer ${privateAuthority.token}`,
          "Duffel-Version": "v2" as const,
        }),
        body: null,
        redirect: "error" as const,
        credentials: "omit" as const,
        cache: "no-store" as const,
        signal: abortController.signal,
        executionScopeSha256: privateAuthority.executionScopeSha256,
        authoritySha256: privateAuthority.authoritySha256,
        offerBindingSha256: privateAuthority.offerBindingSha256,
        requestSha256,
      });
      consumedAuthorities.add(authority);

      let response: FlightConsumerProductionDuffelLiveOfferRepriceResponse;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timeoutHandle = setTimeout(() => {
            abortController.abort();
            reject(new FlightConsumerProductionDuffelLiveOfferRepriceError(
              "transport_ambiguous",
              "ambiguous",
            ));
          }, FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_TIMEOUT_MS);
        });
        response = await Promise.race([
          retrieveBoundOffer(request),
          timeout,
        ]);
      } catch {
        throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
          "transport_ambiguous",
          "ambiguous",
        );
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      }
      if (response.redirected || response.url !== url) {
        throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
          "provider_redirect_refused",
          "ambiguous",
        );
      }
      let contentType: string | null;
      let contentLength: string | null;
      let contentEncoding: string | null;
      try {
        contentType = response.headers.get("content-type");
        contentLength = response.headers.get("content-length");
        contentEncoding = response.headers.get("content-encoding");
      } catch {
        throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
          "provider_response_refused",
          "ambiguous",
        );
      }
      if (
        contentType?.split(";", 1)[0]?.trim().toLowerCase()
          !== "application/json"
        || !(
          contentEncoding === null
          || contentEncoding.trim() === ""
          || contentEncoding.trim().toLowerCase() === "identity"
        )
      ) {
        throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
          "provider_response_refused",
          "ambiguous",
        );
      }
      const rawBody = copyResponseBody(response.body);
      try {
        if (
          contentLength !== null
          && (
            !/^(?:0|[1-9]\d*)$/.test(contentLength)
            || Number(contentLength) !== rawBody.byteLength
          )
        ) {
          throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
            "provider_response_refused",
            "ambiguous",
          );
        }
        const responseSha256 = createHash("sha256").update(rawBody).digest("hex");
        if (response.status !== 200) {
          throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
            "provider_rejected",
            "definitive_failure",
          );
        }
        let decoded: unknown;
        try {
          decoded = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
          );
        } catch {
          throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
            "provider_response_refused",
            "ambiguous",
          );
        }
        const provider = providerResponseSchema.safeParse(decoded);
        if (!provider.success) {
          throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
            "provider_contract_refused",
            "definitive_failure",
          );
        }
        if (provider.data.data.id !== privateAuthority.offerId) {
          throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
            "offer_mismatch",
            "definitive_failure",
          );
        }
        const observed = validNow(now);
        const expiresAtMs = Date.parse(provider.data.data.expires_at);
        if (expiresAtMs <= observed.getTime()) {
          throw new FlightConsumerProductionDuffelLiveOfferRepriceError(
            "offer_expired",
            "definitive_failure",
          );
        }
        const expiresAt = new Date(expiresAtMs).toISOString();
        const observedAt = observed.toISOString();
        const owner = {
          name: provider.data.data.owner.name,
          iataCode: provider.data.data.owner.iata_code,
        };
        const ownerIdentitySha256 = sha256FlightEvidence({
          version: "flight-consumer-production-duffel-live-offer-owner-v1",
          ...owner,
        });
        const normalizedPrice = {
          currency: "USD" as const,
          amountMinor: amountMinor(provider.data.data.total_amount),
        };
        const normalizedOfferSha256 = sha256FlightEvidence({
          version: "flight-consumer-production-duffel-live-offer-reprice-normalized-v1",
          offerBindingSha256: privateAuthority.offerBindingSha256,
          price: normalizedPrice,
          owner: {
            ...owner,
            identitySha256: ownerIdentitySha256,
          },
          expiresAt,
          observedAt,
          responseSha256,
        });
        return deepFreeze({
          version:
            "flight-consumer-production-duffel-live-offer-reprice-result-v1" as const,
          state: "repriced" as const,
          providerCode: "duffel" as const,
          providerEnvironment: "live" as const,
          price: normalizedPrice,
          owner: {
            ...owner,
            identitySha256: ownerIdentitySha256,
          },
          expiresAt,
          observedAt,
          evidence: {
            executionScopeSha256: privateAuthority.executionScopeSha256,
            authoritySha256: privateAuthority.authoritySha256,
            offerBindingSha256: privateAuthority.offerBindingSha256,
            offerIdSha256: privateAuthority.offerIdSha256,
            sourceOfferEvidenceSha256:
              privateAuthority.sourceOfferEvidenceSha256,
            requestSha256,
            responseSha256,
            normalizedOfferSha256,
          },
          providerRetrieveOfferDispatchCount: 1 as const,
          automaticRetryAttempted: false as const,
          rawProviderReferencesExposed: false as const,
          orderAuthorized: false as const,
          paymentAuthorized: false as const,
          settlementAuthorized: false as const,
          ticketingAuthorized: false as const,
          refundAuthorized: false as const,
          consumerReleaseEnabled: false as const,
        });
      } finally {
        rawBody.fill(0);
      }
    },
  });
}
