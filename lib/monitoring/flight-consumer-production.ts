import { z } from "zod";

const instantSchema = z.string().datetime({ offset: true });
const countSchema = z.number().int().min(0).max(1_000_000_000);
const moneyMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveMoneyMinorSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

const snapshotSchema = z.object({
  version: z.literal("flight-consumer-production-operational-snapshot-v1"),
  environment: z.literal("production"),
  collectedAt: instantSchema,
  stripeWebhook: z.object({
    endpointVerifiedAt: instantSchema.nullable(),
    pendingCount: countSchema,
    oldestPendingAt: instantSchema.nullable(),
    failedCount: countSchema,
  }).strict(),
  paymentAttempts: z.object({
    inProgressCount: countSchema,
    oldestInProgressAt: instantSchema.nullable(),
    ambiguousCount: countSchema,
  }).strict(),
  commerceIntegrity: z.object({
    authorizedWithoutOrderCount: countSchema,
    capturedWithoutOrderCount: countSchema,
    orderWithoutTicketCount: countSchema,
    ticketWithoutCapturedPaymentCount: countSchema,
  }).strict(),
  ticketing: z.object({
    pendingCount: countSchema,
    nearestDeadlineAt: instantSchema.nullable(),
  }).strict(),
  duffelBalance: z.object({
    thresholdConfigured: z.boolean(),
    checkedAt: instantSchema.nullable(),
    currency: currencySchema.nullable(),
    availableMinor: moneyMinorSchema.nullable(),
    requiredReserveMinor: positiveMoneyMinorSchema.nullable(),
  }).strict(),
  refunds: z.object({
    pendingCount: countSchema,
    oldestPendingAt: instantSchema.nullable(),
    failedCount: countSchema,
    oldestFailedAt: instantSchema.nullable(),
  }).strict(),
  disputes: z.object({
    openCount: countSchema,
    unacknowledgedCount: countSchema,
    oldestUnacknowledgedAt: instantSchema.nullable(),
  }).strict(),
  scheduleChanges: z.object({
    unacknowledgedCount: countSchema,
    oldestUnacknowledgedAt: instantSchema.nullable(),
  }).strict(),
  notifications: z.object({
    pendingCount: countSchema,
    oldestPendingAt: instantSchema.nullable(),
    failedCount: countSchema,
    oldestFailedAt: instantSchema.nullable(),
  }).strict(),
}).strict().superRefine((snapshot, context) => {
  const requireCountTimestampCoherence = (
    count: number,
    timestamp: string | null,
    path: readonly (string | number)[],
  ) => {
    if ((count === 0) !== (timestamp === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path],
        message: "Aggregate count and oldest-event timestamp must agree.",
      });
    }
  };

  requireCountTimestampCoherence(
    snapshot.stripeWebhook.pendingCount,
    snapshot.stripeWebhook.oldestPendingAt,
    ["stripeWebhook", "oldestPendingAt"],
  );
  requireCountTimestampCoherence(
    snapshot.paymentAttempts.inProgressCount,
    snapshot.paymentAttempts.oldestInProgressAt,
    ["paymentAttempts", "oldestInProgressAt"],
  );
  requireCountTimestampCoherence(
    snapshot.ticketing.pendingCount,
    snapshot.ticketing.nearestDeadlineAt,
    ["ticketing", "nearestDeadlineAt"],
  );
  requireCountTimestampCoherence(
    snapshot.refunds.pendingCount,
    snapshot.refunds.oldestPendingAt,
    ["refunds", "oldestPendingAt"],
  );
  requireCountTimestampCoherence(
    snapshot.refunds.failedCount,
    snapshot.refunds.oldestFailedAt,
    ["refunds", "oldestFailedAt"],
  );
  requireCountTimestampCoherence(
    snapshot.disputes.unacknowledgedCount,
    snapshot.disputes.oldestUnacknowledgedAt,
    ["disputes", "oldestUnacknowledgedAt"],
  );
  requireCountTimestampCoherence(
    snapshot.scheduleChanges.unacknowledgedCount,
    snapshot.scheduleChanges.oldestUnacknowledgedAt,
    ["scheduleChanges", "oldestUnacknowledgedAt"],
  );
  requireCountTimestampCoherence(
    snapshot.notifications.pendingCount,
    snapshot.notifications.oldestPendingAt,
    ["notifications", "oldestPendingAt"],
  );
  requireCountTimestampCoherence(
    snapshot.notifications.failedCount,
    snapshot.notifications.oldestFailedAt,
    ["notifications", "oldestFailedAt"],
  );

  if (snapshot.disputes.unacknowledgedCount > snapshot.disputes.openCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["disputes", "unacknowledgedCount"],
      message: "Unacknowledged disputes cannot exceed open disputes.",
    });
  }

  const balanceEvidence = [
    snapshot.duffelBalance.checkedAt,
    snapshot.duffelBalance.currency,
    snapshot.duffelBalance.availableMinor,
    snapshot.duffelBalance.requiredReserveMinor,
  ];
  if (snapshot.duffelBalance.thresholdConfigured) {
    if (balanceEvidence.some((value) => value === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["duffelBalance"],
        message: "A configured Duffel balance threshold requires complete evidence.",
      });
    }
  } else if (balanceEvidence.some((value) => value !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["duffelBalance"],
      message: "Unconfigured Duffel balance monitoring cannot carry partial evidence.",
    });
  }
});

