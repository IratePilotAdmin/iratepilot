import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sanitize: vi.fn(),
  terminalSanitize: vi.fn(),
  extract: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/flights/duffel-sandbox-contract", () => ({
  sanitizeDuffelSandboxOrderResponse: mocks.sanitize,
  sanitizeDuffelSandboxTerminalRecoveryOrderResponse: mocks.terminalSanitize,
}));
vi.mock("../lib/flights/consumer-preview/duffel-evidence.server", () => ({
  extractVerifiedDuffelPreviewOrderReferences: mocks.extract,
}));
vi.mock("../lib/flights/consumer-preview/reference-crypto.server", () => ({
  encryptFlightConsumerPreviewReference: mocks.encrypt,
}));

import {
  FlightConsumerPreviewTerminalResponseFinalizationError,
  projectFlightConsumerPreviewTerminalOrderResponse,
} from "../lib/flights/consumer-preview/terminal-response-finalization.server";

const customerId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const searchId = "00000000-0000-4000-8000-000000000003";
const offerId = "00000000-0000-4000-8000-000000000004";
const repriceId = "00000000-0000-4000-8000-000000000005";
const passengerId = "00000000-0000-4000-8000-000000000006";
const executionScopeSha256 = "a".repeat(64);
const receiptSha256 = "b".repeat(64);
const termsSha256 = "c".repeat(64);
const refreshSha256 = "d".repeat(64);
const providerOfferSha256 = "e".repeat(64);
const providerPassengerSha256 = "f".repeat(64);
const providerPassengerId = "pas_0000000000000001";
const rawBody = Buffer.from(JSON.stringify({ data: { id: "ord_0000000000000001" } }));
const providerResponseSha256 = createHash("sha256").update(rawBody).digest("hex");
const responseObservedAt = "2027-01-01T00:12:00.000Z";

function sanitized(overrides: Record<string, unknown> = {}) {
  return {
    version: "duffel-sanitized-order-v1",
    providerOrderId: "ord_0000000000000001",
    providerOrderIdDigest: "1".repeat(64),
    liveMode: false,
    selectedOfferIdDigest: providerOfferSha256,
    acceptedTermsDigest: termsSha256,
    offerRefreshReceiptDigest: refreshSha256,
    offerRefreshedAt: "2027-01-01T00:05:00.000Z",
    bookingReferencePresent: true,
    passengerIdDigests: [providerPassengerSha256],
    total: { currency: "USD", amountMinor: 24_950 },
    base: { currency: "USD", amountMinor: 20_000 },
    tax: { currency: "USD", amountMinor: 4_950 },
    createdAt: "2027-01-01T00:11:59.842Z",
    syncedAt: "2027-01-01T00:11:59.000Z",
    uncancelled: true,
    itineraryDigest: "2".repeat(64),
    paidAt: "2027-01-01T00:11:59.000Z",
    awaitingPayment: false,
    ticketDocumentDigests: ["3".repeat(64)],
    ticketedPassengerIdDigests: [providerPassengerSha256],
    everyPassengerCoveredByElectronicTicket: true,
    ticketingEstablished: true,
    rawBodyDigest: providerResponseSha256,
    ...overrides,
  };
}

function projectionInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId,
    executionScopeSha256,
    order: {
      id: orderId,
      customer_id: customerId,
      search_id: searchId,
      offer_id: offerId,
      reprice_receipt_id: repriceId,
      execution_mode: "test",
      execution_scope_sha256: executionScopeSha256,
      provider_code: "duffel",
      currency: "USD",
      total_cents: 24_950,
      status: "requires_review",
    },
    search: {
      departure_date: "2099-02-10",
      adult_count: 1,
      child_count: 0,
      infant_in_seat_count: 0,
      infant_on_lap_count: 0,
    },
    offer: { validating_carrier: "ZZ" },
    payment: {
      status: "captured",
      authorized_cents: 24_950,
      captured_cents: 24_950,
      refunded_cents: 0,
    },
    passengers: [{ id: passengerId, traveler_sequence: 1, traveler_type: "adult" }],
    refreshedOffer: {
      stage: "refreshed",
      receiptDigest: receiptSha256,
      recordDigest: "4".repeat(64),
      scope: {
        tenantId: "tenant_iratepilot_preview_0001",
        commerceId: searchId,
        actorId: customerId,
      },
      retentionExpiresAt: "2027-01-02T00:00:00.000Z",
      search: {
        origin: "ORD",
        destination: "MIA",
        departureDate: "2099-02-10",
        returnDate: null,
        cabin: "economy",
        passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
      },
      snapshot: {
        offerId: "offer_local_0001",
        total: { currency: "USD", amountMinor: 24_950 },
        segments: [{
          segmentId: "segment_local_0001",
          marketingCarrier: "ZZ",
          marketingFlightNumber: "1941",
          origin: "ORD",
          destination: "MIA",
          departsAt: "2099-02-10T10:00:00.000Z",
          arrivesAt: "2099-02-10T13:00:00.000Z",
        }],
      },
      evidence: {
        version: "duffel-refreshed-offer-v1",
        termsDigest: termsSha256,
        refreshReceiptDigest: refreshSha256,
        refreshedAt: "2027-01-01T00:05:00.000Z",
        providerOfferIdDigest: providerOfferSha256,
        providerPassengerIdDigests: [providerPassengerSha256],
      },
    },
    expectedOfferEvidenceReceiptSha256: receiptSha256,
    expectedProviderPassengerIds: [providerPassengerId],
    rawBody,
    providerResponseSha256,
    responseObservedAt,
    referenceKeyring: {} as never,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.sanitize.mockReset().mockImplementation(() => sanitized());
  mocks.terminalSanitize.mockReset().mockImplementation(() => sanitized());
  mocks.extract.mockReset().mockReturnValue({
    providerOrderId: "ord_0000000000000001",
    providerPassengerIds: [providerPassengerId],
    tickets: [{
      providerPassengerId,
      documentReference: "TICKET-00000001",
      documentDigest: "3".repeat(64),
    }],
  });
  mocks.encrypt.mockReset().mockImplementation((input: { value: string }) => ({
    ciphertext: `enc:v1:${input.value}`,
    referenceSha256: createHash("sha256").update(input.value).digest("hex"),
  }));
});

