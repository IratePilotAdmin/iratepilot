import type {
  MewsAvailabilityRequest,
  MewsCancellation,
  MewsCancelReservationRequest,
  MewsCreateReservationRequest,
  MewsMapper,
  MewsOffer,
  MewsReservation,
} from "./contracts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Mews ${label} response is malformed`);
  }
  return value as JsonRecord;
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function encode(value: JsonRecord) {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string) {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    return record(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))), "offer identifier");
  } catch {
    throw new Error("Mews offer identifier is invalid");
  }
}

export type MewsBookingMapperConfig = {
  serviceId: string;
  resourceCategoryId: string;
  rateId: string;
  adultAgeCategoryId: string;
  childAgeCategoryId?: string;
  checkInTime?: string;
  checkOutTime?: string;
};

export class MewsBookingMapper implements MewsMapper {
  constructor(private readonly config: MewsBookingMapperConfig) {
    for (const [key, value] of Object.entries({
      serviceId: config.serviceId,
      resourceCategoryId: config.resourceCategoryId,
      rateId: config.rateId,
      adultAgeCategoryId: config.adultAgeCategoryId,
    })) {
      if (!value.trim()) throw new Error(`Mews ${key} is required`);
    }
  }

  private interval(input: MewsAvailabilityRequest) {
    return {
      StartUtc: `${input.arrivalDate}T${this.config.checkInTime ?? "14:00:00"}Z`,
      EndUtc: `${input.departureDate}T${this.config.checkOutTime ?? "10:00:00"}Z`,
    };
  }

  private personCounts(input: MewsAvailabilityRequest) {
    const counts = [{ AgeCategoryId: this.config.adultAgeCategoryId, Count: input.adults }];
    if (input.children) {
      if (!this.config.childAgeCategoryId) throw new Error("Mews child age category ID is required for child guests");
      counts.push({ AgeCategoryId: this.config.childAgeCategoryId, Count: input.children });
    }
    return counts;
  }

  availabilityPayload(input: MewsAvailabilityRequest) {
    if ((input.rooms ?? 1) !== 1) throw new Error("Mews prices must be requested one room at a time");
    return {
      ServiceId: this.config.serviceId,
      Reservations: [{
        Identifier: "iratepilot-offer",
        ...this.interval(input),
        PersonCounts: this.personCounts(input),
        RequestedCategoryId: this.config.resourceCategoryId,
        RateId: this.config.rateId,
      }],
    };
  }

  availabilityResponse(payload: unknown, input: MewsAvailabilityRequest): MewsOffer[] {
    const source = record(payload, "pricing");
    if (!Array.isArray(source.ReservationPrices)) throw new Error("Mews pricing response is missing reservation prices");
    return source.ReservationPrices.map((value) => {
      const price = record(value, "reservation price");
      const total = record(price.TotalAmount, "total amount");
      const amount = Number(total.GrossValue);
      const currency = text(total.Currency);
      if (!Number.isFinite(amount) || amount < 0 || !currency) throw new Error("Mews total amount is invalid");
      return {
        offerId: encode({
          serviceId: this.config.serviceId,
          resourceCategoryId: this.config.resourceCategoryId,
          rateId: this.config.rateId,
        }),
        propertyCode: input.propertyCode,
        roomTypeCode: this.config.resourceCategoryId,
        ratePlanCode: this.config.rateId,
        currency,
        totalAmount: amount,
        available: true,
        raw: value,
      };
    });
  }

  addCustomerPayload(input: MewsCreateReservationRequest) {
    return {
      FirstName: input.guest.firstName,
      LastName: input.guest.lastName,
      Email: input.guest.email,
      Phone: input.guest.phone,
      Notes: `Created for iRatePilot booking ${input.externalReference}`,
      OverwriteExisting: true,
    };
  }

  addCustomerResponse(payload: unknown) {
    const customer = record(payload, "customer");
    const customerId = text(customer.Id);
    if (!customerId) throw new Error("Mews customer response is missing an ID");
    return customerId;
  }

  createReservationPayload(input: MewsCreateReservationRequest, customerId: string) {
    if ((input.rooms ?? 1) !== 1) throw new Error("Mews bookings must be created one room at a time");
    const offer = decode(input.offerId);
    const serviceId = text(offer.serviceId);
    const categoryId = text(offer.resourceCategoryId);
    const rateId = text(offer.rateId);
    if (!serviceId || !categoryId || !rateId) throw new Error("Mews offer identifier is invalid");
    return {
      ServiceId: serviceId,
      GroupName: `iRatePilot ${input.externalReference}`,
      SendConfirmationEmail: false,
      CheckRateApplicability: true,
      CheckOverbooking: true,
      Reservations: [{
        Identifier: input.externalReference,
        ChannelNumber: input.externalReference,
        State: "Confirmed",
        ...this.interval(input),
        PersonCounts: this.personCounts(input),
        CustomerId: customerId,
        BookerId: customerId,
        RequestedCategoryId: categoryId,
        RateId: rateId,
        Notes: `iRatePilot reference ${input.externalReference}`,
      }],
    };
  }

  createReservationResponse(payload: unknown, input: MewsCreateReservationRequest): MewsReservation {
    const source = record(payload, "reservation");
    const added = Array.isArray(source.Reservations) ? record(source.Reservations[0], "added reservation") : {};
    const reservation = record(added.Reservation, "reservation data");
    const reservationId = text(reservation.Id);
    if (!reservationId) throw new Error("Mews reservation response is missing an ID");
    return {
      propertyCode: input.propertyCode,
      reservationId,
      confirmationNumber: text(reservation.Number),
      externalReference: input.externalReference,
      status: text(reservation.State) ?? "Confirmed",
      raw: payload,
    };
  }

  cancelReservationPayload(input: MewsCancelReservationRequest) {
    return {
      ReservationIds: [input.reservationId],
      PostCancellationFee: false,
      SendEmail: false,
      Notes: input.reason?.trim() || `Canceled by iRatePilot (${input.externalReference})`,
    };
  }

  cancelReservationResponse(payload: unknown, input: MewsCancelReservationRequest): MewsCancellation {
    const source = payload === undefined ? {} : record(payload, "cancellation");
    const ids = Array.isArray(source.ReservationIds) ? source.ReservationIds : [];
    return {
      propertyCode: input.propertyCode,
      reservationId: text(ids[0]) ?? input.reservationId,
      status: "Canceled",
      raw: payload,
    };
  }
}
