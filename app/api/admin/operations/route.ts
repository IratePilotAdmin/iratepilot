import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildAutomationOperationsSnapshot,
  type AutomationActivity,
  type AutomationActivityState,
} from "@/lib/admin/automation-operations";
import {
  automationRunbooks,
  unavailableAutomationWorkflow,
  type AutomationIncident,
  type AutomationIncidentEvent,
  type AutomationIncidentNote,
  type AutomationOperator,
  type AutomationWorkflowSnapshot,
} from "@/lib/admin/automation-workflow";
import {
  automationRetryDefinitions,
  unavailableAutomationRetry,
  type AutomationRetryApproval,
  type AutomationRetryReceipt,
  type AutomationRetryRequest,
  type AutomationRetrySnapshot,
} from "@/lib/admin/automation-retry";
import {
  automationSloPolicies,
  unavailableAutomationEscalation,
  type AutomationEscalation,
  type AutomationEscalationEvent,
  type AutomationEscalationSnapshot,
  type AutomationPolicyScan,
  type AutomationProviderHealth,
  type AutomationSloEvaluation,
  type AutomationSloPolicy,
} from "@/lib/admin/automation-escalation";
import {
  emailOutboxReceiptAdapter,
  unavailableAutomationExecutor,
  type AutomationExecutorSnapshot,
  type AutomationSandboxAdapter,
  type AutomationSandboxExecution,
  type AutomationSandboxExecutionEvent,
} from "@/lib/admin/automation-executor";
import { logOperationalEvent, reportOperationalError } from "@/lib/monitoring/operational";

export const dynamic = "force-dynamic";

type QueryResult = { error: unknown; count?: number | null; data?: unknown };
type IncidentRow = {
  id: string;
  title: string;
  lane: AutomationIncident["lane"];
  severity: AutomationIncident["severity"];
  status: AutomationIncident["status"];
  source_reference: string | null;
  assigned_to: string | null;
  created_by: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};
type NoteRow = { id: string; incident_id: string; author_id: string; body: string; created_at: string };
type EventRow = {
  id: string;
  incident_id: string;
  event_type: AutomationIncidentEvent["eventType"];
  actor_id: string;
  actor_name: string;
  summary: string;
  created_at: string;
};
type OperatorRow = { id: string; full_name: string | null };
type RetryRequestRow = {
  id: string;
  incident_id: string;
  retry_kind: AutomationRetryRequest["kind"];
  target_reference: string;
  reason: string;
  idempotency_key: string;
  status: AutomationRetryRequest["status"];
  execution_mode: "dry_run_only";
  requested_by: string;
  requested_by_name: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
};
type RetryApprovalRow = {
  id: string;
  request_id: string;
  approver_id: string;
  approver_name: string;
  created_at: string;
};
type RetryReceiptRow = {
  id: string;
  request_id: string;
  receipt_type: AutomationRetryReceipt["receiptType"];
  actor_name: string;
  summary: string;
  created_at: string;
};
type SloPolicyRow = {
  code: AutomationSloPolicy["code"];
  label: string;
  severity: AutomationSloPolicy["severity"];
  checkpoint: AutomationSloPolicy["checkpoint"];
  warning_minutes: number;
  target_minutes: number;
  enabled: boolean;
};
type PolicyScanRow = {
  id: string;
  scheduled_for: string;
  observed_at: string;
  scanner_mode: "observation_only";
  incident_count: number;
  finding_count: number;
  provider_attention_count: number;
  created_at: string;
};
type SloEvaluationRow = {
  id: string;
  scan_id: string;
  incident_id: string;
  policy_code: AutomationSloEvaluation["policyCode"];
  state: AutomationSloEvaluation["state"];
  elapsed_minutes: number;
  warning_minutes: number;
  target_minutes: number;
  evaluated_at: string;
};
type ProviderHealthRow = {
  id: string;
  scan_id: string;
  provider_lane: AutomationProviderHealth["lane"];
  state: AutomationProviderHealth["state"];
  failure_count: number;
  stalled_count: number;
  observed_at: string;
};
type EscalationRow = {
  id: string;
  incident_id: string;
  policy_code: AutomationEscalation["policyCode"];
  status: AutomationEscalation["status"];
  first_detected_at: string;
  latest_detected_at: string;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
};
type EscalationEventRow = {
  id: string;
  escalation_id: string;
  event_type: AutomationEscalationEvent["eventType"];
  actor_name: string;
  summary: string;
  created_at: string;
};
type SandboxAdapterRow = {
  adapter_code: AutomationSandboxAdapter["code"];
  label: string;
  source_retry_kind: "email_delivery_review";
  execution_mode: "internal_read_only_sandbox";
  enabled: boolean;
  network_access: false;
  external_side_effects: false;
};
type SandboxExecutionRow = {
  id: string;
  retry_request_id: string;
  adapter_code: AutomationSandboxExecution["adapterCode"];
  idempotency_key: string;
  status: AutomationSandboxExecution["status"];
  observed_status: string | null;
  summary: string;
  executed_by_name: string;
  created_at: string;
};
type SandboxExecutionEventRow = {
  id: string;
  execution_id: string;
  event_type: AutomationSandboxExecutionEvent["eventType"];
  actor_name: string;
  summary: string;
  created_at: string;
};

