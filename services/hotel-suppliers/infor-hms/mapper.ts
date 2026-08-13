import { GuestlineBookingMapper } from "../guestline/mapper";

export type InforHmsBookingMapperConfig = { currency: string; bookingSourceCode?: string };

/** Maps Infor HMS partner responses into iRatePilot's standard PMS contract. */
export class InforHmsBookingMapper extends GuestlineBookingMapper {
  constructor(config: InforHmsBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Infor HMS currency is required");
    super(config);
  }
}
