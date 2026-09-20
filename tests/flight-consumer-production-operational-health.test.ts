import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  deriveFlightConsumerProductionApprovedReservePolicySha256,
  deriveFlightConsumerProductionOperationalSourceSectionSha256,
  evaluateFlightConsumerProductionOperationalHealth,
  FLIGHT_CONSUMER_PRODUCTION_MONITORING_POLICY,
  type FlightConsumerProductionMonitoringTrustedContext,
  type FlightConsumerProductionOperationalSnapshot,
  type FlightConsumerProductionOperationalSource,
} from "../lib/monitoring/flight-consumer-production";

const NOW = "2030-01-01T00:00:00.000Z";

function healthySnapshot(): FlightConsumerProductionOperationalSnapshot {
  return {
    version: "flight-consumer-production-operational-snapshot-v2",
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

function sourceReceipt(
  snapshot: FlightConsumerProductionOperationalSnapshot,
  source: FlightConsumerProductionOperationalSource,
  collectedAt = snapshot.collectedAt,
  authorityReceiptSha256 = "a".repeat(64),
) {
  return {
    collectedAt,
    sectionSha256:
      deriveFlightConsumerProductionOperationalSourceSectionSha256(
        source,
        snapshot.collectedAt,
        collectedAt,
        snapshot[source],
      ),
    authorityReceiptSha256,
  };
}

function trustedContext(
  snapshot: FlightConsumerProductionOperationalSnapshot,
  changes: Partial<FlightConsumerProductionMonitoringTrustedContext> = {},
): FlightConsumerProductionMonitoringTrustedContext {
  const reservePolicyCore = {
    version: "flight-consumer-production-duffel-reserve-policy-v1" as const,
    currency: "USD",
    requiredReserveMinor: 50_000,
    approvalReceiptSha256: "f".repeat(64),
  };
  const context: FlightConsumerProductionMonitoringTrustedContext = {
    version: "flight-consumer-production-monitoring-trusted-context-v1",
    approvedDuffelReservePolicy: {
      ...reservePolicyCore,
      policySha256:
        deriveFlightConsumerProductionApprovedReservePolicySha256(
          reservePolicyCore,
        ),
    },
    sourceReceipts: {
      stripeWebhook: sourceReceipt(snapshot, "stripeWebhook", undefined, "1".repeat(64)),
      paymentAttempts: sourceReceipt(snapshot, "paymentAttempts", undefined, "2".repeat(64)),
      commerceIntegrity: sourceReceipt(snapshot, "commerceIntegrity", undefined, "3".repeat(64)),
      ticketing: sourceReceipt(snapshot, "ticketing", undefined, "4".repeat(64)),
      duffelBalance: sourceReceipt(snapshot, "duffelBalance", undefined, "5".repeat(64)),
      refunds: sourceReceipt(snapshot, "refunds", undefined, "6".repeat(64)),
      disputes: sourceReceipt(snapshot, "disputes", undefined, "7".repeat(64)),
      scheduleChanges: sourceReceipt(snapshot, "scheduleChanges", undefined, "8".repeat(64)),
      notifications: sourceReceipt(snapshot, "notifications", undefined, "9".repeat(64)),
    },
  };
  const mergedReservePolicy = {
    ...context.approvedDuffelReservePolicy,
    ...changes.approvedDuffelReservePolicy,
  };
  return {
    ...context,
    ...changes,
    approvedDuffelReservePolicy: {
      ...mergedReservePolicy,
      policySha256:
        deriveFlightConsumerProductionApprovedReservePolicySha256({
          version: mergedReservePolicy.version,
          currency: mergedReservePolicy.currency,
          requiredReserveMinor: mergedReservePolicy.requiredReserveMinor,
          approvalReceiptSha256: mergedReservePolicy.approvalReceiptSha256,
        }),
    },
    sourceReceipts: {
      ...context.sourceReceipts,
      ...changes.sourceReceipts,
    },
  };
}

function contextFor(snapshot: unknown) {
  try {
    return trustedContext(snapshot as FlightConsumerProductionOperationalSnapshot);
  } catch {
    return trustedContext(healthySnapshot());
  }
}

function evaluate(
  snapshot: unknown,
  context: unknown = contextFor(snapshot),
) {
  return evaluateFlightConsumerProductionOperationalHealth(snapshot, context, {
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
      version: "flight-consumer-production-operational-report-v2",
      evaluatedAt: NOW,
      snapshotCollectedAt: NOW,
      trustedContextSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
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
    const snapshot = healthySnapshot();
    const result = evaluateFlightConsumerProductionOperationalHealth(
      snapshot,
      trustedContext(snapshot),
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

  it("requires fresh exact source receipts ordered before the snapshot", () => {
    const snapshot = healthySnapshot();
    const baseline = trustedContext(snapshot);

    const afterSnapshotAt = "2030-01-01T00:00:01.000Z";
    const afterSnapshot = trustedContext(snapshot, {
      sourceReceipts: {
        ...baseline.sourceReceipts,
        stripeWebhook: sourceReceipt(
          snapshot,
          "stripeWebhook",
          afterSnapshotAt,
          baseline.sourceReceipts.stripeWebhook.authorityReceiptSha256,
        ),
      },
    });
    expect(evaluate(snapshot, afterSnapshot).alerts.map((alert) => alert.code))
      .toContain("source_collection_receipt_after_snapshot");

    const staleAt = "2029-12-31T23:55:00.000Z";
    const stale = trustedContext(snapshot, {
      sourceReceipts: {
        ...baseline.sourceReceipts,
        commerceIntegrity: sourceReceipt(
          snapshot,
          "commerceIntegrity",
          staleAt,
          baseline.sourceReceipts.commerceIntegrity.authorityReceiptSha256,
        ),
      },
    });
    expect(evaluate(snapshot, stale).alerts.map((alert) => alert.code))
      .toContain("source_collection_receipt_stale");

    const mismatched = trustedContext(snapshot, {
      sourceReceipts: {
        ...baseline.sourceReceipts,
        paymentAttempts: {
          ...baseline.sourceReceipts.paymentAttempts,
          sectionSha256: "0".repeat(64),
        },
      },
    });
    expect(evaluate(snapshot, mismatched).alerts.map((alert) => alert.code))
      .toContain("source_collection_receipt_binding_mismatch");
  });

  it("rejects component evidence timestamped after its source receipt", () => {
    const snapshot = healthySnapshot();
    snapshot.stripeWebhook.endpointVerifiedAt =
      "2030-01-01T00:00:30.000Z";
    snapshot.duffelBalance.checkedAt = "2030-01-01T00:00:30.000Z";
    const context = trustedContext(snapshot);

    const result = evaluateFlightConsumerProductionOperationalHealth(
      snapshot,
      context,
      { readClock: () => new Date("2030-01-01T00:00:40.000Z") },
    );
    expect(result.health).toBe("critical");
    expect(result.monitoringGate).toBe("block");
    expect(result.alerts.filter((alert) =>
      alert.code === "source_signal_after_collection_receipt"
    )).toHaveLength(2);
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
    const missing = healthySnapshot();
    missing.duffelBalance = {
      checkedAt: null,
      currency: null,
      availableMinor: null,
    };
    expect(alertCodes(missing)).toContain(
      "duffel_balance_evidence_missing",
    );

    const staleAndLow = healthySnapshot();
    staleAndLow.duffelBalance = {
      checkedAt: "2029-12-31T23:45:00.000Z",
      currency: "USD",
      availableMinor: 49_999,
    };
    const result = evaluate(staleAndLow);
    expect(result.health).toBe("critical");
    expect(result.alerts.map((alert) => alert.code)).toEqual(expect.arrayContaining([
      "duffel_balance_evidence_stale",
      "duffel_balance_below_threshold",
    ]));
  });

  it("takes reserve currency and amount only from the separately trusted policy", () => {
    const snapshot = healthySnapshot();
    const lowerUntrustedThreshold = {
      ...snapshot,
      duffelBalance: {
        ...snapshot.duffelBalance,
        thresholdConfigured: true,
        requiredReserveMinor: 1,
      },
    };
    expect(evaluate(lowerUntrustedThreshold)).toMatchObject({
      health: "critical",
      monitoringGate: "block",
      alerts: [{ code: "monitoring_snapshot_invalid", severity: "p0" }],
    });

    snapshot.duffelBalance.availableMinor = 49_999;
    const approved = trustedContext(snapshot);
    expect(alertCodes(snapshot)).toContain("duffel_balance_below_threshold");

    const wrongCurrency = trustedContext(snapshot, {
      approvedDuffelReservePolicy: {
        ...approved.approvedDuffelReservePolicy,
        currency: "EUR",
      },
    });
    expect(evaluate(snapshot, wrongCurrency).alerts.map((alert) => alert.code))
      .toContain("duffel_balance_policy_currency_mismatch");
  });

  it("fails closed without a complete trusted monitoring context", () => {
    const snapshot = healthySnapshot();
    for (const context of [
      null,
      {},
      { ...trustedContext(snapshot), approvedDuffelReservePolicy: undefined },
      {
        ...trustedContext(snapshot),
        approvedDuffelReservePolicy: {
          ...trustedContext(snapshot).approvedDuffelReservePolicy,
          policySha256: "0".repeat(64),
        },
      },
      {
        ...trustedContext(snapshot),
        sourceReceipts: {
          ...trustedContext(snapshot).sourceReceipts,
          refunds: undefined,
        },
      },
    ]) {
      expect(evaluate(snapshot, context)).toMatchObject({
        health: "critical",
        monitoringGate: "block",
        trustedContextSha256: null,
        alerts: [{ code: "monitoring_trusted_context_invalid", severity: "p0" }],
      });
    }
  });

  it("binds the report digest to approved policy and source receipt changes", () => {
    const snapshot = healthySnapshot();
    const baseline = trustedContext(snapshot);
    const baselineResult = evaluate(snapshot, baseline);

    const changedPolicy = trustedContext(snapshot, {
      approvedDuffelReservePolicy: {
        ...baseline.approvedDuffelReservePolicy,
        requiredReserveMinor: 60_000,
        approvalReceiptSha256: "e".repeat(64),
      },
    });
    const changedReceipt = trustedContext(snapshot, {
      sourceReceipts: {
        ...baseline.sourceReceipts,
        notifications: {
          ...baseline.sourceReceipts.notifications,
          authorityReceiptSha256: "d".repeat(64),
        },
      },
    });

    expect(evaluate(snapshot, changedPolicy).trustedContextSha256)
      .not.toBe(baselineResult.trustedContextSha256);
    expect(evaluate(snapshot, changedReceipt).trustedContextSha256)
      .not.toBe(baselineResult.trustedContextSha256);
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
      version: "flight-consumer-production-monitoring-policy-v2",
      maximumSnapshotAgeSeconds: 300,
      maximumSourceCollectionAgeSeconds: 300,
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
