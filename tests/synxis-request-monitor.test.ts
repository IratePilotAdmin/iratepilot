import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSynxisRequestMonitor,
  type SynxisRequestJournalRow,
} from "../lib/integrations/synxis-request-monitor";

const route = readFileSync(
  new URL("../app/api/admin/integrations/crs/synxis/route.ts", import.meta.url),
  "utf8",
);
const dashboard = readFileSync(
  new URL("../components/dashboard/synxis-crs-readiness.tsx", import.meta.url),
  "utf8",
);

const row = (overrides: Partial<SynxisRequestJournalRow>): SynxisRequestJournalRow => ({
  id: "receipt-1",
  request_id: "IRP-CERT-1",
  attempt_number: 1,
  operation: "rate_push",
  traffic_mode: "certification",
  status: "succeeded",
  http_status: 200,
  started_at: "2026-08-13T20:00:00.000Z",
  completed_at: "2026-08-13T20:00:00.250Z",
  ...overrides,
});

describe("SynXis request monitoring", () => {
  it("summarizes status, latency, and attempts without payload data", () => {
    const monitor = buildSynxisRequestMonitor([
      row({}),
      row({ id: "receipt-2", request_id: "IRP-CERT-2", status: "failed", http_status: 503 }),
    ], Date.parse("2026-08-13T20:01:00.000Z"));
    expect(monitor.summary).toEqual({ total: 2, succeeded: 1, failed: 1, inFlight: 0, stale: 0 });
    expect(monitor.requests[0].durationMs).toBe(250);
    expect(monitor.requests[0]).not.toHaveProperty("body");
    expect(monitor.requests[0]).not.toHaveProperty("credentials");
  });

  it("flags started receipts after five minutes for manual reconciliation", () => {
    const monitor = buildSynxisRequestMonitor([
      row({ status: "started", http_status: null, completed_at: null }),
    ], Date.parse("2026-08-13T20:05:00.000Z"));
    expect(monitor.summary).toMatchObject({ inFlight: 1, stale: 1 });
    expect(monitor.requests[0].stale).toBe(true);
  });

  it("loads the latest 50 receipts in parallel and degrades before migration 042", () => {
    expect(route).toContain('from("synxis_request_journal")');
    expect(route).toContain("requestLimit = 50");
    expect(route).toContain("loadRequestMonitor(admin)");
    expect(route).toContain('result.error?.code === "42P01"');
    expect(route).toContain("Promise.all([");
  });

  it("renders private operational metrics and stale warnings", () => {
    expect(dashboard).toContain("SynXis request monitor");
    expect(dashboard).toContain("Stale over 5 min");
    expect(dashboard).toContain("Verify the vendor outcome before retrying.");
    expect(dashboard).toContain("SOAP payloads and credentials are never included.");
  });
});