function buildIncidentWorkflow(results: QueryResult[]): AutomationWorkflowSnapshot {
  if (results.some((result) => result.error)) return unavailableAutomationWorkflow();

  const incidentRows = (results[0].data || []) as IncidentRow[];
  const noteRows = (results[1].data || []) as NoteRow[];
  const eventRows = (results[2].data || []) as EventRow[];
  const operatorRows = (results[3].data || []) as OperatorRow[];
  const operatorNames = new Map(operatorRows.map((operator) => [
    operator.id,
    operator.full_name?.trim() || "Administrator",
  ]));
  const operators: AutomationOperator[] = operatorRows.map((operator) => ({
    id: operator.id,
    name: operatorNames.get(operator.id) || "Administrator",
  }));
  const notes = new Map<string, AutomationIncidentNote[]>();
  const events = new Map<string, AutomationIncidentEvent[]>();

  for (const row of noteRows) {
    const note: AutomationIncidentNote = {
      id: row.id,
      authorName: operatorNames.get(row.author_id) || "Administrator",
      body: row.body,
      createdAt: row.created_at,
    };
    notes.set(row.incident_id, [...(notes.get(row.incident_id) || []), note]);
  }
  for (const row of eventRows) {
    const event: AutomationIncidentEvent = {
      id: row.id,
      eventType: row.event_type,
      actorName: row.actor_name,
      summary: row.summary,
      createdAt: row.created_at,
    };
    events.set(row.incident_id, [...(events.get(row.incident_id) || []), event]);
  }

  const incidents: AutomationIncident[] = incidentRows.map((row) => ({
    id: row.id,
    title: row.title,
    lane: row.lane,
    severity: row.severity,
    status: row.status,
    sourceReference: row.source_reference,
    assigneeId: row.assigned_to,
    assigneeName: row.assigned_to ? operatorNames.get(row.assigned_to) || "Administrator" : null,
    createdByName: operatorNames.get(row.created_by) || "Administrator",
    acknowledgedByName: row.acknowledged_by ? operatorNames.get(row.acknowledged_by) || "Administrator" : null,
    acknowledgedAt: row.acknowledged_at,
    resolvedByName: row.resolved_by ? operatorNames.get(row.resolved_by) || "Administrator" : null,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: notes.get(row.id) || [],
    events: events.get(row.id) || [],
  }));

  return {
    phase: "Automation Operations Center — Phase 2",
    available: true,
    readOnlyAutomation: true,
    migrationRequired: false,
    summary: {
      open: incidents.filter((incident) => incident.status === "open").length,
      acknowledged: incidents.filter((incident) => incident.status === "acknowledged").length,
      resolved: incidents.filter((incident) => incident.status === "resolved").length,
      unassigned: incidents.filter((incident) => incident.status !== "resolved" && !incident.assigneeId).length,
    },
    runbooks: automationRunbooks,
    operators,
    incidents,
  };
}

