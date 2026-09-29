import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { sha256FlightEvidence } from "../runtime-safety";
import {
  canonicalFlightConsumerProductionPublicShoppingSearchJson,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
  flightConsumerProductionPublicShoppingSearchSchema,
  validateFlightConsumerProductionPublicShoppingTravelWindow,
} from "./public-shopping-contract";
import {
  requireFlightConsumerProductionPublicShoppingPreviewRuntime,
} from "./public-shopping-runtime.server";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MODE =
  "flight_consumer_production_public_shopping_admission" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MIGRATION_VERSION =
  "202608260115" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_RPC =
  "reserve_flight_consumer_live_public_shopping_admission_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PRE_RPC_LIMITER_VERSION =
  "flight-consumer-production-public-shopping-pre-rpc-limiter-v1" as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().min(20).max(64).refine(
  (value) => Number.isFinite(Date.parse(value)),
);

type ProductionEnvironment = Readonly<Record<string, string | undefined>>;

const authorityResultShape = {
  provider_dispatch_authorized: z.literal(false),
  consumer_exposure_authorized: z.literal(false),
  order_authorized: z.literal(false),
  stripe_dispatch_authorized: z.literal(false),
  booking_authorized: z.literal(false),
  payment_authorized: z.literal(false),
  capture_authorized: z.literal(false),
  refund_authorized: z.literal(false),
  settlement_authorized: z.literal(false),
  ticketing_authorized: z.literal(false),
  servicing_authorized: z.literal(false),
  consumer_release_enabled: z.literal(false),
  blind_retry_authorized: z.literal(false),
} as const;

const admissionReceiptSchema = z.object({
  decision: z.enum(["created", "refused", "replay"]),
  admission_id: uuidSchema,
  admission_policy_sha256: sha256Schema,
  admission_state: z.enum(["admitted", "refused"]),
  refusal_code: z.enum([
    "subject_minute_budget_exhausted",
    "subject_day_budget_exhausted",
    "cohort_minute_budget_exhausted",
    "cohort_day_budget_exhausted",
    "global_minute_budget_exhausted",
    "global_day_budget_exhausted",
  ]).nullable(),
  budget_claimed: z.boolean(),
  claim_expires_at: instantSchema.nullable(),
  subject_minute_claim_count: z.number().int().nonnegative(),
  subject_day_claim_count: z.number().int().nonnegative(),
  cohort_minute_claim_count: z.number().int().nonnegative(),
  cohort_day_claim_count: z.number().int().nonnegative(),
  global_minute_claim_count: z.number().int().nonnegative(),
  global_day_claim_count: z.number().int().nonnegative(),
  admission_receipt_sha256: sha256Schema,
  ...authorityResultShape,
}).strict().superRefine((value, context) => {
  const admitted = value.admission_state === "admitted"
    && value.budget_claimed
    && value.claim_expires_at !== null
    && value.refusal_code === null;
  const refused = value.admission_state === "refused"
    && !value.budget_claimed
    && value.claim_expires_at === null
    && value.refusal_code !== null;
  if (!admitted && !refused) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["admission_state"],
      message: "The admission receipt state is inconsistent.",
    });
  }
  if (value.decision === "created" && !admitted) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decision"],
      message: "A created admission must claim budget.",
    });
  }
  if (value.decision === "refused" && !refused) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decision"],
      message: "A refused admission cannot claim budget.",
    });
  }
});

const reserveInputSchema = z.object({
  idempotencyKey: uuidSchema,
  search: z.unknown(),
}).strict();

const preRpcLimiterResultSchema = z.object({
  decision: z.enum(["allowed", "refused"]),
  executionScopeSha256: sha256Schema,
  subjectSha256: sha256Schema,
  idempotencySha256: sha256Schema,
  requestSha256: sha256Schema,
  limiterReceiptSha256: sha256Schema,
}).strict();

export type FlightConsumerProductionPublicShoppingTrustedIdentityCapability =
  Readonly<{
    kind:
      "flight-consumer-production-public-shopping-trusted-identity-capability-v1";
    serializable: false;
  }>;

