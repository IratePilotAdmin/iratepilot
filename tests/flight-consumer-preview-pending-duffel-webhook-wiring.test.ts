import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL(
    "../lib/flights/consumer-preview/complete-order-workflow.server.ts",
    import.meta.url,
  ),
  "utf8",
);

function section(startMarker: string, endMarker: string) {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("Consumer Preview pending Duffel webhook complete-order wiring", () => {
  it("retries local association after terminal recording and again after durable finalization", () => {
    const direct = section(
      "async function createAndFinalizeDuffelOrder(",
      "async function recoverOrResumeDuffelOrder(",
    );
    const terminalValidation = direct.indexOf(
      'recorded.attempt_state !== "succeeded"',
    );
    const postTerminal = direct.indexOf('phase: "post_terminal"');
    const finalization = direct.indexOf("const finalized = await finalizeDuffelOrderResponse");
    const postFinalization = direct.indexOf('phase: "post_finalization"');
    const returned = direct.indexOf("return finalized;", postFinalization);

    expect(terminalValidation).toBeGreaterThan(0);
    expect(postTerminal).toBeGreaterThan(terminalValidation);
    expect(finalization).toBeGreaterThan(postTerminal);
    expect(postFinalization).toBeGreaterThan(finalization);
    expect(returned).toBeGreaterThan(postFinalization);
  });

  it("retries association after succeeded-response crash recovery finalizes the durable order digest", () => {
    const recovery = section(
      "async function recoverOrResumeDuffelOrder(",
      "type FlightConsumerPreviewCompleteOrderIdentity",
    );
    const evidence = recovery.indexOf("loadRecoveredOrderResponse");
    const finalization = recovery.indexOf(
      "const finalized = await finalizeDuffelOrderArtifact",
    );
    const relink = recovery.indexOf('phase: "terminal_response_recovery"');
    const returned = recovery.indexOf("return finalized;", relink);

    expect(evidence).toBeGreaterThan(0);
    expect(finalization).toBeGreaterThan(evidence);
    expect(relink).toBeGreaterThan(finalization);
    expect(returned).toBeGreaterThan(relink);
  });

  it("uses only the bounded fail-open association helper", () => {
    expect(workflow).toContain(
      'from "./pending-duffel-webhook-link.server";',
    );
    expect(workflow).not.toContain(
      '"resolve_flight_consumer_duffel_pending_links_for_attempt_v1"',
    );
  });
});
