export type AutomationLaneStatus = "healthy" | "attention" | "blocked" | "safeguarded";
export type AutomationActivityState = "completed" | "processing" | "attention" | "failed";

export type AutomationOperationsCounts = {
  emailPending: number;
  emailProcessing: number;
  emailFailed: number;
  emailDeadLetters: number;
  emailWebhookFailures: number;
  pendingBookings: number;
  pendingCancellations: number;
  pendingPartners: number;
  openSupport: number;
  stripeProcessing: number;
  stripeFailures: number;
  payoutPending: number;
  payoutFailures: number;
  pmsTestFailures: number;
  synxisStarted: number;
  synxisFailures: number;
  livePmsConnections: number;
  liveSynxisConnections: number;
};

export type AutomationOperationsFlags = {
  pilotMode: boolean;
  publicBookingEnabled: boolean;
  liveBookingPaymentsEnabled: boolean;
  liveStripeWebhooksEnabled: boolean;
  livePartnerPayoutsEnabled: boolean;
  emailWorkerEnabled: boolean;
};

export type AutomationActivity = {
  id: string;
  lane: "communications" | "payments" | "suppliers";
  label: string;
  detail: string;
  state: AutomationActivityState;
  createdAt: string;
};

export type AutomationLane = {
  id: "communications" | "bookings" | "partners" | "support" | "payments" | "suppliers";
  label: string;
  description: string;
  status: AutomationLaneStatus;
  queueDepth: number;
  failures: number;
  href: string;
  detail: string;
};

export type AutomationSafetyLock = {
  id: string;
  label: string;
  engaged: boolean;
  detail: string;
};

export type AutomationAttentionItem = {
  id: string;
  severity: "review" | "warning" | "critical";
  label: string;
  detail: string;
  href: string;
};

const laneStatus = (queueDepth: number, failures: number): AutomationLaneStatus => {
  if (failures > 0) return "attention";
  if (queueDepth > 0) return "attention";
  return "healthy";
};

