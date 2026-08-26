import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FlightConsumerPreviewServiceRequestDto } from "./service-request-contract";
import { listFlightConsumerPreviewServiceRequests } from "./service-requests.server";
import { requireFlightConsumerPreviewRequestRuntime } from "./runtime-authority.server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DatabaseRecord = Record<string, unknown>;

export type ConsumerFlightSegmentDto = Readonly<{
  id: string;
  sequence: number;
  origin: string;
  destination: string;
  marketingCarrier: string;
  flightNumber: string;
  departsAt: string;
  arrivesAt: string;
  durationMinutes: number;
}>;

export type ConsumerFlightSearchDto = Readonly<{
  id: string;
  status: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  cabin: string;
  travelerCount: number;
  expiresAt: string;
  offers: readonly Readonly<{
    id: string;
    currency: string;
    totalCents: number;
    validatingCarrier: string;
    expiresAt: string;
    segments: readonly ConsumerFlightSegmentDto[];
    fareTerms: Readonly<{
      refundable: boolean;
      changeable: boolean;
      checkedBagPieces: number;
      carryOnPieces: number;
    }> | null;
  }>[];
}>;

export type ConsumerFlightOrderDto = Readonly<{
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
  search: Readonly<{
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    cabin: string;
    travelerCount: number;
  }>;
  segments: readonly ConsumerFlightSegmentDto[];
  payment: Readonly<{
    status: string;
    authorizedCents: number;
    capturedCents: number;
    refundedCents: number;
  }> | null;
  tickets: readonly Readonly<{
    id: string;
    status: string;
    documentType: string;
    issuingCarrier: string;
    issuedAt: string | null;
  }>[];
  serviceRequests: readonly FlightConsumerPreviewServiceRequestDto[];
  serviceRequestsAvailable: boolean;
}>;

export type ConsumerFlightOrderSummaryDto = Readonly<{
  id: string;
  confirmationCode: string;
  status: string;
  currency: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  search: ConsumerFlightOrderDto["search"];
  paymentStatus: string | null;
  ticketCount: number;
  serviceRequestCount: number;
  latestServiceRequestStatus: string | null;
  serviceRequestsAvailable: boolean;
}>;

export class ConsumerFlightRepositoryUnavailableError extends Error {
  constructor() {
    super("Consumer flight records are temporarily unavailable.");
    this.name = "ConsumerFlightRepositoryUnavailableError";
  }
}

function integer(value: unknown, label: string) {
  void label;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new ConsumerFlightRepositoryUnavailableError();
  return parsed;
}

function text(value: unknown) {
  if (typeof value !== "string" || value.length === 0) throw new ConsumerFlightRepositoryUnavailableError();
  return value;
}

function nullableText(value: unknown) {
  if (value === null) return null;
  return text(value);
}

function travelerCount(search: DatabaseRecord) {
  return integer(search.adult_count, "adult_count")
    + integer(search.child_count, "child_count")
    + integer(search.infant_in_seat_count, "infant_in_seat_count")
    + integer(search.infant_on_lap_count, "infant_on_lap_count");
}

function mapSegment(row: DatabaseRecord): ConsumerFlightSegmentDto {
  return Object.freeze({
    id: text(row.id),
    sequence: integer(row.segment_sequence, "segment_sequence"),
    origin: text(row.origin_iata),
    destination: text(row.destination_iata),
    marketingCarrier: text(row.marketing_carrier),
    flightNumber: text(row.marketing_flight_number),
    departsAt: text(row.departure_at),
    arrivesAt: text(row.arrival_at),
    durationMinutes: integer(row.duration_minutes, "duration_minutes"),
  });
}

function mapSearchIdentity(search: DatabaseRecord): ConsumerFlightOrderDto["search"] {
  return Object.freeze({
    origin: text(search.origin_iata),
    destination: text(search.destination_iata),
    departureDate: text(search.departure_date),
    returnDate: nullableText(search.return_date),
    cabin: text(search.cabin),
    travelerCount: travelerCount(search),
  });
}

async function readServiceRequestsWithoutBlockingBooking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId?: string,
) {
  try {
    return Object.freeze({
      available: true as const,
      requests: await listFlightConsumerPreviewServiceRequests(
        supabase,
        orderId ? { orderId } : {},
      ),
    });
  } catch {
    return Object.freeze({
      available: false as const,
      requests: Object.freeze([]) as readonly FlightConsumerPreviewServiceRequestDto[],
    });
  }
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new ConsumerFlightRepositoryUnavailableError();
  return user ? { supabase, user } : null;
}

