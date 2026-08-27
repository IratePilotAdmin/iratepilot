import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deriveFlightConsumerProductionDuffelCredentialSha256 } from "../lib/flights/consumer-production/shopping-runtime.server";
import {
  createFlightConsumerProductionStripePaymentPlanJournalPort,
  createFlightConsumerProductionStripePaymentPlanWorkflow,
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_JOURNAL_RPC,
  FlightConsumerProductionStripePaymentPlanJournalError,
  type FlightConsumerProductionStripePaymentPlanJournalPort,
} from "../lib/flights/consumer-production/stripe-payment-intent-plan-journal.server";
import {
  buildFlightConsumerProductionStripePaymentIntentPlan,
  type FlightConsumerProductionStripePaymentIntentPlan,
} from "../lib/flights/consumer-production/stripe-payment-intent-plan.server";
import {
  deriveFlightConsumerProductionStripeAccountSha256,
  requireFlightConsumerProductionStripePaymentPlanRuntime,
} from "../lib/flights/consumer-production/stripe-runtime.server";

const duffelToken = `duffel_live_${"D".repeat(32)}`;
const approvedAccountSha256 =
  deriveFlightConsumerProductionStripeAccountSha256(
    "acct_1234567890abcdef",
  );
const env = Object.freeze({
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_SHOPPING_ORDER_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ORDER_PLAN_REHEARSAL_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_PREFLIGHT_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "true",
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
  DUFFEL_LIVE_ACCESS_TOKEN: duffelToken,
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256: "a".repeat(64),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256:
    deriveFlightConsumerProductionDuffelCredentialSha256(duffelToken),
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET:
    "dedicated-production-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
  FLIGHT_CONSUMER_PRODUCTION_STRIPE_ACCOUNT_SHA256: approvedAccountSha256,
  FLIGHT_PAYMENT_PROCESSOR_ID: "stripe_live",
  FLIGHT_PAYMENT_ADAPTER_VERSION: "22.4.0",
  FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256: "b".repeat(64),
  FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256: approvedAccountSha256,
  FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256: "c".repeat(64),
}) satisfies Record<string, string>;

const workflowInput = Object.freeze({
  orderId: "00000000-0000-4000-8000-000000000001",
  customerId: "00000000-0000-4000-8000-000000000002",
  paymentAttemptId: "00000000-0000-4000-8000-000000000003",
  authoritativeAmountCents: 25_000,
  paymentAmountCents: 25_000,
  currency: "USD" as const,
  offerEvidenceSha256: "1".repeat(64),
  repriceEvidenceSha256: "2".repeat(64),
  orderPlanSha256: "3".repeat(64),
  orderRequestEnvelopeSha256: "4".repeat(64),
});

const planId = "00000000-0000-4000-8000-000000000099";

function paymentPlan() {
  const runtime = requireFlightConsumerProductionStripePaymentPlanRuntime(env);
  return buildFlightConsumerProductionStripePaymentIntentPlan({
    ...workflowInput,
    executionScopeSha256: runtime.binding.executionScopeSha256,
    paymentBinding: runtime.binding.paymentBinding,
  });
}

function journalReceipt(
  plan: FlightConsumerProductionStripePaymentIntentPlan,
  decision: "created" | "replay" = "created",
) {
  return Object.freeze({
    decision,
    planId,
    recordedPlanSha256: plan.planSha256,
    planMode: "zero_dispatch" as const,
  });
}

function appSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return appSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("Flight Consumer Production Stripe payment-plan journal", () => {
  it("maps every immutable migration-103 argument and validates its receipt", async () => {
    const plan = paymentPlan();
    const calls: Array<Readonly<{
      name: string;
      args: Readonly<Record<string, unknown>>;
    }>> = [];
    const client = {
      async rpc(name: string, args: Readonly<Record<string, unknown>>) {
        calls.push({ name, args });
        return {
          data: [{
            decision: "created",
            plan_id: planId,
            recorded_plan_sha256: plan.planSha256,
            plan_mode: "zero_dispatch",
          }],
          error: null,
        };
      },
    };

    const receipt = await createFlightConsumerProductionStripePaymentPlanJournalPort(
      client,
    ).record(plan);

    expect(calls).toEqual([{
      name: FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_JOURNAL_RPC,
      args: {
        p_execution_scope_sha256: plan.executionScopeSha256,
        p_payment_binding_sha256: plan.paymentBindingSha256,
        p_order_reference_sha256: plan.orderReferenceSha256,
        p_customer_reference_sha256: plan.customerReferenceSha256,
        p_payment_attempt_reference_sha256:
          plan.paymentAttemptReferenceSha256,
        p_metadata_sha256: plan.metadataSha256,
        p_request_body_sha256: plan.requestBodySha256,
        p_request_envelope_sha256: plan.requestEnvelopeSha256,
        p_idempotency_request_sha256: plan.idempotencyRequestSha256,
        p_idempotency_key_sha256: plan.idempotencyKeySha256,
        p_plan_sha256: plan.planSha256,
        p_amount_cents: plan.amountCents,
      },
    }]);
    expect(receipt).toEqual(journalReceipt(plan));
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it.each([
    {
      data: [],
      error: null,
      expected: "invalid_result",
    },
    {
      data: [{ decision: "created" }],
      error: null,
      expected: "invalid_result",
    },
    {
      data: [{
        decision: "created",
        plan_id: planId,
        recorded_plan_sha256: "f".repeat(64),
        plan_mode: "dispatch",
      }],
      error: null,
      expected: "invalid_result",
    },
    {
      data: null,
      error: { code: "42501" },
      expected: "rpc_refused",
    },
  ])("fails closed on an invalid or refused journal response", async (value) => {
    const port = createFlightConsumerProductionStripePaymentPlanJournalPort({
      async rpc() {
        return value;
      },
    });

    await expect(port.record(paymentPlan())).rejects.toMatchObject({
      reason: value.expected,
    });
  });

  it("normalizes thrown RPC failures without exposing provider details", async () => {
    const privateMessage = "database-private-detail";
    const port = createFlightConsumerProductionStripePaymentPlanJournalPort({
      async rpc() {
        throw new Error(privateMessage);
      },
    });

    let thrown: unknown;
    try {
      await port.record(paymentPlan());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(
      FlightConsumerProductionStripePaymentPlanJournalError,
    );
    expect(thrown).toMatchObject({ reason: "rpc_refused" });
    expect(String(thrown)).not.toContain(privateMessage);
  });
});

describe("Flight Consumer Production build-and-record coordinator", () => {
  it.each(["created", "replay"] as const)(
    "builds from the sealed runtime binding and returns a %s digest-only receipt",
    async (decision) => {
      let recorded: FlightConsumerProductionStripePaymentIntentPlan | null =
        null;
      const journal: FlightConsumerProductionStripePaymentPlanJournalPort = {
        async record(plan) {
          recorded = plan;
          return journalReceipt(plan, decision);
        },
      };
      const result = await createFlightConsumerProductionStripePaymentPlanWorkflow(
        env,
        { journal },
      ).execute(workflowInput);
      const plan = recorded as FlightConsumerProductionStripePaymentIntentPlan
        | null;

      expect(plan).not.toBeNull();
      if (plan === null) throw new Error("expected recorded plan");
      const runtime =
        requireFlightConsumerProductionStripePaymentPlanRuntime(env);
      expect(plan.executionScopeSha256)
        .toBe(runtime.binding.executionScopeSha256);
      expect(plan.paymentBindingSha256)
        .toBe(runtime.binding.paymentBindingSha256);
      expect(result).toEqual({
        version:
          "flight-consumer-production-stripe-payment-intent-plan-recording-result-v1",
        decision,
        planId,
        planSha256: plan.planSha256,
        mode: "zero_dispatch",
        executionScopeSha256: plan.executionScopeSha256,
        paymentBindingSha256: plan.paymentBindingSha256,
        providerRequestCount: 0,
        stripeRequestCount: 0,
        stripeMutationCount: 0,
        paymentIntentCount: 0,
        chargeCount: 0,
        refundCount: 0,
        externalRequestMade: false,
        rawPaymentMethodAccepted: false,
        clientSecretExposed: false,
        paymentAuthorized: false,
        captureAuthorized: false,
        refundAuthorized: false,
        orderAuthorized: false,
        ticketingAuthorized: false,
        consumerReleaseEnabled: false,
      });
      expect(Object.isFrozen(result)).toBe(true);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(workflowInput.orderId);
      expect(serialized).not.toContain(workflowInput.customerId);
      expect(serialized).not.toContain(workflowInput.paymentAttemptId);
      expect(serialized).not.toMatch(/(?:pi|pm|ch|re)_[A-Za-z0-9_]+/);
      expect(serialized).not.toMatch(/(?:sk|rk)_(?:live|test)_/);
    },
  );

  it("fails before journaling when the gate or request contract is closed", async () => {
    const record = vi.fn();
    const journal = { record } as FlightConsumerProductionStripePaymentPlanJournalPort;
    expect(() => createFlightConsumerProductionStripePaymentPlanWorkflow(
      {
        ...env,
        FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED: "false",
      },
      { journal },
    )).toThrowError(expect.objectContaining({ reason: "runtime_unavailable" }));
    expect(record).not.toHaveBeenCalled();

    const workflow = createFlightConsumerProductionStripePaymentPlanWorkflow(
      env,
      { journal },
    );
    await expect(workflow.execute({
      ...workflowInput,
      paymentMethodId: "pm_not_allowed",
    })).rejects.toMatchObject({ reason: "invalid_input" });
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects a journal receipt that does not match the exact built plan", async () => {
    const journal: FlightConsumerProductionStripePaymentPlanJournalPort = {
      async record(plan) {
        return {
          ...journalReceipt(plan),
          recordedPlanSha256: "f".repeat(64),
        };
      },
    };

    await expect(createFlightConsumerProductionStripePaymentPlanWorkflow(
      env,
      { journal },
    ).execute(workflowInput)).rejects.toMatchObject({
      reason: "evidence_mismatch",
    });
  });

  it("has no Stripe transport, SDK, consumer route, or Preview dependency", () => {
    const sourcePath = join(
      "lib",
      "flights",
      "consumer-production",
      "stripe-payment-intent-plan-journal.server.ts",
    );
    const source = readFileSync(sourcePath, "utf8");
    const applicationSource = appSourceFiles("app")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\.paymentIntents\.|\.charges\.|\.refunds\./);
    expect(source).not.toMatch(/consumer-preview|stripe-test/i);
    expect(source).not.toMatch(/NextRequest|NextResponse|route\.ts/);
    expect(applicationSource)
      .not.toContain("stripe-payment-intent-plan-journal.server");
    expect(applicationSource)
      .not.toContain("createFlightConsumerProductionStripePaymentPlanWorkflow");
  });
});
