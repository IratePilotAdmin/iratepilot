import { GuestlineBookingMapper } from "../guestline/mapper";

export type HotelogixBookingMapperConfig = { currency: string; bookingSourceCode?: string };

/** Maps Hotelogix partner responses into iRatePilot's standard PMS contract. */
export class HotelogixBookingMapper extends GuestlineBookingMapper {
  constructor(config: HotelogixBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Hotelogix currency is required");
    super(config);
  }
}
