export class FlightConsumerPreviewCompletionProcessingError extends Error {
  constructor() {
    super("The test booking completion is already processing.");
    this.name = "FlightConsumerPreviewCompletionProcessingError";
  }
}
