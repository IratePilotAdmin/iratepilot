import type {
  StandardPmsAvailabilityRequest,
  StandardPmsCancellation,
  StandardPmsCancelReservationRequest,
  StandardPmsCreateReservationRequest,
  StandardPmsMapper,
  StandardPmsOffer,
  StandardPmsReservation,
  StandardPmsTransport,
} from "./contracts";
import type { StandardPmsProviderId } from "./providers";

export class StandardPmsAdapter {
  constructor(
    readonly providerId: StandardPmsProviderId,
    private readonly transport: StandardPmsTransport,
    private readonly mapper: StandardPmsMapper,
  ) {}

  async availability(input: StandardPmsAvailabilityRequest): Promise<StandardPmsOffer[]> {
    const payload = await this.transport.execute({
      providerId: this.providerId,
      propertyCode: input.propertyCode,
      operation: "availability",
      requestId: crypto.randomUUID(),
      payload: this.mapper.availabilityPayload(input),
    });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(
    input: StandardPmsCreateReservationRequest,
  ): Promise<StandardPmsReservation> {
    const payload = await this.transport.execute({
      providerId: this.providerId,
      propertyCode: input.propertyCode,
      operation: "create_reservation",
      requestId: input.externalReference,
      payload: this.mapper.createReservationPayload(input),
    });
    return this.mapper.createReservationResponse(payload, input);
  }

  async cancelReservation(
    input: StandardPmsCancelReservationRequest,
  ): Promise<StandardPmsCancellation> {
    const payload = await this.transport.execute({
      providerId: this.providerId,
      propertyCode: input.propertyCode,
      operation: "cancel_reservation",
      requestId: `cancel:${input.externalReference}`,
      payload: this.mapper.cancelReservationPayload(input),
    });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}

