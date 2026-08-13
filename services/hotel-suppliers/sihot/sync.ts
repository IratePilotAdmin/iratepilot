import type {
  StandardPmsAvailabilityRequest,
  StandardPmsCancelReservationRequest,
  StandardPmsCreateReservationRequest,
} from "../standard";
import { SihotBookingMapper } from "./mapper";
import { SihotHttpTransport, type SihotConfig, type SihotFetch } from "./transport";

export type SihotSyncEnvironment = Record<string, string | undefined>;

function required(env: SihotSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing SIHOT configuration: ${key}`);
  return value;
}

function csv(value: string) {
  const result = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!result.length) throw new Error("SIHOT comma-separated configuration cannot be empty");
  return result;
}

export function loadSihotSyncConfig(env: SihotSyncEnvironment) {
  const transport: SihotConfig = {
    baseUrl: required(env, "PMS_SIHOT_BASE_URL"),
    securityId: required(env, "PMS_SIHOT_SECURITY_ID"),
    timeoutMs: env.PMS_SIHOT_TIMEOUT_MS ? Number(env.PMS_SIHOT_TIMEOUT_MS) : 15_000,
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_SIHOT_CURRENCY"),
      categories: csv(required(env, "PMS_SIHOT_CATEGORIES")),
      serviceCodes: csv(required(env, "PMS_SIHOT_SERVICE_CODES")),
      ordererObjectId: required(env, "PMS_SIHOT_ORDERER_OBJECT_ID"),
      reservationType: required(env, "PMS_SIHOT_RESERVATION_TYPE"),
      guestType: env.PMS_SIHOT_GUEST_TYPE?.trim(),
      cancellationReason: env.PMS_SIHOT_CANCELLATION_REASON?.trim(),
    },
  };
}

export class SihotSyncAdapter {
  constructor(private readonly transport: SihotHttpTransport, private readonly mapper: SihotBookingMapper) {}

  async availability(input: StandardPmsAvailabilityRequest) {
    const requestId = crypto.randomUUID();
    const [availability, rates] = await Promise.all([
      this.transport.executeService("S_AVAILABILITY_SEARCH_V002", requestId, "AVAILABILITY-SEARCH", this.mapper.availabilityPayload(input)),
      this.transport.executeService("S_RATE_SEARCH_V002", requestId, "RATE-SEARCH", this.mapper.ratePayload(input)),
    ]);
    return this.mapper.availabilityResponse(availability, rates, input);
  }

  async createReservation(input: StandardPmsCreateReservationRequest) {
    const payload = await this.transport.execute({ providerId: "sihot", propertyCode: input.propertyCode, operation: "create_reservation", requestId: input.externalReference, payload: this.mapper.createReservationPayload(input) });
    return this.mapper.createReservationResponse(payload, input);
  }

  async cancelReservation(input: StandardPmsCancelReservationRequest) {
    const payload = await this.transport.execute({ providerId: "sihot", propertyCode: input.propertyCode, operation: "cancel_reservation", requestId: `cancel:${input.externalReference}`, payload: this.mapper.cancelReservationPayload(input) });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}

export function createSihotSyncAdapter(config: ReturnType<typeof loadSihotSyncConfig>, fetcher?: SihotFetch) {
  return new SihotSyncAdapter(new SihotHttpTransport(config.transport, fetcher), new SihotBookingMapper(config.mapper));
}
