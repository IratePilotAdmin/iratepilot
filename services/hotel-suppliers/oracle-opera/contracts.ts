export type OperaStay = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  rooms?: number;
};

export type OperaAvailabilityRequest = OperaStay & {
  hotelId: string;
  currency?: string;
  ratePlanCodes?: string[];
  roomTypeCodes?: string[];
};

export type OperaOffer = {
  offerId: string;
  hotelId: string;
  roomTypeCode: string;
  ratePlanCode: string;
  currency: string;
  totalAmount: number;
  available: boolean;
  cancellationPolicy?: string;
  raw: unknown;
};

export type OperaGuest = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
};

export type OperaCreateReservationRequest = OperaStay & {
  hotelId: string;
  externalReference: string;
  offerId: string;
  guest: OperaGuest;
  comments?: string[];
};

export type OperaReservation = {
  hotelId: string;
  reservationId: string;
  confirmationNumber?: string;
  externalReference: string;
  status: string;
  raw: unknown;
};

export type OperaCancelReservationRequest = {
  hotelId: string;
  reservationId: string;
  externalReference: string;
  reason?: string;
};

export type OperaCancellation = {
  hotelId: string;
  reservationId: string;
  status: string;
  cancellationNumber?: string;
  raw: unknown;
};

export interface OracleOperaContractMapper {
  availabilityPath(input: OperaAvailabilityRequest): string;
  availabilityPayload(input: OperaAvailabilityRequest): unknown;
  availabilityResponse(payload: unknown, input: OperaAvailabilityRequest): OperaOffer[];
  createReservationPath(input: OperaCreateReservationRequest): string;
  createReservationPayload(input: OperaCreateReservationRequest): unknown;
  createReservationResponse(payload: unknown, input: OperaCreateReservationRequest): OperaReservation;
  cancelReservationPath(input: OperaCancelReservationRequest): string;
  cancelReservationPayload(input: OperaCancelReservationRequest): unknown;
  cancelReservationResponse(payload: unknown, input: OperaCancelReservationRequest): OperaCancellation;
}
