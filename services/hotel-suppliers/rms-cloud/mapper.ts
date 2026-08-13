import type {
  StandardPmsAvailabilityRequest,
  StandardPmsCancellation,
  StandardPmsCancelReservationRequest,
  StandardPmsCreateReservationRequest,
  StandardPmsOffer,
  StandardPmsReservation,
} from "../standard";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`RMS Cloud ${label} response is malformed`);
  }
  return value as JsonRecord;
}

function records(value: unknown, label: string): JsonRecord[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => record(item, label));
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numeric(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`RMS Cloud ${label} is invalid`);
  return result;
}

function integer(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) throw new Error(`RMS Cloud ${label} is invalid`);
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
    throw new Error("RMS Cloud offer identifier is invalid");
  }
}

function firstRecord(payload: unknown, label: string) {
  return records(payload, label)[0]!;
}

export type RmsCloudBookingMapperConfig = {
  currency: string;
  agentId: number;
  categoryIds: number[];
  bookingSourceId: number;
  reservationTypeId: number;
};

export class RmsCloudBookingMapper {
  constructor(readonly config: RmsCloudBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("RMS Cloud currency is required");
    integer(config.agentId, "agent ID");
    if (!config.categoryIds.length) throw new Error("RMS Cloud category IDs are required");
    config.categoryIds.forEach((value) => integer(value, "category ID"));
    integer(config.bookingSourceId, "booking source ID");
    integer(config.reservationTypeId, "reservation type ID");
  }

  availabilityPayload(input: StandardPmsAvailabilityRequest) {
    if ((input.rooms ?? 1) !== 1) throw new Error("RMS Cloud availability must be requested one room at a time");
    return {
      adults: input.adults,
      agentId: this.config.agentId,
      categoryIds: this.config.categoryIds,
      children: input.children ?? 0,
      infants: 0,
      dateFrom: input.arrivalDate,
      dateTo: input.departureDate,
    };
  }

  availabilityResponse(payload: unknown, input: StandardPmsAvailabilityRequest): StandardPmsOffer[] {
    return records(payload, "availability").flatMap((group) => {
      if (!Array.isArray(group.facilities)) throw new Error("RMS Cloud availability response is missing facilities");
      return group.facilities.map((rawFacility) => {
        const facility = record(rawFacility, "facility");
        const categoryId = integer(facility.categoryId, "category ID");
        const rateId = integer(facility.rateId, "rate ID");
        if (!Array.isArray(facility.areas)) throw new Error("RMS Cloud facility response is missing areas");
        const areas = facility.areas.map((value) => record(value, "area"));
        const availableAreas = areas.filter((area) =>
          Array.isArray(area.availability)
          && area.availability.length > 0
          && area.availability.every((slot) => record(slot, "availability slot").available === true),
        );
        const selectedArea = availableAreas[0] ?? areas[0];
        const slots = selectedArea && Array.isArray(selectedArea.availability)
          ? selectedArea.availability.map((slot) => record(slot, "availability slot"))
          : [];
        const total = slots.reduce((sum, slot) => sum + numeric(slot.rate, "rate"), 0);
        return {
          offerId: encode({ categoryId, rateTypeId: rateId, areaId: selectedArea?.areaId }),
          propertyCode: input.propertyCode,
          roomTypeCode: String(categoryId),
          ratePlanCode: String(rateId),
          currency: input.currency ?? this.config.currency,
          totalAmount: total,
          available: availableAreas.length > 0,
          raw: rawFacility,
        };
      });
    });
  }

  guestPayload(input: StandardPmsCreateReservationRequest) {
    return {
      propertyId: Number(input.propertyCode),
      guestGiven: input.guest.firstName,
      guestSurname: input.guest.lastName,
      email: input.guest.email,
      mobile: input.guest.phone,
      externalRefId: input.externalReference,
    };
  }

  guestResponse(payload: unknown) {
    const guest = firstRecord(payload, "guest");
    return integer(guest.id, "guest ID");
  }

  createReservationPayload(input: StandardPmsCreateReservationRequest, guestId?: number) {
    if ((input.rooms ?? 1) !== 1) throw new Error("RMS Cloud reservations must be created one room at a time");
    const offer = decode(input.offerId);
    return {
      adults: input.adults,
      areaId: offer.areaId == null ? undefined : integer(offer.areaId, "area ID"),
      arrivalDate: input.arrivalDate,
      bookingSourceId: this.config.bookingSourceId,
      categoryId: integer(offer.categoryId, "category ID"),
      children: input.children ?? 0,
      departureDate: input.departureDate,
      guestId: guestId == null ? undefined : integer(guestId, "guest ID"),
      infants: 0,
      notes: `iRatePilot booking ${input.externalReference}`,
      otaRef1: input.externalReference,
      propertyId: Number(input.propertyCode),
      rateTypeId: integer(offer.rateTypeId, "rate ID"),
      resTypeId: this.config.reservationTypeId,
    };
  }

  createReservationResponse(payload: unknown, input: StandardPmsCreateReservationRequest): StandardPmsReservation {
    const reservation = firstRecord(payload, "reservation");
    const reservationId = text(reservation.id);
    if (!reservationId) throw new Error("RMS Cloud reservation response is missing an ID");
    return {
      propertyCode: input.propertyCode,
      reservationId,
      confirmationNumber: text(reservation.onlineConfirmationId ?? reservation.confirmationNumber),
      externalReference: input.externalReference,
      status: text(reservation.statusName ?? record(reservation.status ?? {}, "reservation status").status) ?? "unconfirmed",
      raw: payload,
    };
  }

  cancelReservationPayload(input: StandardPmsCancelReservationRequest) {
    return { reservationId: input.reservationId, reason: input.reason };
  }

  cancelReservationResponse(payload: unknown, input: StandardPmsCancelReservationRequest): StandardPmsCancellation {
    if (payload == null) return { propertyCode: input.propertyCode, reservationId: input.reservationId, status: "CANCELED", raw: payload };
    const reservation = firstRecord(payload, "cancellation");
    const status = text(reservation.statusName)
      ?? (reservation.status && typeof reservation.status === "object" ? text(record(reservation.status, "cancellation status").status) : text(reservation.status));
    if (!status || !["cancelled", "canceled"].includes(status.toLowerCase())) {
      throw new Error("RMS Cloud did not confirm the cancellation");
    }
    return { propertyCode: input.propertyCode, reservationId: input.reservationId, status: "CANCELED", raw: payload };
  }
}
