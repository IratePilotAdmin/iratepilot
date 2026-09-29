import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/consumer-preview/runtime-authority.server", () => ({
  requireFlightConsumerPreviewRequestRuntime: vi.fn(),
}));

import {
  closeOneTerminalFlightConsumerPreviewReprice,
  FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION,
  FlightConsumerPreviewRepriceRecoveryError,
  type FlightConsumerPreviewRepriceRecoveryDependencies,
} from "../lib/flights/consumer-preview/reprice-recovery.server";

const actorId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const idempotencyId = "55555555-5555-4555-8555-555555555555";

const candidate = Object.freeze({
  attempt: Object.freeze({
    id: attemptId,
    offer_id: offerId,
    execution_scope_sha256: "a".repeat(64),
    consumer_idempotency_key_sha256: "b".repeat(64),
    state: "succeeded" as const,
    revision: 2 as const,
    retry_authorized: false as const,
  }),
  idempotency: Object.freeze({
    id: idempotencyId,
    status: "in_progress" as const,
  }),
});

function dependencies(
  overrides: Partial<FlightConsumerPreviewRepriceRecoveryDependencies> = {},
) {
  return {
    env: {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: "https://eiqmdldjnedqgbtoozqa.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "preview-service-role-key-material",
      FLIGHT_CONSUMER_PREVIEW_ENABLED: "true",
    },
    requireRuntime: vi.fn().mockResolvedValue({ ready: true }),
    findCandidates: vi.fn().mockResolvedValue([candidate]),
    closeCandidate: vi.fn().mockResolvedValue([{
      offer_id: offerId,
      terminal_state: "succeeded",
      idempotency_status: "failed",
    }]),
    attestCandidate: vi.fn().mockResolvedValue({
      attemptState: "succeeded",
      attemptRevision: 2,
      retryAuthorized: false,
      idempotencyStatus: "failed",
      offerStatus: "expired",
      repriceReceiptCount: 0,
      refreshedEvidenceCount: 0,
      orderCount: 0,
    }),
    ...overrides,
  } satisfies FlightConsumerPreviewRepriceRecoveryDependencies;
}

const input = Object.freeze({
  actorId,
  confirmation: FLIGHT_CONSUMER_PREVIEW_REPRICE_RECOVERY_CONFIRMATION,
  idempotencyKey,
});

describe("Flight Consumer Preview terminal reprice recovery", () => {
  it("closes exactly one terminal attempt and returns no identifiers or digests", async () => {
    const deps = dependencies();
    const result = await closeOneTerminalFlightConsumerPreviewReprice(input, deps);

    expect(result).toEqual({
      decision: "closed",
      terminalState: "succeeded",
      idempotencyStatus: "failed",
      offerStatus: "expired",
    });
    expect(deps.requireRuntime).toHaveBeenCalledTimes(1);
    expect(deps.findCandidates).toHaveBeenCalledTimes(1);
    expect(deps.closeCandidate).toHaveBeenCalledTimes(1);
    expect(deps.closeCandidate).toHaveBeenCalledWith(candidate);
    expect(deps.attestCandidate).toHaveBeenCalledWith(candidate);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(attemptId);
    expect(serialized).not.toContain(offerId);
    expect(serialized).not.toContain(idempotencyId);
    expect(serialized).not.toContain("a".repeat(64));
  });

  it("requires exact Preview authority and explicit confirmation", async () => {
    for (const [candidateInput, env] of [
      [{ ...input, confirmation: "wrong" }, dependencies().env],
      [input, { ...dependencies().env, VERCEL_ENV: "production" }],
      [input, { ...dependencies().env, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }],
      [input, { ...dependencies().env, SUPABASE_SERVICE_ROLE_KEY: "short" }],
    ] as const) {
      const deps = dependencies({ env });
      await expect(closeOneTerminalFlightConsumerPreviewReprice(
        candidateInput,
        deps,
      )).rejects.toBeInstanceOf(FlightConsumerPreviewRepriceRecoveryError);
      expect(deps.requireRuntime).not.toHaveBeenCalled();
      expect(deps.closeCandidate).not.toHaveBeenCalled();
    }
  });

  it("refuses zero or multiple candidates without invoking the failure RPC", async () => {
    for (const found of [[], [candidate, candidate]]) {
      const deps = dependencies({
        findCandidates: vi.fn().mockResolvedValue(found),
      });
      await expect(
        closeOneTerminalFlightConsumerPreviewReprice(input, deps),
      ).rejects.toMatchObject({ kind: "conflict" });
      expect(deps.closeCandidate).not.toHaveBeenCalled();
      expect(deps.attestCandidate).not.toHaveBeenCalled();
    }
  });

  it("fails closed on a mismatched closure or any materialized commerce state", async () => {
    const mismatched = dependencies({
      closeCandidate: vi.fn().mockResolvedValue([{
        offer_id: "66666666-6666-4666-8666-666666666666",
        terminal_state: "succeeded",
        idempotency_status: "failed",
      }]),
    });
    await expect(
      closeOneTerminalFlightConsumerPreviewReprice(input, mismatched),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(mismatched.attestCandidate).not.toHaveBeenCalled();

    const materialized = dependencies({
      attestCandidate: vi.fn().mockResolvedValue({
        attemptState: "succeeded",
        attemptRevision: 2,
        retryAuthorized: false,
        idempotencyStatus: "failed",
        offerStatus: "expired",
        repriceReceiptCount: 0,
        refreshedEvidenceCount: 0,
        orderCount: 1,
      }),
    });
    await expect(
      closeOneTerminalFlightConsumerPreviewReprice(input, materialized),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
});
