import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { validateDuffelLiveAccessToken } from "../duffel/credentials.server";
import {
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import {
  buildFlightConsumerProductionDuffelOrderPlan,
  FlightConsumerProductionDuffelOrderPlanError,
  type FlightConsumerProductionDuffelOrderPlanResult,
} from "./duffel-order-plan.server";
import {
  createFlightConsumerProductionDuffelShoppingJournalPort,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_TIMEOUT_MS,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL,
  readFlightConsumerProductionDuffelShoppingResponse,
  type FlightConsumerProductionDuffelShoppingJournalPort,
} from "./duffel-shopping.server";
import {
  deriveFlightConsumerProductionDuffelOrderPlanRehearsalIdempotencySha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION,
  requireFlightConsumerProductionDuffelOrderPlanRehearsalRuntime,
} from "./shopping-runtime.server";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
});
const searchSchema = z.object({
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  departureDate: localDateSchema,
  returnDate: localDateSchema.nullable(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
  adults: z.literal(1),
}).strict().superRefine((value, context) => {
  if (value.origin === value.destination) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destination"],
      message: "Origin and destination must differ.",
    });
  }
  if (value.returnDate !== null && value.returnDate <= value.departureDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["returnDate"],
      message: "Return date must follow departure date.",
    });
  }
});
const inputSchema = z.object({
  confirmation: z.literal(
    FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_CONFIRMATION,
  ),
  search: searchSchema,
}).strict();

const attemptStateSchema = z.enum([
  "prepared",
  "dispatching",
  "succeeded",
  "failed",
  "ambiguous",
]);
const attemptRowSchema = z.object({
  decision: z.enum(["created", "replay"]),
  attempt_id: uuidSchema,
  attempt_state: attemptStateSchema,
  attempt_revision: z.number().int().min(0).max(2),
  terminal_http_status: z.number().int().min(100).max(599).nullable(),
  terminal_response_sha256: sha256Schema.nullable(),
  terminal_response_bytes: z.number().int().nonnegative().nullable(),
  offer_count: z.number().int().min(0).max(1_000).nullable(),
}).strict();
const claimRowSchema = z.object({
  attempt_id: uuidSchema,
  attempt_state: z.literal("dispatching"),
  attempt_revision: z.literal(1),
}).strict();
const completionRowSchema = z.object({
  attempt_id: uuidSchema,
  attempt_state: z.enum(["succeeded", "failed", "ambiguous"]),
  attempt_revision: z.literal(2),
}).strict();

export type FlightConsumerProductionDuffelOrderPlanRehearsalResult = Readonly<{
  version: "flight-consumer-production-duffel-order-plan-rehearsal-result-v1";
  attemptId: string;
  state: "succeeded";
  replay: false;
  liveMode: true;
  offerCount: number;
  eligibleOfferCount: number;
  responseSha256: string;
  selectionPolicySha256: string;
  fictionalTravelerFixtureSha256: string;
  orderRequestBodySha256: string;
  orderRequestEnvelopeSha256: string;
  providerOfferRequestCount: 1;
  providerOrderDispatchCount: 0;
  stripeRequestCount: 0;
  rawProviderReferencesExposed: false;
  orderEndpointAuthorized: false;
  stripeAuthorized: false;
  bookingAuthorized: false;
  paymentAuthorized: false;
  settlementAuthorized: false;
  ticketingAuthorized: false;
}>;

export class FlightConsumerProductionDuffelOrderPlanRehearsalError extends Error {
  readonly status: 409 | 502 | 503 | 504;
  readonly diagnostic: string;

  constructor(
    status: 409 | 502 | 503 | 504 = 503,
    diagnostic = "workflow_unavailable",
  ) {
    super("Duffel Production order-plan rehearsal could not be completed.");
    this.name = "FlightConsumerProductionDuffelOrderPlanRehearsalError";
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
      503,
      "journal_receipt_rejected",
    );
  }
  return parsed.data[0]!;
}

function buildOfferRequestBody(search: z.infer<typeof searchSchema>) {
  const slices: FlightCanonicalJsonValue[] = [{
    origin: search.origin,
    destination: search.destination,
    departure_date: search.departureDate,
  }];
  if (search.returnDate !== null) {
    slices.push({
      origin: search.destination,
      destination: search.origin,
      departure_date: search.returnDate,
    });
  }
  return {
    data: {
      cabin_class: search.cabin,
      passengers: [{ type: "adult" }],
      slices,
    },
  } satisfies FlightCanonicalJsonValue;
}

