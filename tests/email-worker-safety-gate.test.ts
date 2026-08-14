import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyEmailWorkerSummary, isEmailWorkerEnabled } from "../lib/email/worker-gate";

const workerRoute = readFileSync(new URL("../app/api/email/process/route.ts", import.meta.url), "utf8");
const readinessRoute = readFileSync(new URL("../app/api/admin/operational-readiness/route.ts", import.meta.url), "utf8");

describe("email worker safety hold", () => {
  it("requires the exact explicit activation value", () => {
    expect(isEmailWorkerEnabled("true")).toBe(true);
    expect(isEmailWorkerEnabled("false")).toBe(false);
    expect(isEmailWorkerEnabled("TRUE")).toBe(false);
    expect(isEmailWorkerEnabled("")).toBe(false);
    expect(isEmailWorkerEnabled(undefined)).toBe(false);
  });

  it("returns a fresh zeroed summary for disabled invocations", () => {
    const first = emptyEmailWorkerSummary();
    first.processed = 1;
    expect(emptyEmailWorkerSummary()).toEqual({
      processed: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      deadLettered: 0,
    });
  });

  it("authenticates before reporting the hold and exits before external clients are created", () => {
    const authorization = workerRoute.indexOf('request.headers.get("authorization")');
    const safetyHold = workerRoute.indexOf("if (!isEmailWorkerEnabled())");
    const supabaseClient = workerRoute.indexOf("createClient(supabaseUrl");
    const resendClient = workerRoute.indexOf("new Resend(resendApiKey)");
    const claim = workerRoute.indexOf('rpc("claim_transactional_email_job")');

    expect(authorization).toBeGreaterThan(-1);
    expect(authorization).toBeLessThan(safetyHold);
    expect(safetyHold).toBeLessThan(supabaseClient);
    expect(safetyHold).toBeLessThan(resendClient);
    expect(safetyHold).toBeLessThan(claim);
    expect(workerRoute).toContain('"email_worker_disabled"');
    expect(workerRoute).toContain("disabled: true");
  });

  it("marks both queued email and a disabled worker as operational alerts", () => {
    expect(readinessRoute).toContain('metrics.emailBacklog ? ["email_backlog"]');
    expect(readinessRoute).toContain('!metrics.emailWorkerEnabled ? ["email_worker_disabled"]');
    expect(readinessRoute).toContain("emailWorkerEnabled: isEmailWorkerEnabled()");
  });
});