function buildRetryWorkflow(results: QueryResult[], currentOperatorId: string): AutomationRetrySnapshot {
  if (results.some((result) => result.error)) return unavailableAutomationRetry(currentOperatorId);

  const requestRows = (results[0].data || []) as RetryRequestRow[];
  const approvalRows = (results[1].data || []) as RetryApprovalRow[];
  const receiptRows = (results[2].data || []) as RetryReceiptRow[];
  const approvals = new Map<string, AutomationRetryApproval[]>();
  const receipts = new Map<string, AutomationRetryReceipt[]>();

  for (const row of approvalRows) {
    approvals.set(row.request_id, [...(approvals.get(row.request_id) || []), {
      id: row.id,
      approverId: row.approver_id,
      approverName: row.approver_name,
      createdAt: row.created_at,
    }]);
  }
  for (const row of receiptRows) {
    receipts.set(row.request_id, [...(receipts.get(row.request_id) || []), {
      id: row.id,
      receiptType: row.receipt_type,
      actorName: row.actor_name,
      summary: row.summary,
      createdAt: row.created_at,
    }]);
  }

  const requests: AutomationRetryRequest[] = requestRows.map((row) => ({
    id: row.id,
    incidentId: row.incident_id,
    kind: row.retry_kind,
    targetReference: row.target_reference,
    reason: row.reason,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    executionMode: row.execution_mode,
    requestedById: row.requested_by,
    requestedByName: row.requested_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    approvals: approvals.get(row.id) || [],
    receipts: receipts.get(row.id) || [],
  }));

  return {
    phase: "Automation Operations Center — Phase 3",
    available: true,
    migrationRequired: false,
    executionMode: "dry_run_only",
    requiredApprovals: 2,
    currentOperatorId,
    summary: {
      pendingApproval: requests.filter((request) => request.status === "pending_approval").length,
      approved: requests.filter((request) => request.status === "approved").length,
      dryRunCompleted: requests.filter((request) => request.status === "dry_run_completed").length,
      cancelled: requests.filter((request) => request.status === "cancelled").length,
    },
    definitions: automationRetryDefinitions,
    requests,
  };
}

function buildEscalationWorkflow(results: QueryResult[], scannerEnabled: boolean): AutomationEscalationSnapshot {
  if (results.some((result) => result.error)) return unavailableAutomationEscalation(scannerEnabled);

  const policyRows = (results[0].data || []) as SloPolicyRow[];
  const scanRows = (results[1].data || []) as PolicyScanRow[];
  const evaluationRows = (results[2].data || []) as SloEvaluationRow[];
  const providerRows = (results[3].data || []) as ProviderHealthRow[];
  const escalationRows = (results[4].data || []) as EscalationRow[];
  const eventRows = (results[5].data || []) as EscalationEventRow[];
  const latestScanRow = scanRows[0];
  const latestScan: AutomationPolicyScan | null = latestScanRow ? {
    id: latestScanRow.id,
    scheduledFor: latestScanRow.scheduled_for,
    observedAt: latestScanRow.observed_at,
    scannerMode: latestScanRow.scanner_mode,
    incidentCount: latestScanRow.incident_count,
    findingCount: latestScanRow.finding_count,
    providerAttentionCount: latestScanRow.provider_attention_count,
    createdAt: latestScanRow.created_at,
  } : null;
  const policies: AutomationSloPolicy[] = policyRows.length ? policyRows.map((row) => ({
    code: row.code,
    label: row.label,
    severity: row.severity,
    checkpoint: row.checkpoint,
    warningMinutes: row.warning_minutes,
    targetMinutes: row.target_minutes,
    enabled: row.enabled,
  })) : automationSloPolicies;
  const evaluations: AutomationSloEvaluation[] = evaluationRows
    .filter((row) => row.scan_id === latestScan?.id)
    .map((row) => ({
      id: row.id,
      incidentId: row.incident_id,
      policyCode: row.policy_code,
      state: row.state,
      elapsedMinutes: row.elapsed_minutes,
      warningMinutes: row.warning_minutes,
      targetMinutes: row.target_minutes,
      evaluatedAt: row.evaluated_at,
    }));
  const providerHealth: AutomationProviderHealth[] = providerRows
    .filter((row) => row.scan_id === latestScan?.id)
    .map((row) => ({
      id: row.id,
      lane: row.provider_lane,
      state: row.state,
      failureCount: row.failure_count,
      stalledCount: row.stalled_count,
      observedAt: row.observed_at,
    }));
  const events = new Map<string, AutomationEscalationEvent[]>();
  for (const row of eventRows) {
    events.set(row.escalation_id, [...(events.get(row.escalation_id) || []), {
      id: row.id,
      eventType: row.event_type,
      actorName: row.actor_name,
      summary: row.summary,
      createdAt: row.created_at,
    }]);
  }
  const escalations: AutomationEscalation[] = escalationRows.map((row) => ({
    id: row.id,
    incidentId: row.incident_id,
    policyCode: row.policy_code,
    status: row.status,
    firstDetectedAt: row.first_detected_at,
    latestDetectedAt: row.latest_detected_at,
    acknowledgedByName: row.acknowledged_by_name,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    events: events.get(row.id) || [],
  }));

  return {
    phase: "Automation Operations Center — Phase 4",
    available: true,
    migrationRequired: false,
    scannerEnabled,
    scannerMode: "observation_only",
    cronSchedule: "15 8 * * *",
    summary: {
      withinTarget: evaluations.filter((evaluation) => evaluation.state === "within_target").length,
      atRisk: evaluations.filter((evaluation) => evaluation.state === "at_risk").length,
      breached: evaluations.filter((evaluation) => evaluation.state === "breached").length,
      activeEscalations: escalations.filter((escalation) => escalation.status !== "resolved").length,
      providerAttention: providerHealth.filter((provider) => provider.state === "attention").length,
    },
    policies,
    latestScan,
    evaluations,
    providerHealth,
    escalations,
  };
}

