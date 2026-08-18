export type AutomationRetryKind =
  | "email_delivery_review"
  | "stripe_event_reconciliation"
  | "supplier_validation_review"
  | "booking_operation_review";

export type AutomationRetryStatus =
  | "pending_approval"
  | "approved"
  | "dry_run_completed"
  | "cancelled";

export type AutomationRetryDefinition = {
  id: AutomationRetryKind;
  label: string;
  purpose: string;
  dryRunCheck: string;
  prohibitedAction: string;
};

export type AutomationRetryApproval = {
  id: string;
  approverId: string;
  approverName: string;
  createdAt: string;
};

export type AutomationRetryReceipt = {
  id: string;
  receiptType: "requested" | "approved" | "approval_quorum_reached" | "cancelled" | "dry_run_validated";
  actorName: string;
  summary: string;
  createdAt: string;
};

export type AutomationRetryRequest = {
  id: string;
  incidentId: string;
  kind: AutomationRetryKind;
  targetReference: string;
  reason: string;
  idempotencyKey: string;
  status: AutomationRetryStatus;
  executionMode: "dry_run_only";
  requestedById: string;
  requestedByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  approvals: AutomationRetryApproval[];
  receipts: AutomationRetryReceipt[];
};

export type AutomationRetrySnapshot = {
  phase: "Automation Operations Center — Phase 3";
  available: boolean;
  migrationRequired: boolean;
  executionMode: "dry_run_only";
  requiredApprovals: 2;
  currentOperatorId: string | null;
  summary: {
    pendingApproval: number;
    approved: number;
    dryRunCompleted: number;
    cancelled: number;
  };
  definitions: AutomationRetryDefinition[];
  requests: AutomationRetryRequest[];
};

export const automationRetryDefinitions: AutomationRetryDefinition[] = [
  {
    id: "email_delivery_review",
    label: "Email delivery review",
    purpose: "Rehearse whether a separately approved transactional-message retry would be safe and idempotent.",
    dryRunCheck: "Validate the incident, sanitized message reference, approval quorum, and idempotency fingerprint.",
    prohibitedAction: "Does not enqueue, send, or resend any message.",
  },
  {
    id: "stripe_event_reconciliation",
    label: "Stripe event reconciliation",
    purpose: "Rehearse reconciliation of a failed or incomplete Stripe event without changing financial state.",
    dryRunCheck: "Validate the incident, sanitized event reference, approval quorum, and idempotency fingerprint.",
    prohibitedAction: "Does not retry a webhook or create a payment, refund, transfer, or payout.",
  },
  {
    id: "supplier_validation_review",
    label: "Supplier validation review",
    purpose: "Rehearse a supplier validation decision while all provider traffic remains disabled.",
    dryRunCheck: "Validate the incident, sanitized validation reference, approval quorum, and idempotency fingerprint.",
    prohibitedAction: "Does not contact a PMS, CRS, SynXis, or other supplier.",
  },
  {
    id: "booking_operation_review",
    label: "Booking operation review",
    purpose: "Rehearse an operator decision for an incomplete booking workflow without changing a reservation.",
    dryRunCheck: "Validate the incident, sanitized booking reference, approval quorum, and idempotency fingerprint.",
    prohibitedAction: "Does not create, confirm, cancel, or modify a booking or inventory.",
  },
];

export function unavailableAutomationRetry(currentOperatorId: string | null = null): AutomationRetrySnapshot {
  return {
    phase: "Automation Operations Center — Phase 3",
    available: false,
    migrationRequired: true,
    executionMode: "dry_run_only",
    requiredApprovals: 2,
    currentOperatorId,
    summary: { pendingApproval: 0, approved: 0, dryRunCompleted: 0, cancelled: 0 },
    definitions: automationRetryDefinitions,
    requests: [],
  };
}
