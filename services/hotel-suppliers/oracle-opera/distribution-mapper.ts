import type {
  OperaCancellation,
  OperaCreateReservationRequest,
  OperaOffer,
  OperaReservation,
  OracleOperaContractMapper,
} from "./contracts";

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Oracle OPERA ${label} is required`);
  return normalized;
}

function firstReservation(payload: unknown) {
  const candidate = Array.isArray(payload) ? payload[0] : payload;
  const reservation = object(candidate);
  if (!Object.keys(reservation).length) throw new Error("Oracle OPERA reservation response was empty");
  return reservation;
}

function reservationId(reservation: Json, preferredType: string) {
  const ids = array(reservation.reservationIds).map(object);
  return string(ids.find((item) => string(item.type)?.toLowerCase() === preferredType.toLowerCase())?.id)
    || string(ids[0]?.id);
}

function reservation(payload: unknown, input: {
  hotelId: string;
  reservationId?: string;
  externalReference?: string;
}): OperaReservation {
  const value = firstReservation(payload);
  const confirmation = reservationId(value, "Confirmation") || input.reservationId;
  if (!confirmation) throw new Error("Oracle OPERA response did not include a confirmation number");
  return {
    hotelId: string(value.hotelCode) || input.hotelId,
    reservationId: confirmation,
    confirmationNumber: confirmation,
    externalReference: input.externalReference || input.reservationId || confirmation,
    status: string(value.reservationStatus) || "Reserved",
    raw: payload,
  };
}

function createPayload(input: OperaCreateReservationRequest) {
  const roomTypeCode = required(input.roomTypeCode, "room type code");
  const ratePlanCode = required(input.ratePlanCode, "rate plan code");
  const methodCode = required(input.payment.methodCode, "payment method code");
  if (!input.payment.guaranteeCode && !input.payment.guaranteeType) {
    throw new Error("Oracle OPERA guarantee code or guarantee type is required");
  }
  if (!input.nightlyRates.length) throw new Error("Oracle OPERA nightly rates are required");

  const paymentCard = input.payment.token ? {
    cardNumber: input.payment.token,
    cardOrToken: input.payment.tokenType || "Token",
    ...(input.payment.expirationDate ? { expirationDate: input.payment.expirationDate } : {}),
  } : undefined;

  return {
    reservations: [{
      hotelCode: required(input.hotelId, "hotel code"),
      messageId: required(input.externalReference, "external reference"),
      isSessionRequest: false,
      printRate: false,
      reservationIdList: [{
        id: input.externalReference,
        idContext: "iRatePilot",
        type: "External",
      }],
      roomStay: {
        arrivalDate: input.arrivalDate,
        departureDate: input.departureDate,
        bookingMedium: "OTA",
        guarantee: {
          ...(input.payment.guaranteeCode ? { guaranteeCode: input.payment.guaranteeCode } : {}),
          ...(input.payment.guaranteeType ? { guaranteeType: input.payment.guaranteeType } : {}),
          onHold: false,
        },
        guestCounts: { adults: input.adults, children: input.children || 0 },
        roomRates: [{
          start: input.arrivalDate,
          end: input.departureDate,
          numberOfUnits: input.rooms || 1,
          roomType: roomTypeCode,
          ratePlanCode,
          guestCounts: { adults: input.adults, children: input.children || 0 },
          rates: {
            rate: input.nightlyRates.map((rate) => ({
              start: rate.start,
              end: rate.end,
              base: {
                currencyCode: input.currency,
                ...(rate.amountBeforeTax === undefined ? {} : { amountBeforeTax: rate.amountBeforeTax }),
                ...(rate.amountAfterTax === undefined ? {} : { amountAfterTax: rate.amountAfterTax }),
              },
            })),
          },
        }],
      },
      reservationGuests: [{
        primary: true,
        profileInfo: {
          profile: {
            profileType: "Guest",
            customer: {
              personName: [{
                givenName: required(input.guest.firstName, "guest first name"),
                surname: required(input.guest.lastName, "guest last name"),
                nameType: "Primary",
                ...(input.guest.email ? { email: input.guest.email } : {}),
                ...(input.guest.phone ? { phoneNumber: input.guest.phone } : {}),
              }],
            },
          },
        },
      }],
      reservationPaymentMethods: [{
        paymentMethod: methodCode,
        ...(paymentCard ? { paymentCard } : {}),
      }],
      comments: (input.comments || []).map((comment) => ({
        comment: { commentTitle: "iRatePilot", text: { value: comment } },
      })),
    }],
  };
}

export const oracleOperaDistributionMapper: OracleOperaContractMapper = {
  availabilityMethod: () => "GET",
  availabilityPath(input) {
    const query = new URLSearchParams({
      ArrivalDate: input.arrivalDate,
      DepartureDate: input.departureDate,
      Adults: String(input.adults),
      Children: String(input.children || 0),
      NumberOfUnits: String(input.rooms || 1),
      AvailableOnly: "true",
    });
    input.ratePlanCodes?.forEach((code) => query.append("RatePlanCodes", code));
    input.roomTypeCodes?.forEach((code) => query.append("RoomTypes", code));
    return `/shop/v1/hotels/${encodeURIComponent(input.hotelId)}/offers?${query}`;
  },
  availabilityResponse(payload, input): OperaOffer[] {
    const roomStays = array(object(payload).roomStays).map(object);
    return roomStays.flatMap((roomStay) => array(roomStay.offers).map(object)).map((offer) => {
      const total = object(offer.total);
      const rateInformation = object(offer.rateInformation);
      const nightlyRates = array(rateInformation.base).map((value) => {
        const rate = object(value);
        return {
          start: string(rate.start) || input.arrivalDate,
          end: string(rate.end) || input.departureDate,
          amountBeforeTax: number(rate.amountBeforeTax),
          amountAfterTax: number(rate.amountAfterTax),
        };
      });
      const offerId = string(offer.bookingCode);
      const roomTypeCode = string(offer.roomType);
      const ratePlanCode = string(offer.ratePlanCode);
      const currency = string(total.currencyCode) || input.currency;
      const totalAmount = number(total.amountAfterTax) ?? number(total.amountBeforeTax);
      if (!offerId || !roomTypeCode || !ratePlanCode || !currency || totalAmount === undefined) {
        throw new Error("Oracle OPERA offer response was incomplete");
      }
      return {
        offerId,
        hotelId: input.hotelId,
        roomTypeCode,
        ratePlanCode,
        currency,
        totalAmount,
        nightlyRates,
        available: string(offer.availabilityStatus) === "AvailableForSale",
        raw: offer,
      };
    });
  },
  createReservationPath: (input) => `/book/v1/hotels/${encodeURIComponent(input.hotelId)}/reservations`,
  createReservationPayload: createPayload,
  createReservationResponse: (payload, input) => reservation(payload, input),
  getReservationPath: (input) =>
    `/book/v1/hotels/${encodeURIComponent(input.hotelId)}/reservations/${encodeURIComponent(input.reservationId)}`,
  getReservationResponse: (payload, input) => reservation(payload, input),
  modifyReservationPath: (input) =>
    `/book/v1/hotels/${encodeURIComponent(input.hotelId)}/reservations/${encodeURIComponent(input.reservationId)}`,
  modifyReservationPayload: createPayload,
  modifyReservationResponse: (payload, input) => reservation(payload, input),
  cancelReservationPath: (input) =>
    `/book/v1/hotels/${encodeURIComponent(input.hotelId)}/reservations/${encodeURIComponent(input.reservationId)}/cancellations`,
  cancelReservationPayload(input) {
    return {
      reservations: [{
        hotelCode: input.hotelId,
        messageId: input.externalReference,
        reservationIdList: [{ id: input.reservationId, idContext: "Central", type: "Confirmation" }],
      }],
    };
  },
  cancelReservationResponse(payload, input): OperaCancellation {
    const value = firstReservation(payload);
    return {
      hotelId: string(value.hotelCode) || input.hotelId,
      reservationId: input.reservationId,
      cancellationNumber: reservationId(value, "Cancellation"),
      status: string(value.reservationStatus) || "Cancelled",
      raw: payload,
    };
  },
};
