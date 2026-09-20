import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionPrivatePreviewFoundationPersistence,
  createFlightConsumerProductionPrivatePreviewPreRpcLimiter,
  deriveFlightConsumerProductionPrivatePreviewExecutionScopeSha256,
  FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_EXPOSURE_RPC,
  FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_LIMITER_RPC,
} from "../lib/flights/consumer-production/public-shopping-private-preview-foundation.server";
import {
  requireFlightConsumerProductionPublicShoppingAdmissionRuntime,
} from "../lib/flights/consumer-production/public-shopping-admission.server";

const digest = (character: string) => character.repeat(64);
const sourceCommitSha = "b".repeat(40);
const environment = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  VERCEL_GIT_COMMIT_SHA: sourceCommitSha,
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256: digest("2"),
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256: digest("4"),
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA: sourceCommitSha,
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
  DUFFEL_LIVE_ACCESS_TOKEN: `duffel_live_${"x".repeat(20)}`,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "duffel-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
};

const falseAuthorities = {
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
} as const;

describe("Gate139 private-preview foundation runtime", () => {
  it("derives a domain-separated scope with every downstream authority false", () => {
    const input = {
      admissionExecutionScopeSha256: digest("1"),
      policySha256: digest("2"),
      admissionPolicySha256: digest("3"),
      cohortSha256: digest("4"),
    };
    const first =
      deriveFlightConsumerProductionPrivatePreviewExecutionScopeSha256(input);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(
      deriveFlightConsumerProductionPrivatePreviewExecutionScopeSha256(input),
    ).toBe(first);
    expect(deriveFlightConsumerProductionPrivatePreviewExecutionScopeSha256({
      ...input,
      cohortSha256: digest("5"),
    })).not.toBe(first);
  });

  it("implements the exact Gate115 limiter interface and strips DB diagnostics", async () => {
    const runtime =
      requireFlightConsumerProductionPublicShoppingAdmissionRuntime(environment);
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe(FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_LIMITER_RPC);
      expect(args).toMatchObject({
        p_execution_scope_sha256: runtime.binding.executionScopeSha256,
        p_policy_sha256: runtime.binding.policySha256,
        p_cohort_sha256: runtime.binding.cohortSha256,
        p_subject_sha256: digest("5"),
        p_idempotency_sha256: digest("6"),
        p_request_sha256: digest("7"),
      });
      return { error: null, data: [{
        decision: "allowed",
        execution_scope_sha256: runtime.binding.executionScopeSha256,
        subject_sha256: digest("5"),
        idempotency_sha256: digest("6"),
        request_sha256: digest("7"),
        limiter_receipt_sha256: digest("8"),
        refusal_code: null,
        claim_expires_at: "2026-08-27T12:01:00.000Z",
        subject_minute_claim_count: 1,
        subject_day_claim_count: 1,
        cohort_minute_claim_count: 1,
        cohort_day_claim_count: 1,
        global_minute_claim_count: 1,
        global_day_claim_count: 1,
        ...falseAuthorities,
      }] };
    });
    const persistence =
      createFlightConsumerProductionPrivatePreviewFoundationPersistence({ rpc });
    const limiter = createFlightConsumerProductionPrivatePreviewPreRpcLimiter({
      environment,
      persistence,
    });
    const result = await limiter.consume({
      executionScopeSha256: runtime.binding.executionScopeSha256,
      cohortSha256: runtime.binding.cohortSha256,
      subjectSha256: digest("5"),
      idempotencySha256: digest("6"),
      requestSha256: digest("7"),
    });
    expect(result).toEqual({
      decision: "allowed",
      executionScopeSha256: runtime.binding.executionScopeSha256,
      subjectSha256: digest("5"),
      idempotencySha256: digest("6"),
      requestSha256: digest("7"),
      limiterReceiptSha256: digest("8"),
    });
    expect(limiter).toMatchObject({
      routeExposed: false,
      authenticatedSubjectRequired: true,
      distributedBudgetEnforced: true,
      failClosed: true,
      budget: {
        subjectMinute: 2,
        subjectDay: 10,
        cohortMinute: 10,
        cohortDay: 100,
        globalMinute: 20,
        globalDay: 250,
        claimTtlSeconds: 60,
      },
    });
  });

  it("fails before persistence when the admission scope or cohort is substituted", async () => {
    const runtime =
      requireFlightConsumerProductionPublicShoppingAdmissionRuntime(environment);
    const rpc = vi.fn();
    const limiter = createFlightConsumerProductionPrivatePreviewPreRpcLimiter({
      environment,
      persistence:
        createFlightConsumerProductionPrivatePreviewFoundationPersistence({ rpc }),
    });
    await expect(limiter.consume({
      executionScopeSha256: digest("9"),
      cohortSha256: runtime.binding.cohortSha256,
      subjectSha256: digest("5"),
      idempotencySha256: digest("6"),
      requestSha256: digest("7"),
    })).rejects.toMatchObject({ reason: "runtime_binding_refused" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds exposure to the derived scope and accepts only a full false-authority receipt", async () => {
    const scopeInput = {
      admissionExecutionScopeSha256: digest("1"),
      policySha256: digest("2"),
      admissionPolicySha256: digest("3"),
      cohortSha256: digest("4"),
    };
    const expectedScope =
      deriveFlightConsumerProductionPrivatePreviewExecutionScopeSha256(scopeInput);
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe(FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_EXPOSURE_RPC);
      expect(args.p_preview_execution_scope_sha256).toBe(expectedScope);
      return { error: null, data: [{
        decision: "created",
        exposure_id: "00000000-0000-4000-8000-000000000001",
        exposure_receipt_sha256: digest("a"),
        reconciliation_mode: "late_success_after_stale",
        exposure_not_after: "2026-08-27T12:01:00.000Z",
        source_offer_count: 0,
        projected_offer_count: 0,
        refused_offer_count: 0,
        private_preview_exposure_authorized: true,
        consumer_public_release_authorized: false,
        ...Object.fromEntries(Object.entries(falseAuthorities)
          .filter(([key]) => key !== "provider_dispatch_authorized"
            && key !== "consumer_exposure_authorized")),
      }] };
    });
    const persistence =
      createFlightConsumerProductionPrivatePreviewFoundationPersistence({ rpc });
    await expect(persistence.authorizeExposure({
      ...scopeInput,
      admissionId: "00000000-0000-4000-8000-000000000002",
      admissionReceiptSha256: digest("5"),
      subjectSha256: digest("6"),
      requestSha256: digest("7"),
      dispatchId: "00000000-0000-4000-8000-000000000003",
      dispatchReceiptSha256: digest("8"),
      projectionBatchSha256: digest("9"),
      projectionReceiptSha256: digest("b"),
      sourceOfferCount: 0,
      projectedOfferCount: 0,
      refusedOfferCount: 0,
      exposureNotAfter: "2026-08-27T12:01:00.000Z",
    })).resolves.toMatchObject({
      private_preview_exposure_authorized: true,
      consumer_public_release_authorized: false,
      order_authorized: false,
      payment_authorized: false,
      capture_authorized: false,
      blind_retry_authorized: false,
    });
  });

  it("rejects malformed or expanded database authority receipts", async () => {
    const rpc = vi.fn(async () => ({ error: null, data: [{
      decision: "allowed",
      execution_scope_sha256: digest("1"),
      subject_sha256: digest("5"),
      idempotency_sha256: digest("6"),
      request_sha256: digest("7"),
      limiter_receipt_sha256: digest("8"),
      refusal_code: null,
      claim_expires_at: "2026-08-27T12:01:00.000Z",
      subject_minute_claim_count: 1,
      subject_day_claim_count: 1,
      cohort_minute_claim_count: 1,
      cohort_day_claim_count: 1,
      global_minute_claim_count: 1,
      global_day_claim_count: 1,
      ...falseAuthorities,
      booking_authorized: true,
    }] }));
    const persistence =
      createFlightConsumerProductionPrivatePreviewFoundationPersistence({ rpc });
    await expect(persistence.consumeLimiter({
      executionScopeSha256: digest("1"),
      policySha256: digest("2"),
      cohortSha256: digest("4"),
      subjectSha256: digest("5"),
      idempotencySha256: digest("6"),
      requestSha256: digest("7"),
    })).rejects.toMatchObject({ reason: "receipt_refused" });
  });
});