describe("Flight Consumer Preview retained terminal-response projector", () => {
  it("uses the original durable observation time and exact accepted offer evidence", () => {
    const artifact = projectFlightConsumerPreviewTerminalOrderResponse(
      projectionInput() as never,
    );

    expect(mocks.sanitize).toHaveBeenCalledWith(rawBody, {
      expectedOffer: expect.objectContaining({
        version: "duffel-refreshed-offer-v1",
        termsDigest: termsSha256,
      }),
      acceptedTermsDigest: termsSha256,
      expectedProviderPassengerIds: [providerPassengerId],
      retrievedAt: responseObservedAt,
    });
    expect(mocks.terminalSanitize).not.toHaveBeenCalled();
    expect(artifact).toMatchObject({
      providerCreatedAt: "2027-01-01T00:11:59.842Z",
      ticketingDeadlineAt: "2099-02-10T09:59:00.000Z",
      issuedTicketCount: 1,
    });
    expect(Date.parse(artifact.ticketingDeadlineAt)).toBeLessThan(
      Date.parse("2099-02-10T10:00:00.000Z"),
    );
    expect(artifact.passengerBindings).toHaveLength(1);
    expect(artifact.ticketDocuments).toHaveLength(1);
  });

  it("rejects a missing, non-canonical, or provider-preceding outbound deadline", () => {
    const missing = projectionInput();
    missing.refreshedOffer.snapshot.segments = [];
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(missing as never))
      .toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);

    const nonCanonical = projectionInput();
    nonCanonical.refreshedOffer.snapshot.segments[0]!.departsAt =
      "2099-02-10T10:00:00+00:00";
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(nonCanonical as never))
      .toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);

    const tooEarly = projectionInput();
    tooEarly.refreshedOffer.snapshot.segments[0]!.departsAt =
      "2027-01-01T00:12:30.000Z";
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(tooEarly as never))
      .toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);

    const past = projectionInput();
    past.refreshedOffer.snapshot.segments[0]!.departsAt =
      "2020-02-10T10:00:00.000Z";
    mocks.sanitize.mockReturnValueOnce(sanitized({
      createdAt: "2020-02-09T10:00:00.000Z",
    }));
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(past as never))
      .toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);
  });

  it("accepts the dedicated unbranded terminal-recovery projection shape", () => {
    const input = projectionInput();
    const { stage, ...offer } = input.refreshedOffer;
    const artifact = projectFlightConsumerPreviewTerminalOrderResponse({
      ...input,
      refreshedOffer: {
        ...offer,
        version: "duffel-terminal-recovery-offer-evidence-v1",
        terminalStage: stage,
        evidence: {
          ...offer.evidence,
          version: "duffel-terminal-recovery-refreshed-offer-evidence-v1",
        },
      },
    } as never);

    expect(mocks.sanitize).not.toHaveBeenCalled();
    expect(mocks.terminalSanitize).toHaveBeenCalledWith(rawBody, {
      expectedOffer: expect.objectContaining({
        version: "duffel-terminal-recovery-refreshed-offer-evidence-v1",
        termsDigest: termsSha256,
      }),
      acceptedTermsDigest: termsSha256,
      expectedProviderPassengerIds: [providerPassengerId],
      retrievedAt: responseObservedAt,
    });
    expect(artifact).toMatchObject({
      providerCreatedAt: "2027-01-01T00:11:59.842Z",
      issuedTicketCount: 1,
    });
  });

  it("encrypts the one-character Duffel TEST ticket identifier with the real reference contract", async () => {
    const referenceCrypto = await vi.importActual<
      typeof import("../lib/flights/consumer-preview/reference-crypto.server")
    >("../lib/flights/consumer-preview/reference-crypto.server");
    const keyring = referenceCrypto.createFlightConsumerPreviewReferenceKeyring({
      keyVersion: "preview-reference-v1",
      encryptionKeyBase64Url: Buffer.alloc(32, 21).toString("base64url"),
      hmacKeyBase64Url: Buffer.alloc(32, 22).toString("base64url"),
    });
    mocks.extract.mockReturnValueOnce({
      providerOrderId: "ord_0000000000000001",
      providerPassengerIds: [providerPassengerId],
      tickets: [{
        providerPassengerId,
        documentReference: "1",
        documentDigest: "3".repeat(64),
      }],
    });
    mocks.encrypt.mockImplementation(referenceCrypto.encryptFlightConsumerPreviewReference);

    const artifact = projectFlightConsumerPreviewTerminalOrderResponse(
      projectionInput({ referenceKeyring: keyring }) as never,
    );
    const ticket = artifact.ticketDocuments[0]!;
    expect(referenceCrypto.decryptFlightConsumerPreviewReference({
      ciphertext: ticket.document_ref_ciphertext,
      expectedReferenceSha256: ticket.document_ref_sha256,
      context: {
        kind: "duffel_ticket",
        customerId,
        resourceId: `ticket:${passengerId}`,
        executionScopeSha256,
      },
      keyring,
    })).toBe("1");
  });

  it("rejects hybrid or mismatched terminal outer shapes before either sanitizer", () => {
    const hybrid = projectionInput();
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse({
      ...hybrid,
      refreshedOffer: {
        ...hybrid.refreshedOffer,
        version: "duffel-terminal-recovery-offer-evidence-v1",
        terminalStage: "refreshed",
        evidence: {
          ...hybrid.refreshedOffer.evidence,
          version: "duffel-terminal-recovery-refreshed-offer-evidence-v1",
        },
      },
    } as never)).toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);

    const mismatched = projectionInput();
    const { stage, ...withoutStage } = mismatched.refreshedOffer;
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse({
      ...mismatched,
      refreshedOffer: {
        ...withoutStage,
        version: "duffel-terminal-recovery-offer-evidence-v1",
        terminalStage: stage,
      },
    } as never)).toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);

    const inherited = projectionInput();
    inherited.refreshedOffer = Object.assign(
      Object.create({ terminalStage: "refreshed" }),
      inherited.refreshedOffer,
    ) as typeof inherited.refreshedOffer;
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(inherited as never))
      .toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);
    expect(mocks.sanitize).not.toHaveBeenCalled();
    expect(mocks.terminalSanitize).not.toHaveBeenCalled();
  });

  it("rejects a raw response whose durable digest does not match", () => {
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(
      projectionInput({ providerResponseSha256: "9".repeat(64) }) as never,
    )).toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);
    expect(mocks.sanitize).not.toHaveBeenCalled();
  });

  it("rejects uncaptured money or uncertified ticket coverage", () => {
    const invalidPayment = projectionInput();
    invalidPayment.payment.captured_cents = 24_949;
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(invalidPayment as never))
      .toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);

    mocks.sanitize.mockReturnValueOnce(sanitized({ ticketingEstablished: false }));
    expect(() => projectFlightConsumerPreviewTerminalOrderResponse(projectionInput() as never))
      .toThrow(FlightConsumerPreviewTerminalResponseFinalizationError);
  });

  it("keeps terminal recovery independent of fresh dispatch authority and current offer expiry", () => {
    const projectorSource = readFileSync(resolve(
      process.cwd(),
      "lib/flights/consumer-preview/terminal-response-finalization.server.ts",
    ), "utf8");
    const workflowSource = readFileSync(resolve(
      process.cwd(),
      "lib/flights/consumer-preview/complete-order-workflow.server.ts",
    ), "utf8");
    const asyncSource = readFileSync(resolve(
      process.cwd(),
      "lib/flights/consumer-preview/async-duffel-order-convergence.server.ts",
    ), "utf8");
    const repositorySource = readFileSync(resolve(
      process.cwd(),
      "lib/flights/consumer-preview/offer-evidence-repository.server.ts",
    ), "utf8");
    const orderCreatingBranch = workflowSource.slice(
      workflowSource.indexOf('if (state.order.status === "order_creating")'),
      workflowSource.indexOf("const stripe =", workflowSource.indexOf(
        'if (state.order.status === "order_creating")',
      )),
    );
    const recoveryBranch = workflowSource.slice(
      workflowSource.indexOf("async function recoverOrResumeDuffelOrder"),
      workflowSource.indexOf("export async function completeFlightConsumerPreviewOrder"),
    );

    expect(projectorSource).toContain("sanitizeDuffelSandboxOrderResponse");
    expect(projectorSource).toContain(
      "sanitizeDuffelSandboxTerminalRecoveryOrderResponse",
    );
    expect(projectorSource).not.toContain("createFlightConsumerPreviewAuthority");
    expect(projectorSource).not.toContain("prepareDuffelSandboxCreateOrderBridge");
    expect(projectorSource).not.toMatch(/expiresAt|expires_at/);
    expect(orderCreatingBranch).not.toContain("buildOrderPackage");
    expect(orderCreatingBranch).toContain("recoverOrResumeDuffelOrder");
    expect(recoveryBranch.indexOf("readOrderRecovery")).toBeLessThan(
      recoveryBranch.indexOf("buildOrderPackage"),
    );
    expect(recoveryBranch).toContain(
      "buildFlightConsumerPreviewTerminalResponseFinalizationArtifact",
    );
    expect(workflowSource).toContain(
      "createFlightConsumerPreviewTerminalRecoveryOfferEvidenceRepository",
    );
    expect(recoveryBranch).toContain('responseObservation: { kind: "terminal_replay" }');
    expect(workflowSource).toContain(
      'const historicalRecovery = input.responseObservation.kind !== "create_terminal"',
    );
    expect(workflowSource).not.toContain('.from("flight_offer_evidence_vault")');
    expect(workflowSource).not.toContain("local_offer_id: input.order.offer_id");
    expect(workflowSource).not.toContain(
      "context.local_offer_id !== input.order.offer_id",
    );
    expect(workflowSource).toContain("receiptSha256: context.receipt_sha256");
    expect(workflowSource).toContain("reader.projectTerminalOfferEvidence(");
    expect(workflowSource).not.toContain("Object.freeze({ ...refreshedOffer })");
    expect(recoveryBranch).not.toContain("finalizeDuffelOrderResponse({");
    expect(asyncSource).toContain(
      "buildFlightConsumerPreviewTerminalResponseFinalizationArtifact",
    );
    expect(asyncSource).toContain(
      "responseObservedAt: millisecondRecoveryObservation(evidence.created_at)",
    );
    expect(asyncSource).toContain("return new Date(milliseconds).toISOString()");
    expect(asyncSource).not.toContain("responseObservedAt: evidence.created_at");
    expect(asyncSource).toContain(
      "get_flight_consumer_duffel_recovery_evidence_observation_v1",
    );
    expect(asyncSource).not.toContain('.from("flight_order_recovery_evidence_vault")');
    expect(asyncSource).not.toContain("buildFlightConsumerPreviewOrderFinalizationPackage");
    expect(asyncSource).not.toContain("buildFlightConsumerPreviewDuffelFinalizationArtifact");
    expect(repositorySource).toContain(
      "get_flight_offer_local_identity_for_terminal_recovery_v1",
    );
    expect(repositorySource).toContain("p_receipt_sha256: identity.receiptSha256");
    expect(repositorySource).not.toContain("localOfferId: identity.offerId");
    expect(repositorySource).toContain(
      "projectDuffelSandboxTerminalRecoveryOfferEvidence",
    );
    expect(repositorySource).toContain("verifyAndLoadTerminalOfferEvidence");
    expect(repositorySource).toContain("projectTerminalOfferEvidence");
    expect(repositorySource).not.toContain("createFlightConsumerPreviewAuthority");
    expect(repositorySource).not.toContain("prepareDuffelSandboxCreateOrderBridge");
  });
});