class TrustedAuthenticatedCustomerIdentityCapability
implements FlightConsumerProductionPublicShoppingTrustedIdentityCapability {
  readonly kind =
    "flight-consumer-production-public-shopping-trusted-identity-capability-v1" as const;
  readonly serializable = false as const;
  readonly #customerId: string;

  constructor(customerId: string) {
    this.#customerId = customerId;
    Object.freeze(this);
  }

  static read(value: unknown) {
    if (!(value instanceof TrustedAuthenticatedCustomerIdentityCapability)) {
      throw new TypeError("A trusted server-auth identity capability is required.");
    }
    return value.#customerId;
  }

  toJSON(): never {
    throw new TypeError("Trusted server-auth identity cannot be serialized.");
  }

  toString() {
    return "[FlightConsumerProductionPublicShoppingTrustedIdentityCapability REDACTED]";
  }
}

export function createFlightConsumerProductionPublicShoppingTrustedIdentityCapability(
  serverAuthenticatedCustomerId: unknown,
): FlightConsumerProductionPublicShoppingTrustedIdentityCapability {
  const accepted = uuidSchema.safeParse(serverAuthenticatedCustomerId);
  if (!accepted.success) {
    throw new TypeError("The trusted server-auth customer identity is invalid.");
  }
  return new TrustedAuthenticatedCustomerIdentityCapability(accepted.data);
}

export type FlightConsumerProductionPublicShoppingPreRpcLimiter = Readonly<{
  version:
    typeof FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PRE_RPC_LIMITER_VERSION;
  routeExposed: false;
  authenticatedSubjectRequired: true;
  distributedBudgetEnforced: true;
  failClosed: true;
  budget: typeof FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET;
  consume: (input: Readonly<{
    executionScopeSha256: string;
    cohortSha256: string;
    subjectSha256: string;
    idempotencySha256: string;
    requestSha256: string;
  }>) => Promise<unknown>;
}>;

export type FlightConsumerProductionPublicShoppingAdmissionRuntimeDecision =
  | Readonly<{
    authorized: true;
    mode: typeof FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MODE;
    reasons: readonly [];
    binding: Readonly<{
      prerequisiteExecutionScopeSha256: string;
      executionScopeSha256: string;
      policySha256: string;
      admissionPolicySha256: string;
      cohortSha256: string;
      allowedDatabaseOperations: readonly ["reserve_public_shopping_budget"];
      persistenceEnabled: true;
      budgetClaimEnabled: true;
      trustedIdentityCapabilityRequired: true;
      preRpcAuthenticatedLimiterRequired: true;
      refusalEvidenceCoalesced: true;
      postLockTrustedClockRequired: true;
      providerDispatchEnabled: false;
      consumerExposureEnabled: false;
      orderEndpointEnabled: false;
      stripeEnabled: false;
      bookingEnabled: false;
      paymentEnabled: false;
      captureEnabled: false;
      refundEnabled: false;
      settlementEnabled: false;
      ticketingEnabled: false;
      servicingEnabled: false;
      consumerReleaseEnabled: false;
      blindRetryEnabled: false;
      transactionKillSwitchEngaged: true;
    }>;
  }>
  | Readonly<{
    authorized: false;
    mode: "disabled";
    reasons: readonly string[];
    binding: null;
  }>;

export class FlightConsumerProductionPublicShoppingAdmissionUnavailableError
  extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super("Flight Consumer Production public-shopping admission is unavailable.");
    this.name =
      "FlightConsumerProductionPublicShoppingAdmissionUnavailableError";
    this.reasons = Object.freeze([...reasons]);
  }
}

export class FlightConsumerProductionPublicShoppingAdmissionError
  extends Error {
  readonly reason:
    | "invalid_input"
    | "limiter_refused"
    | "rpc_refused"
    | "invalid_result";

  constructor(reason: FlightConsumerProductionPublicShoppingAdmissionError["reason"]) {
    super("Flight Consumer Production public-shopping admission was refused.");
    this.name = "FlightConsumerProductionPublicShoppingAdmissionError";
    this.reason = reason;
  }
}