export function buildAutomationOperationsSnapshot(
  counts: AutomationOperationsCounts,
  flags: AutomationOperationsFlags,
  activity: AutomationActivity[] = [],
  checkedAt = new Date().toISOString(),
) {
  const liveSupplierConnections = counts.livePmsConnections + counts.liveSynxisConnections;
  const emailQueue = counts.emailPending + counts.emailProcessing;
  const emailFailures = counts.emailFailed + counts.emailDeadLetters + counts.emailWebhookFailures;
  const paymentQueue = counts.stripeProcessing + counts.payoutPending;
  const paymentFailures = counts.stripeFailures + counts.payoutFailures;
  const supplierFailures = counts.pmsTestFailures + counts.synxisFailures;

  const communicationsStatus: AutomationLaneStatus = emailFailures > 0
    ? "attention"
    : !flags.emailWorkerEnabled && emailQueue > 0
      ? "blocked"
      : flags.emailWorkerEnabled
        ? "healthy"
        : "safeguarded";
  const supplierStatus: AutomationLaneStatus = flags.pilotMode && liveSupplierConnections > 0
    ? "blocked"
    : supplierFailures > 0 || counts.synxisStarted > 0
      ? "attention"
      : liveSupplierConnections > 0
        ? "healthy"
        : "safeguarded";

  const lanes: AutomationLane[] = [
    {
      id: "communications",
      label: "Transactional communications",
      description: "Email queue, worker, delivery events, and dead-letter monitoring.",
      status: communicationsStatus,
      queueDepth: emailQueue,
      failures: emailFailures,
      href: "/admin/settings",
      detail: flags.emailWorkerEnabled
        ? "The email worker is enabled; provider and delivery failures remain operator-reviewed."
        : emailQueue > 0
          ? "Queued messages are waiting while the worker safety hold is active."
          : "The worker is intentionally held with no queued messages.",
    },
    {
      id: "bookings",
      label: "Booking operations",
      description: "Private booking requests and cancellation decisions awaiting review.",
      status: laneStatus(counts.pendingBookings + counts.pendingCancellations, 0),
      queueDepth: counts.pendingBookings + counts.pendingCancellations,
      failures: 0,
      href: "/admin/bookings",
      detail: `${counts.pendingBookings} booking requests and ${counts.pendingCancellations} cancellation requests await review.`,
    },
    {
      id: "partners",
      label: "Partner onboarding",
      description: "Hotel and partner applications waiting for independent verification.",
      status: laneStatus(counts.pendingPartners, 0),
      queueDepth: counts.pendingPartners,
      failures: 0,
      href: "/admin/partners",
      detail: `${counts.pendingPartners} pending applications require authority and content review.`,
    },
    {
      id: "support",
      label: "Support routing",
      description: "New and in-progress customer or partner support cases.",
      status: laneStatus(counts.openSupport, 0),
      queueDepth: counts.openSupport,
      failures: 0,
      href: "/admin/support",
      detail: `${counts.openSupport} support cases are open.`,
    },
    {
      id: "payments",
      label: "Payment reconciliation",
      description: "Stripe webhook processing and partner-transfer exception monitoring.",
      status: laneStatus(paymentQueue, paymentFailures),
      queueDepth: paymentQueue,
      failures: paymentFailures,
      href: "/admin/finance",
      detail: `${counts.stripeProcessing} Stripe events and ${counts.payoutPending} partner transfers are pending.`,
    },
    {
      id: "suppliers",
      label: "Supplier connectivity",
      description: "PMS validation and SynXis request receipts without exposing credentials.",
      status: supplierStatus,
      queueDepth: counts.synxisStarted,
      failures: supplierFailures,
      href: "/admin/settings",
      detail: liveSupplierConnections > 0
        ? `${liveSupplierConnections} supplier connections are marked live.`
        : "Live supplier traffic remains disabled.",
    },
  ];

  const safetyLocks: AutomationSafetyLock[] = [
    { id: "pilot_mode", label: "Private pilot mode", engaged: flags.pilotMode, detail: flags.pilotMode ? "Pilot safeguards are active." : "Pilot mode is not active." },
    { id: "public_booking", label: "Public booking lock", engaged: !flags.publicBookingEnabled, detail: flags.publicBookingEnabled ? "Public booking is enabled." : "Public booking is disabled." },
    { id: "live_payments", label: "Live payment lock", engaged: !flags.liveBookingPaymentsEnabled, detail: flags.liveBookingPaymentsEnabled ? "Live booking payments are enabled." : "Live booking payments are disabled." },
    { id: "live_webhooks", label: "Live webhook lock", engaged: !flags.liveStripeWebhooksEnabled, detail: flags.liveStripeWebhooksEnabled ? "Live Stripe webhooks are enabled." : "Live Stripe webhooks are disabled." },
    { id: "live_payouts", label: "Live payout lock", engaged: !flags.livePartnerPayoutsEnabled, detail: flags.livePartnerPayoutsEnabled ? "Live partner payouts are enabled." : "Live partner payouts are disabled." },
    { id: "supplier_traffic", label: "Supplier traffic lock", engaged: liveSupplierConnections === 0, detail: liveSupplierConnections ? `${liveSupplierConnections} live supplier authorizations need review.` : "No supplier connection is authorized for live traffic." },
  ];

  const attention: AutomationAttentionItem[] = [
    ...safetyLocks.filter((item) => !item.engaged).map((item) => ({
      id: `safety:${item.id}`,
      severity: "critical" as const,
      label: `${item.label} needs review`,
      detail: item.detail,
      href: "/admin/settings",
    })),
    ...lanes.filter((lane) => lane.failures > 0).map((lane) => ({
      id: `failure:${lane.id}`,
      severity: "warning" as const,
      label: `${lane.failures} ${lane.label.toLowerCase()} failures`,
      detail: "Inspect the source ledger before approving a retry or external action.",
      href: lane.href,
    })),
    ...lanes.filter((lane) => lane.queueDepth > 0).map((lane) => ({
      id: `queue:${lane.id}`,
      severity: "review" as const,
      label: `${lane.queueDepth} items in ${lane.label.toLowerCase()}`,
      detail: lane.detail,
      href: lane.href,
    })),
  ];

  const totalQueue = lanes.reduce((total, lane) => total + lane.queueDepth, 0);
  const failureCount = lanes.reduce((total, lane) => total + lane.failures, 0);
  const healthyCount = lanes.filter((lane) => lane.status === "healthy").length;
  const safeguardedCount = lanes.filter((lane) => lane.status === "safeguarded").length;

  return {
    phase: "Automation Operations Center — Phase 1",
    mode: flags.pilotMode ? "private_pilot" as const : "commercial_configuration" as const,
    readOnly: true,
    checkedAt,
    summary: {
      automationLanes: lanes.length,
      healthyCount,
      safeguardedCount,
      attentionCount: lanes.length - healthyCount - safeguardedCount,
      totalQueue,
      failureCount,
      safetyLocksEngaged: safetyLocks.filter((item) => item.engaged).length,
      safetyLockTotal: safetyLocks.length,
    },
    safetyReady: safetyLocks.every((item) => item.engaged),
    lanes,
    safetyLocks,
    attention,
    activity: [...activity]
      .filter((item) => !Number.isNaN(Date.parse(item.createdAt)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 12),
  };
}
