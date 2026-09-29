export type AutomationLaneId = "communications" | "bookings" | "partners" | "support" | "payments" | "suppliers";
export type AutomationIncidentSeverity = "review" | "warning" | "critical";
export type AutomationIncidentStatus = "open" | "acknowledged" | "resolved";

export type AutomationRunbook = {
  id: AutomationLaneId;
  label: string;
  purpose: string;
  steps: string[];
  completionChecks: string[];
  prohibitedActions: string[];
};

export type AutomationOperator = {
  id: string;
  name: string;
};

export type AutomationIncidentNote = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type AutomationIncidentEvent = {
  id: string;
  eventType: "created" | "acknowledged" | "assigned" | "unassigned" | "note_added" | "resolved";
  actorName: string;
  summary: string;
  createdAt: string;
};

export type AutomationIncident = {
  id: string;
  title: string;
  lane: AutomationLaneId;
  severity: AutomationIncidentSeverity;
  status: AutomationIncidentStatus;
  sourceReference: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdByName: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: AutomationIncidentNote[];
  events: AutomationIncidentEvent[];
};

export type AutomationWorkflowSnapshot = {
  phase: "Automation Operations Center — Phase 2";
  available: boolean;
  readOnlyAutomation: true;
  migrationRequired: boolean;
  summary: {
    open: number;
    acknowledged: number;
    resolved: number;
    unassigned: number;
  };
  runbooks: AutomationRunbook[];
  operators: AutomationOperator[];
  incidents: AutomationIncident[];
};

const sharedProhibitions = [
  "Do not copy credentials, authorization headers, cookies, card data, bank data, guest details, or provider payloads into an incident.",
  "Do not execute retries, payments, refunds, transfers, payouts, email sends, publication, or supplier traffic from this workspace.",
  "Escalate any external or Production action for separate approval and use the owning source workspace.",
];

export const automationRunbooks: AutomationRunbook[] = [
  {
    id: "communications",
    label: "Transactional communications response",
    purpose: "Triage queued, failed, or suppressed transactional communications without sending or retrying a message.",
    steps: [
      "Confirm the worker flag and private-pilot locks before reviewing the queue.",
      "Review sanitized outbox and delivery-event receipts in Admin Settings.",
      "Identify whether the issue is configuration, suppression, provider delivery, or application state.",
      "Record the finding and owner; request separate approval for any resend or provider change.",
    ],
    completionChecks: ["Owner assigned", "Failure category recorded", "No message sent from the incident workspace"],
    prohibitedActions: sharedProhibitions,
  },
  {
    id: "bookings",
    label: "Booking operations response",
    purpose: "Coordinate booking or cancellation review while preserving inventory and payment controls.",
    steps: [
      "Open the booking or cancellation ledger and confirm the current status.",
      "Verify dates, property state, and private-pilot payment mode without copying guest details.",
      "Assign the appropriate operator and document the decision needed.",
      "Use the booking workspace for any separately approved review decision.",
    ],
    completionChecks: ["Source record reviewed", "Decision owner assigned", "No payment or inventory mutation performed here"],
    prohibitedActions: sharedProhibitions,
  },
  {
    id: "partners",
    label: "Partner onboarding response",
    purpose: "Coordinate independent hotel verification and partner follow-up without approving or publishing a property.",
    steps: [
      "Review the partner application and hotel intake evidence in the partner workspace.",
      "Confirm ownership or management authority still requires independent verification.",
      "Assign an operator and record missing, conflicting, or unverifiable information.",
      "Request separate approval before application approval, invitation, publication, or activation.",
    ],
    completionChecks: ["Authority evidence status recorded", "Follow-up owner assigned", "No property published"],
    prohibitedActions: sharedProhibitions,
  },
  {
    id: "support",
    label: "Support escalation response",
    purpose: "Route customer and partner support issues with an accountable owner and sanitized incident notes.",
    steps: [
      "Review the source support case and classify urgency and affected workflow.",
      "Avoid copying personal, payment, credential, or provider data into the incident.",
      "Acknowledge and assign the incident to the responding operator.",
      "Resolve the source support case separately, then record a short outcome note.",
    ],
    completionChecks: ["Support owner assigned", "Outcome documented", "Sensitive data excluded"],
    prohibitedActions: sharedProhibitions,
  },
  {
    id: "payments",
    label: "Payment reconciliation response",
    purpose: "Investigate Stripe and partner-transfer exceptions without moving money or retrying a financial operation.",
    steps: [
      "Confirm test/live mode and all payment safety locks before inspecting the ledger.",
      "Compare sanitized Stripe event and booking-financial receipts by non-secret reference.",
      "Record the mismatch, current state, and accountable operator.",
      "Use the finance workspace and a separate approval for any refund, transfer, retry, or payout.",
    ],
    completionChecks: ["Mode confirmed", "Ledger mismatch documented", "No financial operation executed here"],
    prohibitedActions: sharedProhibitions,
  },
  {
    id: "suppliers",
    label: "Supplier connectivity response",
    purpose: "Triage PMS and SynXis validation receipts without exposing credentials or activating traffic.",
    steps: [
      "Confirm pilot mode and supplier traffic lock are engaged.",
      "Review sanitized validation, request-journal, and launch-evidence receipts.",
      "Classify the issue as configuration, mapping, certification, transport, or vendor approval.",
      "Assign an owner and request separate approval before any provider test or traffic change.",
    ],
    completionChecks: ["Traffic lock confirmed", "Failure category recorded", "No provider request executed here"],
    prohibitedActions: sharedProhibitions,
  },
];

const sensitiveIncidentPatterns = [
  /\b(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|bearer)\b\s*[:=]/i,
  /\b(?:sk|rk|pk)_(?:live|test)_[a-z0-9]{12,}\b/i,
  /\b\d{13,19}\b/,
];

export function containsSensitiveIncidentContent(value: string) {
  return sensitiveIncidentPatterns.some((pattern) => pattern.test(value));
}

export function unavailableAutomationWorkflow(): AutomationWorkflowSnapshot {
  return {
    phase: "Automation Operations Center — Phase 2",
    available: false,
    readOnlyAutomation: true,
    migrationRequired: true,
    summary: { open: 0, acknowledged: 0, resolved: 0, unassigned: 0 },
    runbooks: automationRunbooks,
    operators: [],
    incidents: [],
  };
}
