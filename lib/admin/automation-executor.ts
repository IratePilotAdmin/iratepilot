export type AutomationSandboxAdapterCode = "email_outbox_receipt_check";
export type AutomationSandboxExecutionStatus = "validated" | "blocked";

export type AutomationSandboxAdapter = {
  code: AutomationSandboxAdapterCode;
  label: string;
  sourceRetryKind: "email_delivery_review";
  executionMode: "internal_read_only_sandbox";
  enabled: boolean;
  networkAccess: false;
  externalSideEffects: false;
};

export type AutomationSandboxExecutionEvent = {
  id: string;
  eventType: "validated" | "blocked";
  actorName: string;
  summary: string;
  createdAt: string;
};

export type AutomationSandboxExecution = {
  id: string;
  retryRequestId: string;
  adapterCode: AutomationSandboxAdapterCode;
  idempotencyKey: string;
  status: AutomationSandboxExecutionStatus;
  observedStatus: string | null;
  summary: string;
  executedByName: string;
  createdAt: string;
  events: AutomationSandboxExecutionEvent[];
};

export type AutomationExecutorSnapshot = {
  phase: "Automation Operations Center — Phase 5";
  available: boolean;
  migrationRequired: boolean;
  applicationKillSwitchEnabled: boolean;
  databaseKillSwitchEnabled: boolean;
  effectiveEnabled: boolean;
  executionMode: "internal_read_only_sandbox";
  adapter: AutomationSandboxAdapter;
  summary: {
    validated: number;
    blocked: number;
    total: number;
  };
  executions: AutomationSandboxExecution[];
};

export const emailOutboxReceiptAdapter: AutomationSandboxAdapter = {
  code: "email_outbox_receipt_check",
  label: "Email outbox receipt check",
  sourceRetryKind: "email_delivery_review",
  executionMode: "internal_read_only_sandbox",
  enabled: false,
  networkAccess: false,
  externalSideEffects: false,
};

export function unavailableAutomationExecutor(applicationKillSwitchEnabled = false): AutomationExecutorSnapshot {
  return {
    phase: "Automation Operations Center — Phase 5",
    available: false,
    migrationRequired: true,
    applicationKillSwitchEnabled,
    databaseKillSwitchEnabled: false,
    effectiveEnabled: false,
    executionMode: "internal_read_only_sandbox",
    adapter: emailOutboxReceiptAdapter,
    summary: { validated: 0, blocked: 0, total: 0 },
    executions: [],
  };
}
