import "server-only";

import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";

export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_RETENTION_VERSION =
  "202608260117" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_PURGE_RPC =
  "purge_flight_consumer_live_expired_offer_references_v1" as const;
export const FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_PURGE_ENABLED =
  "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_PURGE_ENABLED" as const;

const receiptSchema = z.object({
  decision: z.enum(["empty", "purged"]),
  purge_receipt_id: z.string().uuid().nullable(),
  purged_count: z.number().int().min(0).max(500),
  purged_at: z.string().datetime({ offset: true }),
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
}).strict().superRefine((value, context) => {
  if ((value.decision === "empty") !== (value.purge_receipt_id === null)
    || (value.decision === "empty") !== (value.purged_count === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid purge receipt." });
  }
});

type Client = Readonly<{ rpc(name: string, args: Readonly<Record<string, unknown>>):
  Promise<Readonly<{ data: unknown; error: unknown }>> }>;

export class FlightConsumerProductionPublicOfferReferenceRetentionError
  extends Error {
  constructor() {
    super("Production offer-reference retention purge is unavailable.");
    this.name = "FlightConsumerProductionPublicOfferReferenceRetentionError";
  }
}

export function createFlightConsumerProductionPublicOfferReferenceRetention(
  env: Readonly<Record<string, string | undefined>> = process.env,
  client: Client = {
    async rpc(name, args) {
      const { data, error } = await createAdminClient().rpc(name, args);
      return { data, error };
    },
  },
) {
  if (env[FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_PURGE_ENABLED]
    !== "true") {
    throw new FlightConsumerProductionPublicOfferReferenceRetentionError();
  }
  return Object.freeze({
    version: "flight-consumer-production-public-offer-reference-retention-v1" as const,
    migrationVersion:
      FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_RETENTION_VERSION,
    routeExposed: false as const,
    schedulerImplemented: false as const,
    decryptImplemented: false as const,
    providerRequests: 0 as const,
    providerDispatchAuthorized: false as const,
    consumerExposureAuthorized: false as const,
    bookingAuthorized: false as const,
    paymentAuthorized: false as const,
    captureAuthorized: false as const,
    refundAuthorized: false as const,
    async purge(limit: number) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        throw new FlightConsumerProductionPublicOfferReferenceRetentionError();
      }
      try {
        const response = await client.rpc(
          FLIGHT_CONSUMER_PRODUCTION_PUBLIC_OFFER_REFERENCE_PURGE_RPC,
          { p_limit: limit },
        );
        const accepted = z.array(receiptSchema).length(1).safeParse(response.data);
        if (response.error !== null || !accepted.success) throw new Error();
        return Object.freeze(accepted.data[0]!);
      } catch {
        throw new FlightConsumerProductionPublicOfferReferenceRetentionError();
      }
    },
  });
}