export type FlightConsumerProductionPublicShoppingAdmissionRpcClient = Readonly<{
  rpc: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<Readonly<{
    data: unknown;
    error: Readonly<{ code?: string | null }> | null;
  }>>;
}>;

export type FlightConsumerProductionPublicShoppingAdmissionRepository =
  Readonly<{
    version: "flight-consumer-production-public-shopping-admission-repository-v1";
    migrationVersion:
      typeof FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MIGRATION_VERSION;
    routeExposed: false;
    providerTransportImplemented: false;
    providerDispatchAuthorized: false;
    reserve: (
      args: Readonly<Record<string, unknown>>,
    ) => Promise<z.output<typeof admissionReceiptSchema>>;
  }>;

type FlightConsumerProductionPublicShoppingBudget = Readonly<{
  subjectMinute: number;
  subjectDay: number;
  cohortMinute: number;
  cohortDay: number;
  globalMinute: number;
  globalDay: number;
  claimTtlSeconds: number;
}>;

export function deriveFlightConsumerProductionPublicShoppingAdmissionPolicySha256(
  policySha256: string,
  budget: FlightConsumerProductionPublicShoppingBudget =
    FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
) {
  if (!sha256Schema.safeParse(policySha256).success) {
    throw new TypeError("The public-shopping policy binding is invalid.");
  }
  return createHash("sha256")
    .update(
      "iratepilot:flight-consumer-production:public-shopping-admission-policy:v1",
      "utf8",
    )
    .update("\0", "utf8")
    .update([
      policySha256,
      `subjectMinute=${budget.subjectMinute}`,
      `subjectDay=${budget.subjectDay}`,
      `cohortMinute=${budget.cohortMinute}`,
      `cohortDay=${budget.cohortDay}`,
      `globalMinute=${budget.globalMinute}`,
      `globalDay=${budget.globalDay}`,
      `claimTtlSeconds=${budget.claimTtlSeconds}`,
    ].join(":"), "utf8")
    .digest("hex");
}

export function deriveFlightConsumerProductionPublicShoppingAdmissionExecutionScopeSha256(
  input: Readonly<{
    prerequisiteExecutionScopeSha256: string;
    policySha256: string;
    cohortSha256: string;
  }>,
  budget: FlightConsumerProductionPublicShoppingBudget =
    FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
) {
  const admissionPolicySha256 =
    deriveFlightConsumerProductionPublicShoppingAdmissionPolicySha256(
      input.policySha256,
      budget,
    );
  return sha256FlightEvidence({
    version:
      "flight-consumer-production-public-shopping-admission-execution-scope-v1",
    migrationVersion:
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MIGRATION_VERSION,
    prerequisiteExecutionScopeSha256: input.prerequisiteExecutionScopeSha256,
    admissionPolicySha256,
    cohortSha256: input.cohortSha256,
    allowedDatabaseOperations: ["reserve_public_shopping_budget"],
    persistenceEnabled: true,
    budgetClaimEnabled: true,
    trustedIdentityCapabilityRequired: true,
    preRpcAuthenticatedLimiterRequired: true,
    refusalEvidenceCoalesced: true,
    postLockTrustedClockRequired: true,
    providerDispatchEnabled: false,
    consumerExposureEnabled: false,
    orderEndpointEnabled: false,
    stripeEnabled: false,
    bookingEnabled: false,
    paymentEnabled: false,
    captureEnabled: false,
    refundEnabled: false,
    settlementEnabled: false,
    ticketingEnabled: false,
    servicingEnabled: false,
    consumerReleaseEnabled: false,
    blindRetryEnabled: false,
  });
}

