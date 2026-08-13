import type {
  ApaleoAvailabilityRequest,
  ApaleoCancellation,
  ApaleoCancelReservationRequest,
  ApaleoCreateReservationRequest,
  ApaleoMapper,
  ApaleoOffer,
  ApaleoReservation,
} from "./contracts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Apaleo ${label} response is malformed`);
  }
  return value as JsonRecord;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function amount(value: unknown, label: string) {
  const source = record(value, label);
  const number = typeof source.amount === "number" ? source.amount : Number(source.amount);
  const currency = text(source.currency);
  if (!Number.isFinite(number) || number < 0 || !currency) {
    throw new Error(`Apaleo ${label} is invalid`);
  }
  return { amount: number, currency };
}

type OfferIdentity = {
  ratePlanId: string;
  unitGroupId: string;
  guaranteeType: string;
  timeSlices: JsonRecord[];
  prePaymentAmount?: { amount: number; currency: string };
};

function encodeOffer(identity: OfferIdentity) {
  return btoa(JSON.stringify(identity)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeOffer(offerId: string): OfferIdentity {
  try {
    const encoded = offerId.replaceAll("-", "+").replaceAll("_", "/");
    const value = record(JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="))), "offer identifier");
    const ratePlanId = text(value.ratePlanId);
    const unitGroupId = text(value.unitGroupId);
    const guaranteeType = text(value.guaranteeType);
    if (!ratePlanId || !unitGroupId || !guaranteeType || !Array.isArray(value.timeSlices)) throw new Error();
    return {
      ratePlanId,
      unitGroupId,
      guaranteeType,
      timeSlices: value.timeSlices.map((slice) => record(slice, "offer time slice")),
      prePaymentAmount: value.prePaymentAmount
        ? amount(value.prePaymentAmount, "offer prepayment amount")
        : undefined,
    };
  } catch {
    throw new Error("Apaleo offer identifier is invalid");
  }
}

function childAges(input: ApaleoAvailabilityRequest) {
  if (input.childrenAges?.length) return input.childrenAges.join(",");
  if (input.children) return Array.from({ length: input.children }, () => 10).join(",");
  return undefined;
}

function mappedTimeSlices(value: unknown, ratePlanId: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Apaleo offer is missing time slices");
  }
  return value.map((sliceValue) => {
    const slice = record(sliceValue, "offer time slice");
    return {
      ratePlanId: text(record(slice.ratePlan ?? {}, "time-slice rate plan").id) ?? ratePlanId,
      ...(slice.totalGrossAmount ? { totalGrossAmount: amount(slice.totalGrossAmount, "time-slice amount") } : {}),
    };
  });
}

export class ApaleoBookingMapper implements ApaleoMapper {
  availabilityPayload(input: ApaleoAvailabilityRequest) {
    if ((input.rooms ?? 1) !== 1) {
      throw new Error("Apaleo offers must be requested one room at a time");
    }
    return {
      arrival: input.arrivalDate,
      departure: input.departureDate,
      adults: input.adults,
      childrenAges: childAges(input),
    };
  }

  availabilityResponse(payload: unknown, input: ApaleoAvailabilityRequest): ApaleoOffer[] {
    const response = record(payload, "availability");
    if (!Array.isArray(response.offers)) throw new Error("Apaleo availability response is missing offers");
    return response.offers.map((offerValue) => {
      const offer = record(offerValue, "offer");
      const ratePlan = record(offer.ratePlan, "offer rate plan");
      const unitGroup = record(offer.unitGroup, "offer unit group");
      const ratePlanId = text(ratePlan.id);
      const unitGroupId = text(unitGroup.id);
      const guaranteeType = text(offer.minGuaranteeType);
      const total = amount(offer.totalGrossAmount, "offer total");
      if (!ratePlanId || !unitGroupId || !guaranteeType) {
        throw new Error("Apaleo offer is missing booking identifiers");
      }
      const timeSlices = mappedTimeSlices(offer.timeSlices, ratePlanId);
      const prePaymentAmount = offer.prePaymentGrossAmount
        ? amount(offer.prePaymentGrossAmount, "offer prepayment amount")
        : undefined;
      const availableUnits = Number(offer.availableUnits);
      return {
        offerId: encodeOffer({ ratePlanId, unitGroupId, guaranteeType, timeSlices, prePaymentAmount }),
        propertyCode: text(record(response.property ?? {}, "property").id) ?? input.propertyCode,
        roomTypeCode: unitGroupId,
        ratePlanCode: ratePlanId,
        currency: total.currency,
        totalAmount: total.amount,
        available: Number.isFinite(availableUnits) && availableUnits > 0,
        raw: offerValue,
      };
    });
  }

  createReservationPayload(input: ApaleoCreateReservationRequest) {
    if ((input.rooms ?? 1) !== 1) {
      throw new Error("Apaleo bookings must be created one room at a time");
    }
    const offer = decodeOffer(input.offerId);
    const guest = {
      firstName: input.guest.firstName,
      lastName: input.guest.lastName,
      email: input.guest.email,
      phone: input.guest.phone,
    };
    return {
      booker: guest,
      reservations: [{
        arrival: input.arrivalDate,
        departure: input.departureDate,
        adults: input.adults,
        childrenAges: input.childrenAges,
        channelCode: "Ibe",
        primaryGuest: guest,
        guaranteeType: offer.guaranteeType,
        unitGroupId: offer.unitGroupId,
        timeSlices: offer.timeSlices,
        prePaymentAmount: offer.prePaymentAmount,
        comment: `iRatePilot reference ${input.externalReference}`,
      }],
    };
  }

  createReservationResponse(payload: unknown, input: ApaleoCreateReservationRequest): ApaleoReservation {
    const booking = record(payload, "booking");
    const reservations = Array.isArray(booking.reservations) ? booking.reservations : [];
    const source = record(reservations[0], "reservation");
    const reservationId = text(source.id);
    if (!reservationId) throw new Error("Apaleo booking response is missing a reservation ID");
    return {
      propertyCode: text(source.propertyId) ?? input.propertyCode,
      reservationId,
      confirmationNumber: text(source.confirmationNumber ?? source.number ?? booking.id),
      externalReference: input.externalReference,
      status: text(source.status) ?? "confirmed",
      raw: payload,
    };
  }

  cancelReservationPayload(input: ApaleoCancelReservationRequest) {
    return { reservationId: input.reservationId };
  }

  cancelReservationResponse(payload: unknown, input: ApaleoCancelReservationRequest): ApaleoCancellation {
    const source = payload === undefined ? {} : record(payload, "cancellation");
    return {
      propertyCode: text(source.propertyId) ?? input.propertyCode,
      reservationId: text(source.id ?? source.reservationId) ?? input.reservationId,
      cancellationNumber: text(source.cancellationNumber),
      status: text(source.status) ?? "canceled",
      raw: payload,
    };
  }
}
