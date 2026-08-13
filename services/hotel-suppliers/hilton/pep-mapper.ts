import type {
  HiltonAvailabilityRequest,
  HiltonCancellation,
  HiltonCancelReservationRequest,
  HiltonCreateReservationRequest,
  HiltonGetReservationRequest,
  HiltonModifyReservationRequest,
  HiltonOffer,
  HiltonPmsMapper,
  HiltonReservation,
} from "./contracts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Hilton PEP ${label} response is malformed`);
  }
  return value as JsonRecord;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function money(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Hilton PEP offer amount is invalid");
  return amount;
}

function reservation(payload: unknown, input: HiltonGetReservationRequest | HiltonCreateReservationRequest): HiltonReservation {
  const source = record(payload, "reservation");
  const reservationId = text(source.reservationId ?? source.bookingId ?? source.id ?? source.confirmationNumber);
  if (!reservationId) throw new Error("Hilton PEP reservation response is missing an ID");
  return {
    propertyCode: text(source.propertyCode ?? source.hotelCode) ?? input.propertyCode,
    reservationId,
    confirmationNumber: text(source.confirmationNumber ?? source.confirmationCode),
    externalReference: text(source.externalReference ?? source.clientReference)
      ?? input.externalReference
      ?? reservationId,
    status: text(source.status ?? source.reservationStatus) ?? "UNKNOWN",
    raw: payload,
  };
}

export class HiltonPepMapper implements HiltonPmsMapper {
  availabilityPayload(input: HiltonAvailabilityRequest) {
    return {
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      adults: input.adults,
      children: input.children ?? 0,
      rooms: input.rooms ?? 1,
      currency: input.currency,
    };
  }

  availabilityResponse(payload: unknown, input: HiltonAvailabilityRequest): HiltonOffer[] {
    const source = record(payload, "availability");
    const items = Array.isArray(source.offers)
      ? source.offers
      : Array.isArray(source.roomOffers)
        ? source.roomOffers
        : [];
    return items.map((item) => {
      const offer = record(item, "offer");
      const offerId = text(offer.offerId ?? offer.bookingCode ?? offer.id);
      const roomTypeCode = text(offer.roomTypeCode ?? offer.roomType);
      const ratePlanCode = text(offer.ratePlanCode ?? offer.rateCode);
      if (!offerId || !roomTypeCode || !ratePlanCode) throw new Error("Hilton PEP offer is missing required identifiers");
      return {
        offerId,
        propertyCode: text(offer.propertyCode ?? offer.hotelCode) ?? input.propertyCode,
        roomTypeCode,
        ratePlanCode,
        currency: text(offer.currency ?? offer.currencyCode) ?? input.currency ?? "USD",
        totalAmount: money(offer.totalAmount ?? offer.amountAfterTax ?? offer.total),
        available: offer.available !== false && offer.status !== "CLOSED",
        raw: item,
      };
    });
  }

  createReservationPayload(input: HiltonCreateReservationRequest) {
    return {
      externalReference: input.externalReference,
      offerId: input.offerId,
      stay: {
        arrivalDate: input.arrivalDate,
        departureDate: input.departureDate,
        adults: input.adults,
        children: input.children ?? 0,
        rooms: input.rooms ?? 1,
      },
      guest: input.guest,
    };
  }

  createReservationResponse(payload: unknown, input: HiltonCreateReservationRequest) {
    return reservation(payload, input);
  }

  getReservationPayload(input: HiltonGetReservationRequest) {
    return { reservationId: input.reservationId };
  }

  getReservationResponse(payload: unknown, input: HiltonGetReservationRequest) {
    return reservation(payload, input);
  }

  modifyReservationPayload(input: HiltonModifyReservationRequest) {
    return { reservationId: input.reservationId, ...this.createReservationPayload(input) };
  }

  modifyReservationResponse(payload: unknown, input: HiltonModifyReservationRequest) {
    return reservation(payload, input);
  }

  cancelReservationPayload(input: HiltonCancelReservationRequest) {
    return {
      reservationId: input.reservationId,
      externalReference: input.externalReference,
      reason: input.reason,
    };
  }

  cancelReservationResponse(payload: unknown, input: HiltonCancelReservationRequest): HiltonCancellation {
    const source = record(payload, "cancellation");
    return {
      propertyCode: text(source.propertyCode ?? source.hotelCode) ?? input.propertyCode,
      reservationId: text(source.reservationId ?? source.bookingId) ?? input.reservationId,
      cancellationNumber: text(source.cancellationNumber ?? source.cancellationCode),
      status: text(source.status ?? source.reservationStatus) ?? "CANCELLED",
      raw: payload,
    };
  }
}
