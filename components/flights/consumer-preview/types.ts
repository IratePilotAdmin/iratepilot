import type { FlightConsumerPreviewServiceRequestDto } from "@/lib/flights/consumer-preview/service-request-contract";

export type ConsumerFlightSegmentDto = {
  id: string;
  sequence: number;
  origin: string;
  destination: string;
  marketingCarrier: string;
  flightNumber: string;
  departsAt: string;
  arrivesAt: string;
  durationMinutes: number;
};

export type ConsumerFlightFareTermsDto = {
  refundable: boolean;
  changeable: boolean;
  checkedBagPieces: number;
  carryOnPieces: number;
};

export type ConsumerFlightOfferDto = {
  id: string;
  currency: string;
  totalCents: number;
  validatingCarrier: string;
  expiresAt: string;
  segments: readonly ConsumerFlightSegmentDto[];
  fareTerms: ConsumerFlightFareTermsDto | null;
};

export type ConsumerFlightSearchDto = {
  id: string;
  status: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  cabin: string;
  travelerCount: number;
  expiresAt: string;
  offers: readonly ConsumerFlightOfferDto[];
};

export type ConsumerFlightPaymentDto = {
  status: string;
  authorizedCents: number;
  capturedCents: number;
  refundedCents: number;
};

export type ConsumerFlightTicketDto = {
  id: string;
  status: string;
  documentType: string;
  issuingCarrier: string;
  issuedAt: string | null;
};

export type ConsumerFlightOrderDto = {
  id: string;
  confirmationCode: string;
  status: string;
  currency: string;
  totalCents: number;
  providerCode: string;
  providerCreatedAt: string | null;
  ticketingDeadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  search: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    cabin: string;
    travelerCount: number;
  };
  segments: readonly ConsumerFlightSegmentDto[];
  payment: ConsumerFlightPaymentDto | null;
  tickets: readonly ConsumerFlightTicketDto[];
  serviceRequests: readonly FlightConsumerPreviewServiceRequestDto[];
  serviceRequestsAvailable: boolean;
};

export type ConsumerFlightOrderSummaryDto = {
  id: string;
  confirmationCode: string;
  status: string;
  currency: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  search: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    cabin: string;
  };
  paymentStatus: string | null;
  ticketCount: number;
  serviceRequestCount: number;
  latestServiceRequestStatus: string | null;
  serviceRequestsAvailable: boolean;
};

export function formatConsumerFlightMoney(totalCents: number, currency: string) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || !/^[A-Z]{3}$/.test(currency)) return "Unavailable";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(totalCents / 100);
}

export function formatConsumerFlightDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function formatConsumerFlightDateTime(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Not recorded";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

export function formatConsumerFlightDuration(minutes: number) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) return "Duration unavailable";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${remainder}m`;
}

export function formatConsumerFlightStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
