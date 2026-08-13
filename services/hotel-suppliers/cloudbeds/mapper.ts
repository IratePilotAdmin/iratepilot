import type {
  CloudbedsAvailabilityRequest,
  CloudbedsCancellation,
  CloudbedsCancelReservationRequest,
  CloudbedsCreateReservationRequest,
  CloudbedsMapper,
  CloudbedsOffer,
  CloudbedsReservation,
} from "./contracts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Cloudbeds ${label} response is malformed`);
  }
  return value as JsonRecord;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numeric(value: unknown, label: string) {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`Cloudbeds ${label} is invalid`);
  return result;
}

function data(payload: unknown, label: string) {
  const envelope = record(payload, label);
  return envelope.data ?? envelope;
}

type OfferIdentity = { roomTypeID: string; roomRateID: string };

function encodeOffer(identity: OfferIdentity) {
  return btoa(JSON.stringify(identity)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeOffer(offerId: string): OfferIdentity {
  try {
    const encoded = offerId.replaceAll("-", "+").replaceAll("_", "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const value = record(JSON.parse(atob(padded)), "offer identifier");
    const roomTypeID = text(value.roomTypeID);
    const roomRateID = text(value.roomRateID);
    if (!roomTypeID || !roomRateID) throw new Error();
    return { roomTypeID, roomRateID };
  } catch {
    throw new Error("Cloudbeds offer identifier is invalid");
  }
}

function reservation(payload: unknown, input: CloudbedsCreateReservationRequest): CloudbedsReservation {
  const source = record(data(payload, "reservation"), "reservation data");
  const reservationId = text(source.reservationID ?? source.reservationId ?? source.confirmationNumber);
  if (!reservationId) throw new Error("Cloudbeds reservation response is missing an ID");
  return {
    propertyCode: text(source.propertyID ?? source.propertyId) ?? input.propertyCode,
    reservationId,
    confirmationNumber: text(source.confirmationNumber ?? source.confirmationCode ?? source.reservationID),
    externalReference: text(source.thirdPartyIdentifier) ?? input.externalReference,
    status: text(source.status ?? source.reservationStatus) ?? "confirmed",
    raw: payload,
  };
}

export type CloudbedsBookingMapperConfig = {
  sourceId: string;
  paymentMethod?: "cash" | "credit" | "ebanking" | "pay_pal";
};

export class CloudbedsBookingMapper implements CloudbedsMapper {
  constructor(private readonly config: CloudbedsBookingMapperConfig) {
    if (!config.sourceId.trim()) throw new Error("Cloudbeds source ID is required");
  }

  availabilityPayload(input: CloudbedsAvailabilityRequest) {
    return {
      propertyIDs: input.propertyCode,
      startDate: input.arrivalDate,
      endDate: input.departureDate,
      rooms: input.rooms ?? 1,
      adults: input.adults,
      children: input.children ?? 0,
      detailedRates: true,
    };
  }

  availabilityResponse(payload: unknown, input: CloudbedsAvailabilityRequest): CloudbedsOffer[] {
    const responseData = data(payload, "availability");
    const properties = Array.isArray(responseData) ? responseData : [responseData];
    const offers: CloudbedsOffer[] = [];

    properties.forEach((propertyValue) => {
      const property = record(propertyValue, "property availability");
      const propertyCode = text(property.propertyID ?? property.propertyId) ?? input.propertyCode;
      const rooms = Array.isArray(property.propertyRooms)
        ? property.propertyRooms
        : Array.isArray(property.rooms)
          ? property.rooms
          : [];
      rooms.forEach((roomValue) => {
        const room = record(roomValue, "room availability");
        const roomTypeCode = text(room.roomTypeID ?? room.roomTypeId);
        const roomRateID = text(room.roomRateID ?? room.rateID ?? room.rateId);
        if (!roomTypeCode || !roomRateID) {
          throw new Error("Cloudbeds offer is missing room or rate identifiers");
        }
        const availableRooms = numeric(room.roomsAvailable ?? room.availableRooms ?? 0, "availability count");
        offers.push({
          offerId: encodeOffer({ roomTypeID: roomTypeCode, roomRateID }),
          propertyCode,
          roomTypeCode,
          ratePlanCode: text(room.ratePlanID ?? room.ratePlanId ?? roomRateID) ?? roomRateID,
          currency: text(room.currency ?? property.currency) ?? input.currency ?? "USD",
          totalAmount: numeric(room.totalRate ?? room.totalAmount ?? room.roomRate, "offer amount"),
          available: availableRooms >= (input.rooms ?? 1),
          raw: roomValue,
        });
      });
    });
    return offers;
  }

  createReservationPayload(input: CloudbedsCreateReservationRequest) {
    const offer = decodeOffer(input.offerId);
    return {
      propertyID: input.propertyCode,
      sourceID: this.config.sourceId,
      thirdPartyIdentifier: input.externalReference,
      startDate: input.arrivalDate,
      endDate: input.departureDate,
      guestFirstName: input.guest.firstName,
      guestLastName: input.guest.lastName,
      guestEmail: input.guest.email,
      guestPhone: input.guest.phone,
      rooms: [{ roomTypeID: offer.roomTypeID, roomRateID: offer.roomRateID, quantity: input.rooms ?? 1 }],
      adults: [{ roomTypeID: offer.roomTypeID, quantity: input.adults }],
      children: [{ roomTypeID: offer.roomTypeID, quantity: input.children ?? 0 }],
      paymentMethod: this.config.paymentMethod ?? "cash",
      sendEmailConfirmation: false,
    };
  }

  createReservationResponse(payload: unknown, input: CloudbedsCreateReservationRequest) {
    return reservation(payload, input);
  }

  cancelReservationPayload(input: CloudbedsCancelReservationRequest) {
    return {
      propertyID: input.propertyCode,
      reservationID: input.reservationId,
      thirdPartyIdentifier: input.externalReference,
      cancellationReason: input.reason,
    };
  }

  cancelReservationResponse(payload: unknown, input: CloudbedsCancelReservationRequest): CloudbedsCancellation {
    const source = record(data(payload, "cancellation"), "cancellation data");
    return {
      propertyCode: text(source.propertyID ?? source.propertyId) ?? input.propertyCode,
      reservationId: text(source.reservationID ?? source.reservationId) ?? input.reservationId,
      cancellationNumber: text(source.cancellationNumber ?? source.cancellationCode),
      status: text(source.status ?? source.reservationStatus) ?? "canceled",
      raw: payload,
    };
  }
}

