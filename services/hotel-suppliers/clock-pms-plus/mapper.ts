import { GuestlineBookingMapper } from "../guestline/mapper";
import type { StandardPmsCreateReservationRequest } from "../standard";
export type ClockPmsBookingMapperConfig = { currency: string; bookingSourceCode?: string };
/** Maps Clock PMS+ partner booking responses into the standard PMS contract. */
export class ClockPmsBookingMapper extends GuestlineBookingMapper {
  constructor(config: ClockPmsBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Clock PMS+ currency is required");
    super(config);
  }

  override createReservationResponse(payload: unknown, input: StandardPmsCreateReservationRequest) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const source = payload as Record<string, unknown>;
      if (source.bookingId !== undefined && source.id === undefined && source.reservationId === undefined) {
        return super.createReservationResponse({ ...source, id: source.bookingId }, input);
      }
    }
    return super.createReservationResponse(payload, input);
  }
}
