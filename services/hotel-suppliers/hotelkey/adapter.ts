import type {
  HotelKeyAvailabilityRequest,
  HotelKeyCancellation,
  HotelKeyCancelReservationRequest,
  HotelKeyCreateReservationRequest,
  HotelKeyGetReservationRequest,
  HotelKeyModifyReservationRequest,
  HotelKeyMapper,
  HotelKeyOffer,
  HotelKeyReservation,
  HotelKeyTransport,
} from "./contracts";

export class HotelKeyAdapter {
  constructor(
    private readonly transport: HotelKeyTransport,
    private readonly mapper: HotelKeyMapper,
  ) {}

  async availability(input: HotelKeyAvailabilityRequest): Promise<HotelKeyOffer[]> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "availability",
      requestId: crypto.randomUUID(),
      payload: this.mapper.availabilityPayload(input),
    });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: HotelKeyCreateReservationRequest): Promise<HotelKeyReservation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "create_reservation",
      requestId: input.externalReference,
      payload: this.mapper.createReservationPayload(input),
    });
    return this.mapper.createReservationResponse(payload, input);
  }

  async getReservation(input: HotelKeyGetReservationRequest): Promise<HotelKeyReservation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "get_reservation",
      requestId: `get:${input.externalReference ?? input.reservationId}`,
      payload: this.mapper.getReservationPayload(input),
    });
    return this.mapper.getReservationResponse(payload, input);
  }

  async modifyReservation(input: HotelKeyModifyReservationRequest): Promise<HotelKeyReservation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "modify_reservation",
      requestId: `modify:${input.externalReference}`,
      payload: this.mapper.modifyReservationPayload(input),
    });
    return this.mapper.modifyReservationResponse(payload, input);
  }

  async cancelReservation(input: HotelKeyCancelReservationRequest): Promise<HotelKeyCancellation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "cancel_reservation",
      requestId: `cancel:${input.externalReference}`,
      payload: this.mapper.cancelReservationPayload(input),
    });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}