export type FlightConsumerProductionOperationalSnapshot = z.infer<
  typeof snapshotSchema
>;

export const FLIGHT_CONSUMER_PRODUCTION_MONITORING_POLICY = Object.freeze({
  version: "flight-consumer-production-monitoring-policy-v1" as const,
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

export const FLIGHT_CONSUMER_PRODUCTION_OPERATIONAL_ALERT_CODES = Object.freeze([
  "monitor_clock_invalid",
  "monitoring_snapshot_invalid",
  "monitoring_snapshot_stale",
  "signal_timestamp_in_future",
  "stripe_webhook_endpoint_unverified",
  "stripe_webhook_endpoint_verification_stale",
  "stripe_webhook_processing_lag",
  "stripe_webhook_delivery_failed",
  "payment_attempt_stuck",
  "payment_attempt_ambiguous",
  "payment_authorized_without_order",
  "payment_captured_without_order",
  "order_without_ticket",
  "ticket_without_captured_payment",
  "ticket_deadline_at_risk",
  "ticket_deadline_expired",
  "duffel_balance_threshold_unconfigured",
  "duffel_balance_evidence_stale",
  "duffel_balance_below_threshold",
  "refund_pending_lag",
  "refund_failed",
  "dispute_unacknowledged",
  "schedule_change_pending_acknowledgement",
  "schedule_change_acknowledgement_lag",
  "notification_delivery_lag",
  "notification_delivery_failed",
] as const);

export type FlightConsumerProductionOperationalAlertCode =
  (typeof FLIGHT_CONSUMER_PRODUCTION_OPERATIONAL_ALERT_CODES)[number];
export type FlightConsumerProductionOperationalSeverity = "p0" | "p1" | "p2";
export type FlightConsumerProductionOperationalLevel = "warning" | "error";

type AggregateEvidenceValue = string | number | boolean | null;

export type FlightConsumerProductionOperationalAlert = Readonly<{
  code: FlightConsumerProductionOperationalAlertCode;
  event: `flight_consumer_production_${FlightConsumerProductionOperationalAlertCode}`;
  severity: FlightConsumerProductionOperationalSeverity;
  level: FlightConsumerProductionOperationalLevel;
  summary: string;
  runbookSection: string;
  responseTargetSeconds: number;
  blocksMonitoringGate: true;
  aggregateEvidence: Readonly<Record<string, AggregateEvidenceValue>>;
}>;

export type FlightConsumerProductionOperationalReport = Readonly<{
  version: "flight-consumer-production-operational-report-v1";
  evaluatedAt: string | null;
  snapshotCollectedAt: string | null;
  health: "healthy" | "degraded" | "critical";
  monitoringGate: "pass" | "block";
  alerts: readonly FlightConsumerProductionOperationalAlert[];
  providerRequestCount: 0;
  externalRequestMade: false;
  providerMutationAuthorized: false;
  consumerReleaseAuthorized: false;
}>;

type FlightConsumerProductionMonitoringDependencies = Readonly<{
  readClock?: () => Date;
}>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function responseTargetSeconds(
  severity: FlightConsumerProductionOperationalSeverity,
) {
  if (severity === "p0") return 15 * 60;
  if (severity === "p1") return 30 * 60;
  return 4 * 60 * 60;
}

function operationalAlert(input: Readonly<{
  code: FlightConsumerProductionOperationalAlertCode;
  severity: FlightConsumerProductionOperationalSeverity;
  summary: string;
  runbookSection: string;
  aggregateEvidence?: Readonly<Record<string, AggregateEvidenceValue>>;
}>): FlightConsumerProductionOperationalAlert {
  return deepFreeze({
    code: input.code,
    event: `flight_consumer_production_${input.code}` as const,
    severity: input.severity,
    level: input.severity === "p2" ? "warning" as const : "error" as const,
    summary: input.summary,
    runbookSection: input.runbookSection,
    responseTargetSeconds: responseTargetSeconds(input.severity),
    blocksMonitoringGate: true as const,
    aggregateEvidence: { ...(input.aggregateEvidence ?? {}) },
  });
}

function report(
  evaluatedAt: string | null,
  snapshotCollectedAt: string | null,
  alerts: readonly FlightConsumerProductionOperationalAlert[],
): FlightConsumerProductionOperationalReport {
  const health = alerts.some((alert) => alert.severity === "p0")
    ? "critical" as const
    : alerts.length > 0
      ? "degraded" as const
      : "healthy" as const;
  return deepFreeze({
    version: "flight-consumer-production-operational-report-v1" as const,
    evaluatedAt,
    snapshotCollectedAt,
    health,
    monitoringGate: alerts.length === 0 ? "pass" as const : "block" as const,
    alerts: [...alerts],
    providerRequestCount: 0 as const,
    externalRequestMade: false as const,
    providerMutationAuthorized: false as const,
    consumerReleaseAuthorized: false as const,
  });
}

function secondsSince(nowMilliseconds: number, instant: string) {
  return Math.max(0, Math.floor((nowMilliseconds - Date.parse(instant)) / 1_000));
}

function secondsUntil(nowMilliseconds: number, instant: string) {
  return Math.floor((Date.parse(instant) - nowMilliseconds) / 1_000);
}

function readEvaluationClock(
  dependencies: FlightConsumerProductionMonitoringDependencies,
) {
  try {
    const now = dependencies.readClock?.() ?? new Date();
    return Number.isFinite(now.getTime()) ? now : null;
  } catch {
    return null;
  }
}

export function evaluateFlightConsumerProductionOperationalHealth(
  untrustedSnapshot: unknown,
  dependencies: FlightConsumerProductionMonitoringDependencies = {},
): FlightConsumerProductionOperationalReport {
  const now = readEvaluationClock(dependencies);
  if (now === null) {
    return report(null, null, [operationalAlert({
      code: "monitor_clock_invalid",
      severity: "p0",
      summary: "The monitoring evaluator could not establish a trusted clock.",
      runbookSection: "Monitoring evidence failure",
    })]);
  }
  const evaluatedAt = now.toISOString();
  const accepted = snapshotSchema.safeParse(untrustedSnapshot);
  if (!accepted.success) {
    return report(evaluatedAt, null, [operationalAlert({
      code: "monitoring_snapshot_invalid",
      severity: "p0",
      summary: "The flight operational snapshot is missing, malformed, or internally inconsistent.",
      runbookSection: "Monitoring evidence failure",
    })]);
  }

  const snapshot = accepted.data;
  const nowMilliseconds = now.getTime();
  const policy = FLIGHT_CONSUMER_PRODUCTION_MONITORING_POLICY;
  const alerts: FlightConsumerProductionOperationalAlert[] = [];
  const timestampSignals = [
    ["snapshot", snapshot.collectedAt],
    ["stripe_webhook_endpoint", snapshot.stripeWebhook.endpointVerifiedAt],
    ["stripe_webhook_pending", snapshot.stripeWebhook.oldestPendingAt],
    ["payment_attempt", snapshot.paymentAttempts.oldestInProgressAt],
    ["duffel_balance", snapshot.duffelBalance.checkedAt],
    ["refund_pending", snapshot.refunds.oldestPendingAt],
    ["refund_failed", snapshot.refunds.oldestFailedAt],
    ["dispute", snapshot.disputes.oldestUnacknowledgedAt],
    ["schedule_change", snapshot.scheduleChanges.oldestUnacknowledgedAt],
    ["notification_pending", snapshot.notifications.oldestPendingAt],
    ["notification_failed", snapshot.notifications.oldestFailedAt],
  ] as const;
  const futureSignals = timestampSignals.filter(([, instant]) =>
    instant !== null
    && Date.parse(instant) - nowMilliseconds
      > policy.maximumFutureClockSkewSeconds * 1_000
  );
  if (futureSignals.length > 0) {
    alerts.push(operationalAlert({
      code: "signal_timestamp_in_future",
      severity: "p0",
      summary: "One or more monitoring signals are untrustworthily far in the future.",
      runbookSection: "Monitoring evidence failure",
      aggregateEvidence: {
        futureSignalCount: futureSignals.length,
        maximumAllowedFutureSkewSeconds: policy.maximumFutureClockSkewSeconds,
      },
    }));
  }

  const snapshotAgeSeconds = secondsSince(nowMilliseconds, snapshot.collectedAt);
  if (snapshotAgeSeconds >= policy.maximumSnapshotAgeSeconds) {
    alerts.push(operationalAlert({
      code: "monitoring_snapshot_stale",
      severity: "p0",
      summary: "The aggregate flight operational snapshot is stale.",
      runbookSection: "Monitoring evidence failure",
      aggregateEvidence: {
        ageSeconds: snapshotAgeSeconds,
        thresholdSeconds: policy.maximumSnapshotAgeSeconds,
      },
    }));
  }

  if (snapshot.stripeWebhook.endpointVerifiedAt === null) {
    alerts.push(operationalAlert({
      code: "stripe_webhook_endpoint_unverified",
      severity: "p1",
      summary: "No current verification exists for the flight Stripe webhook endpoint.",
      runbookSection: "Stripe webhook health",
    }));
  } else {
    const ageSeconds = secondsSince(
      nowMilliseconds,
      snapshot.stripeWebhook.endpointVerifiedAt,
    );
    if (ageSeconds >= policy.stripeEndpointVerificationMaxAgeSeconds) {
      alerts.push(operationalAlert({
        code: "stripe_webhook_endpoint_verification_stale",
        severity: "p1",
        summary: "The flight Stripe webhook endpoint verification is stale.",
        runbookSection: "Stripe webhook health",
        aggregateEvidence: {
          ageSeconds,
          thresholdSeconds: policy.stripeEndpointVerificationMaxAgeSeconds,
        },
      }));
    }
  }
  if (snapshot.stripeWebhook.oldestPendingAt !== null) {
    const ageSeconds = secondsSince(
      nowMilliseconds,
      snapshot.stripeWebhook.oldestPendingAt,
    );
    if (ageSeconds >= policy.stripeWebhookProcessingMaxLagSeconds) {
      alerts.push(operationalAlert({
        code: "stripe_webhook_processing_lag",
        severity: "p1",
        summary: "Flight Stripe webhook processing exceeds the reviewed lag threshold.",
        runbookSection: "Stripe webhook health",
        aggregateEvidence: {
          pendingCount: snapshot.stripeWebhook.pendingCount,
          oldestAgeSeconds: ageSeconds,
          thresholdSeconds: policy.stripeWebhookProcessingMaxLagSeconds,
        },
      }));
    }
  }
  if (snapshot.stripeWebhook.failedCount > 0) {
    alerts.push(operationalAlert({
      code: "stripe_webhook_delivery_failed",
      severity: "p1",
      summary: "One or more flight Stripe webhook events are in a failed state.",
      runbookSection: "Stripe webhook health",
      aggregateEvidence: { failedCount: snapshot.stripeWebhook.failedCount },
    }));
  }

  if (snapshot.paymentAttempts.oldestInProgressAt !== null) {
    const ageSeconds = secondsSince(
      nowMilliseconds,
      snapshot.paymentAttempts.oldestInProgressAt,
    );
    if (ageSeconds >= policy.paymentAttemptMaxAgeSeconds) {
      alerts.push(operationalAlert({
        code: "payment_attempt_stuck",
        severity: "p1",
        summary: "A flight payment attempt remains in progress beyond its threshold.",
        runbookSection: "Payment attempt recovery",
        aggregateEvidence: {
          inProgressCount: snapshot.paymentAttempts.inProgressCount,
          oldestAgeSeconds: ageSeconds,
          thresholdSeconds: policy.paymentAttemptMaxAgeSeconds,
        },
      }));
    }
  }
  if (snapshot.paymentAttempts.ambiguousCount > 0) {
    alerts.push(operationalAlert({
      code: "payment_attempt_ambiguous",
      severity: "p1",
      summary: "A flight payment attempt requires provider reconciliation before retry.",
      runbookSection: "Payment attempt recovery",
      aggregateEvidence: { ambiguousCount: snapshot.paymentAttempts.ambiguousCount },
    }));
  }

  const mismatchAlerts = [
    [
      snapshot.commerceIntegrity.authorizedWithoutOrderCount,
      "payment_authorized_without_order",
      "p1",
      "Authorized flight payments exist without a bound provider order.",
    ],
    [
      snapshot.commerceIntegrity.capturedWithoutOrderCount,
      "payment_captured_without_order",
      "p0",
      "Captured flight payments exist without a bound provider order.",
    ],
    [
      snapshot.commerceIntegrity.orderWithoutTicketCount,
      "order_without_ticket",
      "p1",
      "Confirmed flight orders remain unresolved without ticket documents.",
    ],
    [
      snapshot.commerceIntegrity.ticketWithoutCapturedPaymentCount,
      "ticket_without_captured_payment",
      "p0",
      "Issued flight tickets exist without the expected captured payment.",
    ],
  ] as const;
  for (const [count, code, severity, summary] of mismatchAlerts) {
    if (count > 0) {
      alerts.push(operationalAlert({
        code,
        severity,
        summary,
        runbookSection: "Payment, order, and ticket integrity",
        aggregateEvidence: { unresolvedCount: count },
      }));
    }
  }

  if (snapshot.ticketing.nearestDeadlineAt !== null) {
    const remainingSeconds = secondsUntil(
      nowMilliseconds,
      snapshot.ticketing.nearestDeadlineAt,
    );
    if (remainingSeconds <= 0) {
      alerts.push(operationalAlert({
        code: "ticket_deadline_expired",
        severity: "p0",
        summary: "At least one unresolved flight ticketing deadline has expired.",
        runbookSection: "Ticket deadline protection",
        aggregateEvidence: {
          pendingCount: snapshot.ticketing.pendingCount,
          secondsPastDeadline: Math.abs(remainingSeconds),
        },
      }));
    } else if (remainingSeconds <= policy.ticketDeadlineWarningSeconds) {
      alerts.push(operationalAlert({
        code: "ticket_deadline_at_risk",
        severity: "p1",
        summary: "An unresolved flight ticketing deadline is within the response window.",
        runbookSection: "Ticket deadline protection",
        aggregateEvidence: {
          pendingCount: snapshot.ticketing.pendingCount,
          remainingSeconds,
          thresholdSeconds: policy.ticketDeadlineWarningSeconds,
        },
      }));
    }
  }

  if (!snapshot.duffelBalance.thresholdConfigured) {
    alerts.push(operationalAlert({
      code: "duffel_balance_threshold_unconfigured",
      severity: "p1",
      summary: "The minimum Duffel settlement reserve has not been configured.",
      runbookSection: "Duffel balance protection",
    }));
  } else {
    const checkedAt = snapshot.duffelBalance.checkedAt!;
    const availableMinor = snapshot.duffelBalance.availableMinor!;
    const requiredReserveMinor = snapshot.duffelBalance.requiredReserveMinor!;
    const ageSeconds = secondsSince(nowMilliseconds, checkedAt);
    if (ageSeconds >= policy.duffelBalanceMaxAgeSeconds) {
      alerts.push(operationalAlert({
        code: "duffel_balance_evidence_stale",
        severity: "p1",
        summary: "Duffel balance evidence is stale.",
        runbookSection: "Duffel balance protection",
        aggregateEvidence: {
          ageSeconds,
          thresholdSeconds: policy.duffelBalanceMaxAgeSeconds,
        },
      }));
    }
    if (availableMinor < requiredReserveMinor) {
      alerts.push(operationalAlert({
        code: "duffel_balance_below_threshold",
        severity: "p0",
        summary: "Available Duffel balance is below the configured settlement reserve.",
        runbookSection: "Duffel balance protection",
        aggregateEvidence: {
          currency: snapshot.duffelBalance.currency,
          availableMinor,
          requiredReserveMinor,
        },
      }));
    }
  }

  if (snapshot.refunds.oldestPendingAt !== null) {
    const ageSeconds = secondsSince(
      nowMilliseconds,
      snapshot.refunds.oldestPendingAt,
    );
    if (ageSeconds >= policy.refundPendingMaxAgeSeconds) {
      alerts.push(operationalAlert({
        code: "refund_pending_lag",
        severity: "p1",
        summary: "A flight refund remains pending beyond the reviewed threshold.",
        runbookSection: "Refund and dispute response",
        aggregateEvidence: {
          pendingCount: snapshot.refunds.pendingCount,
          oldestAgeSeconds: ageSeconds,
          thresholdSeconds: policy.refundPendingMaxAgeSeconds,
        },
      }));
    }
  }
  if (snapshot.refunds.failedCount > 0) {
    alerts.push(operationalAlert({
      code: "refund_failed",
      severity: "p1",
      summary: "One or more flight refunds are in a failed state.",
      runbookSection: "Refund and dispute response",
      aggregateEvidence: {
        failedCount: snapshot.refunds.failedCount,
        oldestAgeSeconds: secondsSince(
          nowMilliseconds,
          snapshot.refunds.oldestFailedAt!,
        ),
      },
    }));
  }
  if (snapshot.disputes.unacknowledgedCount > 0) {
    alerts.push(operationalAlert({
      code: "dispute_unacknowledged",
      severity: "p1",
      summary: "A flight-payment dispute has not been acknowledged by an owner.",
      runbookSection: "Refund and dispute response",
      aggregateEvidence: {
        openCount: snapshot.disputes.openCount,
        unacknowledgedCount: snapshot.disputes.unacknowledgedCount,
        oldestAgeSeconds: secondsSince(
          nowMilliseconds,
          snapshot.disputes.oldestUnacknowledgedAt!,
        ),
      },
    }));
  }

  if (snapshot.scheduleChanges.oldestUnacknowledgedAt !== null) {
    const ageSeconds = secondsSince(
      nowMilliseconds,
      snapshot.scheduleChanges.oldestUnacknowledgedAt,
    );
    const exceeded = ageSeconds
      >= policy.scheduleChangeAcknowledgementMaxAgeSeconds;
    alerts.push(operationalAlert({
      code: exceeded
        ? "schedule_change_acknowledgement_lag"
        : "schedule_change_pending_acknowledgement",
      severity: exceeded ? "p1" : "p2",
      summary: exceeded
        ? "A supplier schedule change remains unacknowledged beyond its threshold."
        : "A supplier schedule change is awaiting operator acknowledgement.",
      runbookSection: "Schedule-change response",
      aggregateEvidence: {
        unacknowledgedCount: snapshot.scheduleChanges.unacknowledgedCount,
        oldestAgeSeconds: ageSeconds,
        thresholdSeconds: policy.scheduleChangeAcknowledgementMaxAgeSeconds,
      },
    }));
  }

  if (snapshot.notifications.oldestPendingAt !== null) {
    const ageSeconds = secondsSince(
      nowMilliseconds,
      snapshot.notifications.oldestPendingAt,
    );
    if (ageSeconds >= policy.notificationPendingMaxAgeSeconds) {
      alerts.push(operationalAlert({
        code: "notification_delivery_lag",
        severity: "p1",
        summary: "A flight traveler notification remains pending beyond its threshold.",
        runbookSection: "Traveler notification response",
        aggregateEvidence: {
          pendingCount: snapshot.notifications.pendingCount,
          oldestAgeSeconds: ageSeconds,
          thresholdSeconds: policy.notificationPendingMaxAgeSeconds,
        },
      }));
    }
  }
  if (snapshot.notifications.failedCount > 0) {
    alerts.push(operationalAlert({
      code: "notification_delivery_failed",
      severity: "p1",
      summary: "One or more flight traveler notifications are in a failed state.",
      runbookSection: "Traveler notification response",
      aggregateEvidence: {
        failedCount: snapshot.notifications.failedCount,
        oldestAgeSeconds: secondsSince(
          nowMilliseconds,
          snapshot.notifications.oldestFailedAt!,
        ),
      },
    }));
  }

  return report(evaluatedAt, snapshot.collectedAt, alerts);
}
