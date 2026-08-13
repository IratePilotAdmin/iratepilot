import { GuestlineBookingMapper } from "../guestline/mapper";

export type AgilysysPmsBookingMapperConfig = { currency: string; bookingSourceCode?: string };

/** Maps Agilysys PMS partner responses into iRatePilot's standard PMS contract. */
export class AgilysysPmsBookingMapper extends GuestlineBookingMapper {
  constructor(config: AgilysysPmsBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Agilysys PMS currency is required");
    super(config);
  }
}
