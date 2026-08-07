import type {
  HiltonAvailabilityRequest,
  HiltonCancellation,
  HiltonCancelReservationRequest,
  HiltonCreateReservationRequest,
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
