import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildAutomationOperationsSnapshot,
  type AutomationOperationsCounts,
  type AutomationOperationsFlags,
} from "../lib/admin/automation-operations";

const route = readFileSync(new URL("../app/api/admin/operations/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/operations/page.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/dashboard/automation-operations-center.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../data/navigation.ts", import.meta.url), "utf8");

const emptyCounts: AutomationOperationsCounts = {
  emailPending: 0,
  emailProcessing: 0,
  emailFailed: 0,
  emailDeadLetters: 0,
  emailWebhookFailures: 0,
  pendingBookings: 0,
  pendingCancellations: 0,
  pendingPartners: 0,
  openSupport: 0,
  stripeProcessing: 0,
  stripeFailures: 0,
  payoutPending: 0,
  payoutFailures: 0,
  pmsTestFailures: 0,
  synxisStarted: 0,
  synxisFailures: 0,
  livePmsConnections: 0,
  liveSynxisConnections: 0,
};

const privatePilot: AutomationOperationsFlags = {
  pilotMode: true,
  publicBookingEnabled: false,
  liveBookingPaymentsEnabled: false,
  liveStripeWebhooksEnabled: false,
  livePartnerPayoutsEnabled: false,
  emailWorkerEnabled: false,
};

describe("Automation Operations Center Phase 1", () => {
  it("authorizes admins before service-role ledger reads and exposes GET only", () => {
    expect(route).toContain('requireRole(["admin"])');
    expect(route.indexOf('requireRole(["admin"])')).toBeLessThan(route.indexOf("createAdminClient()"));
    expect(route).toContain("Promise.all([");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain("export async function PATCH");
    expect(route).not.toContain("export async function DELETE");
  });

  it("reports an idle private pilot as safe and safeguarded", () => {
    const snapshot = buildAutomationOperationsSnapshot(emptyCounts, privatePilot, [], "2026-08-17T12:00:00.000Z");
    expect(snapshot.readOnly).toBe(true);
    expect(snapshot.mode).toBe("private_pilot");
    expect(snapshot.safetyReady).toBe(true);
    expect(snapshot.summary).toMatchObject({
      automationLanes: 6,
      totalQueue: 0,
      failureCount: 0,
      safetyLocksEngaged: 6,
      safetyLockTotal: 6,
    });
    expect(snapshot.lanes.find((lane) => lane.id === "communications")?.status).toBe("safeguarded");
    expect(snapshot.lanes.find((lane) => lane.id === "suppliers")?.status).toBe("safeguarded");
  });

  it("blocks a queued email while its worker safety hold is active", () => {
    const snapshot = buildAutomationOperationsSnapshot({ ...emptyCounts, emailPending: 2 }, privatePilot);
    const communications = snapshot.lanes.find((lane) => lane.id === "communications");
    expect(communications).toMatchObject({ status: "blocked", queueDepth: 2, failures: 0 });
    expect(snapshot.attention).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "queue:communications", severity: "review" }),
    ]));
  });

  it("surfaces ledger failures and safety-lock conflicts without executing actions", () => {
    const snapshot = buildAutomationOperationsSnapshot({
      ...emptyCounts,
      emailDeadLetters: 1,
      stripeFailures: 2,
      payoutFailures: 1,
      synxisFailures: 1,
      liveSynxisConnections: 1,
    }, { ...privatePilot, publicBookingEnabled: true }, [
      { id: "older", lane: "payments", label: "Older", detail: "processed", state: "completed", createdAt: "2026-08-17T10:00:00.000Z" },
      { id: "newer", lane: "suppliers", label: "Newer", detail: "failed", state: "failed", createdAt: "2026-08-17T11:00:00.000Z" },
    ]);

    expect(snapshot.summary.failureCount).toBe(5);
    expect(snapshot.safetyReady).toBe(false);
    expect(snapshot.safetyLocks.find((lock) => lock.id === "public_booking")?.engaged).toBe(false);
    expect(snapshot.lanes.find((lane) => lane.id === "suppliers")?.status).toBe("blocked");
    expect(snapshot.activity.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(snapshot.attention).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "safety:public_booking", severity: "critical" }),
      expect.objectContaining({ id: "failure:payments", severity: "warning" }),
    ]));
  });

  it("adds a clearly read-only operations surface to admin navigation", () => {
    expect(page).toContain("<AutomationOperationsCenter />");
    expect(navigation).toContain('{ href: "/admin/operations", label: "Operations" }');
    expect(component).toContain("Read-only monitoring only");
    expect(component).not.toContain("Run automation");
    expect(component).not.toContain("Retry payment");
  });
});
