import type {
  StandardPmsAvailabilityRequest,
  StandardPmsCancellation,
  StandardPmsCancelReservationRequest,
  StandardPmsCreateReservationRequest,
  StandardPmsMapper,
  StandardPmsOffer,
  StandardPmsReservation,
} from "../standard";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Maestro ${label} response is malformed`);
  }
  return value as JsonRecord;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function amount(value: unknown) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error("Maestro offer amount is invalid");
  return result;
}

function encode(value: JsonRecord) {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string) {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    return record(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))), "offer identifier");
  } catch {
    throw new Error("Maestro offer identifier is invalid");
  }
}

function responseItems(payload: unknown, label: string) {
  if (Array.isArray(payload)) return payload.map((item) => record(item, label));
  const source = record(payload, label);
  const list = source.offers ?? source.results ?? source.availability ?? source.rooms;
  if (!Array.isArray(list)) throw new Error(`Maestro ${label} response is missing results`);
  return list.map((item) => record(item, label));
}

export type MaestroBookingMapperConfig = {
  currency: string;
  bookingSourceCode?: string;
};

export class MaestroBookingMapper implements StandardPmsMapper {
  constructor(private readonly config: MaestroBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Maestro currency is required");
  }

  availabilityPayload(input: StandardPmsAvailabilityRequest) {
    return {
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      adults: input.adults,
      children: input.children ?? 0,
      rooms: input.rooms ?? 1,
      currency: input.currency ?? this.config.currency,
    };
  }

  availabilityResponse(payload: unknown, input: StandardPmsAvailabilityRequest): StandardPmsOffer[] {
    return responseItems(payload, "availability").map((offer) => {
      const roomTypeCode = text(offer.roomTypeCode ?? offer.roomCode ?? offer.categoryCode);
      const ratePlanCode = text(offer.ratePlanCode ?? offer.rateCode ?? offer.rateTypeCode);
      if (!roomTypeCode || !ratePlanCode) throw new Error("Maestro offer is missing room or rate identifiers");
      const availableCount = Number(offer.availableRooms ?? offer.availableCount ?? offer.inventory);
      const available = typeof offer.available === "boolean"
        ? offer.available
        : Number.isFinite(availableCount) && availableCount >= (input.rooms ?? 1);
      return {
        offerId: encode({ roomTypeCode, ratePlanCode, offerToken: text(offer.offerToken ?? offer.id) }),
        propertyCode: input.propertyCode,
        roomTypeCode,
        ratePlanCode,
        currency: text(offer.currency ?? offer.currencyCode) ?? input.currency ?? this.config.currency,
        totalAmount: amount(offer.totalAmount ?? offer.total ?? offer.amount ?? offer.rate),
        available,
        raw: offer,
      };
    });
  }

  createReservationPayload(input: StandardPmsCreateReservationRequest) {
    const offer = decode(input.offerId);
    const roomTypeCode = text(offer.roomTypeCode);
    const ratePlanCode = text(offer.ratePlanCode);
    if (!roomTypeCode || !ratePlanCode) throw new Error("Maestro offer identifier is invalid");
    return {
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      adults: input.adults,
      children: input.children ?? 0,
      rooms: input.rooms ?? 1,
      roomTypeCode,
      ratePlanCode,
      offerToken: text(offer.offerToken),
      externalReference: input.externalReference,
      bookingSourceCode: this.config.bookingSourceCode,
      guest: {
        firstName: input.guest.firstName,
        lastName: input.guest.lastName,
        email: input.guest.email,
        phone: input.guest.phone,
      },
    };
  }

  createReservationResponse(payload: unknown, input: StandardPmsCreateReservationRequest): StandardPmsReservation {
    const source = Array.isArray(payload) ? record(payload[0], "reservation") : record(payload, "reservation");
    const reservation = source.reservation && typeof source.reservation === "object"
      ? record(source.reservation, "reservation")
      : source;
    const reservationId = text(reservation.reservationId ?? reservation.id ?? reservation.confirmationNumber);
    if (!reservationId) throw new Error("Maestro reservation response is missing an ID");
    return {
      propertyCode: input.propertyCode,
      reservationId,
      confirmationNumber: text(reservation.confirmationNumber ?? reservation.confirmationCode),
      externalReference: input.externalReference,
      status: text(reservation.status ?? reservation.reservationStatus) ?? "CONFIRMED",
      raw: payload,
    };
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
    if (!confirmed) throw new Error("Maestro did not confirm the cancellation");
    return {
      propertyCode: input.propertyCode,
      reservationId: input.reservationId,
      cancellationNumber: text(source.cancellationNumber ?? source.cancellationCode),
      status: "CANCELED",
      raw: payload,
    };
  }
}
