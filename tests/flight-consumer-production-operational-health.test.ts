import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  evaluateFlightConsumerProductionOperationalHealth,
  FLIGHT_CONSUMER_PRODUCTION_MONITORING_POLICY,
  type FlightConsumerProductionOperationalSnapshot,
} from "../lib/monitoring/flight-consumer-production";

const NOW = "2030-01-01T00:00:00.000Z";

function healthySnapshot(): FlightConsumerProductionOperationalSnapshot {
  return {
    version: "flight-consumer-production-operational-snapshot-v1",
    environment: "production",
    collectedAt: NOW,
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
      thresholdConfigured: true,
      checkedAt: NOW,
      currency: "USD",
      availableMinor: 100_000,
      requiredReserveMinor: 50_000,
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

function evaluate(snapshot: unknown) {
  return evaluateFlightConsumerProductionOperationalHealth(snapshot, {
    readClock: () => new Date(NOW),
  });
}

function alertCodes(snapshot: unknown) {
  return evaluate(snapshot).alerts.map((alert) => alert.code);
}

describe("Flight Consumer Production operational health foundation", () => {
  it("passes only a complete, current, internally healthy aggregate snapshot", () => {
    const result = evaluate(healthySnapshot());

    expect(result).toEqual({
      version: "flight-consumer-production-operational-report-v1",
      evaluatedAt: NOW,
      snapshotCollectedAt: NOW,
      health: "healthy",
      monitoringGate: "pass",
      alerts: [],
      providerRequestCount: 0,
      externalRequestMade: false,
      providerMutationAuthorized: false,
      consumerReleaseAuthorized: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.alerts)).toBe(true);
  });

  it("fails closed for malformed, partial, contradictory, or extra evidence", () => {
    const baseline = healthySnapshot();
    const malformed = [
      null,
      {},
      { ...baseline, environment: "preview" },
      { ...baseline, credential: "must-never-be-reflected" },
      {
        ...baseline,
        stripeWebhook: {
          ...baseline.stripeWebhook,
          pendingCount: 1,
          oldestPendingAt: null,
        },
      },
      {
        ...baseline,
        disputes: {
          openCount: 1,
          unacknowledgedCount: 2,
          oldestUnacknowledgedAt: NOW,
        },
      },
      {
        ...baseline,
        duffelBalance: {
          thresholdConfigured: false,
          checkedAt: NOW,
          currency: "USD",
          availableMinor: 100,
          requiredReserveMinor: 50,
        },
      },
    ];

    for (const snapshot of malformed) {
      const result = evaluate(snapshot);
      expect(result).toMatchObject({
        health: "critical",
        monitoringGate: "block",
        snapshotCollectedAt: null,
        alerts: [{ code: "monitoring_snapshot_invalid", severity: "p0" }],
        consumerReleaseAuthorized: false,
      });
      expect(JSON.stringify(result)).not.toContain("must-never-be-reflected");
    }
  });

  it("blocks when the evaluator clock is unavailable", () => {
    const result = evaluateFlightConsumerProductionOperationalHealth(
      healthySnapshot(),
      { readClock: () => new Date(Number.NaN) },
    );

    expect(result).toMatchObject({
      evaluatedAt: null,
      health: "critical",
      monitoringGate: "block",
      alerts: [{ code: "monitor_clock_invalid", severity: "p0" }],
    });
  });

  it("blocks stale snapshots and implausibly future-dated component signals", () => {
    const stale = healthySnapshot();
    stale.collectedAt = "2029-12-31T23:55:00.000Z";
    expect(alertCodes(stale)).toContain("monitoring_snapshot_stale");

    const future = healthySnapshot();
    future.stripeWebhook.endpointVerifiedAt = "2030-01-01T00:01:01.000Z";
    expect(alertCodes(future)).toContain("signal_timestamp_in_future");
  });

  it("alerts on Stripe webhook verification, lag, and terminal failures", () => {
    const unverified = healthySnapshot();
    unverified.stripeWebhook.endpointVerifiedAt = null;
    expect(alertCodes(unverified)).toContain("stripe_webhook_endpoint_unverified");

    const unhealthy = healthySnapshot();
    unhealthy.stripeWebhook = {
      endpointVerifiedAt: "2029-12-31T23:45:00.000Z",
      pendingCount: 3,
      oldestPendingAt: "2029-12-31T23:55:00.000Z",
      failedCount: 1,
    };
    expect(alertCodes(unhealthy)).toEqual(expect.arrayContaining([
      "stripe_webhook_endpoint_verification_stale",
      "stripe_webhook_processing_lag",
      "stripe_webhook_delivery_failed",
    ]));
  });

  it("alerts on stuck or ambiguous payments and every order-ticket mismatch", () => {
    const snapshot = healthySnapshot();
    snapshot.paymentAttempts = {
      inProgressCount: 2,
      oldestInProgressAt: "2029-12-31T23:50:00.000Z",
      ambiguousCount: 1,
    };
    snapshot.commerceIntegrity = {
      authorizedWithoutOrderCount: 1,
      capturedWithoutOrderCount: 2,
      orderWithoutTicketCount: 3,
      ticketWithoutCapturedPaymentCount: 4,
    };

    const result = evaluate(snapshot);
    expect(result.health).toBe("critical");
    expect(result.monitoringGate).toBe("block");
    expect(result.alerts.map((alert) => alert.code)).toEqual(expect.arrayContaining([
      "payment_attempt_stuck",
      "payment_attempt_ambiguous",
      "payment_authorized_without_order",
      "payment_captured_without_order",
      "order_without_ticket",
      "ticket_without_captured_payment",
    ]));
  });

  it("distinguishes an at-risk ticket deadline from an expired deadline", () => {
    const atRisk = healthySnapshot();
    atRisk.ticketing = {
      pendingCount: 1,
      nearestDeadlineAt: "2030-01-01T01:00:00.000Z",
    };
    const atRiskResult = evaluate(atRisk);
    expect(atRiskResult.health).toBe("degraded");
    expect(atRiskResult.alerts.map((alert) => alert.code)).toContain(
      "ticket_deadline_at_risk",
    );
    expect(atRiskResult.alerts.map((alert) => alert.code)).not.toContain(
      "signal_timestamp_in_future",
    );

    const expired = healthySnapshot();
    expired.ticketing = {
      pendingCount: 2,
      nearestDeadlineAt: "2029-12-31T23:59:59.000Z",
    };
    const result = evaluate(expired);
    expect(result.health).toBe("critical");
    expect(result.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ticket_deadline_expired", severity: "p0" }),
    ]));
  });

  it("fails closed for missing, stale, or insufficient Duffel balance evidence", () => {
    const unconfigured = healthySnapshot();
    unconfigured.duffelBalance = {
      thresholdConfigured: false,
      checkedAt: null,
      currency: null,
      availableMinor: null,
      requiredReserveMinor: null,
    };
    expect(alertCodes(unconfigured)).toContain(
      "duffel_balance_threshold_unconfigured",
    );

    const staleAndLow = healthySnapshot();
    staleAndLow.duffelBalance = {
      thresholdConfigured: true,
      checkedAt: "2029-12-31T23:45:00.000Z",
      currency: "USD",
      availableMinor: 49_999,
      requiredReserveMinor: 50_000,
    };
    const result = evaluate(staleAndLow);
    expect(result.health).toBe("critical");
    expect(result.alerts.map((alert) => alert.code)).toEqual(expect.arrayContaining([
      "duffel_balance_evidence_stale",
      "duffel_balance_below_threshold",
    ]));
  });

  it("alerts on refund lag/failure and unacknowledged disputes", () => {
    const snapshot = healthySnapshot();
    snapshot.refunds = {
      pendingCount: 2,
      oldestPendingAt: "2029-12-31T00:00:00.000Z",
      failedCount: 1,
      oldestFailedAt: "2029-12-31T23:30:00.000Z",
    };
    snapshot.disputes = {
      openCount: 2,
      unacknowledgedCount: 1,
      oldestUnacknowledgedAt: "2029-12-31T23:30:00.000Z",
    };

    expect(alertCodes(snapshot)).toEqual(expect.arrayContaining([
      "refund_pending_lag",
      "refund_failed",
      "dispute_unacknowledged",
    ]));
  });

  it("warns immediately and escalates overdue schedule changes", () => {
    const pending = healthySnapshot();
    pending.scheduleChanges = {
      unacknowledgedCount: 1,
      oldestUnacknowledgedAt: "2029-12-31T23:59:00.000Z",
    };
    expect(evaluate(pending).alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "schedule_change_pending_acknowledgement",
        severity: "p2",
        level: "warning",
      }),
    ]));

    const overdue = healthySnapshot();
    overdue.scheduleChanges = {
      unacknowledgedCount: 2,
      oldestUnacknowledgedAt: "2029-12-31T23:45:00.000Z",
    };
    expect(alertCodes(overdue)).toContain(
      "schedule_change_acknowledgement_lag",
    );
  });

  it("alerts on delayed and failed traveler notifications", () => {
    const snapshot = healthySnapshot();
    snapshot.notifications = {
      pendingCount: 2,
      oldestPendingAt: "2029-12-31T23:45:00.000Z",
      failedCount: 1,
      oldestFailedAt: "2029-12-31T23:50:00.000Z",
    };

    expect(alertCodes(snapshot)).toEqual(expect.arrayContaining([
      "notification_delivery_lag",
      "notification_delivery_failed",
    ]));
  });

  it("keeps policy thresholds code-reviewed and all alert output aggregate-only", () => {
    expect(FLIGHT_CONSUMER_PRODUCTION_MONITORING_POLICY).toEqual({
      version: "flight-consumer-production-monitoring-policy-v1",
      maximumSnapshotAgeSeconds: 300,
      maximumFutureClockSkewSeconds: 60,
      stripeEndpointVerificationMaxAgeSeconds: 900,
      stripeWebhookProcessingMaxLagSeconds: 300,
      paymentAttemptMaxAgeSeconds: 600,
      ticketDeadlineWarningSeconds: 3_600,
      duffelBalanceMaxAgeSeconds: 900,
      refundPendingMaxAgeSeconds: 86_400,
      scheduleChangeAcknowledgementMaxAgeSeconds: 900,
      notificationPendingMaxAgeSeconds: 900,
    });
    expect(Object.isFrozen(FLIGHT_CONSUMER_PRODUCTION_MONITORING_POLICY)).toBe(true);

    const serialized = JSON.stringify(evaluate(healthySnapshot()));
    expect(serialized).not.toMatch(/(?:pi|ch|re|ord|evt)_[A-Za-z0-9_]+/);
    expect(serialized).not.toMatch(/(?:sk|rk)_(?:live|test)_|whsec_|client_secret/i);
  });

  it("contains no provider, network, environment, persistence, or release mutation path", () => {
    const source = readFileSync(
      new URL(
        "../lib/monitoring/flight-consumer-production.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']stripe["']/);
    expect(source).not.toMatch(/from\s+["']@supabase\//);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bprocess\.env\b/);
    expect(source).not.toMatch(/\bcreateAdminClient\b|\bgetStripe\b/);
    expect(source).not.toMatch(
      /(?:stripe\.)?paymentIntents\.|(?:stripe\.)?refunds\.(?:create|retrieve)|orders\.(?:create|update)/,
    );
    expect(source).not.toMatch(/FLIGHT_CONSUMER_PRODUCTION_RELEASE_ENABLED/);
  });
});
