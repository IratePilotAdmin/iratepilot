import { GuestlineBookingMapper } from "../guestline/mapper";

export type PlanetProtelBookingMapperConfig = { currency: string; bookingSourceCode?: string };

/** Maps Planet Protel partner responses into iRatePilot's standard PMS contract. */
export class PlanetProtelBookingMapper extends GuestlineBookingMapper {
  constructor(config: PlanetProtelBookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Planet Protel currency is required");
    super(config);
  }
}
