export { HotelKeyAdapter } from "./adapter";
export { HotelKeyHttpTransport, HotelKeyTransportError } from "./transport";
export type { HotelKeyConfig, HotelKeyEndpoint, HotelKeyFetch } from "./transport";
export { HotelKeyConnectionTestError, testHotelKeySandboxConnection } from "./connection-test";
export type { HotelKeyConnectionTestConfig, HotelKeyConnectionTestResult } from "./connection-test";
export type {
  HotelKeyAvailabilityRequest,
  HotelKeyCancellation,
  HotelKeyCancelReservationRequest,
  HotelKeyCreateReservationRequest,
  HotelKeyMapper,
  HotelKeyOffer,
  HotelKeyOperation,
  HotelKeyReservation,
  HotelKeyStay,
  HotelKeyTransport,
  HotelKeyTransportRequest,
} from "./contracts";
