import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = readFileSync(join(
  root,
  "components/flights/consumer-preview/service-requests.tsx",
), "utf8");
const confirmation = readFileSync(join(
  root,
  "components/flights/consumer-preview/confirmation.tsx",
), "utf8");
const trips = readFileSync(join(
  root,
  "components/flights/consumer-preview/my-flights.tsx",
), "utf8");
const admin = readFileSync(join(
  root,
  "app/admin/flights/consumer-preview/page.tsx",
), "utf8");
const repository = readFileSync(join(
  root,
  "lib/flights/consumer-preview/repository.server.ts",
), "utf8");

describe("Flight Consumer Preview support visibility", () => {
  it("offers enum selects only and submits same-origin UUID-idempotent JSON", () => {
    expect(component.match(/<select\b/g)).toHaveLength(2);
    expect(component).not.toMatch(/<textarea\b|type=["'](?:text|email|tel)["']/i);
    expect(component).toContain("window.crypto.randomUUID()");
    expect(component).toContain('credentials: "same-origin"');
    expect(component).toContain('"Idempotency-Key": idempotencyKey.current');
    expect(component).toContain("body: JSON.stringify({ requestType, reasonCode })");
  });

  it("shows status on the durable receipt, My Flights, and the admin review queue", () => {
    expect(confirmation).toContain("<ConsumerFlightPreviewServiceRequests");
    expect(confirmation).toContain("requests={order.serviceRequests}");
    expect(trips).toContain("order.latestServiceRequestStatus");
    expect(admin).toContain("Consumer Preview request review");
    expect(admin).toContain("no provider-servicing dispatch");
    expect(admin).not.toMatch(/cancelFlight|refundPayment|duffel.*fetch/i);
  });

  it("keeps an unavailable support ledger from blocking core booking reads", () => {
    expect(repository).toContain("readServiceRequestsWithoutBlockingBooking");
    expect(repository).toContain("available: false as const");
    expect(component).toContain("Existing request status is not being inferred");
  });
});