export function resolveFlightConsumerProductionPublicShoppingAdmissionRuntime(
  env: ProductionEnvironment = process.env,
): FlightConsumerProductionPublicShoppingAdmissionRuntimeDecision {
  const reasons: string[] = [];
  let prerequisite: ReturnType<
    typeof requireFlightConsumerProductionPublicShoppingPreviewRuntime
  > | null = null;
  try {
    prerequisite =
      requireFlightConsumerProductionPublicShoppingPreviewRuntime(env);
  } catch {
    reasons.push("The public-shopping prerequisite is unavailable.");
  }
  if (
    env.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_ENABLED
    !== "true"
  ) {
    reasons.push("The dedicated public-shopping admission gate is disabled.");
  }
  const policySha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256 ?? "";
  const cohortSha256 =
    env.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256 ?? "";
  if (policySha256 === cohortSha256) {
    reasons.push("The public-shopping policy and cohort bindings are not independent.");
  }
  if (reasons.length > 0 || prerequisite === null) {
    return Object.freeze({
      authorized: false as const,
      mode: "disabled" as const,
      reasons: Object.freeze([...new Set(reasons)]),
      binding: null,
    });
  }
  const admissionPolicySha256 =
    deriveFlightConsumerProductionPublicShoppingAdmissionPolicySha256(
      policySha256,
    );
  const executionScopeSha256 =
    deriveFlightConsumerProductionPublicShoppingAdmissionExecutionScopeSha256({
      prerequisiteExecutionScopeSha256:
        prerequisite.binding.executionScopeSha256,
      policySha256,
      cohortSha256,
    });
  return Object.freeze({
    authorized: true as const,
    mode: FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MODE,
    reasons: Object.freeze([]) as readonly [],
    binding: Object.freeze({
      prerequisiteExecutionScopeSha256:
        prerequisite.binding.executionScopeSha256,
      executionScopeSha256,
      policySha256,
      admissionPolicySha256,
      cohortSha256,
      allowedDatabaseOperations: Object.freeze([
        "reserve_public_shopping_budget",
      ] as const),
      persistenceEnabled: true as const,
      budgetClaimEnabled: true as const,
      trustedIdentityCapabilityRequired: true as const,
      preRpcAuthenticatedLimiterRequired: true as const,
      refusalEvidenceCoalesced: true as const,
      postLockTrustedClockRequired: true as const,
      providerDispatchEnabled: false as const,
      consumerExposureEnabled: false as const,
      orderEndpointEnabled: false as const,
      stripeEnabled: false as const,
      bookingEnabled: false as const,
      paymentEnabled: false as const,
      captureEnabled: false as const,
      refundEnabled: false as const,
      settlementEnabled: false as const,
      ticketingEnabled: false as const,
      servicingEnabled: false as const,
      consumerReleaseEnabled: false as const,
      blindRetryEnabled: false as const,
      transactionKillSwitchEngaged: true as const,
    }),
  });
}

export function requireFlightConsumerProductionPublicShoppingAdmissionRuntime(
  env: ProductionEnvironment = process.env,
) {
  const decision =
    resolveFlightConsumerProductionPublicShoppingAdmissionRuntime(env);
  if (!decision.authorized) {
    throw new FlightConsumerProductionPublicShoppingAdmissionUnavailableError(
      decision.reasons,
    );
  }
  return decision;
}

export function createFlightConsumerProductionPublicShoppingAdmissionRepository(
  client: FlightConsumerProductionPublicShoppingAdmissionRpcClient,
): FlightConsumerProductionPublicShoppingAdmissionRepository {
  return Object.freeze({
    version:
      "flight-consumer-production-public-shopping-admission-repository-v1" as const,
    migrationVersion:
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MIGRATION_VERSION,
    routeExposed: false as const,
    providerTransportImplemented: false as const,
    providerDispatchAuthorized: false as const,
    async reserve(args) {
      let response: Awaited<ReturnType<typeof client.rpc>>;
      try {
        response = await client.rpc(
          FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_RPC,
          args,
        );
      } catch {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "rpc_refused",
        );
      }
      if (response.error !== null) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "rpc_refused",
        );
      }
      const rows = z.array(z.unknown()).length(1).safeParse(response.data);
      if (!rows.success) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "invalid_result",
        );
      }
      const receipt = admissionReceiptSchema.safeParse(rows.data[0]);
      if (!receipt.success) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "invalid_result",
        );
      }
      return Object.freeze(receipt.data);
    },
  });
}

