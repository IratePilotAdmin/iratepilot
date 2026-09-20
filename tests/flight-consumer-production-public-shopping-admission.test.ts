import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionPublicShoppingAdmissionRepository,
  createFlightConsumerProductionPublicShoppingAdmissionService,
  createFlightConsumerProductionPublicShoppingTrustedIdentityCapability,
  deriveFlightConsumerProductionPublicShoppingAdmissionExecutionScopeSha256,
  deriveFlightConsumerProductionPublicShoppingAdmissionPolicySha256,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MODE,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PRE_RPC_LIMITER_VERSION,
  resolveFlightConsumerProductionPublicShoppingAdmissionRuntime,
} from "../lib/flights/consumer-production/public-shopping-admission.server";
import {
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
} from "../lib/flights/consumer-production/public-shopping-contract";

const token = `duffel_live_${"P".repeat(32)}`;
const sourceCommitSha = "1".repeat(40);
const policySha256 = "2".repeat(64);
const cohortSha256 = "3".repeat(64);
const customerId = "00000000-0000-4000-8000-000000000001";
const idempotencyKey = "00000000-0000-4000-8000-000000000002";
const admissionId = "00000000-0000-4000-8000-000000000003";
const admissionPolicySha256 =
  deriveFlightConsumerProductionPublicShoppingAdmissionPolicySha256(
    policySha256,
  );

const baseEnv = Object.freeze({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: sourceCommitSha,
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256: policySha256,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256: cohortSha256,
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA:
    sourceCommitSha,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "false",
  FLIGHT_RUNTIME_MODE: "production",
  FLIGHT_RUNTIME_ENVIRONMENT: "production",
  FLIGHT_RUNTIME_ENABLED: "false",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "false",
  FLIGHT_BOOKING_ENABLED: "false",
  FLIGHT_PAYMENT_ENABLED: "false",
  FLIGHT_SETTLEMENT_ENABLED: "false",
  FLIGHT_TICKETING_ENABLED: "false",
  FLIGHT_SERVICING_ENABLED: "false",
  FLIGHT_WEBHOOKS_ENABLED: "false",
  FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
  FLIGHT_TRANSACTION_KILL_SWITCH: "engaged",
  DUFFEL_LIVE_ACCESS_TOKEN: token,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "duffel-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
}) satisfies Record<string, string>;

const search = Object.freeze({
  origin: "ORD",
  destination: "LHR",
  departureDate: "2026-09-01",
  returnDate: "2026-09-08",
  cabin: "economy" as const,
  adults: 2,
});

const admittedReceipt = Object.freeze({
  decision: "created",
  admission_id: admissionId,
  admission_policy_sha256: admissionPolicySha256,
  admission_state: "admitted",
  refusal_code: null,
  budget_claimed: true,
  claim_expires_at: "2026-08-27T18:31:00.000Z",
  subject_minute_claim_count: 1,
  subject_day_claim_count: 1,
  cohort_minute_claim_count: 1,
  cohort_day_claim_count: 1,
  global_minute_claim_count: 1,
  global_day_claim_count: 1,
  admission_receipt_sha256: "4".repeat(64),
  provider_dispatch_authorized: false,
  consumer_exposure_authorized: false,
  order_authorized: false,
  stripe_dispatch_authorized: false,
  booking_authorized: false,
  payment_authorized: false,
  capture_authorized: false,
  refund_authorized: false,
  settlement_authorized: false,
  ticketing_authorized: false,
  servicing_authorized: false,
  consumer_release_enabled: false,
  blind_retry_authorized: false,
} as const);

function preRpcLimiter(
  decision: "allowed" | "refused" = "allowed",
) {
  const consume = vi.fn(async (input: Readonly<{
    executionScopeSha256: string;
    cohortSha256: string;
    subjectSha256: string;
    idempotencySha256: string;
    requestSha256: string;
  }>) => ({
    decision,
    executionScopeSha256: input.executionScopeSha256,
    subjectSha256: input.subjectSha256,
    idempotencySha256: input.idempotencySha256,
    requestSha256: input.requestSha256,
    limiterReceiptSha256: "a".repeat(64),
  }));
  return {
    value: Object.freeze({
      version:
        FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PRE_RPC_LIMITER_VERSION,
      routeExposed: false as const,
      authenticatedSubjectRequired: true as const,
      distributedBudgetEnforced: true as const,
      failClosed: true as const,
      budget: FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
      consume,
    }),
    consume,
  };
}

function appSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Flight Consumer Production public-shopping admission", () => {
  it("authorizes only a default-off, non-dispatching budget reservation", () => {
    expect(resolveFlightConsumerProductionPublicShoppingAdmissionRuntime(baseEnv))
      .toEqual({
        authorized: true,
        mode: FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_MODE,
        reasons: [],
        binding: {
          prerequisiteExecutionScopeSha256:
            expect.stringMatching(/^[0-9a-f]{64}$/),
          executionScopeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
          policySha256,
          admissionPolicySha256,
          cohortSha256,
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
          transactionKillSwitchEngaged: true,
        },
      });
    const disabled = { ...baseEnv } as Record<string, string>;
    delete disabled.FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_ENABLED;
    expect(resolveFlightConsumerProductionPublicShoppingAdmissionRuntime(disabled))
      .toMatchObject({ authorized: false, mode: "disabled", binding: null });
    expect(resolveFlightConsumerProductionPublicShoppingAdmissionRuntime({
      ...baseEnv,
      FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "true",
    })).toMatchObject({ authorized: false, mode: "disabled", binding: null });
  });

  it("derives a distinct Gate-115 scope and binds every fixed budget constant", () => {
    const runtime =
      resolveFlightConsumerProductionPublicShoppingAdmissionRuntime(baseEnv);
    expect(runtime.authorized).toBe(true);
    if (!runtime.authorized) throw new Error("expected admission runtime");
    expect(runtime.binding.executionScopeSha256).not.toBe(
      runtime.binding.prerequisiteExecutionScopeSha256,
    );
    const keys = Object.keys(
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
    ) as Array<keyof typeof FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET>;
    for (const key of keys) {
      const changedBudget = {
        ...FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET,
        [key]: FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_BUDGET[key] + 1,
      };
      expect(
        deriveFlightConsumerProductionPublicShoppingAdmissionPolicySha256(
          policySha256,
          changedBudget,
        ),
      ).not.toBe(runtime.binding.admissionPolicySha256);
      expect(
        deriveFlightConsumerProductionPublicShoppingAdmissionExecutionScopeSha256(
          {
            prerequisiteExecutionScopeSha256:
              runtime.binding.prerequisiteExecutionScopeSha256,
            policySha256,
            cohortSha256,
          },
          changedBudget,
        ),
      ).not.toBe(runtime.binding.executionScopeSha256);
    }
  });

  it("hash-binds the authenticated subject, idempotency key, and exact search", async () => {
    const reserve = vi.fn(async (
      args: Readonly<Record<string, unknown>>,
    ) => {
      void args;
      return admittedReceipt;
    });
    const repository = Object.freeze({
      version:
        "flight-consumer-production-public-shopping-admission-repository-v1" as const,
      migrationVersion: "202608260115" as const,
      routeExposed: false as const,
      providerTransportImplemented: false as const,
      providerDispatchAuthorized: false as const,
      reserve,
    });
    const limiter = preRpcLimiter();
    const service =
      createFlightConsumerProductionPublicShoppingAdmissionService(baseEnv, {
        preRpcLimiter: limiter.value,
        repository,
        now: () => new Date("2026-08-27T18:30:00.000Z"),
      });
    const identity =
      createFlightConsumerProductionPublicShoppingTrustedIdentityCapability(
        customerId,
      );

    const result = await service.reserve({
      idempotencyKey,
      search,
    }, identity);
    expect(reserve).toHaveBeenCalledOnce();
    expect(limiter.consume).toHaveBeenCalledOnce();
    expect(limiter.consume.mock.invocationCallOrder[0])
      .toBeLessThan(reserve.mock.invocationCallOrder[0]!);
    const [args] = reserve.mock.calls[0]!;
    expect(args).toEqual({
      p_execution_scope_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_policy_sha256: policySha256,
      p_cohort_sha256: cohortSha256,
      p_subject_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_idempotency_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_request_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(args)).not.toContain(customerId);
    expect(JSON.stringify(args)).not.toContain(idempotencyKey);
    expect(JSON.stringify(args)).not.toContain("ORD");
    expect(result).toMatchObject({
      decision: "created",
      admissionId,
      admissionState: "admitted",
      budgetClaimed: true,
      preRpcLimiterReceiptSha256: "a".repeat(64),
      providerDispatchAuthorized: false,
      consumerExposureAuthorized: false,
      orderAuthorized: false,
      stripeDispatchAuthorized: false,
      bookingAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      settlementAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerReleaseEnabled: false,
      blindRetryAuthorized: false,
    });
  });

  it("rejects PII, invalid travel windows, and malformed authority receipts", async () => {
    const reserve = vi.fn(async (
      args: Readonly<Record<string, unknown>>,
    ) => {
      void args;
      return admittedReceipt;
    });
    const repository = Object.freeze({
      version:
        "flight-consumer-production-public-shopping-admission-repository-v1" as const,
      migrationVersion: "202608260115" as const,
      routeExposed: false as const,
      providerTransportImplemented: false as const,
      providerDispatchAuthorized: false as const,
      reserve,
    });
    const service =
      createFlightConsumerProductionPublicShoppingAdmissionService(baseEnv, {
        preRpcLimiter: preRpcLimiter().value,
        repository,
        now: () => new Date("2026-08-27T18:30:00.000Z"),
      });
    const identity =
      createFlightConsumerProductionPublicShoppingTrustedIdentityCapability(
        customerId,
      );
    await expect(service.reserve({
      trustedAuthenticatedCustomerId: customerId,
      idempotencyKey,
      search: { ...search, email: "traveler@example.com" },
    }, identity)).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(service.reserve({
      idempotencyKey,
      search: { ...search, departureDate: "2026-08-27" },
    }, identity)).rejects.toMatchObject({ reason: "invalid_input" });
    await expect(service.reserve({ idempotencyKey, search }, {
      kind:
        "flight-consumer-production-public-shopping-trusted-identity-capability-v1",
      serializable: false,
    })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(reserve).not.toHaveBeenCalled();
    expect(() => JSON.stringify(identity)).toThrow(TypeError);

    const invalidRepository =
      createFlightConsumerProductionPublicShoppingAdmissionRepository({
        async rpc() {
          return {
            data: [{
              ...admittedReceipt,
              provider_dispatch_authorized: true,
            }],
            error: null,
          };
        },
      });
    await expect(invalidRepository.reserve({}))
      .rejects.toMatchObject({ reason: "invalid_result" });
    for (const field of [
      "capture_authorized",
      "refund_authorized",
      "consumer_release_enabled",
      "blind_retry_authorized",
    ] as const) {
      const unsafeRepository =
        createFlightConsumerProductionPublicShoppingAdmissionRepository({
          async rpc() {
            return {
              data: [{ ...admittedReceipt, [field]: true }],
              error: null,
            };
          },
        });
      await expect(unsafeRepository.reserve({}))
        .rejects.toMatchObject({ reason: "invalid_result" });
    }
  });

  it("requires a fail-closed authenticated pre-RPC limiter before persistence", async () => {
    const reserve = vi.fn(async () => admittedReceipt);
    const repository = Object.freeze({
      version:
        "flight-consumer-production-public-shopping-admission-repository-v1" as const,
      migrationVersion: "202608260115" as const,
      routeExposed: false as const,
      providerTransportImplemented: false as const,
      providerDispatchAuthorized: false as const,
      reserve,
    });
    const identity =
      createFlightConsumerProductionPublicShoppingTrustedIdentityCapability(
        customerId,
      );
    const refusedLimiter = preRpcLimiter("refused");
    const refusedService =
      createFlightConsumerProductionPublicShoppingAdmissionService(baseEnv, {
        preRpcLimiter: refusedLimiter.value,
        repository,
        now: () => new Date("2026-08-27T18:30:00.000Z"),
      });

    await expect(refusedService.reserve({ idempotencyKey, search }, identity))
      .rejects.toMatchObject({ reason: "limiter_refused" });
    expect(refusedLimiter.consume).toHaveBeenCalledOnce();
    expect(reserve).not.toHaveBeenCalled();
    expect(JSON.stringify(refusedLimiter.consume.mock.calls[0])).not.toContain(
      customerId,
    );

    const uncertainLimiter = preRpcLimiter();
    uncertainLimiter.consume.mockRejectedValueOnce(
      new Error("distributed limiter unavailable"),
    );
    const uncertainService =
      createFlightConsumerProductionPublicShoppingAdmissionService(baseEnv, {
        preRpcLimiter: uncertainLimiter.value,
        repository,
        now: () => new Date("2026-08-27T18:30:00.000Z"),
      });
    await expect(uncertainService.reserve({ idempotencyKey, search }, identity))
      .rejects.toMatchObject({ reason: "limiter_refused" });
    expect(reserve).not.toHaveBeenCalled();

    const mismatchedLimiter = preRpcLimiter();
    mismatchedLimiter.consume.mockImplementationOnce(async (input) => ({
      decision: "allowed" as const,
      executionScopeSha256: input.executionScopeSha256,
      subjectSha256: "b".repeat(64),
      idempotencySha256: input.idempotencySha256,
      requestSha256: input.requestSha256,
      limiterReceiptSha256: "a".repeat(64),
    }));
    const mismatchedService =
      createFlightConsumerProductionPublicShoppingAdmissionService(baseEnv, {
        preRpcLimiter: mismatchedLimiter.value,
        repository,
        now: () => new Date("2026-08-27T18:30:00.000Z"),
      });
    await expect(mismatchedService.reserve({ idempotencyKey, search }, identity))
      .rejects.toMatchObject({ reason: "limiter_refused" });
    expect(reserve).not.toHaveBeenCalled();

    expect(() =>
      createFlightConsumerProductionPublicShoppingAdmissionService(baseEnv, {
        preRpcLimiter: {
          ...preRpcLimiter().value,
          distributedBudgetEnforced: false,
        } as never,
        repository,
      })
    ).toThrow(expect.objectContaining({ reason: "limiter_refused" }));
  });

  it("has no provider transport and is not imported by any app surface", () => {
    const source = readFileSync(
      "lib/flights/consumer-production/public-shopping-admission.server.ts",
      "utf8",
    );
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/from ["'][^"']*(stripe|duffel-live-client)/i);
    const appSource = appSourceFiles("app")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(appSource).not.toContain("public-shopping-admission.server");
  });
});
