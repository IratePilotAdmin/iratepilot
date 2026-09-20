import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow,
  FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED,
  FlightConsumerProductionPrivatePreviewLiveShoppingError,
  type FlightConsumerProductionPrivatePreviewLiveShoppingPorts,
} from "../lib/flights/consumer-production/private-preview-live-shopping.server";

const digest = (value: string) => value.repeat(64);
const sourceCommit = "b".repeat(40);
const environment = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://www.iratepilot.com",
  VERCEL_GIT_COMMIT_SHA: sourceCommit,
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_DARK_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED: "false",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_ADMISSION_ENABLED: "true",
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256: digest("2"),
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256: digest("4"),
  FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA: sourceCommit,
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
  FLIGHT_CONSUMER_PRODUCTION_DUFFEL_WEBHOOK_SECRET: "dedicated-webhook-secret",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-1234567890abcdef",
  [FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED]: "true",
};

const customerId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";
const search = {
  origin: "ORD",
  destination: "LHR",
  departureDate: "2026-09-10",
  returnDate: null,
  cabin: "economy" as const,
  adults: 1,
};
const admission = {
  admissionId: "33333333-3333-4333-8333-333333333333",
  admissionReceiptSha256: digest("a"),
  admissionExecutionScopeSha256: digest("1"),
  policySha256: digest("2"),
  admissionPolicySha256: digest("3"),
  cohortSha256: digest("4"),
  subjectSha256: digest("5"),
  admissionIdempotencySha256: digest("6"),
  publicRequestSha256: digest("7"),
};
const falseAuthorities = {
  consumer_public_release_authorized: false,
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

function ports(rows: readonly unknown[] = []):
FlightConsumerProductionPrivatePreviewLiveShoppingPorts {
  return {
    reserve: vi.fn(async () => admission),
    dispatch: vi.fn(async () => ({ replay: false })),
    reconcile: vi.fn(async () => ({
      decision: "created" as const,
      exposure_id: "44444444-4444-4444-8444-444444444444",
      exposure_receipt_sha256: digest("8"),
      reconciliation_mode: "direct" as const,
      exposure_not_after: "2026-08-27T15:01:00.000Z",
      source_offer_count: rows.length === 0 ? 0 : 1,
      projected_offer_count: rows.length === 0 ? 0 : 1,
      refused_offer_count: 0,
      private_preview_exposure_authorized: true as const,
      ...falseAuthorities,
    })),
    readSafe: vi.fn(async () => rows),
  };
}

const safeRow = {
  local_offer_id: "55555555-5555-4555-8555-555555555555",
  display_rank: 1,
  owner_name: "Example Air",
  owner_iata_code: "EA",
  currency: "USD",
  base_amount_minor: "12345",
  tax_amount_minor: "2345",
  total_amount_minor: "14690",
  offer_expires_at: "2026-08-27T15:10:00.000Z",
  presentation_expires_at: "2026-08-27T15:05:00.000Z",
  changeable: true,
  refundable: false,
  change_penalty_amount_minor: "5000",
  refund_penalty_amount_minor: null,
  segment_sequence: 1,
  slice_sequence: 1,
  journey_direction: "outbound",
  origin_iata: "ORD",
  destination_iata: "LHR",
  departing_at_local: "2026-09-10T10:00:00",
  arriving_at_local: "2026-09-10T22:00:00",
  origin_time_zone: "America/Chicago",
  destination_time_zone: "Europe/London",
  marketing_carrier_name: "Example Air",
  marketing_carrier_iata_code: "EA",
  operating_carrier_name: "Example Air",
  operating_carrier_iata_code: "EA",
  marketing_flight_number: "101",
  duration_minutes: 480,
  cabin: "economy",
};

describe("Gate140 private-preview live-shopping workflow", () => {
  it("composes admission, one-shot dispatch, Gate139 exposure, and allowlisted read", async () => {
    const dependencies = ports([safeRow]);
    const workflow = createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow({
      environment,
      ports: dependencies,
      now: () => new Date("2026-08-27T14:00:00.000Z"),
    });

    const result = await workflow.execute({
      authenticatedCustomerId: customerId,
      idempotencyKey,
      search,
    });

    expect(dependencies.reserve).toHaveBeenCalledWith({
      authenticatedCustomerId: customerId,
      idempotencyKey,
      search,
    });
    expect(dependencies.dispatch).toHaveBeenCalledWith({ ...admission, search });
    expect(dependencies.reconcile).toHaveBeenCalledWith(admission);
    expect(dependencies.readSafe).toHaveBeenCalledWith({
      exposureReceiptSha256: digest("8"),
      subjectSha256: admission.subjectSha256,
      requestSha256: admission.publicRequestSha256,
    });
    expect(result).toEqual({
      status: "complete",
      replay: false,
      offerCount: 1,
      offers: [{
        id: safeRow.local_offer_id,
        rank: 1,
        owner: { name: "Example Air", iataCode: "EA" },
        price: {
          currency: "USD",
          baseMinor: "12345",
          taxMinor: "2345",
          totalMinor: "14690",
        },
        offerExpiresAt: safeRow.offer_expires_at,
        presentationExpiresAt: safeRow.presentation_expires_at,
        terms: {
          changeable: true,
          refundable: false,
          changePenaltyMinor: "5000",
          refundPenaltyMinor: null,
        },
        segments: [expect.objectContaining({
          origin: "ORD",
          destination: "LHR",
          flightNumber: "101",
        })],
      }],
      providerReferenceExposed: false,
      orderAuthorized: false,
      paymentAuthorized: false,
      captureAuthorized: false,
      refundAuthorized: false,
      ticketingAuthorized: false,
      servicingAuthorized: false,
      consumerPublicReleaseAuthorized: false,
      blindRetryAuthorized: false,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /receipt|sha256|subject|admission|dispatch|projection|provider[_-]?id|off_/i,
    );
  });

  it("treats an exact zero-offer result as complete and does not invent retry authority", async () => {
    const dependencies = ports();
    vi.mocked(dependencies.dispatch).mockResolvedValueOnce({ replay: true });
    const result = await createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow({
      environment,
      ports: dependencies,
      now: () => new Date("2026-08-27T14:00:00.000Z"),
    }).execute({ authenticatedCustomerId: customerId, idempotencyKey, search });
    expect(result).toMatchObject({
      status: "complete",
      replay: true,
      offerCount: 0,
      offers: [],
      blindRetryAuthorized: false,
    });
  });

  it("is default-off and refuses inconsistent safe-row accounting", async () => {
    expect(() => createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow({
      environment: {
        ...environment,
        [FLIGHT_CONSUMER_PRODUCTION_PRIVATE_PREVIEW_ROUTE_ENABLED]: "false",
      },
      ports: ports(),
    })).toThrow(FlightConsumerProductionPrivatePreviewLiveShoppingError);

    await expect(createFlightConsumerProductionPrivatePreviewLiveShoppingWorkflow({
      environment,
      ports: ports([safeRow, { ...safeRow }]),
      now: () => new Date("2026-08-27T14:00:00.000Z"),
    }).execute({ authenticatedCustomerId: customerId, idempotencyKey, search }))
      .rejects.toMatchObject({ reason: "invalid_result", status: 503 });
  });
});