export function createFlightConsumerProductionPublicShoppingAdmissionService(
  env: ProductionEnvironment = process.env,
  dependencies: Readonly<{
    preRpcLimiter: FlightConsumerProductionPublicShoppingPreRpcLimiter;
    repository?: FlightConsumerProductionPublicShoppingAdmissionRepository;
    now?: () => Date;
  }>,
) {
  const runtime =
    requireFlightConsumerProductionPublicShoppingAdmissionRuntime(env);
  const repository = dependencies.repository
    ?? createFlightConsumerProductionPublicShoppingAdmissionRepository(
      {
        async rpc(name, args) {
          const { data, error } = await createAdminClient().rpc(name, args);
          return {
            data,
            error: error === null ? null : { code: error.code },
          };
        },
      },
    );
  const now = dependencies.now ?? (() => new Date());
  const preRpcLimiter = dependencies.preRpcLimiter as
    | FlightConsumerProductionPublicShoppingPreRpcLimiter
    | null
    | undefined;
  const expectedBudget = FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET;
  if (
    preRpcLimiter === null
    || preRpcLimiter === undefined
    || preRpcLimiter.version
      !== FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PRE_RPC_LIMITER_VERSION
    || preRpcLimiter.routeExposed !== false
    || preRpcLimiter.authenticatedSubjectRequired !== true
    || preRpcLimiter.distributedBudgetEnforced !== true
    || preRpcLimiter.failClosed !== true
    || typeof preRpcLimiter.consume !== "function"
    || preRpcLimiter.budget === null
    || preRpcLimiter.budget === undefined
    || preRpcLimiter.budget.subjectMinute !== expectedBudget.subjectMinute
    || preRpcLimiter.budget.subjectDay !== expectedBudget.subjectDay
    || preRpcLimiter.budget.cohortMinute !== expectedBudget.cohortMinute
    || preRpcLimiter.budget.cohortDay !== expectedBudget.cohortDay
    || preRpcLimiter.budget.globalMinute !== expectedBudget.globalMinute
    || preRpcLimiter.budget.globalDay !== expectedBudget.globalDay
    || preRpcLimiter.budget.claimTtlSeconds !== expectedBudget.claimTtlSeconds
  ) {
    throw new FlightConsumerProductionPublicShoppingAdmissionError(
      "limiter_refused",
    );
  }

  return Object.freeze({
    version: "flight-consumer-production-public-shopping-admission-service-v1" as const,
    migrationVersion:
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MIGRATION_VERSION,
    routeExposed: false as const,
    providerTransportImplemented: false as const,
    providerDispatchAuthorized: false as const,
    consumerExposureAuthorized: false as const,
    trustedIdentityCapabilityRequired: true as const,
    preRpcAuthenticatedLimiterRequired: true as const,
    async reserve(
      input: unknown,
      trustedIdentityCapability:
        FlightConsumerProductionPublicShoppingTrustedIdentityCapability,
    ) {
      const envelope = reserveInputSchema.safeParse(input);
      let trustedAuthenticatedCustomerId: string;
      try {
        trustedAuthenticatedCustomerId =
          TrustedAuthenticatedCustomerIdentityCapability.read(
            trustedIdentityCapability,
          );
      } catch {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "invalid_input",
        );
      }
      if (!envelope.success) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "invalid_input",
        );
      }
      const search = flightConsumerProductionPublicShoppingSearchSchema
        .safeParse(envelope.data.search);
      if (
        !search.success
        || !validateFlightConsumerProductionPublicShoppingTravelWindow(
          search.data,
          now(),
        )
      ) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "invalid_input",
        );
      }

      const subjectSha256 = sha256FlightEvidence({
        version:
          "flight-consumer-production-public-shopping-admission-subject-v1",
        executionScopeSha256: runtime.binding.executionScopeSha256,
        customerId: trustedAuthenticatedCustomerId,
      });
      const idempotencySha256 = sha256FlightEvidence({
        version:
          "flight-consumer-production-public-shopping-admission-idempotency-v1",
        executionScopeSha256: runtime.binding.executionScopeSha256,
        subjectSha256,
        idempotencyKey: envelope.data.idempotencyKey,
      });
      const requestSha256 = sha256FlightEvidence({
        version:
          "flight-consumer-production-public-shopping-admission-request-v1",
        executionScopeSha256: runtime.binding.executionScopeSha256,
        policySha256: runtime.binding.policySha256,
        admissionPolicySha256: runtime.binding.admissionPolicySha256,
        cohortSha256: runtime.binding.cohortSha256,
        subjectSha256,
        search: JSON.parse(
          canonicalFlightConsumerProductionPublicShoppingSearchJson(
            search.data,
          ),
        ) as {
          adults: number;
          cabin: string;
          departureDate: string;
          destination: string;
          origin: string;
          returnDate: string | null;
        },
      });
      if (new Set([
        runtime.binding.executionScopeSha256,
        runtime.binding.policySha256,
        runtime.binding.cohortSha256,
        subjectSha256,
        idempotencySha256,
        requestSha256,
      ]).size !== 6) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "invalid_input",
        );
      }
      let limiterResult: z.output<typeof preRpcLimiterResultSchema>;
      try {
        const result = preRpcLimiterResultSchema.safeParse(
          await preRpcLimiter.consume({
            executionScopeSha256: runtime.binding.executionScopeSha256,
            cohortSha256: runtime.binding.cohortSha256,
            subjectSha256,
            idempotencySha256,
            requestSha256,
          }),
        );
        if (!result.success) throw new Error("invalid_limiter_result");
        limiterResult = result.data;
      } catch {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "limiter_refused",
        );
      }
      if (
        limiterResult.decision !== "allowed"
        || limiterResult.executionScopeSha256
          !== runtime.binding.executionScopeSha256
        || limiterResult.subjectSha256 !== subjectSha256
        || limiterResult.idempotencySha256 !== idempotencySha256
        || limiterResult.requestSha256 !== requestSha256
        || new Set([
          runtime.binding.executionScopeSha256,
          subjectSha256,
          idempotencySha256,
          requestSha256,
          limiterResult.limiterReceiptSha256,
        ]).size !== 5
      ) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "limiter_refused",
        );
      }
      const receipt = await repository.reserve({
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
        p_policy_sha256: runtime.binding.policySha256,
        p_cohort_sha256: runtime.binding.cohortSha256,
        p_subject_sha256: subjectSha256,
        p_idempotency_sha256: idempotencySha256,
        p_request_sha256: requestSha256,
      });
      if (
        receipt.admission_policy_sha256
        !== runtime.binding.admissionPolicySha256
      ) {
        throw new FlightConsumerProductionPublicShoppingAdmissionError(
          "invalid_result",
        );
      }
      return Object.freeze({
        version:
          "flight-consumer-production-public-shopping-admission-receipt-v1" as const,
        decision: receipt.decision,
        admissionId: receipt.admission_id,
        admissionState: receipt.admission_state,
        refusalCode: receipt.refusal_code,
        budgetClaimed: receipt.budget_claimed,
        claimExpiresAt: receipt.claim_expires_at === null
          ? null
          : new Date(receipt.claim_expires_at).toISOString(),
        subjectSha256,
        idempotencySha256,
        requestSha256,
        preRpcLimiterReceiptSha256: limiterResult.limiterReceiptSha256,
        admissionPolicySha256: receipt.admission_policy_sha256,
        admissionReceiptSha256: receipt.admission_receipt_sha256,
        observedClaims: Object.freeze({
          subjectMinute: receipt.subject_minute_claim_count,
          subjectDay: receipt.subject_day_claim_count,
          cohortMinute: receipt.cohort_minute_claim_count,
          cohortDay: receipt.cohort_day_claim_count,
          globalMinute: receipt.global_minute_claim_count,
          globalDay: receipt.global_day_claim_count,
        }),
        providerDispatchAuthorized: false as const,
        consumerExposureAuthorized: false as const,
        orderAuthorized: false as const,
        stripeDispatchAuthorized: false as const,
        bookingAuthorized: false as const,
        paymentAuthorized: false as const,
        captureAuthorized: false as const,
        refundAuthorized: false as const,
        settlementAuthorized: false as const,
        ticketingAuthorized: false as const,
        servicingAuthorized: false as const,
        consumerReleaseEnabled: false as const,
        blindRetryAuthorized: false as const,
      });
    },
  });
}
