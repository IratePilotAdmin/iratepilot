import { describe, expect, it, vi } from "vitest";

import {
  collectFlightConsumerProductionOperationalEvidence,
  type FlightConsumerProductionOperationalCollectorReaders,
} from "../lib/monitoring/flight-consumer-production-collector";
import {
  evaluateFlightConsumerProductionOperationalHealth,
  type FlightConsumerProductionOperationalSnapshot,
} from "../lib/monitoring/flight-consumer-production";

const NOW = "2030-01-01T00:00:00.000Z";

function sections(): Omit<FlightConsumerProductionOperationalSnapshot, "version" | "environment" | "collectedAt"> {
  return {
    stripeWebhook: {
      endpointVerifiedAt: NOW,
      pendingCount: 0,
      oldestPendingAt: null,
      failedCount: 0,
    },
    paymentAttempts: {
      inProgressCount: 0,
      oldestInProgressAt: null,
      ambiguousCount: 0,
    },
    commerceIntegrity: {
      authorizedWithoutOrderCount: 0,
      capturedWithoutOrderCount: 0,
      orderWithoutTicketCount: 0,
      ticketWithoutCapturedPaymentCount: 0,
    },
    ticketing: {
      pendingCount: 0,
      nearestDeadlineAt: null,
    },
    duffelBalance: {
      checkedAt: NOW,
      currency: "USD",
      availableMinor: 100_000,
    },
    refunds: {
      pendingCount: 0,
      oldestPendingAt: null,
      failedCount: 0,
      oldestFailedAt: null,
    },
    disputes: {
      openCount: 0,
      unacknowledgedCount: 0,
      oldestUnacknowledgedAt: null,
    },
    scheduleChanges: {
      unacknowledgedCount: 0,
      oldestUnacknowledgedAt: null,
    },
    notifications: {
      pendingCount: 0,
      oldestPendingAt: null,
      failedCount: 0,
      oldestFailedAt: null,
    },
  };
}

function readers(): FlightConsumerProductionOperationalCollectorReaders {
  const value = sections();
  return Object.fromEntries(
    Object.entries(value).map(([source, section], index) => [source, vi.fn(async () => ({
      collectedAt: NOW,
      section,
      authorityReceiptSha256: `${index + 1}`.repeat(64),
    }))]),
  ) as unknown as FlightConsumerProductionOperationalCollectorReaders;
}

const policy = {
  version: "flight-consumer-production-duffel-reserve-policy-v1" as const,
  currency: "USD",
  requiredReserveMinor: 50_000,
  approvalReceiptSha256: "f".repeat(64),
};

describe("Flight Consumer Production operational collector assembly", () => {
  it("assembles all injected source receipts without adding capabilities", async () => {
    const sourceReaders = readers();
    const evidence = await collectFlightConsumerProductionOperationalEvidence(
      sourceReaders,
      policy,
      { readClock: () => new Date(NOW) },
    );

    expect(evidence.snapshot.environment).toBe("production");
    expect(Object.keys(evidence.trustedContext.sourceReceipts)).toHaveLength(9);
    expect(evidence.trustedContext.approvedDuffelReservePolicy.currency).toBe("USD");
    expect(evaluateFlightConsumerProductionOperationalHealth(
      evidence.snapshot,
      evidence.trustedContext,
      { readClock: () => new Date(NOW) },
    )).toMatchObject({
      health: "healthy",
      monitoringGate: "pass",
      externalRequestMade: false,
      providerMutationAuthorized: false,
      consumerReleaseAuthorized: false,
    });

    for (const reader of Object.values(sourceReaders)) {
      expect(reader).toHaveBeenCalledOnce();
    }
  });

  it("fails closed when the clock or a source reader is unavailable", async () => {
    await expect(collectFlightConsumerProductionOperationalEvidence(
      readers(),
      policy,
      { readClock: () => new Date(Number.NaN) },
    )).rejects.toThrow("monitoring collector clock");

    const incomplete = { ...readers() } as unknown as {
      -readonly [Source in keyof FlightConsumerProductionOperationalCollectorReaders]?:
        FlightConsumerProductionOperationalCollectorReaders[Source];
    };
    delete incomplete.notifications;
    await expect(collectFlightConsumerProductionOperationalEvidence(
      incomplete as FlightConsumerProductionOperationalCollectorReaders,
      policy,
      { readClock: () => new Date(NOW) },
    )).rejects.toThrow("Missing monitoring source reader: notifications");
  });
});
