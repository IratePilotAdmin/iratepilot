import type {
  StandardPmsAvailabilityRequest,
  StandardPmsCancelReservationRequest,
  StandardPmsCreateReservationRequest,
} from "../standard";
import { RmsCloudBookingMapper } from "./mapper";
import { RmsCloudHttpTransport, type RmsCloudConfig, type RmsCloudFetch } from "./transport";

export type RmsCloudSyncEnvironment = Record<string, string | undefined>;

function required(env: RmsCloudSyncEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing RMS Cloud configuration: ${key}`);
  return value;
}

function positiveInteger(value: string, key: string) {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw new Error(`Invalid RMS Cloud configuration: ${key}`);
  return result;
}

function integerList(value: string, key: string) {
  const result = value.split(",").map((item) => positiveInteger(item.trim(), key));
  if (!result.length) throw new Error(`Invalid RMS Cloud configuration: ${key}`);
  return result;
}

export function loadRmsCloudSyncConfig(env: RmsCloudSyncEnvironment) {
  const transport: RmsCloudConfig = {
    baseUrl: env.PMS_RMS_CLOUD_BASE_URL?.trim() || "https://restapi8.rmscloud.com/",
    authToken: required(env, "PMS_RMS_CLOUD_AUTH_TOKEN"),
    timeoutMs: env.PMS_RMS_CLOUD_TIMEOUT_MS ? Number(env.PMS_RMS_CLOUD_TIMEOUT_MS) : 15_000,
  };
  return {
    transport,
    mapper: {
      currency: required(env, "PMS_RMS_CLOUD_CURRENCY"),
      agentId: positiveInteger(required(env, "PMS_RMS_CLOUD_AGENT_ID"), "PMS_RMS_CLOUD_AGENT_ID"),
      categoryIds: integerList(required(env, "PMS_RMS_CLOUD_CATEGORY_IDS"), "PMS_RMS_CLOUD_CATEGORY_IDS"),
      bookingSourceId: positiveInteger(required(env, "PMS_RMS_CLOUD_BOOKING_SOURCE_ID"), "PMS_RMS_CLOUD_BOOKING_SOURCE_ID"),
      reservationTypeId: positiveInteger(required(env, "PMS_RMS_CLOUD_RESERVATION_TYPE_ID"), "PMS_RMS_CLOUD_RESERVATION_TYPE_ID"),
    },
  };
}

export class RmsCloudSyncAdapter {
  readonly providerId = "rms-cloud" as const;

  constructor(private readonly transport: RmsCloudHttpTransport, private readonly mapper: RmsCloudBookingMapper) {}

  async availability(input: StandardPmsAvailabilityRequest) {
    const payload = await this.transport.execute({ providerId: this.providerId, propertyCode: input.propertyCode, operation: "availability", requestId: crypto.randomUUID(), payload: this.mapper.availabilityPayload(input) });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: StandardPmsCreateReservationRequest) {
    const guestPayload = await this.transport.executeEndpoint("POST", "guests?ignoreMandatoryFieldWarnings=false", `${input.externalReference}:guest`, this.mapper.guestPayload(input));
    const guestId = this.mapper.guestResponse(guestPayload);
    const payload = await this.transport.execute({ providerId: this.providerId, propertyCode: input.propertyCode, operation: "create_reservation", requestId: input.externalReference, payload: this.mapper.createReservationPayload(input, guestId) });
    return this.mapper.createReservationResponse(payload, input);
  }

  async cancelReservation(input: StandardPmsCancelReservationRequest) {
    const payload = await this.transport.execute({ providerId: this.providerId, propertyCode: input.propertyCode, operation: "cancel_reservation", requestId: `cancel:${input.externalReference}`, payload: this.mapper.cancelReservationPayload(input) });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}

export function createRmsCloudSyncAdapter(config: ReturnType<typeof loadRmsCloudSyncConfig>, fetcher?: RmsCloudFetch) {
  return new RmsCloudSyncAdapter(new RmsCloudHttpTransport(config.transport, fetcher), new RmsCloudBookingMapper(config.mapper));
}
