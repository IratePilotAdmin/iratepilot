import "server-only";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { sha256FlightEvidence } from "../runtime-safety";
import {
  deriveFlightConsumerProductionStripeAccountSha256,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
  requireFlightConsumerProductionStripeAccountPreflightRuntime,
  validateFlightConsumerProductionStripeLiveCredential,
} from "./stripe-runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_URL =
  "https://api.stripe.com/v1/account" as const;
export const FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_MAX_BYTES =
  65_536 as const;
export const FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_TIMEOUT_MS =
  15_000 as const;

const sha256Pattern = /^[0-9a-f]{64}$/;
const stripeAccountSchema = z.object({
  id: z.string().regex(/^acct_[A-Za-z0-9]{8,127}$/),
  object: z.literal("account"),
  charges_enabled: z.literal(true),
  details_submitted: z.literal(true),
  default_currency: z.literal("usd"),
});
const inputSchema = z.object({
  confirmation: z.literal(
    FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_CONFIRMATION,
  ),
}).strict();

export type FlightConsumerProductionStripeAccountPreflightErrorCode =
  | "runtime_unavailable"
  | "request_contract_refused"
  | "provider_unavailable"
  | "provider_redirect_refused"
  | "provider_status_refused"
  | "provider_media_type_refused"
  | "provider_response_refused"
  | "provider_contract_refused"
  | "account_binding_mismatch";

export class FlightConsumerProductionStripeAccountPreflightError extends Error {
  readonly status: 409 | 502 | 503 | 504;
  readonly diagnostic: FlightConsumerProductionStripeAccountPreflightErrorCode;
  readonly code: FlightConsumerProductionStripeAccountPreflightErrorCode;

  constructor(code: FlightConsumerProductionStripeAccountPreflightErrorCode) {
    super("The Stripe Production account preflight could not be completed.");
    this.name = "FlightConsumerProductionStripeAccountPreflightError";
    this.status = code === "runtime_unavailable"
      ? 503
      : code === "provider_unavailable"
        ? 504
        : code === "request_contract_refused"
            || code === "account_binding_mismatch"
          ? 409
          : 502;
    this.diagnostic = code;
    this.code = code;
  }
}

export type FlightConsumerProductionStripeAccountPreflightResult = Readonly<{
  version: "flight-consumer-production-stripe-account-preflight-result-v1";
  ready: true;
  liveMode: true;
  executionScopeSha256: string;
  accountSha256: string;
  accountProjectionSha256: string;
  accountObjectVerified: true;
  accountBindingMatched: true;
  credentialBindingMatched: true;
  publishableKeyBindingMatched: true;
  chargesEnabled: true;
  detailsSubmitted: true;
  defaultCurrencyUsd: true;
  providerReadCount: 1;
  stripeRequestCount: 1;
  stripeMutationCount: 0;
  paymentIntentCount: 0;
  chargeCount: 0;
  refundCount: 0;
  providerOrderDispatchCount: 0;
  ticketDispatchCount: 0;
  rawProviderReferencesExposed: false;
  rawProviderResponseStored: false;
  orderEndpointAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
  consumerReleaseEnabled: false;
}>;

type Dependencies = Readonly<{
  fetcher?: typeof fetch;
}>;

