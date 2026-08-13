export type HotelKeyOperation =
  | "availability"
  | "create_reservation"
  | "get_reservation"
  | "modify_reservation"
  | "cancel_reservation";

export type HotelKeyStay = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  rooms?: number;
};

export type HotelKeyAvailabilityRequest = HotelKeyStay & {
  propertyCode: string;
  currency?: string;
};

export type HotelKeyOffer = {
  offerId: string;
  propertyCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  currency: string;
  totalAmount: number;
  available: boolean;
  raw: unknown;
};

export type HotelKeyCreateReservationRequest = HotelKeyStay & {
  propertyCode: string;
  externalReference: string;
  offerId: string;
  guest: { firstName: string; lastName: string; email?: string; phone?: string };
};

export type HotelKeyGetReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference?: string;
};

export type HotelKeyModifyReservationRequest = HotelKeyCreateReservationRequest & {
  reservationId: string;
};

export type HotelKeyReservation = {
  propertyCode: string;
  reservationId: string;
  confirmationNumber?: string;
  externalReference: string;
  status: string;
  raw: unknown;
};

export type HotelKeyCancelReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference: string;
  reason?: string;
};

export type HotelKeyCancellation = {
  propertyCode: string;
  reservationId: string;
  cancellationNumber?: string;
  status: string;
  raw: unknown;
};

export type HotelKeyTransportRequest = {
  propertyCode: string;
  operation: HotelKeyOperation;
  requestId: string;
  payload: unknown;
};

export interface HotelKeyTransport {
  execute(request: HotelKeyTransportRequest): Promise<unknown>;
}

export interface HotelKeyMapper {
  availabilityPayload(input: HotelKeyAvailabilityRequest): unknown;
  availabilityResponse(payload: unknown, input: HotelKeyAvailabilityRequest): HotelKeyOffer[];
  createReservationPayload(input: HotelKeyCreateReservationRequest): unknown;
  createReservationResponse(payload: unknown, input: HotelKeyCreateReservationRequest): HotelKeyReservation;
  getReservationPayload(input: HotelKeyGetReservationRequest): unknown;
  getReservationResponse(payload: unknown, input: HotelKeyGetReservationRequest): HotelKeyReservation;
  modifyReservationPayload(input: HotelKeyModifyReservationRequest): unknown;
  modifyReservationResponse(payload: unknown, input: HotelKeyModifyReservationRequest): HotelKeyReservation;
  cancelReservationPayload(input: HotelKeyCancelReservationRequest): unknown;
  cancelReservationResponse(payload: unknown, input: HotelKeyCancelReservationRequest): HotelKeyCancellation;
}
