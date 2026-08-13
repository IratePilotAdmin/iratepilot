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
    throw new Error(`SIHOT ${label} response is malformed`);
  }
  return value as JsonRecord;
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function number(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`SIHOT ${label} is invalid`);
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
    throw new Error("SIHOT offer identifier is invalid");
  }
}

export type SihotBookingMapperConfig = {
  currency: string;
  categories: string[];
  serviceCodes: string[];
  ordererObjectId: string;
  reservationType: string;
  guestType?: string;
  cancellationReason?: string;
};

export class SihotBookingMapper {
  constructor(readonly config: SihotBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("SIHOT currency is required");
    if (!config.categories.length) throw new Error("SIHOT room categories are required");
    if (!config.serviceCodes.length) throw new Error("SIHOT service codes are required");
    if (!config.ordererObjectId.trim()) throw new Error("SIHOT orderer object ID is required");
    if (!config.reservationType.trim()) throw new Error("SIHOT reservation type is required");
  }

  availabilityPayload(input: StandardPmsAvailabilityRequest) {
    return {
      datefrom: input.arrivalDate,
      dateto: input.departureDate,
      CATEGORY: this.config.categories.map((category) => ({ category })),
    };
  }

  ratePayload(input: StandardPmsAvailabilityRequest) {
    return {
      from: input.arrivalDate,
      to: input.departureDate,
      scope: "FORCECALCDAYPRICE",
      currency: input.currency ?? this.config.currency,
      "SERVICE-CODE": this.config.serviceCodes.map((serviceCode) => ({ serviceCode })),
      CATEGORY: this.config.categories.map((category) => ({ category })),
      "PERSON-TYPE": [{ noofpax: input.adults, ...(this.config.guestType ? { guesttype: this.config.guestType } : {}) }],
    };
  }

  availabilityResponse(
    availabilityPayload: unknown,
    ratePayload: unknown,
    input: StandardPmsAvailabilityRequest,
  ): StandardPmsOffer[] {
    const availability = record(record(availabilityPayload, "availability").AVAILABILITY, "availability data");
    const days = list(availability["AVAILABILITY-DAY"]).map((value) => record(value, "availability day"));
    const minimumByCategory = new Map<string, number>();
    for (const day of days) {
      for (const raw of list(day["AVAILABILITY-ENTRY"])) {
        const entry = record(raw, "availability entry");
        const category = text(entry.category);
        if (!category) continue;
        const available = number(entry.available, "available-room count");
        minimumByCategory.set(category, Math.min(minimumByCategory.get(category) ?? available, available));
      }
    }

    const rates = list(record(ratePayload, "rate")["RATE-RESULT"]);
    return rates.map((raw) => {
      const rate = record(raw, "rate result");
      const category = text(rate.category);
      const serviceCode = text(rate.servicecode);
      const rateCategory = text(rate.ratecategory);
      if (!category || !serviceCode || !rateCategory) throw new Error("SIHOT rate result is missing identifiers");
      const total = rate.currencyamount ?? rate.rate;
      return {
        offerId: encode({ category, serviceCode, rateCategory }),
        propertyCode: input.propertyCode,
        roomTypeCode: category,
        ratePlanCode: rateCategory,
        currency: input.currency ?? this.config.currency,
        totalAmount: number(total, "rate total"),
        available: (minimumByCategory.get(category) ?? 0) >= (input.rooms ?? 1),
        raw: { availability: days, rate: raw },
      };
    });
  }

  createReservationPayload(input: StandardPmsCreateReservationRequest) {
    const offer = decode(input.offerId);
    const category = text(offer.category);
    const serviceCode = text(offer.serviceCode);
    const rateCategory = text(offer.rateCategory);
    if (!category || !serviceCode || !rateCategory) throw new Error("SIHOT offer identifier is invalid");
    return {
      arrival: input.arrivalDate,
      departure: input.departureDate,
      noofrooms: input.rooms ?? 1,
      noofpax: input.adults + (input.children ?? 0),
      category,
      ratecategory: rateCategory,
      restype: this.config.reservationType,
      packages: serviceCode,
      guesttype: this.config.guestType,
      gdsresnumber: input.externalReference,
      externalreference: input.externalReference,
      note: `iRatePilot ${input.externalReference}`.slice(0, 60),
      ORDERER: { "ORDERER-OBJID": this.config.ordererObjectId },
    };
  }

  createReservationResponse(payload: unknown, input: StandardPmsCreateReservationRequest): StandardPmsReservation {
    const source = record(payload, "reservation");
    const reservation = source.RESERVATION && typeof source.RESERVATION === "object"
      ? record(source.RESERVATION, "reservation data")
      : source;
    const reservationId = text(reservation["RESERVATION-OBJID"] ?? source["RESERVATION-OBJID"]);
    if (!reservationId) throw new Error("SIHOT reservation response is missing an object ID");
    return {
      propertyCode: input.propertyCode,
      reservationId,
      confirmationNumber: text(reservation.resno ?? reservation.gdsresnumber),
      externalReference: input.externalReference,
      status: text(reservation.restype) ?? "RESERVED",
      raw: payload,
    };
  }

  cancelReservationPayload(input: StandardPmsCancelReservationRequest) {
    return {
      "RESERVATION-OBJID": input.reservationId,
      reason: this.config.cancellationReason,
      note: input.reason?.slice(0, 60),
    };
  }

  cancelReservationResponse(payload: unknown, input: StandardPmsCancelReservationRequest): StandardPmsCancellation {
    const source = record(payload, "cancellation");
    const result = record(source.Result, "cancellation result");
    if (result.Success !== true && result.Success !== "true") throw new Error("SIHOT did not confirm the cancellation");
    return { propertyCode: input.propertyCode, reservationId: input.reservationId, status: "CANCELED", raw: payload };
  }
}
