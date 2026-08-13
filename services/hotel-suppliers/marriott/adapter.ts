import type {
  MarriottAvailabilityRequest, MarriottCancellation, MarriottCancelReservationRequest,
  MarriottCreateReservationRequest, MarriottOffer, MarriottPmsMapper, MarriottPmsProvider,
  MarriottGetReservationRequest, MarriottModifyReservationRequest, MarriottPmsTransport, MarriottReservation,
} from "./contracts";

export class MarriottPmsAdapter {
  constructor(
    private readonly provider: MarriottPmsProvider,
    private readonly transport: MarriottPmsTransport,
    private readonly mapper: MarriottPmsMapper,
  ) {}

  async availability(input: MarriottAvailabilityRequest): Promise<MarriottOffer[]> {
    const payload = await this.transport.execute({
      provider: this.provider, propertyCode: input.propertyCode, operation: "availability",
      requestId: crypto.randomUUID(), payload: this.mapper.availabilityPayload(input),
    });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: MarriottCreateReservationRequest): Promise<MarriottReservation> {
    const payload = await this.transport.execute({
      provider: this.provider, propertyCode: input.propertyCode, operation: "create_reservation",
      requestId: input.externalReference, payload: this.mapper.createReservationPayload(input),
    });
    return this.mapper.createReservationResponse(payload, input);
  }

  async getReservation(input: MarriottGetReservationRequest): Promise<MarriottReservation> {
    if (!this.mapper.getReservationPayload || !this.mapper.getReservationResponse) {
      throw new Error(`${this.provider} reservation retrieval is not configured`);
    }
    const payload = await this.transport.execute({
      provider: this.provider, propertyCode: input.propertyCode, operation: "get_reservation",
      requestId: input.externalReference ?? `get:${input.reservationId}`,
      payload: this.mapper.getReservationPayload(input),
    });
    return this.mapper.getReservationResponse(payload, input);
  }

  async modifyReservation(input: MarriottModifyReservationRequest): Promise<MarriottReservation> {
    if (!this.mapper.modifyReservationPayload || !this.mapper.modifyReservationResponse) {
      throw new Error(`${this.provider} reservation modification is not configured`);
    }
    const payload = await this.transport.execute({
      provider: this.provider, propertyCode: input.propertyCode, operation: "modify_reservation",
      requestId: `modify:${input.externalReference}`, payload: this.mapper.modifyReservationPayload(input),
    });
    return this.mapper.modifyReservationResponse(payload, input);
  }

  async cancelReservation(input: MarriottCancelReservationRequest): Promise<MarriottCancellation> {
    const payload = await this.transport.execute({
      provider: this.provider, propertyCode: input.propertyCode, operation: "cancel_reservation",
      requestId: `cancel:${input.externalReference}`, payload: this.mapper.cancelReservationPayload(input),
    });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}
