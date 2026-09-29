export type AutomationSloPolicyCode =
  | "critical_acknowledgement"
  | "warning_acknowledgement"
  | "review_acknowledgement"
  | "critical_resolution"
  | "warning_resolution"
  | "review_resolution";

export type AutomationSloCheckpoint = "acknowledgement" | "resolution";
export type AutomationSloState = "within_target" | "at_risk" | "breached";
export type AutomationProviderLane = "communications" | "payments" | "pms" | "synxis";
export type AutomationEscalationStatus = "open" | "acknowledged" | "resolved";

export type AutomationSloPolicy = {
  code: AutomationSloPolicyCode;
  label: string;
  severity: "review" | "warning" | "critical";
  checkpoint: AutomationSloCheckpoint;
  warningMinutes: number;
  targetMinutes: number;
  enabled: boolean;
};

export type AutomationPolicyScan = {
  id: string;
  scheduledFor: string;
  observedAt: string;
  scannerMode: "observation_only";
  incidentCount: number;
  findingCount: number;
  providerAttentionCount: number;
  createdAt: string;
};

export type AutomationSloEvaluation = {
  id: string;
  incidentId: string;
  policyCode: AutomationSloPolicyCode;
  state: AutomationSloState;
  elapsedMinutes: number;
  warningMinutes: number;
  targetMinutes: number;
  evaluatedAt: string;
};

export type AutomationProviderHealth = {
  id: string;
  lane: AutomationProviderLane;
  state: "healthy" | "attention";
  failureCount: number;
  stalledCount: number;
  observedAt: string;
};

export type AutomationEscalationEvent = {
  id: string;
  eventType: "detected" | "acknowledged" | "resolved";
  actorName: string;
  summary: string;
  createdAt: string;
};

export type AutomationEscalation = {
  id: string;
  incidentId: string;
  policyCode: AutomationSloPolicyCode;
  status: AutomationEscalationStatus;
  firstDetectedAt: string;
  latestDetectedAt: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  events: AutomationEscalationEvent[];
};

export type AutomationEscalationSnapshot = {
  phase: "Automation Operations Center — Phase 4";
  available: boolean;
  migrationRequired: boolean;
  scannerEnabled: boolean;
  scannerMode: "observation_only";
  cronSchedule: "15 8 * * *";
  summary: {
    withinTarget: number;
    atRisk: number;
    breached: number;
    activeEscalations: number;
    providerAttention: number;
  };
  policies: AutomationSloPolicy[];
  latestScan: AutomationPolicyScan | null;
  evaluations: AutomationSloEvaluation[];
  providerHealth: AutomationProviderHealth[];
  escalations: AutomationEscalation[];
};

export const automationSloPolicies: AutomationSloPolicy[] = [
  { code: "critical_acknowledgement", label: "Critical acknowledgment", severity: "critical", checkpoint: "acknowledgement", warningMinutes: 10, targetMinutes: 15, enabled: true },
  { code: "warning_acknowledgement", label: "Warning acknowledgment", severity: "warning", checkpoint: "acknowledgement", warningMinutes: 45, targetMinutes: 60, enabled: true },
  { code: "review_acknowledgement", label: "Review acknowledgment", severity: "review", checkpoint: "acknowledgement", warningMinutes: 180, targetMinutes: 240, enabled: true },
  { code: "critical_resolution", label: "Critical resolution", severity: "critical", checkpoint: "resolution", warningMinutes: 90, targetMinutes: 120, enabled: true },
  { code: "warning_resolution", label: "Warning resolution", severity: "warning", checkpoint: "resolution", warningMinutes: 360, targetMinutes: 480, enabled: true },
  { code: "review_resolution", label: "Review resolution", severity: "review", checkpoint: "resolution", warningMinutes: 1080, targetMinutes: 1440, enabled: true },
];

export function unavailableAutomationEscalation(scannerEnabled = false): AutomationEscalationSnapshot {
  return {
    phase: "Automation Operations Center — Phase 4",
    available: false,
    migrationRequired: true,
    scannerEnabled,
    scannerMode: "observation_only",
    cronSchedule: "15 8 * * *",
    summary: { withinTarget: 0, atRisk: 0, breached: 0, activeEscalations: 0, providerAttention: 0 },
    policies: automationSloPolicies,
    latestScan: null,
    evaluations: [],
    providerHealth: [],
    escalations: [],
  };
}
