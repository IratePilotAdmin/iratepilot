import type {
  HiltonAvailabilityRequest,
  HiltonCancellation,
  HiltonCancelReservationRequest,
  HiltonCreateReservationRequest,
  HiltonGetReservationRequest,
  HiltonModifyReservationRequest,
  HiltonOffer,
  HiltonPmsMapper,
  HiltonPmsProvider,
  HiltonPmsTransport,
  HiltonReservation,
} from "./contracts";

export class HiltonPmsAdapter {
  constructor(
    private readonly provider: HiltonPmsProvider,
    private readonly transport: HiltonPmsTransport,
    private readonly mapper: HiltonPmsMapper,
  ) {}

  async availability(input: HiltonAvailabilityRequest): Promise<HiltonOffer[]> {
    const payload = await this.transport.execute({
      provider: this.provider,
      propertyCode: input.propertyCode,
      operation: "availability",
      requestId: crypto.randomUUID(),
      payload: this.mapper.availabilityPayload(input),
    });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: HiltonCreateReservationRequest): Promise<HiltonReservation> {
    const payload = await this.transport.execute({
      provider: this.provider,
      propertyCode: input.propertyCode,
      operation: "create_reservation",
      requestId: input.externalReference,
      payload: this.mapper.createReservationPayload(input),
    });
    return this.mapper.createReservationResponse(payload, input);
  }

  async getReservation(input: HiltonGetReservationRequest): Promise<HiltonReservation> {
    if (!this.mapper.getReservationPayload || !this.mapper.getReservationResponse) {
      throw new Error(`${this.provider} reservation retrieval is not configured`);
    }
    const payload = await this.transport.execute({
      provider: this.provider,
      propertyCode: input.propertyCode,
      operation: "get_reservation",
      requestId: input.externalReference ?? `get:${input.reservationId}`,
      payload: this.mapper.getReservationPayload(input),
    });
    return this.mapper.getReservationResponse(payload, input);
  }

  async modifyReservation(input: HiltonModifyReservationRequest): Promise<HiltonReservation> {
    if (!this.mapper.modifyReservationPayload || !this.mapper.modifyReservationResponse) {
      throw new Error(`${this.provider} reservation modification is not configured`);
    }
    const payload = await this.transport.execute({
      provider: this.provider,
      propertyCode: input.propertyCode,
      operation: "modify_reservation",
      requestId: `modify:${input.externalReference}`,
      payload: this.mapper.modifyReservationPayload(input),
    });
    return this.mapper.modifyReservationResponse(payload, input);
  }

  async cancelReservation(input: HiltonCancelReservationRequest): Promise<HiltonCancellation> {
    const payload = await this.transport.execute({
      provider: this.provider,
      propertyCode: input.propertyCode,
      operation: "cancel_reservation",
      requestId: `cancel:${input.externalReference}`,
      payload: this.mapper.cancelReservationPayload(input),
    });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}