async function readSegments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  offerIds: readonly string[],
  executionScopeSha256: string,
) {
  if (offerIds.length === 0) return new Map<string, ConsumerFlightSegmentDto[]>();
  const { data, error } = await supabase
    .from("flight_offer_segments")
    .select("id,offer_id,segment_sequence,origin_iata,destination_iata,marketing_carrier,marketing_flight_number,departure_at,arrival_at,duration_minutes")
    .in("offer_id", [...offerIds])
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .order("segment_sequence", { ascending: true });
  if (error || !Array.isArray(data)) throw new ConsumerFlightRepositoryUnavailableError();
  const grouped = new Map<string, ConsumerFlightSegmentDto[]>();
  for (const raw of data) {
    const row = raw as DatabaseRecord;
    const offerId = text(row.offer_id);
    const current = grouped.get(offerId) ?? [];
    current.push(mapSegment(row));
    grouped.set(offerId, current);
  }
  return grouped;
}

export async function getConsumerFlightSearch(searchId: string): Promise<ConsumerFlightSearchDto | null> {
  if (!uuidPattern.test(searchId)) return null;
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const executionScopeSha256 = runtime.binding.executionScopeSha256;
  const authenticated = await authenticatedClient();
  if (!authenticated) return null;
  const { supabase, user } = authenticated;
  const { data: rawSearch, error: searchError } = await supabase
    .from("flight_searches")
    .select("id,status,origin_iata,destination_iata,departure_date,return_date,cabin,adult_count,child_count,infant_in_seat_count,infant_on_lap_count,expires_at")
    .eq("id", searchId)
    .eq("customer_id", user.id)
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .maybeSingle();
  if (searchError) throw new ConsumerFlightRepositoryUnavailableError();
  if (!rawSearch) return null;

  const { data: rawOffers, error: offerError } = await supabase
    .from("flight_offers")
    .select("id,currency,total_cents,validating_carrier,expires_at")
    .eq("search_id", searchId)
    .eq("provider_code", "duffel")
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .eq("status", "offered")
    .order("total_cents", { ascending: true });
  if (offerError || !Array.isArray(rawOffers)) throw new ConsumerFlightRepositoryUnavailableError();
  const offerIds = rawOffers.map((raw) => text((raw as DatabaseRecord).id));
  const [segmentsByOffer, fareTermsResult] = await Promise.all([
    readSegments(supabase, offerIds, executionScopeSha256),
    offerIds.length === 0
      ? Promise.resolve({ data: [] as DatabaseRecord[], error: null })
      : supabase
        .from("flight_offer_fare_terms")
        .select("offer_id,refundable,changeable,checked_bag_pieces,carry_on_pieces")
        .in("offer_id", offerIds)
        .eq("execution_mode", "test")
        .eq("execution_scope_sha256", executionScopeSha256),
  ]);
  if (fareTermsResult.error || !Array.isArray(fareTermsResult.data)) throw new ConsumerFlightRepositoryUnavailableError();
  const fareTermsByOffer = new Map<string, ConsumerFlightSearchDto["offers"][number]["fareTerms"]>();
  for (const raw of fareTermsResult.data) {
    const row = raw as DatabaseRecord;
    fareTermsByOffer.set(text(row.offer_id), Object.freeze({
      refundable: row.refundable === true,
      changeable: row.changeable === true,
      checkedBagPieces: integer(row.checked_bag_pieces, "checked_bag_pieces"),
      carryOnPieces: integer(row.carry_on_pieces, "carry_on_pieces"),
    }));
  }
  const search = rawSearch as DatabaseRecord;
  return Object.freeze({
    id: text(search.id),
    status: text(search.status),
    origin: text(search.origin_iata),
    destination: text(search.destination_iata),
    departureDate: text(search.departure_date),
    returnDate: nullableText(search.return_date),
    cabin: text(search.cabin),
    travelerCount: travelerCount(search),
    expiresAt: text(search.expires_at),
    offers: Object.freeze(rawOffers.map((raw) => {
      const row = raw as DatabaseRecord;
      const id = text(row.id);
      return Object.freeze({
        id,
        currency: text(row.currency),
        totalCents: integer(row.total_cents, "total_cents"),
        validatingCarrier: text(row.validating_carrier),
        expiresAt: text(row.expires_at),
        segments: Object.freeze(segmentsByOffer.get(id) ?? []),
        fareTerms: fareTermsByOffer.get(id) ?? null,
      });
    })),
  });
}

