import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  activateFlightConsumerPreview,
  createFlightConsumerPreviewActivationPacketSha256,
  createFlightConsumerPreviewRelockPacketSha256,
  FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
  FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION,
  FlightConsumerPreviewActivationControlError,
  relockFlightConsumerPreview,
  type FlightConsumerPreviewActivationControlClient,
  type FlightConsumerPreviewActivationControlDependencies,
} from "../lib/flights/consumer-preview/activation-control.server";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function key() {
  return randomBytes(32).toString("base64url");
}

const actorId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-08-25T21:00:00.000Z";
const activatedAt = "2026-08-25T21:00:01.000Z";
const expectedScope = "1".repeat(64);
const targetScope = "2".repeat(64);
const expectedEvidence = "3".repeat(64);
const expectedReceipt = "4".repeat(64);
const manifest = "5".repeat(64);
const newEvidence = "6".repeat(64);
const newReceipt = "7".repeat(64);
const nonce = "server_generated_nonce_1234567890";

function fixtures() {
  const stripeAccountId = "acct_preview12345678";
  const stripeAccountSha256 = sha256(stripeAccountId);
  const env: Record<string, string> = {
    VERCEL_ENV: "preview",
    PILOT_MODE: "true",
    FLIGHT_CONSUMER_PREVIEW_ENABLED: "true",
    FLIGHT_RUNTIME_MODE: "sandbox",
    FLIGHT_RUNTIME_ENVIRONMENT: "preview",
    FLIGHT_RUNTIME_ENABLED: "true",
    FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
    FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
    FLIGHT_BOOKING_ENABLED: "true",
    FLIGHT_PAYMENT_ENABLED: "true",
    FLIGHT_SETTLEMENT_ENABLED: "true",
    FLIGHT_TICKETING_ENABLED: "true",
    FLIGHT_SERVICING_ENABLED: "false",
    FLIGHT_WEBHOOKS_ENABLED: "true",
    FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
    FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
    ENABLE_LIVE_BOOKING_PAYMENTS: "false",
    ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
    NEXT_PUBLIC_PUBLIC_BOOKING: "false",
    FLIGHT_DUFFEL_TEST_BOOKING_ENABLED: "false",
    FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED: "false",
    EMAIL_WORKER_ENABLED: "false",
    NEXT_PUBLIC_SUPABASE_URL: "https://eiqmdldjnedqgbtoozqa.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "preview-service-role-key",
    FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET: "preview-duffel-authority-secret",
    STRIPE_SECRET_KEY: "sk_test_12345678",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_12345678",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET: "whsec_preview_1234567890",
    STRIPE_WEBHOOK_SECRET: "whsec_generic_1234567890",
    FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET: "duffel-preview-webhook-secret",
    FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID: stripeAccountId,
    FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256: stripeAccountSha256,
    DUFFEL_TEST_ACCESS_TOKEN: "duffel_test_1234567890abcdef",
    FLIGHT_CONSUMER_PREVIEW_PII_KEY_VERSION: "pii-v1",
    FLIGHT_CONSUMER_PREVIEW_PII_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_PII_HMAC_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_KEY_VERSION: "evidence-v1",
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_EVIDENCE_HMAC_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_KEY_VERSION: "reference-v1",
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_ENCRYPTION_KEY_BASE64URL: key(),
    FLIGHT_CONSUMER_PREVIEW_REFERENCE_HMAC_KEY_BASE64URL: key(),
    NEXT_PUBLIC_APP_URL: "https://preview.iratepilot.test",
  };
  const inspection = {
    version: "flight-consumer-preview-preflight-v1" as const,
    ready: false,
    checkedAt: updatedAt,
    checks: {
      databaseAuthority: false,
      runtimeConfiguration: false,
      stripeTestAccount: true,
      stripeAccountBinding: true,
    },
    stripeAccountId,
    stripeAccountSha256,
    issues: ["Verified database runtime authority is unavailable."],
  };
  const activationPreflight = {
    version: "flight-consumer-preview-activation-preflight-v2",
    ready: true,
    control_key: "global",
    expected_updated_at: updatedAt,
    expected_execution_scope_sha256: expectedScope,
    expected_activation_evidence_sha256: expectedEvidence,
    expected_runtime_control_receipt_sha256: expectedReceipt,
    target_execution_scope_sha256: targetScope,
    activation_manifest_sha256: manifest,
  } as const;
  const activeAuthority = {
    version: "flight-consumer-preview-runtime-authority-v1",
    authorized: true,
    control_key: "global",
    execution_mode: "test",
    execution_kill_switch_engaged: false,
    synthetic_execution_enabled: false,
    provider_sandbox_traffic_enabled: true,
    provider_live_traffic_enabled: false,
    shopping_enabled: true,
    order_enabled: true,
    payment_enabled: true,
    ticketing_enabled: true,
    servicing_enabled: false,
    provider_events_enabled: true,
    production_release_enabled: false,
    bound_environment: "preview",
    bound_project_ref: "eiqmdldjnedqgbtoozqa",
    bound_database_name: "postgres",
    bound_session_user: "authenticator",
    bound_provider_code: "duffel",
    bound_provider_account_sha256: "8".repeat(64),
    bound_point_of_sale: "US",
    bound_content_scope_sha256: "9".repeat(64),
    bound_adapter_version_sha256: "a".repeat(64),
    bound_payment_processor_code: "stripe",
    bound_payment_account_sha256: stripeAccountSha256,
    bound_payment_environment: "test",
    bound_payment_source_sha256: "b".repeat(64),
    bound_payment_adapter_version_sha256: "c".repeat(64),
    bound_provider_settlement_processor_code: "duffel_balance",
    bound_provider_settlement_account_sha256: "d".repeat(64),
    bound_provider_settlement_environment: "test",
    bound_provider_settlement_source_sha256: "e".repeat(64),
    bound_provider_settlement_adapter_version_sha256: "f".repeat(64),
    bound_execution_scope_sha256: targetScope,
    activation_evidence_sha256: expectedEvidence,
    runtime_control_receipt_sha256: expectedReceipt,
  };
  const activeControl = {
    control_key: "global",
    updated_at: updatedAt,
    bound_execution_scope_sha256: targetScope,
    activation_evidence_sha256: expectedEvidence,
    execution_kill_switch_engaged: false,
    synthetic_execution_enabled: false,
    provider_sandbox_traffic_enabled: true,
    provider_live_traffic_enabled: false,
    shopping_enabled: true,
    order_enabled: true,
    payment_enabled: true,
    ticketing_enabled: true,
    servicing_enabled: false,
    provider_events_enabled: true,
    production_release_enabled: false,
  } as const;
  return {
    activeAuthority,
    activeControl,
    activationPreflight,
    env,
    inspection,
    stripeAccountId,
    stripeAccountSha256,
  };
}

