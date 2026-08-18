import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  automationRetryDefinitions,
  unavailableAutomationRetry,
} from "../lib/admin/automation-retry";

const migration = readFileSync(
  new URL("../supabase/migrations/202608170065_automation_retry_authorization.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../app/api/admin/operations/route.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/admin/operations/retry-actions.ts", import.meta.url), "utf8");
const component = readFileSync(
  new URL("../components/dashboard/automation-retry-workspace.tsx", import.meta.url),
  "utf8",
);

describe("Automation Operations Center Phase 3", () => {
  it("defines four bounded rehearsal types with no external action", () => {
    expect(automationRetryDefinitions.map((definition) => definition.id)).toEqual([
      "email_delivery_review",
      "stripe_event_reconciliation",
      "supplier_validation_review",
      "booking_operation_review",
    ]);
    for (const definition of automationRetryDefinitions) {
      expect(definition.dryRunCheck.toLowerCase()).toContain("idempotency");
      expect(definition.prohibitedAction.toLowerCase()).toMatch(/does not/);
    }
  });

  it("creates private request, approval, and immutable receipt ledgers", () => {
    expect(migration).toContain("create table if not exists public.automation_retry_requests");
    expect(migration).toContain("create table if not exists public.automation_retry_approvals");
    expect(migration).toContain("create table if not exists public.automation_retry_receipts");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("unique (request_id, approver_id)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("before update or delete on public.automation_retry_approvals");
    expect(migration).toContain("before update or delete on public.automation_retry_receipts");
  });

  it("enforces acknowledged incidents, requester separation, and two distinct approvals", () => {
    expect(migration).toContain("v_incident.status <> 'acknowledged'");
    expect(migration).toContain("v_request.requested_by = v_actor_id");
    expect(migration).toContain("Requesters cannot approve their own request");
    expect(migration).toContain("select count(distinct approver_id) into v_approval_count");
    expect(migration).toContain("if v_approval_count < 2");
    expect(migration).toContain("for update");
  });

  it("hard-codes a no-executor result and contains no outbound adapter", () => {
    expect(migration).toContain("execution_mode = 'dry_run_only'");
    expect(migration).toContain("check (not external_execution_requested)");
    expect(migration).toContain("dry_run_result = 'validated_no_executor'");
    expect(migration).toContain("no executor or external provider was invoked");
    expect(migration).not.toMatch(/net\.http|http_post|pg_net|dblink/i);
    expect(actions).not.toMatch(/stripe\.|resend\.|fetch\(|createAdminClient/);
  });

  it("authenticates every action and derives a deterministic SHA-256 fingerprint", () => {
    expect(actions.match(/requireRole\(\["admin"\]\)/g)).toHaveLength(4);
    expect(actions).toContain('createHash("sha256")');
    expect(actions).toContain("containsSensitiveIncidentContent");
    expect(actions).toContain('rpc("create_automation_retry_request"');
    expect(actions).toContain('rpc("approve_automation_retry_request"');
    expect(actions).toContain('rpc("cancel_automation_retry_request"');
    expect(actions).toContain('rpc("record_automation_retry_dry_run"');
  });

  it("degrades safely before migration 065 and presents rehearsal-only controls", () => {
    expect(unavailableAutomationRetry("admin-id")).toMatchObject({
      available: false,
      migrationRequired: true,
      executionMode: "dry_run_only",
      requiredApprovals: 2,
      currentOperatorId: "admin-id",
    });
    expect(route).toContain("unavailableAutomationRetry(currentOperatorId)");
    expect(route).toContain("retryWorkflowAvailable: retryWorkflow.available");
    expect(component).toContain("Record independent approval");
    expect(component).toContain("Record dry-run validation");
    expect(component).not.toContain(">Execute retry<");
    expect(component).not.toContain(">Send email<");
  });
});