function buildExecutorWorkflow(results: QueryResult[], applicationKillSwitchEnabled: boolean): AutomationExecutorSnapshot {
  if (results.some((result) => result.error)) return unavailableAutomationExecutor(applicationKillSwitchEnabled);

  const adapterRow = ((results[0].data || []) as SandboxAdapterRow[])[0];
  if (!adapterRow) return unavailableAutomationExecutor(applicationKillSwitchEnabled);
  const executionRows = (results[1].data || []) as SandboxExecutionRow[];
  const eventRows = (results[2].data || []) as SandboxExecutionEventRow[];
  const events = new Map<string, AutomationSandboxExecutionEvent[]>();
  for (const row of eventRows) {
    events.set(row.execution_id, [...(events.get(row.execution_id) || []), {
      id: row.id,
      eventType: row.event_type,
      actorName: row.actor_name,
      summary: row.summary,
      createdAt: row.created_at,
    }]);
  }
  const adapter: AutomationSandboxAdapter = {
    code: adapterRow.adapter_code,
    label: adapterRow.label,
    sourceRetryKind: adapterRow.source_retry_kind,
    executionMode: adapterRow.execution_mode,
    enabled: adapterRow.enabled,
    networkAccess: adapterRow.network_access,
    externalSideEffects: adapterRow.external_side_effects,
  };
  const executions: AutomationSandboxExecution[] = executionRows.map((row) => ({
    id: row.id,
    retryRequestId: row.retry_request_id,
    adapterCode: row.adapter_code,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    observedStatus: row.observed_status,
    summary: row.summary,
    executedByName: row.executed_by_name,
    createdAt: row.created_at,
    events: events.get(row.id) || [],
  }));
  return {
    phase: "Automation Operations Center — Phase 5",
    available: true,
    migrationRequired: false,
    applicationKillSwitchEnabled,
    databaseKillSwitchEnabled: adapter.enabled,
    effectiveEnabled: applicationKillSwitchEnabled && adapter.enabled,
    executionMode: "internal_read_only_sandbox",
    adapter,
    summary: {
      validated: executions.filter((execution) => execution.status === "validated").length,
      blocked: executions.filter((execution) => execution.status === "blocked").length,
      total: executions.length,
    },
    executions,
  };
}

const emailState = (status: string): AutomationActivityState => {
  if (["failed", "dead_letter"].includes(status)) return "failed";
  if (["pending", "processing"].includes(status)) return "processing";
  return "completed";
};

const ledgerState = (status: string): AutomationActivityState => {
  if (status === "failed") return "failed";
  if (["pending", "processing", "started"].includes(status)) return "processing";
  if (status === "ignored") return "attention";
  return "completed";
};