function dependencies(
  fixture: ReturnType<typeof fixtures>,
  overrides: Partial<FlightConsumerPreviewActivationControlDependencies> = {},
): FlightConsumerPreviewActivationControlDependencies {
  return {
    env: fixture.env,
    inspectRuntimePreflight: vi.fn(async () => fixture.inspection),
    verifyServiceRoleControlBinding: vi.fn(async () => true),
    readActiveRuntimeAuthority: vi.fn(async () => fixture.activeAuthority),
    readCurrentControl: vi.fn(async () => fixture.activeControl),
    createNonce: () => nonce,
    ...overrides,
  } as FlightConsumerPreviewActivationControlDependencies;
}

function client(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as FlightConsumerPreviewActivationControlClient;
}

describe("Flight Consumer Preview activation control", () => {
  it("derives the Stripe account from verified preflight, calls DB preflight first, and binds exact CAS evidence", async () => {
    const fixture = fixtures();
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [fixture.activationPreflight], error: null })
      .mockResolvedValueOnce({
        data: [{
          decision: "activated",
          control_key: "global",
          updated_at: activatedAt,
          bound_execution_scope_sha256: targetScope,
          activation_evidence_sha256: newEvidence,
          runtime_control_receipt_sha256: newReceipt,
        }],
        error: null,
      });

    const result = await activateFlightConsumerPreview(client(rpc), {
      actorId,
      confirmation: FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
      idempotencyKey,
    }, dependencies(fixture));

    expect(rpc.mock.calls[0]).toEqual([
      "get_flight_consumer_preview_activation_preflight_v1",
      { p_stripe_account_id: fixture.stripeAccountId },
    ]);
    const expectedPacket = createFlightConsumerPreviewActivationPacketSha256({
      actorId,
      idempotencyKey,
      stripeAccountSha256: fixture.stripeAccountSha256,
      preflight: fixture.activationPreflight,
    });
    expect(rpc.mock.calls[1]).toEqual([
      "activate_flight_consumer_preview_v1",
      {
        p_expected_updated_at: updatedAt,
        p_expected_execution_scope_sha256: expectedScope,
        p_expected_activation_evidence_sha256: expectedEvidence,
        p_expected_runtime_control_receipt_sha256: expectedReceipt,
        p_stripe_account_id: fixture.stripeAccountId,
        p_activation_packet_sha256: expectedPacket,
        p_activation_nonce: nonce,
      },
    ]);
    expect(result).toEqual({
      decision: "activated",
      controlKey: "global",
      updatedAt: activatedAt,
      executionScopeSha256: targetScope,
      activationEvidenceSha256: newEvidence,
      runtimeControlReceiptSha256: newReceipt,
    });
    expect(JSON.stringify(result)).not.toContain(fixture.env.STRIPE_SECRET_KEY);
  });

  it("fails before DB preflight when any dedicated environment prerequisite is missing", async () => {
    const fixture = fixtures();
    delete fixture.env.FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET;
    const inspect = vi.fn(async () => fixture.inspection);
    const rpc = vi.fn();
    await expect(activateFlightConsumerPreview(client(rpc), {
      actorId,
      confirmation: FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
      idempotencyKey,
    }, dependencies(fixture, { inspectRuntimePreflight: inspect }))).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(inspect).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed against the superseded migration-080 preflight contract", async () => {
    const fixture = fixtures();
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{
        ...fixture.activationPreflight,
        version: "flight-consumer-preview-activation-preflight-v1",
      }],
      error: null,
    });
    await expect(activateFlightConsumerPreview(client(rpc), {
      actorId,
      confirmation: FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
      idempotencyKey,
    }, dependencies(fixture))).rejects.toMatchObject({ kind: "unavailable" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "get_flight_consumer_preview_activation_preflight_v1",
      { p_stripe_account_id: fixture.stripeAccountId },
    );
  });

  it("rejects unverified account observations and body-supplied account fields", async () => {
    const fixture = fixtures();
    const rpc = vi.fn();
    const unverified = {
      ...fixture.inspection,
      checks: { ...fixture.inspection.checks, stripeAccountBinding: false },
    };
    await expect(activateFlightConsumerPreview(client(rpc), {
      actorId,
      confirmation: FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
      idempotencyKey,
    }, dependencies(fixture, {
      inspectRuntimePreflight: vi.fn(async () => unverified as never),
    }))).rejects.toBeInstanceOf(FlightConsumerPreviewActivationControlError);

    await expect(activateFlightConsumerPreview(client(rpc), {
      actorId,
      confirmation: FLIGHT_CONSUMER_PREVIEW_ACTIVATION_CONFIRMATION,
      idempotencyKey,
      stripeAccountId: fixture.stripeAccountId,
    } as never, dependencies(fixture))).rejects.toMatchObject({ kind: "conflict" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("relocks from exact active authority and preserves scope while rotating evidence", async () => {
    const fixture = fixtures();
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{
        decision: "relocked",
        control_key: "global",
        updated_at: activatedAt,
        bound_execution_scope_sha256: targetScope,
        activation_evidence_sha256: newEvidence,
        runtime_control_receipt_sha256: newReceipt,
      }],
      error: null,
    });
    const deps = dependencies(fixture);

    const result = await relockFlightConsumerPreview(client(rpc), {
      actorId,
      confirmation: FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION,
      idempotencyKey,
    }, deps);

    const expectedPacket = createFlightConsumerPreviewRelockPacketSha256({
      actorId,
      idempotencyKey,
      control: fixture.activeControl,
      runtimeControlReceiptSha256: expectedReceipt,
    });
    expect(rpc).toHaveBeenCalledWith("relock_flight_consumer_preview_v1", {
      p_expected_updated_at: updatedAt,
      p_expected_execution_scope_sha256: targetScope,
      p_expected_activation_evidence_sha256: expectedEvidence,
      p_expected_runtime_control_receipt_sha256: expectedReceipt,
      p_relock_packet_sha256: expectedPacket,
      p_relock_nonce: nonce,
    });
    expect(result.decision).toBe("relocked");
    expect(result.executionScopeSha256).toBe(targetScope);
    expect(deps.inspectRuntimePreflight).not.toHaveBeenCalled();
    expect(deps.verifyServiceRoleControlBinding).not.toHaveBeenCalled();
  });

  it("never calls the relock RPC when active authority and the admin CAS row disagree", async () => {
    const fixture = fixtures();
    const rpc = vi.fn();
    const mismatched = { ...fixture.activeControl, activation_evidence_sha256: "0".repeat(64) };
    await expect(relockFlightConsumerPreview(client(rpc), {
      actorId,
      confirmation: FLIGHT_CONSUMER_PREVIEW_RELOCK_CONFIRMATION,
      idempotencyKey,
    }, dependencies(fixture, {
      readCurrentControl: vi.fn(async () => mismatched),
    }))).rejects.toMatchObject({ kind: "conflict" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