function equalSha256(left: string, right: string) {
  if (!sha256Pattern.test(left) || !sha256Pattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function contentTypeIsJson(response: Response) {
  return response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function contentLengthIsSafe(response: Response) {
  const declared = response.headers.get("content-length");
  return declared === null
    || (/^(?:0|[1-9]\d*)$/.test(declared)
      && Number(declared) <= FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_MAX_BYTES);
}

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Disposal cannot grant authority or cause a retry.
  }
}

async function readBoundedResponseBody(response: Response) {
  if (!contentLengthIsSafe(response) || response.body === null) {
    await discardResponseBody(response);
    throw new FlightConsumerProductionStripeAccountPreflightError(
      "provider_response_refused",
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let completed = false;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) {
        completed = true;
        break;
      }
      if (!(part.value instanceof Uint8Array) || chunks.length >= 1_024) {
        throw new FlightConsumerProductionStripeAccountPreflightError(
          "provider_response_refused",
        );
      }
      total += part.value.byteLength;
      if (total > FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_MAX_BYTES) {
        throw new FlightConsumerProductionStripeAccountPreflightError(
          "provider_response_refused",
        );
      }
      chunks.push(part.value);
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}

export function createFlightConsumerProductionStripeAccountPreflightWorkflow(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Dependencies = {},
) {
  let runtime;
  let credential: string;
  try {
    credential = validateFlightConsumerProductionStripeLiveCredential(
      env.FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY,
    );
    runtime = requireFlightConsumerProductionStripeAccountPreflightRuntime({
      ...env,
      FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_KEY: credential,
    });
  } catch {
    throw new FlightConsumerProductionStripeAccountPreflightError(
      "runtime_unavailable",
    );
  }

  const fetcher = dependencies.fetcher ?? fetch;

  return Object.freeze({
    async execute(
      value: unknown,
    ): Promise<FlightConsumerProductionStripeAccountPreflightResult> {
      if (!inputSchema.safeParse(value).success) {
        throw new FlightConsumerProductionStripeAccountPreflightError(
          "request_contract_refused",
        );
      }
      let response: Response;
      try {
        response = await fetcher(
          FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_URL,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "identity",
              Authorization: `Bearer ${credential}`,
            },
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(
              FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_TIMEOUT_MS,
            ),
          },
        );
      } catch {
        throw new FlightConsumerProductionStripeAccountPreflightError(
          "provider_unavailable",
        );
      }

      if (response.redirected) {
        await discardResponseBody(response);
        throw new FlightConsumerProductionStripeAccountPreflightError(
          "provider_redirect_refused",
        );
      }
      if (response.status !== 200 || !response.ok) {
        await discardResponseBody(response);
        throw new FlightConsumerProductionStripeAccountPreflightError(
          "provider_status_refused",
        );
      }
      if (!contentTypeIsJson(response)) {
        await discardResponseBody(response);
        throw new FlightConsumerProductionStripeAccountPreflightError(
          "provider_media_type_refused",
        );
      }

      let rawBody: Uint8Array | null = null;
      let decoded: unknown = null;
      try {
        rawBody = await readBoundedResponseBody(response);
        try {
          decoded = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
          );
        } catch {
          throw new FlightConsumerProductionStripeAccountPreflightError(
            "provider_contract_refused",
          );
        }

        const parsed = stripeAccountSchema.safeParse(decoded);
        decoded = null;
        if (!parsed.success) {
          throw new FlightConsumerProductionStripeAccountPreflightError(
            "provider_contract_refused",
          );
        }

        const accountSha256 =
          deriveFlightConsumerProductionStripeAccountSha256(parsed.data.id);
        if (!equalSha256(
          accountSha256,
          runtime.binding.approvedAccountSha256,
        )) {
          throw new FlightConsumerProductionStripeAccountPreflightError(
            "account_binding_mismatch",
          );
        }

        const accountProjectionSha256 = sha256FlightEvidence({
          version:
            "flight-consumer-production-stripe-account-projection-v1",
          executionScopeSha256: runtime.binding.executionScopeSha256,
          accountSha256,
          accountObjectVerified: true,
          publishableKeyBindingMatched: true,
          chargesEnabled: true,
          detailsSubmitted: true,
          defaultCurrencyUsd: true,
        });

        return Object.freeze({
          version:
            "flight-consumer-production-stripe-account-preflight-result-v1" as const,
          ready: true as const,
          liveMode: true as const,
          executionScopeSha256: runtime.binding.executionScopeSha256,
          accountSha256,
          accountProjectionSha256,
          accountObjectVerified: true as const,
          accountBindingMatched: true as const,
          credentialBindingMatched: true as const,
          publishableKeyBindingMatched: true as const,
          chargesEnabled: true as const,
          detailsSubmitted: true as const,
          defaultCurrencyUsd: true as const,
          providerReadCount: 1 as const,
          stripeRequestCount: 1 as const,
          stripeMutationCount: 0 as const,
          paymentIntentCount: 0 as const,
          chargeCount: 0 as const,
          refundCount: 0 as const,
          providerOrderDispatchCount: 0 as const,
          ticketDispatchCount: 0 as const,
          rawProviderReferencesExposed: false as const,
          rawProviderResponseStored: false as const,
          orderEndpointAuthorized: false as const,
          paymentAuthorized: false as const,
          settlementAuthorized: false as const,
          ticketingAuthorized: false as const,
          consumerReleaseEnabled: false as const,
        });
      } finally {
        decoded = null;
        rawBody?.fill(0);
      }
    },
  });
}