async function loadOrder(
  orderId: string,
  authenticated: NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>,
  executionScopeSha256: string,
): Promise<ConsumerFlightOrderDto | null> {
  const { supabase, user } = authenticated;
  const { data: rawOrder, error: orderError } = await supabase
    .from("flight_orders")
    .select("id,customer_id,search_id,offer_id,confirmation_code,status,currency,total_cents,provider_code,provider_created_at,ticketing_deadline_at,created_at,updated_at")
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .eq("provider_code", "duffel")
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .maybeSingle();
  if (orderError) throw new ConsumerFlightRepositoryUnavailableError();
  if (!rawOrder) return null;
  const order = rawOrder as DatabaseRecord;
  const searchId = text(order.search_id);
  const offerId = text(order.offer_id);
  const [searchResult, segmentsByOffer, paymentResult, ticketResult, serviceRequestResult] = await Promise.all([
    supabase.from("flight_searches")
      .select("origin_iata,destination_iata,departure_date,return_date,cabin,adult_count,child_count,infant_in_seat_count,infant_on_lap_count")
      .eq("id", searchId).eq("customer_id", user.id)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .maybeSingle(),
    readSegments(supabase, [offerId], executionScopeSha256),
    supabase.from("flight_payments")
      .select("status,authorized_cents,captured_cents,refunded_cents,updated_at")
      .eq("order_id", orderId)
      .eq("processor_code", "stripe")
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("flight_ticket_documents")
      .select("id,status,document_type,issuing_carrier,issued_at")
      .eq("order_id", orderId)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .order("created_at", { ascending: true }),
    readServiceRequestsWithoutBlockingBooking(supabase, orderId),
  ]);
  if (searchResult.error || !searchResult.data || paymentResult.error || ticketResult.error || !Array.isArray(ticketResult.data)) {
    throw new ConsumerFlightRepositoryUnavailableError();
  }
  const payment = paymentResult.data as DatabaseRecord | null;
  return Object.freeze({
    id: text(order.id),
    confirmationCode: text(order.confirmation_code),
    status: text(order.status),
    currency: text(order.currency),
    totalCents: integer(order.total_cents, "total_cents"),
    providerCode: text(order.provider_code),
    providerCreatedAt: nullableText(order.provider_created_at),
    ticketingDeadlineAt: nullableText(order.ticketing_deadline_at),
    createdAt: text(order.created_at),
    updatedAt: text(order.updated_at),
    search: mapSearchIdentity(searchResult.data as DatabaseRecord),
    segments: Object.freeze(segmentsByOffer.get(offerId) ?? []),
    payment: payment ? Object.freeze({
      status: text(payment.status),
      authorizedCents: integer(payment.authorized_cents, "authorized_cents"),
      capturedCents: integer(payment.captured_cents, "captured_cents"),
      refundedCents: integer(payment.refunded_cents, "refunded_cents"),
    }) : null,
    tickets: Object.freeze(ticketResult.data.map((raw) => {
      const row = raw as DatabaseRecord;
      return Object.freeze({
        id: text(row.id),
        status: text(row.status),
        documentType: text(row.document_type),
        issuingCarrier: text(row.issuing_carrier),
        issuedAt: nullableText(row.issued_at),
      });
    })),
    serviceRequests: serviceRequestResult.requests,
    serviceRequestsAvailable: serviceRequestResult.available,
  });
}

export async function getConsumerFlightOrder(orderId: string): Promise<ConsumerFlightOrderDto | null> {
  if (!uuidPattern.test(orderId)) return null;
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const authenticated = await authenticatedClient();
  return authenticated ? loadOrder(orderId, authenticated, runtime.binding.executionScopeSha256) : null;
}

