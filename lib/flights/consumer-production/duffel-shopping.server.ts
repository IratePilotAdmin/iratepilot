import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { validateDuffelLiveAccessToken } from "../duffel/credentials.server";
import {
  canonicalFlightJson,
  sha256FlightEvidence,
  type FlightCanonicalJsonValue,
} from "../runtime-safety";
import {
  deriveFlightConsumerProductionDuffelShoppingOneShotIdempotencySha256,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_CONFIRMATION,
  requireFlightConsumerProductionShoppingDarkRuntime,
} from "./shopping-runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL =
  "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=10000&view=offers" as const;
export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_MAX_BYTES = 4_194_304 as const;
export const FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_TIMEOUT_MS = 15_000 as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const searchSchema = z.object({
  origin: z.string().regex(/^[A-Z]{3}$/),
  destination: z.string().regex(/^[A-Z]{3}$/),
  departureDate: localDateSchema,
  returnDate: localDateSchema.nullable(),
  cabin: z.enum(["economy", "premium_economy", "business", "first"]),
  adults: z.number().int().min(1).max(9),
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
  confirmation: z.literal(FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_CONFIRMATION),
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
const offerSchema = z.object({
  id: z.string().regex(/^off_[A-Za-z0-9]{8,252}$/),
  live_mode: z.literal(true),
  total_amount: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),
  total_currency: z.string().regex(/^[A-Z]{3}$/),
  expires_at: z.string().min(20).max(64).refine((value) => Number.isFinite(Date.parse(value))),
}).passthrough();
const responseSchema = z.object({
  data: z.object({
    id: z.string().regex(/^orq_[A-Za-z0-9]{8,252}$/),
    live_mode: z.literal(true),
    offers: z.array(offerSchema).max(1_000),
  }).passthrough(),
}).passthrough();

type AttemptBeginParameters = Readonly<{
  p_execution_scope_sha256: string;
  p_idempotency_sha256: string;
  p_request_sha256: string;
  p_request_body_sha256: string;
  p_dispatch_not_after: string;
}>;

type AttemptCompleteParameters = Readonly<{
  p_attempt_id: string;
  p_expected_revision: 1;
  p_terminal_state: "succeeded" | "failed" | "ambiguous";
  p_terminal_http_status: number | null;
  p_terminal_response_sha256: string | null;
  p_terminal_response_bytes: number | null;
  p_offer_count: number | null;
}>;

export interface FlightConsumerProductionDuffelShoppingJournalPort {
  begin(parameters: AttemptBeginParameters): Promise<unknown>;
  claim(parameters: Readonly<{
    p_attempt_id: string;
    p_expected_revision: 0;
    p_execution_scope_sha256: string;
  }>): Promise<unknown>;
  complete(parameters: AttemptCompleteParameters): Promise<unknown>;
}

export type FlightConsumerProductionDuffelShoppingResult = Readonly<{
  version: "flight-consumer-production-duffel-shopping-result-v1";
  attemptId: string;
  state: "succeeded";
  replay: boolean;
  liveMode: true;
  offerCount: number;
  responseSha256: string;
  rawProviderReferencesExposed: false;
  bookingAuthorized: false;
  paymentAuthorized: false;
  ticketingAuthorized: false;
}>;

export class FlightConsumerProductionDuffelShoppingError extends Error {
  readonly status: 409 | 502 | 503 | 504;
  readonly diagnostic: string;

  constructor(
    status: 409 | 502 | 503 | 504 = 503,
    diagnostic = "workflow_unavailable",
  ) {
    super("Duffel Production live shopping could not be completed.");
    this.name = "FlightConsumerProductionDuffelShoppingError";
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

class SupabaseFlightConsumerProductionDuffelShoppingJournalPort
implements FlightConsumerProductionDuffelShoppingJournalPort {
  async begin(parameters: AttemptBeginParameters) {
    const { data, error } = await createAdminClient().rpc(
      "prepare_flight_consumer_live_duffel_shopping_attempt_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelShoppingError(503, "journal_prepare_failed");
    return data;
  }

  async claim(parameters: Readonly<{
    p_attempt_id: string;
    p_expected_revision: 0;
    p_execution_scope_sha256: string;
  }>) {
    const { data, error } = await createAdminClient().rpc(
      "claim_flight_consumer_live_duffel_shopping_attempt_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelShoppingError(503, "journal_claim_failed");
    return data;
  }

  async complete(parameters: AttemptCompleteParameters) {
    const { data, error } = await createAdminClient().rpc(
      "complete_flight_consumer_live_duffel_shopping_attempt_v1",
      parameters,
    );
    if (error) throw new FlightConsumerProductionDuffelShoppingError(503, "journal_completion_failed");
    return data;
  }
}

export function createFlightConsumerProductionDuffelShoppingJournalPort():
FlightConsumerProductionDuffelShoppingJournalPort {
  return Object.freeze(new SupabaseFlightConsumerProductionDuffelShoppingJournalPort());
}

function oneRow<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = z.array(schema).length(1).safeParse(value);
  if (!parsed.success) {
    throw new FlightConsumerProductionDuffelShoppingError(503, "journal_receipt_rejected");
  }
  return parsed.data[0]!;
}

function buildRequestBody(search: z.infer<typeof searchSchema>) {
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
      passengers: Array.from({ length: search.adults }, () => ({ type: "adult" })),
      slices,
    },
  } satisfies FlightCanonicalJsonValue;
}

function validateTravelWindow(search: z.infer<typeof searchSchema>, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const maximum = new Date(now.getTime() + 330 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  if (search.departureDate <= today || search.departureDate > maximum) {
    throw new FlightConsumerProductionDuffelShoppingError(409, "travel_window_refused");
  }
  if (search.returnDate !== null && search.returnDate > maximum) {
    throw new FlightConsumerProductionDuffelShoppingError(409, "travel_window_refused");
  }
}

export async function readFlightConsumerProductionDuffelShoppingResponse(
  response: Response,
) {
  const declared = response.headers.get("content-length");
  const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase() ?? null;
  const wireLengthMatchesDecodedLength = contentEncoding === null
    || contentEncoding === ""
    || contentEncoding === "identity";
  if (declared !== null) {
    if (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_MAX_BYTES) {
      throw new FlightConsumerProductionDuffelShoppingError(502, "provider_response_too_large");
    }
  }
  if (response.body === null) {
    throw new FlightConsumerProductionDuffelShoppingError(502, "provider_response_missing");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) {
        throw new FlightConsumerProductionDuffelShoppingError(502, "provider_response_invalid");
      }
      total += value.byteLength;
      if (total > FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_MAX_BYTES || chunks.length >= 4_096) {
        throw new FlightConsumerProductionDuffelShoppingError(502, "provider_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  // Fetch decodes compressed response bodies but may preserve the wire-level
  // Content-Length. Compare lengths only when the representation is identity;
  // the decoded-byte cap above remains authoritative for compressed bodies.
  if (wireLengthMatchesDecodedLength && declared !== null && Number(declared) !== total) {
    throw new FlightConsumerProductionDuffelShoppingError(502, "provider_response_invalid");
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function safeResult(input: Readonly<{
  attemptId: string;
  replay: boolean;
  offerCount: number;
  responseSha256: string;
}>): FlightConsumerProductionDuffelShoppingResult {
  return Object.freeze({
    version: "flight-consumer-production-duffel-shopping-result-v1" as const,
    attemptId: input.attemptId,
    state: "succeeded" as const,
    replay: input.replay,
    liveMode: true as const,
    offerCount: input.offerCount,
    responseSha256: input.responseSha256,
    rawProviderReferencesExposed: false as const,
    bookingAuthorized: false as const,
    paymentAuthorized: false as const,
    ticketingAuthorized: false as const,
  });
}

export function createFlightConsumerProductionDarkDuffelShoppingWorkflow(
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
    runtime = requireFlightConsumerProductionShoppingDarkRuntime({
      ...env,
      DUFFEL_LIVE_ACCESS_TOKEN: token,
    });
  } catch {
    throw new FlightConsumerProductionDuffelShoppingError(503, "workflow_unavailable");
  }
  const journal = dependencies.journal
    ?? createFlightConsumerProductionDuffelShoppingJournalPort();
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());

  return Object.freeze({
    async execute(value: unknown): Promise<FlightConsumerProductionDuffelShoppingResult> {
      const parsed = inputSchema.safeParse(value);
      if (!parsed.success) {
        throw new FlightConsumerProductionDuffelShoppingError(409, "request_contract_refused");
      }
      const observedNow = now();
      validateTravelWindow(parsed.data.search, observedNow);
      const requestBody = buildRequestBody(parsed.data.search);
      const canonicalBody = canonicalFlightJson(requestBody);
      const requestBodySha256 = createHash("sha256").update(canonicalBody, "utf8").digest("hex");
      const requestSha256 = sha256FlightEvidence({
        version: "flight-consumer-production-duffel-shopping-request-v1",
        executionScopeSha256: runtime.binding.executionScopeSha256,
        method: "POST",
        url: FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL,
        bodySha256: requestBodySha256,
      });
      const idempotencySha256 =
        deriveFlightConsumerProductionDuffelShoppingOneShotIdempotencySha256(
          runtime.binding.executionScopeSha256,
        );
      const dispatchNotAfter = new Date(observedNow.getTime() + 60_000).toISOString();
      const begun = oneRow(attemptRowSchema, await journal.begin({
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
        p_idempotency_sha256: idempotencySha256,
        p_request_sha256: requestSha256,
        p_request_body_sha256: requestBodySha256,
        p_dispatch_not_after: dispatchNotAfter,
      }));
      if (begun.decision === "replay") {
        if (
          begun.attempt_state === "succeeded"
          && begun.offer_count !== null
          && begun.terminal_response_sha256 !== null
        ) {
          return safeResult({
            attemptId: begun.attempt_id,
            replay: true,
            offerCount: begun.offer_count,
            responseSha256: begun.terminal_response_sha256,
          });
        }
        if (begun.attempt_state !== "prepared") {
          throw new FlightConsumerProductionDuffelShoppingError(409, "prior_attempt_not_replayable");
        }
      }

      const claimed = oneRow(claimRowSchema, await journal.claim({
        p_attempt_id: begun.attempt_id,
        p_expected_revision: 0,
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
      }));
      if (claimed.attempt_id !== begun.attempt_id) {
        throw new FlightConsumerProductionDuffelShoppingError(503, "journal_claim_rejected");
      }

      let response: Response;
      try {
        response = await fetcher(FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_URL, {
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
          signal: AbortSignal.timeout(FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_TIMEOUT_MS),
        });
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
        throw new FlightConsumerProductionDuffelShoppingError(504, "provider_dispatch_ambiguous");
      }

      let rawBody: Uint8Array | null = null;
      try {
        if (response.redirected) {
          throw new FlightConsumerProductionDuffelShoppingError(502, "provider_redirect_refused");
        }
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (contentType !== "application/json") {
          throw new FlightConsumerProductionDuffelShoppingError(502, "provider_media_type_refused");
        }
        rawBody = await readFlightConsumerProductionDuffelShoppingResponse(response);
        const responseSha256 = createHash("sha256").update(rawBody).digest("hex");
        if (!response.ok) {
          oneRow(completionRowSchema, await journal.complete({
            p_attempt_id: begun.attempt_id,
            p_expected_revision: 1,
            p_terminal_state: "failed",
            p_terminal_http_status: response.status,
            p_terminal_response_sha256: responseSha256,
            p_terminal_response_bytes: rawBody.byteLength,
            p_offer_count: null,
          }));
          throw new FlightConsumerProductionDuffelShoppingError(502, "provider_rejected");
        }
        let decoded: unknown;
        try {
          decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
        } catch {
          throw new FlightConsumerProductionDuffelShoppingError(502, "provider_json_refused");
        }
        const accepted = responseSchema.safeParse(decoded);
        if (!accepted.success) {
          throw new FlightConsumerProductionDuffelShoppingError(502, "provider_contract_refused");
        }
        const completed = oneRow(completionRowSchema, await journal.complete({
          p_attempt_id: begun.attempt_id,
          p_expected_revision: 1,
          p_terminal_state: "succeeded",
          p_terminal_http_status: response.status,
          p_terminal_response_sha256: responseSha256,
          p_terminal_response_bytes: rawBody.byteLength,
          p_offer_count: accepted.data.data.offers.length,
        }));
        if (completed.attempt_id !== begun.attempt_id || completed.attempt_state !== "succeeded") {
          throw new FlightConsumerProductionDuffelShoppingError(503, "journal_completion_rejected");
        }
        return safeResult({
          attemptId: begun.attempt_id,
          replay: begun.decision === "replay",
          offerCount: accepted.data.data.offers.length,
          responseSha256,
        });
      } catch (error) {
        if (error instanceof FlightConsumerProductionDuffelShoppingError && error.diagnostic === "provider_rejected") {
          throw error;
        }
        await journal.complete({
          p_attempt_id: begun.attempt_id,
          p_expected_revision: 1,
          p_terminal_state: "ambiguous",
          p_terminal_http_status: null,
          p_terminal_response_sha256: null,
          p_terminal_response_bytes: null,
          p_offer_count: null,
        }).catch(() => undefined);
        if (error instanceof FlightConsumerProductionDuffelShoppingError) throw error;
        throw new FlightConsumerProductionDuffelShoppingError(503, "journal_completion_failed");
      } finally {
        rawBody?.fill(0);
      }
    },
  });
}
