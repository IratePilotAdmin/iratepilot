import { z } from "zod";

export const flightConsumerPreviewServiceRequestTypes = [
  "cancel",
  "change",
  "refund",
  "schedule_change",
  "name_correction",
  "document_reissue",
] as const;

export const flightConsumerPreviewServiceRequestTypeSchema = z.enum(
  flightConsumerPreviewServiceRequestTypes,
);

export type FlightConsumerPreviewServiceRequestType =
  z.infer<typeof flightConsumerPreviewServiceRequestTypeSchema>;

export const flightConsumerPreviewServiceRequestReasons = Object.freeze({
  cancel: Object.freeze([
    { code: "plans_changed", label: "Plans changed" },
    { code: "duplicate_test_booking", label: "Duplicate test booking" },
  ]),
  change: Object.freeze([
    { code: "travel_date_change", label: "Travel date change" },
    { code: "route_change", label: "Route change" },
  ]),
  refund: Object.freeze([
    { code: "test_refund_review", label: "Test refund review" },
    { code: "duplicate_test_booking", label: "Duplicate test booking" },
  ]),
  schedule_change: Object.freeze([
    { code: "schedule_change_review", label: "Schedule change review" },
    { code: "connection_risk", label: "Connection risk review" },
  ]),
  name_correction: Object.freeze([
    { code: "fictional_name_correction", label: "Fictional traveler name correction" },
  ]),
  document_reissue: Object.freeze([
    { code: "test_document_review", label: "Test document review" },
  ]),
} satisfies Readonly<Record<FlightConsumerPreviewServiceRequestType, readonly Readonly<{
  code: string;
  label: string;
}>[]>>);

const allowedReasons = new Map<FlightConsumerPreviewServiceRequestType, ReadonlySet<string>>(
  flightConsumerPreviewServiceRequestTypes.map((requestType) => [
    requestType,
    new Set(flightConsumerPreviewServiceRequestReasons[requestType].map(({ code }) => code)),
  ]),
);

export const flightConsumerPreviewServiceRequestInputSchema = z.object({
  requestType: flightConsumerPreviewServiceRequestTypeSchema,
  reasonCode: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
}).strict().superRefine((value, context) => {
  if (!allowedReasons.get(value.requestType)?.has(value.reasonCode)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reasonCode"],
      message: "The selected reason is not allowed for this request type.",
    });
  }
});

export const flightConsumerPreviewServiceRequestStatusSchema = z.enum([
  "requested",
  "quoted",
  "accepted",
  "processing",
  "completed",
  "declined",
  "failed",
  "requires_review",
]);

export type FlightConsumerPreviewServiceRequestDto = Readonly<{
  id: string;
  orderId: string;
  requestType: FlightConsumerPreviewServiceRequestType;
  reasonCode: string;
  status: z.infer<typeof flightConsumerPreviewServiceRequestStatusSchema>;
  createdAt: string;
  updatedAt: string;
}>;

export function flightConsumerPreviewServiceRequestTypeLabel(
  requestType: FlightConsumerPreviewServiceRequestType,
) {
  return requestType.replaceAll("_", " ");
}

export function flightConsumerPreviewServiceRequestReasonLabel(
  requestType: FlightConsumerPreviewServiceRequestType,
  reasonCode: string,
) {
  return flightConsumerPreviewServiceRequestReasons[requestType]
    .find(({ code }) => code === reasonCode)?.label ?? "Recorded support reason";
}