function validateTravelWindow(search: z.infer<typeof searchSchema>, now: Date) {
  const observed = now.getTime();
  if (!Number.isFinite(observed)) {
    throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
      503,
      "clock_refused",
    );
  }
  const today = now.toISOString().slice(0, 10);
  const maximum = new Date(observed + 330 * 24 * 60 * 60_000)
    .toISOString().slice(0, 10);
  if (
    search.departureDate <= today
    || search.departureDate > maximum
    || (search.returnDate !== null && search.returnDate > maximum)
  ) {
    throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
      409,
      "travel_window_refused",
    );
  }
}

function safeResult(input: Readonly<{
  attemptId: string;
  responseSha256: string;
  plan: FlightConsumerProductionDuffelOrderPlanResult;
}>): FlightConsumerProductionDuffelOrderPlanRehearsalResult {
  return Object.freeze({
    version:
      "flight-consumer-production-duffel-order-plan-rehearsal-result-v1" as const,
    attemptId: input.attemptId,
    state: "succeeded" as const,
    replay: false as const,
    liveMode: true as const,
    offerCount: input.plan.offerCount,
    eligibleOfferCount: input.plan.eligibleOfferCount,
    responseSha256: input.responseSha256,
    selectionPolicySha256: input.plan.selectionPolicySha256,
    fictionalTravelerFixtureSha256:
      input.plan.fictionalTravelerFixtureSha256,
    orderRequestBodySha256: input.plan.orderRequestBodySha256,
    orderRequestEnvelopeSha256: input.plan.orderRequestEnvelopeSha256,
    providerOfferRequestCount: 1 as const,
    providerOrderDispatchCount: input.plan.providerOrderDispatchCount,
    stripeRequestCount: input.plan.stripeRequestCount,
    rawProviderReferencesExposed: input.plan.rawProviderReferencesExposed,
    orderEndpointAuthorized: input.plan.orderEndpointAuthorized,
    stripeAuthorized: input.plan.stripeAuthorized,
    bookingAuthorized: input.plan.bookingAuthorized,
    paymentAuthorized: input.plan.paymentAuthorized,
    settlementAuthorized: input.plan.settlementAuthorized,
    ticketingAuthorized: input.plan.ticketingAuthorized,
  });
}

function plannerFailure(error: FlightConsumerProductionDuffelOrderPlanError) {
  if (error.code === "no_eligible_offer") {
    return new FlightConsumerProductionDuffelOrderPlanRehearsalError(
      409,
      "no_eligible_offer",
    );
  }
  if (error.code === "provider_contract_refused") {
    return new FlightConsumerProductionDuffelOrderPlanRehearsalError(
      502,
      "provider_contract_refused",
    );
  }
  return new FlightConsumerProductionDuffelOrderPlanRehearsalError(
    503,
    "planner_unavailable",
  );
}