export async function GET() {
  const startedAt = Date.now();
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const admin = createAdminClient();
    const count = (table: string, column: string, values: Array<string | boolean>) => admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, values);

    const [results, workflowResults, retryResults, escalationResults, executorResults] = await Promise.all([
      Promise.all([
        count("email_outbox", "status", ["pending"]),
        count("email_outbox", "status", ["processing"]),
        count("email_outbox", "status", ["failed"]),
        count("email_outbox", "status", ["dead_letter"]),
        count("email_delivery_events", "processing_status", ["failed"]),
        count("bookings", "status", ["pending"]),
        count("booking_cancellation_requests", "status", ["pending"]),
        count("partner_applications", "status", ["pending"]),
        count("contact_messages", "status", ["new", "in_progress"]),
        count("stripe_financial_events", "processing_status", ["processing"]),
        count("stripe_financial_events", "processing_status", ["failed"]),
        count("booking_financials", "stripe_transfer_status", ["pending"]),
        count("booking_financials", "stripe_transfer_status", ["failed"]),
        count("pms_connection_test_events", "result", ["failed"]),
        count("synxis_request_journal", "status", ["started"]),
        count("synxis_request_journal", "status", ["failed"]),
        count("priority_pms_launch_evidence", "live_enabled", [true]),
        count("synxis_crs_launch_evidence", "live_enabled", [true]),
        admin.from("email_outbox").select("id,status,template_name,updated_at").order("updated_at", { ascending: false }).limit(4),
        admin.from("stripe_financial_events").select("id,event_type,processing_status,updated_at").order("updated_at", { ascending: false }).limit(4),
        admin.from("pms_connection_test_events").select("id,validation_mode,result,detail_code,created_at").order("created_at", { ascending: false }).limit(3),
        admin.from("synxis_request_journal").select("id,operation,traffic_mode,status,started_at,completed_at").order("started_at", { ascending: false }).limit(3),
      ]),
      Promise.all([
        admin.from("automation_incidents")
          .select("id,title,lane,severity,status,source_reference,assigned_to,created_by,acknowledged_by,acknowledged_at,resolved_by,resolved_at,created_at,updated_at")
          .order("updated_at", { ascending: false }).limit(50),
        admin.from("automation_incident_notes")
          .select("id,incident_id,author_id,body,created_at")
          .order("created_at", { ascending: false }).limit(200),
        admin.from("automation_incident_events")
          .select("id,incident_id,event_type,actor_id,actor_name,summary,created_at")
          .order("created_at", { ascending: false }).limit(200),
        admin.from("profiles").select("id,full_name").eq("role", "admin").order("full_name"),
      ]),
      Promise.all([
        admin.from("automation_retry_requests")
          .select("id,incident_id,retry_kind,target_reference,reason,idempotency_key,status,execution_mode,requested_by,requested_by_name,created_at,updated_at,completed_at,cancelled_at")
          .order("updated_at", { ascending: false }).limit(50),
        admin.from("automation_retry_approvals")
          .select("id,request_id,approver_id,approver_name,created_at")
          .order("created_at", { ascending: false }).limit(200),
        admin.from("automation_retry_receipts")
          .select("id,request_id,receipt_type,actor_name,summary,created_at")
          .order("created_at", { ascending: false }).limit(300),
      ]),
      Promise.all([
        admin.from("automation_escalation_policies")
          .select("code,label,severity,checkpoint,warning_minutes,target_minutes,enabled")
          .order("target_minutes"),
        admin.from("automation_policy_scans")
          .select("id,scheduled_for,observed_at,scanner_mode,incident_count,finding_count,provider_attention_count,created_at")
          .order("observed_at", { ascending: false }).limit(10),
        admin.from("automation_slo_evaluations")
          .select("id,scan_id,incident_id,policy_code,state,elapsed_minutes,warning_minutes,target_minutes,evaluated_at")
          .order("evaluated_at", { ascending: false }).limit(500),
        admin.from("automation_provider_health_snapshots")
          .select("id,scan_id,provider_lane,state,failure_count,stalled_count,observed_at")
          .order("observed_at", { ascending: false }).limit(100),
        admin.from("automation_escalations")
          .select("id,incident_id,policy_code,status,first_detected_at,latest_detected_at,acknowledged_by_name,acknowledged_at,resolved_at")
          .order("latest_detected_at", { ascending: false }).limit(100),
        admin.from("automation_escalation_events")
          .select("id,escalation_id,event_type,actor_name,summary,created_at")
          .order("created_at", { ascending: false }).limit(500),
      ]),
      Promise.all([
        admin.from("automation_executor_registry")
          .select("adapter_code,label,source_retry_kind,execution_mode,enabled,network_access,external_side_effects")
          .eq("adapter_code", emailOutboxReceiptAdapter.code).limit(1),
        admin.from("automation_sandbox_executions")
          .select("id,retry_request_id,adapter_code,idempotency_key,status,observed_status,summary,executed_by_name,created_at")
          .order("created_at", { ascending: false }).limit(100),
        admin.from("automation_sandbox_execution_events")
          .select("id,execution_id,event_type,actor_name,summary,created_at")
          .order("created_at", { ascending: false }).limit(300),
      ]),
    ]) as [QueryResult[], QueryResult[], QueryResult[], QueryResult[], QueryResult[]];
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;

    const value = (index: number) => results[index].count || 0;
    const emailRows = (results[18].data || []) as Array<{ id: string; status: string; template_name: string; updated_at: string }>;
    const stripeRows = (results[19].data || []) as Array<{ id: string; event_type: string; processing_status: string; updated_at: string }>;
    const pmsRows = (results[20].data || []) as Array<{ id: string; validation_mode: string; result: string; detail_code: string; created_at: string }>;
    const synxisRows = (results[21].data || []) as Array<{ id: string; operation: string; traffic_mode: string; status: string; started_at: string; completed_at: string | null }>;

    const activity: AutomationActivity[] = [
      ...emailRows.map((row) => ({
        id: `email:${row.id}`,
        lane: "communications" as const,
        label: "Transactional email",
        detail: `${row.template_name.replaceAll("_", " ")} · ${row.status}`,
        state: emailState(row.status),
        createdAt: row.updated_at,
      })),
      ...stripeRows.map((row) => ({
        id: `stripe:${row.id}`,
        lane: "payments" as const,
        label: "Stripe event",
        detail: `${row.event_type} · ${row.processing_status}`,
        state: ledgerState(row.processing_status),
        createdAt: row.updated_at,
      })),
      ...pmsRows.map((row) => ({
        id: `pms:${row.id}`,
        lane: "suppliers" as const,
        label: "PMS validation",
        detail: `${row.validation_mode.replaceAll("_", " ")} · ${row.detail_code}`,
        state: ledgerState(row.result),
        createdAt: row.created_at,
      })),
      ...synxisRows.map((row) => ({
        id: `synxis:${row.id}`,
        lane: "suppliers" as const,
        label: "SynXis request receipt",
        detail: `${row.operation.replaceAll("_", " ")} · ${row.traffic_mode} · ${row.status}`,
        state: ledgerState(row.status),
        createdAt: row.completed_at || row.started_at,
      })),
    ];

    const snapshot = buildAutomationOperationsSnapshot({
      emailPending: value(0),
      emailProcessing: value(1),
      emailFailed: value(2),
      emailDeadLetters: value(3),
      emailWebhookFailures: value(4),
      pendingBookings: value(5),
      pendingCancellations: value(6),
      pendingPartners: value(7),
      openSupport: value(8),
      stripeProcessing: value(9),
      stripeFailures: value(10),
      payoutPending: value(11),
      payoutFailures: value(12),
      pmsTestFailures: value(13),
      synxisStarted: value(14),
      synxisFailures: value(15),
      livePmsConnections: value(16),
      liveSynxisConnections: value(17),
    }, {
      pilotMode: process.env.PILOT_MODE === "true",
      publicBookingEnabled: process.env.NEXT_PUBLIC_PUBLIC_BOOKING === "true",
      liveBookingPaymentsEnabled: process.env.ENABLE_LIVE_BOOKING_PAYMENTS === "true",
      liveStripeWebhooksEnabled: process.env.ENABLE_LIVE_STRIPE_WEBHOOKS === "true",
      livePartnerPayoutsEnabled: process.env.ENABLE_LIVE_PARTNER_PAYOUTS === "true",
      emailWorkerEnabled: process.env.EMAIL_WORKER_ENABLED === "true",
    }, activity);

    const workflow = buildIncidentWorkflow(workflowResults);
    const retryWorkflow = buildRetryWorkflow(retryResults, auth.user.id);
    const escalationWorkflow = buildEscalationWorkflow(
      escalationResults,
      process.env.AUTOMATION_POLICY_SCANNER_ENABLED === "true",
    );
    const executorWorkflow = buildExecutorWorkflow(
      executorResults,
      process.env.AUTOMATION_SANDBOX_EXECUTOR_ENABLED === "true",
    );
    logOperationalEvent(snapshot.summary.attentionCount || snapshot.summary.failureCount ? "warning" : "info", "automation_operations_checked", {
      queueDepth: snapshot.summary.totalQueue,
      failureCount: snapshot.summary.failureCount,
      attentionCount: snapshot.summary.attentionCount,
      incidentWorkflowAvailable: workflow.available,
      retryWorkflowAvailable: retryWorkflow.available,
      escalationWorkflowAvailable: escalationWorkflow.available,
      policyScannerEnabled: escalationWorkflow.scannerEnabled,
      executorWorkflowAvailable: executorWorkflow.available,
      sandboxExecutorEnabled: executorWorkflow.effectiveEnabled,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { ...snapshot, workflow, retryWorkflow, escalationWorkflow, executorWorkflow },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    await reportOperationalError("automation_operations_check_failed", error, { durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: "Automation operations could not be loaded." }, { status: 503 });
  }
}