export async function listConsumerFlightOrders(): Promise<readonly ConsumerFlightOrderSummaryDto[]> {
  const runtime = await requireFlightConsumerPreviewRequestRuntime();
  const authenticated = await authenticatedClient();
  if (!authenticated) return Object.freeze([]);
  const { supabase, user } = authenticated;
  const executionScopeSha256 = runtime.binding.executionScopeSha256;
  const { data: rawOrders, error: orderError } = await supabase
    .from("flight_orders")
    .select("id,search_id,offer_id,confirmation_code,status,currency,total_cents,created_at,updated_at")
    .eq("customer_id", user.id)
    .eq("provider_code", "duffel")
    .eq("execution_mode", "test")
    .eq("execution_scope_sha256", executionScopeSha256)
    .order("created_at", { ascending: false })
    .limit(100);
  if (orderError || !Array.isArray(rawOrders)) throw new ConsumerFlightRepositoryUnavailableError();
  if (rawOrders.length === 0) return Object.freeze([]);

  const orders = rawOrders.map((raw) => raw as DatabaseRecord);
  const orderIds = orders.map((order) => text(order.id));
  const searchIds = [...new Set(orders.map((order) => text(order.search_id)))];

  const [searchResult, paymentResult, ticketResult, serviceRequestResult] = await Promise.all([
    supabase.from("flight_searches")
      .select("id,origin_iata,destination_iata,departure_date,return_date,cabin,adult_count,child_count,infant_in_seat_count,infant_on_lap_count")
      .in("id", searchIds)
      .eq("customer_id", user.id)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256),
    supabase.from("flight_payments")
      .select("order_id,status,updated_at")
      .in("order_id", orderIds)
      .eq("processor_code", "stripe")
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256)
      .order("updated_at", { ascending: false }),
    supabase.from("flight_ticket_documents")
      .select("order_id,status")
      .in("order_id", orderIds)
      .eq("execution_mode", "test")
      .eq("execution_scope_sha256", executionScopeSha256),
    readServiceRequestsWithoutBlockingBooking(supabase),
  ]);
  if (searchResult.error || paymentResult.error || ticketResult.error
    || !Array.isArray(searchResult.data)
    || !Array.isArray(paymentResult.data)
    || !Array.isArray(ticketResult.data)) {
    throw new ConsumerFlightRepositoryUnavailableError();
  }

  const searchesById = new Map<string, ConsumerFlightOrderDto["search"]>();
  for (const raw of searchResult.data) {
    const search = raw as DatabaseRecord;
    searchesById.set(text(search.id), mapSearchIdentity(search));
  }
  const paymentStatusByOrderId = new Map<string, string>();
  for (const raw of paymentResult.data) {
    const payment = raw as DatabaseRecord;
    const orderId = text(payment.order_id);
    if (!paymentStatusByOrderId.has(orderId)) paymentStatusByOrderId.set(orderId, text(payment.status));
  }
  const issuedTicketCountByOrderId = new Map<string, number>();
  for (const raw of ticketResult.data) {
    const ticket = raw as DatabaseRecord;
    if (text(ticket.status) !== "issued") continue;
    const orderId = text(ticket.order_id);
    issuedTicketCountByOrderId.set(orderId, (issuedTicketCountByOrderId.get(orderId) ?? 0) + 1);
  }
  const serviceRequestsByOrderId = new Map<string, FlightConsumerPreviewServiceRequestDto[]>();
  for (const request of serviceRequestResult.requests) {
    const current = serviceRequestsByOrderId.get(request.orderId) ?? [];
    current.push(request);
    serviceRequestsByOrderId.set(request.orderId, current);
  }

  return Object.freeze(orders.map((order) => {
    const id = text(order.id);
    const search = searchesById.get(text(order.search_id));
    if (!search) throw new ConsumerFlightRepositoryUnavailableError();
    return Object.freeze({
      id,
      confirmationCode: text(order.confirmation_code),
      status: text(order.status),
      currency: text(order.currency),
      totalCents: integer(order.total_cents, "total_cents"),
      createdAt: text(order.created_at),
      updatedAt: text(order.updated_at),
      search,
      paymentStatus: paymentStatusByOrderId.get(id) ?? null,
      ticketCount: issuedTicketCountByOrderId.get(id) ?? 0,
      serviceRequestCount: serviceRequestsByOrderId.get(id)?.length ?? 0,
      latestServiceRequestStatus: serviceRequestsByOrderId.get(id)?.[0]?.status ?? null,
      serviceRequestsAvailable: serviceRequestResult.available,
    });
  }));
}