export function createFlightConsumerProductionDuffelOrderPlanRehearsalWorkflow(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Readonly<{
    journal?: FlightConsumerProductionDuffelShoppingJournalPort;
    fetcher?: typeof fetch;
    now?: () => Date;
  }> = {},
) {
  let runtime;
  let token: string;
  try {
    token = validateDuffelLiveAccessToken(env.DUFFEL_LIVE_ACCESS_TOKEN);
    runtime = requireFlightConsumerProductionDuffelOrderPlanRehearsalRuntime({
      ...env,
      DUFFEL_LIVE_ACCESS_TOKEN: token,
    });
  } catch {
    throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
      503,
      "workflow_unavailable",
    );
  }

  const journal = dependencies.journal
    ?? createFlightConsumerProductionDuffelShoppingJournalPort();
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());

  return Object.freeze({
    async execute(
      value: unknown,
    ): Promise<FlightConsumerProductionDuffelOrderPlanRehearsalResult> {
      const parsed = inputSchema.safeParse(value);
      if (!parsed.success) {
        throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
          409,
          "request_contract_refused",
        );
      }

      const observedNow = now();
      validateTravelWindow(parsed.data.search, observedNow);
      const requestBody = buildOfferRequestBody(parsed.data.search);
      const canonicalBody = canonicalFlightJson(requestBody);
      const requestBodySha256 = createHash("sha256")
        .update(canonicalBody, "utf8")
        .digest("hex");
      const requestSha256 = sha256FlightEvidence({
        version:
          "flight-consumer-production-duffel-order-plan-rehearsal-offer-request-v1",
        executionScopeSha256: runtime.binding.executionScopeSha256,
        method: "POST",
        url: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL,
        bodySha256: requestBodySha256,
      });
      const idempotencySha256 =
        deriveFlightConsumerProductionDuffelOrderPlanRehearsalIdempotencySha256(
          runtime.binding.executionScopeSha256,
        );
      const dispatchNotAfter = new Date(observedNow.getTime() + 60_000)
        .toISOString();
      const begun = oneRow(attemptRowSchema, await journal.begin({
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
        p_idempotency_sha256: idempotencySha256,
        p_request_sha256: requestSha256,
        p_request_body_sha256: requestBodySha256,
        p_dispatch_not_after: dispatchNotAfter,
      }));
      if (begun.decision === "replay" && begun.attempt_state !== "prepared") {
        throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
          409,
          "prior_attempt_not_replayable",
        );
      }

      const claimed = oneRow(claimRowSchema, await journal.claim({
        p_attempt_id: begun.attempt_id,
        p_expected_revision: 0,
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
      }));
      if (claimed.attempt_id !== begun.attempt_id) {
        throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
          503,
          "journal_claim_rejected",
        );
      }

      let response: Response;
      try {
        response = await fetcher(
          FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "identity",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Duffel-Version": "v2",
            },
            body: canonicalBody,
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(
              FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_TIMEOUT_MS,
            ),
          },
        );
      } catch {
        await journal.complete({
          p_attempt_id: begun.attempt_id,
          p_expected_revision: 1,
          p_terminal_state: "ambiguous",
          p_terminal_http_status: null,
          p_terminal_response_sha256: null,
          p_terminal_response_bytes: null,
          p_offer_count: null,
        }).catch(() => undefined);
        throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
          504,
          "provider_dispatch_ambiguous",
        );
      }

      let rawBody: Uint8Array | null = null;
      let terminalRecorded = false;
      try {
        if (response.redirected) {
          throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
            502,
            "provider_redirect_refused",
          );
        }
        const contentType = response.headers.get("content-type")
          ?.split(";", 1)[0]?.trim().toLowerCase();
        if (contentType !== "application/json") {
          throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
            502,
            "provider_media_type_refused",
          );
        }
        try {
          rawBody = await readFlightConsumerProductionDuffelShoppingResponse(
            response,
          );
        } catch {
          throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
            502,
            "provider_response_refused",
          );
        }
        const responseSha256 = createHash("sha256").update(rawBody).digest("hex");

        if (!response.ok) {
          const completed = oneRow(completionRowSchema, await journal.complete({
            p_attempt_id: begun.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "failed",
            p_terminal_http_status: response.status,
            p_terminal_response_sha256: responseSha256,
            p_terminal_response_bytes: rawBody.byteLength,
            p_offer_count: null,
          }));
          terminalRecorded = true;
          if (completed.attempt_id !== begun.attempt_id) {
            throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
              503,
              "journal_completion_rejected",
            );
          }
          throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
            502,
            "provider_rejected",
          );
        }

        let decoded: unknown;
        let plan: FlightConsumerProductionDuffelOrderPlanResult;
        try {
          decoded = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
          );
          plan = buildFlightConsumerProductionDuffelOrderPlan(
            decoded,
            observedNow,
          );
          decoded = null;
        } catch (error) {
          decoded = null;
          const completed = oneRow(completionRowSchema, await journal.complete({
            p_attempt_id: begun.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "failed",
            p_terminal_http_status: response.status,
            p_terminal_response_sha256: responseSha256,
            p_terminal_response_bytes: rawBody.byteLength,
            p_offer_count: null,
          }));
          terminalRecorded = true;
          if (completed.attempt_id !== begun.attempt_id) {
            throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
              503,
              "journal_completion_rejected",
            );
          }
          throw error instanceof FlightConsumerProductionDuffelOrderPlanError
            ? plannerFailure(error)
            : new FlightConsumerProductionDuffelOrderPlanRehearsalError(
              502,
              "provider_json_refused",
            );
        }

        const completed = oneRow(completionRowSchema, await journal.complete({
          p_attempt_id: begun.attempt_id,
          p_expected_revision: 1,
          p_terminal_state: "succeeded",
          p_terminal_http_status: response.status,
          p_terminal_response_sha256: responseSha256,
          p_terminal_response_bytes: rawBody.byteLength,
          p_offer_count: plan.offerCount,
        }));
        terminalRecorded = true;
        if (
          completed.attempt_id !== begun.attempt_id
          || completed.attempt_state !== "succeeded"
        ) {
          throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
            503,
            "journal_completion_rejected",
          );
        }
        return safeResult({
          attemptId: begun.attempt_id,
          responseSha256,
          plan,
        });
      } catch (error) {
        if (!terminalRecorded) {
          await journal.complete({
            p_attempt_id: begun.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "ambiguous",
            p_terminal_http_status: null,
            p_terminal_response_sha256: null,
            p_terminal_response_bytes: null,
            p_offer_count: null,
          }).catch(() => undefined);
        }
        if (
          error
          instanceof FlightConsumerProductionDuffelOrderPlanRehearsalError
        ) {
          throw error;
        }
        throw new FlightConsumerProductionDuffelOrderPlanRehearsalError(
          503,
          "journal_completion_failed",
        );
      } finally {
        rawBody?.fill(0);
      }
    },
  });
}
