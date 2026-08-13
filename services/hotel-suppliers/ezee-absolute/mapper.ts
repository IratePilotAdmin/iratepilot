import { GuestlineBookingMapper } from "../guestline/mapper";

export type EzeeAbsoluteBookingMapperConfig = { currency: string; bookingSourceCode?: string };

/** Maps the configurable eZee partner reservation schema into the standard PMS contract. */
export class EzeeAbsoluteBookingMapper extends GuestlineBookingMapper {
  constructor(config: EzeeAbsoluteBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("eZee Absolute currency is required");
    super(config);
  }
}
