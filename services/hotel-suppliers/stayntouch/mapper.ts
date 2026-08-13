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
    throw new Error(`Stayntouch ${label} response is malformed`);
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
    throw new Error("Stayntouch offer identifier is invalid");
  }
}

function stayDates(arrivalDate: string, departureDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${arrivalDate}T00:00:00Z`);
  const departure = new Date(`${departureDate}T00:00:00Z`);
  if (!Number.isFinite(cursor.valueOf()) || !Number.isFinite(departure.valueOf()) || cursor >= departure) {
    throw new Error("Stayntouch stay dates are invalid");
  }
  while (cursor < departure) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export type StayntouchBookingMapperConfig = {
  currency: string;
  bookingOriginCode?: string;
  reservationTypeCode?: string;
  sourceCode?: string;
  marketSegmentCode?: string;
};

export class StayntouchBookingMapper implements StandardPmsMapper {
  constructor(private readonly config: StayntouchBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Stayntouch currency is required");
  }

  availabilityPayload(input: StandardPmsAvailabilityRequest) {
    if ((input.rooms ?? 1) !== 1) throw new Error("Stayntouch availability must be requested one room at a time");
    return {
      from_date: input.arrivalDate,
      to_date: input.departureDate,
      adults: input.adults,
      children: input.children ?? 0,
      rate_classification: "PUBLIC",
      per_page: 50,
    };
  }

  availabilityResponse(payload: unknown, input: StandardPmsAvailabilityRequest): StandardPmsOffer[] {
    const source = record(payload, "availability");
    if (!Array.isArray(source.results)) throw new Error("Stayntouch availability response is missing results");
    const nights = stayDates(input.arrivalDate, input.departureDate).length;
    return source.results.flatMap((value) => {
      const rate = record(value, "rate availability");
      const rateId = text(rate.rate_id);
      if (!rateId || !Array.isArray(rate.room_types)) throw new Error("Stayntouch availability rate is malformed");
      return rate.room_types.map((roomValue) => {
        const room = record(roomValue, "room availability");
        const roomTypeId = text(room.id);
        const adr = Number(room.adr);
        const availability = Number(room.availability);
        if (!roomTypeId || !Number.isFinite(adr) || adr < 0 || !Number.isFinite(availability)) {
          throw new Error("Stayntouch room availability is malformed");
        }
        return {
          offerId: encode({ rateId, roomTypeId }),
          propertyCode: input.propertyCode,
          roomTypeCode: roomTypeId,
          ratePlanCode: text(rate.rate_code) ?? rateId,
          currency: input.currency ?? this.config.currency,
          totalAmount: adr * nights,
          available: availability > 0,
          raw: { rate: value, room: roomValue },
        };
      });
    });
  }

  createReservationPayload(input: StandardPmsCreateReservationRequest) {
    if ((input.rooms ?? 1) !== 1) throw new Error("Stayntouch reservations must be created one room at a time");
    const offer = decode(input.offerId);
    const rateId = Number(offer.rateId);
    const roomTypeId = Number(offer.roomTypeId);
    if (!Number.isInteger(rateId) || !Number.isInteger(roomTypeId)) {
      throw new Error("Stayntouch offer identifier is invalid");
    }
    return {
      arrival_date: input.arrivalDate,
      departure_date: input.departureDate,
      stay_dates: stayDates(input.arrivalDate, input.departureDate).map((date) => ({
        date,
        rate_id: rateId,
        room_type_id: roomTypeId,
        adults: input.adults,
        children: input.children ?? 0,
      })),
      guests: [{
        is_primary: true,
        first_name: input.guest.firstName,
        last_name: input.guest.lastName,
        email: input.guest.email,
      }],
      booker_email: input.guest.email,
      booking_origin_code: this.config.bookingOriginCode,
      reservation_type_code: this.config.reservationTypeCode,
      source_code: this.config.sourceCode,
      market_segment_code: this.config.marketSegmentCode,
      notes: [{ description: `iRatePilot booking ${input.externalReference}` }],
      references: [{
        value: input.externalReference,
        type: "confirmation_number",
        interface: "direct",
        primary: true,
        description: "iRatePilot booking reference",
      }],
    };
  }

  createReservationResponse(payload: unknown, input: StandardPmsCreateReservationRequest): StandardPmsReservation {
    const source = record(payload, "reservation");
    const reservationId = text(source.id);
    if (!reservationId) throw new Error("Stayntouch reservation response is missing an ID");
    return {
      propertyCode: input.propertyCode,
      reservationId,
      confirmationNumber: text(source.confirmation_number),
      externalReference: input.externalReference,
      status: text(source.status) ?? "RESERVED",
      raw: payload,
    };
  }

  cancelReservationPayload(input: StandardPmsCancelReservationRequest) {
    return {
      reservationId: input.reservationId,
      reason: input.reason?.trim() || `Canceled by iRatePilot (${input.externalReference})`,
      send_cancellation_email: false,
      refund_deposit: false,
      charge_penalty: false,
    };
  }

  cancelReservationResponse(payload: unknown, input: StandardPmsCancelReservationRequest): StandardPmsCancellation {
    const source = record(payload, "cancellation");
    if (source.status !== true) throw new Error("Stayntouch did not confirm the cancellation");
    return {
      propertyCode: input.propertyCode,
      reservationId: input.reservationId,
      status: "CANCELED",
      raw: payload,
    };
  }
}
