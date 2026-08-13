import type {
  StandardPmsAvailabilityRequest, StandardPmsCancellation,
  StandardPmsCancelReservationRequest, StandardPmsCreateReservationRequest,
  StandardPmsMapper, StandardPmsOffer, StandardPmsReservation,
} from "../standard";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Shiji ${label} response is malformed`);
  }
  return value as JsonRecord;
}
function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}
function amount(value: unknown) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error("Shiji offer amount is invalid");
  return result;
}
function encode(value: JsonRecord) {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function decode(value: string) {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    return record(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))), "offer identifier");
  } catch { throw new Error("Shiji offer identifier is invalid"); }
}
function responseItems(payload: unknown, label: string) {
  if (Array.isArray(payload)) return payload.map((item) => record(item, label));
  const source = record(payload, label);
  const list = source.items ?? source.results ?? source.offers ?? source.availability ?? source.rooms;
  if (!Array.isArray(list)) throw new Error(`Shiji ${label} response is missing results`);
  return list.map((item) => record(item, label));
}

export type ShijiBookingMapperConfig = { currency: string; bookingSourceCode?: string };

export class ShijiBookingMapper implements StandardPmsMapper {
  constructor(private readonly config: ShijiBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Shiji currency is required");
  }
  availabilityPayload(input: StandardPmsAvailabilityRequest) {
    return { arrivalDate: input.arrivalDate, departureDate: input.departureDate, adults: input.adults,
      children: input.children ?? 0, rooms: input.rooms ?? 1, currency: input.currency ?? this.config.currency };
  }
  availabilityResponse(payload: unknown, input: StandardPmsAvailabilityRequest): StandardPmsOffer[] {
    return responseItems(payload, "availability").map((offer) => {
      const roomTypeCode = text(offer.roomTypeCode ?? offer.roomCode ?? offer.roomTypeId);
      const ratePlanCode = text(offer.ratePlanCode ?? offer.rateCode ?? offer.ratePlanId);
      if (!roomTypeCode || !ratePlanCode) throw new Error("Shiji offer is missing room or rate identifiers");
      const count = Number(offer.availableRooms ?? offer.availableCount ?? offer.inventory);
      const available = typeof offer.available === "boolean" ? offer.available
        : Number.isFinite(count) && count >= (input.rooms ?? 1);
      return { offerId: encode({ roomTypeCode, ratePlanCode, offerToken: text(offer.offerToken ?? offer.id) }),
        propertyCode: input.propertyCode, roomTypeCode, ratePlanCode,
        currency: text(offer.currency ?? offer.currencyCode) ?? input.currency ?? this.config.currency,
        totalAmount: amount(offer.totalAmount ?? offer.total ?? offer.amount ?? offer.rate), available, raw: offer };
    });
  }
  createReservationPayload(input: StandardPmsCreateReservationRequest) {
    const offer = decode(input.offerId);
    const roomTypeCode = text(offer.roomTypeCode); const ratePlanCode = text(offer.ratePlanCode);
    if (!roomTypeCode || !ratePlanCode) throw new Error("Shiji offer identifier is invalid");
    return { arrivalDate: input.arrivalDate, departureDate: input.departureDate, adults: input.adults,
      children: input.children ?? 0, rooms: input.rooms ?? 1, roomTypeCode, ratePlanCode,
      offerToken: text(offer.offerToken), externalReference: input.externalReference,
      bookingSourceCode: this.config.bookingSourceCode, guest: { firstName: input.guest.firstName,
        lastName: input.guest.lastName, email: input.guest.email, phone: input.guest.phone } };
  }
  createReservationResponse(payload: unknown, input: StandardPmsCreateReservationRequest): StandardPmsReservation {
    const source = Array.isArray(payload) ? record(payload[0], "reservation") : record(payload, "reservation");
    const reservation = source.reservation && typeof source.reservation === "object"
      ? record(source.reservation, "reservation") : source;
    const reservationId = text(reservation.reservationId ?? reservation.id ?? reservation.confirmationNumber);
    if (!reservationId) throw new Error("Shiji reservation response is missing an ID");
    return { propertyCode: input.propertyCode, reservationId,
      confirmationNumber: text(reservation.confirmationNumber ?? reservation.confirmationCode),
      externalReference: input.externalReference,
      status: text(reservation.status ?? reservation.reservationStatus) ?? "CONFIRMED", raw: payload };
  }
  cancelReservationPayload(input: StandardPmsCancelReservationRequest) {
    return { reservationId: input.reservationId, externalReference: input.externalReference, reason: input.reason };
  }
  cancelReservationResponse(payload: unknown, input: StandardPmsCancelReservationRequest): StandardPmsCancellation {
    if (payload == null) return { propertyCode: input.propertyCode, reservationId: input.reservationId, status: "CANCELED", raw: payload };
    const source = Array.isArray(payload) ? record(payload[0], "cancellation") : record(payload, "cancellation");
    const status = text(source.status ?? source.reservationStatus);
    const confirmed = source.success === true || source.cancelled === true
      || (status ? ["cancelled", "canceled"].includes(status.toLowerCase()) : false);
    if (!confirmed) throw new Error("Shiji did not confirm the cancellation");
    return { propertyCode: input.propertyCode, reservationId: input.reservationId,
      cancellationNumber: text(source.cancellationNumber ?? source.cancellationCode), status: "CANCELED", raw: payload };
  }
}
