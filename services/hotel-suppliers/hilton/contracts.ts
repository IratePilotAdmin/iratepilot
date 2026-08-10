export type HiltonPmsProvider = "hilton-pep" | "hilton-onq";

export type HiltonStay = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  rooms?: number;
};

export type HiltonAvailabilityRequest = HiltonStay & {
  propertyCode: string;
  currency?: string;
};

export type HiltonOffer = {
  offerId: string;
  propertyCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  currency: string;
  totalAmount: number;
  available: boolean;
  raw: unknown;
};

export type HiltonCreateReservationRequest = HiltonStay & {
  propertyCode: string;
  externalReference: string;
  offerId: string;
  guest: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
};

export type HiltonReservation = {
  propertyCode: string;
  reservationId: string;
  confirmationNumber?: string;
  externalReference: string;
  status: string;
  raw: unknown;
};

export type HiltonGetReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference?: string;
};

export type HiltonModifyReservationRequest = HiltonCreateReservationRequest & {
  reservationId: string;
};

export type HiltonCancelReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference: string;
  reason?: string;
};

export type HiltonCancellation = {
  propertyCode: string;
  reservationId: string;
  cancellationNumber?: string;
  status: string;
  raw: unknown;
};

export type HiltonOperation =
  | "availability"
  | "create_reservation"
  | "get_reservation"
  | "modify_reservation"
  | "cancel_reservation";

export type HiltonTransportRequest = {
  provider: HiltonPmsProvider;
  propertyCode: string;
  operation: HiltonOperation;
  requestId: string;
  payload: unknown;
};

export interface HiltonPmsTransport {
  execute(request: HiltonTransportRequest): Promise<unknown>;
}

export interface HiltonPmsMapper {
  availabilityPayload(input: HiltonAvailabilityRequest): unknown;
  availabilityResponse(payload: unknown, input: HiltonAvailabilityRequest): HiltonOffer[];
  createReservationPayload(input: HiltonCreateReservationRequest): unknown;
  createReservationResponse(payload: unknown, input: HiltonCreateReservationRequest): HiltonReservation;
  getReservationPayload?(input: HiltonGetReservationRequest): unknown;
  getReservationResponse?(payload: unknown, input: HiltonGetReservationRequest): HiltonReservation;
  modifyReservationPayload?(input: HiltonModifyReservationRequest): unknown;
  modifyReservationResponse?(payload: unknown, input: HiltonModifyReservationRequest): HiltonReservation;
  cancelReservationPayload(input: HiltonCancelReservationRequest): unknown;
  cancelReservationResponse(payload: unknown, input: HiltonCancelReservationRequest): HiltonCancellation;
}
