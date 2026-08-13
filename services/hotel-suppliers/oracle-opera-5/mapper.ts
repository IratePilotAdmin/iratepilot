import { GuestlineBookingMapper } from "../guestline/mapper";

export type OracleOpera5BookingMapperConfig = { currency: string; bookingSourceCode?: string };

/** Maps approved OPERA 5 SOAP response projections into the standard PMS contract. */
export class OracleOpera5BookingMapper extends GuestlineBookingMapper {
  constructor(config: OracleOpera5BookingMapperConfig) {
    if (!config.currency.trim()) throw new Error("Oracle OPERA 5 currency is required");
    super(config);
  }
}
