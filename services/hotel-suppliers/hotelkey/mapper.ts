import type {
  HotelKeyAvailabilityRequest, HotelKeyCancellation, HotelKeyCancelReservationRequest,
  HotelKeyCreateReservationRequest, HotelKeyGetReservationRequest, HotelKeyMapper,
  HotelKeyModifyReservationRequest, HotelKeyOffer, HotelKeyReservation,
} from "./contracts";

type JsonRecord = Record<string, unknown>;
function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`HotelKey ${label} response is malformed`);
  return value as JsonRecord;
}
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : undefined; }
function amount(value: unknown) {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error("HotelKey offer amount is invalid");
  return result;
}
function reservation(payload: unknown, input: HotelKeyGetReservationRequest | HotelKeyCreateReservationRequest): HotelKeyReservation {
  const source = record(payload, "reservation");
  const reservationId = text(source.reservationId ?? source.confirmationNumber ?? source.bookingId ?? source.id);
  if (!reservationId) throw new Error("HotelKey reservation response is missing an ID");
  return {
    propertyCode: text(source.propertyCode ?? source.hotelCode) ?? input.propertyCode,
    reservationId,
    confirmationNumber: text(source.confirmationNumber ?? source.confirmationCode),
    externalReference: text(source.externalReference ?? source.clientReference) ?? input.externalReference ?? reservationId,
    status: text(source.status ?? source.reservationStatus) ?? "UNKNOWN",
    raw: payload,
  };
}

export class HotelKeyBookingMapper implements HotelKeyMapper {
  availabilityPayload(input: HotelKeyAvailabilityRequest) {
    return { arrivalDate: input.arrivalDate, departureDate: input.departureDate, adults: input.adults, children: input.children ?? 0, rooms: input.rooms ?? 1, currency: input.currency };
  }
  availabilityResponse(payload: unknown, input: HotelKeyAvailabilityRequest): HotelKeyOffer[] {
    const source = record(payload, "availability");
    const items = Array.isArray(source.rates) ? source.rates : Array.isArray(source.offers) ? source.offers : [];
    return items.map((item) => {
      const offer = record(item, "offer");
      const offerId = text(offer.offerId ?? offer.bookingCode ?? offer.id);
      const roomTypeCode = text(offer.roomTypeCode ?? offer.roomType);
      const ratePlanCode = text(offer.ratePlanCode ?? offer.rateCode);
      if (!offerId || !roomTypeCode || !ratePlanCode) throw new Error("HotelKey offer is missing required identifiers");
      return {
        offerId, propertyCode: text(offer.propertyCode ?? offer.hotelCode) ?? input.propertyCode,
        roomTypeCode, ratePlanCode, currency: text(offer.currency ?? offer.currencyCode) ?? input.currency ?? "USD",
        totalAmount: amount(offer.totalAmount ?? offer.amountAfterTax ?? offer.total),
        available: offer.available !== false && offer.status !== "CLOSED", raw: item,
      };
    });
  }
  createReservationPayload(input: HotelKeyCreateReservationRequest) {
    return {
      externalReference: input.externalReference, offerId: input.offerId,
      stay: { arrivalDate: input.arrivalDate, departureDate: input.departureDate, adults: input.adults, children: input.children ?? 0, rooms: input.rooms ?? 1 },
      guest: input.guest,
    };
  }
  createReservationResponse(payload: unknown, input: HotelKeyCreateReservationRequest) { return reservation(payload, input); }
  getReservationPayload(input: HotelKeyGetReservationRequest) { return { reservationId: input.reservationId }; }
  getReservationResponse(payload: unknown, input: HotelKeyGetReservationRequest) { return reservation(payload, input); }
  modifyReservationPayload(input: HotelKeyModifyReservationRequest) { return { reservationId: input.reservationId, ...this.createReservationPayload(input) }; }
  modifyReservationResponse(payload: unknown, input: HotelKeyModifyReservationRequest) { return reservation(payload, input); }
  cancelReservationPayload(input: HotelKeyCancelReservationRequest) { return { reservationId: input.reservationId, externalReference: input.externalReference, reason: input.reason }; }
  cancelReservationResponse(payload: unknown, input: HotelKeyCancelReservationRequest): HotelKeyCancellation {
    const source = record(payload, "cancellation");
    return {
      propertyCode: text(source.propertyCode ?? source.hotelCode) ?? input.propertyCode,
      reservationId: text(source.reservationId ?? source.bookingId) ?? input.reservationId,
      cancellationNumber: text(source.cancellationNumber ?? source.cancellationCode),
      status: text(source.status ?? source.reservationStatus) ?? "CANCELLED", raw: payload,
    };
  }
}
