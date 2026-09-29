import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: state.rpc }),
}));

import {
  resolveFlightConsumerPreviewPendingDuffelWebhookLinks,
} from "../lib/flights/consumer-preview/pending-duffel-webhook-link.server";

const attemptId = "00000000-0000-4000-8000-000000000001";

describe("Consumer Preview bounded pending Duffel webhook linkage", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ data: [], error: null });
  });

  it.each([
    "post_terminal",
    "post_finalization",
    "terminal_response_recovery",
  ] as const)("runs the bounded local-only resolver at %s", async (phase) => {
    await expect(resolveFlightConsumerPreviewPendingDuffelWebhookLinks({
      attemptId,
      phase,
    })).resolves.toBeUndefined();

    expect(state.rpc).toHaveBeenCalledWith(
      "resolve_flight_consumer_duffel_pending_links_for_attempt_v1",
      {
        p_attempt_id: attemptId,
        p_expected_terminal_revision: 2,
        p_max_links: 8,
      },
    );
  });

  it("fails open with only redacted phase/category logging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.rpc.mockResolvedValue({ data: null, error: { message: "provider secret" } });

    await expect(resolveFlightConsumerPreviewPendingDuffelWebhookLinks({
      attemptId,
      phase: "terminal_response_recovery",
    })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      "[flight-consumer-preview:pending-webhook-link] resolution deferred",
      {
        phase: "terminal_response_recovery",
        category: "local_cas_unavailable",
      },
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("provider secret");
    expect(JSON.stringify(warn.mock.calls)).not.toContain(attemptId);
    warn.mockRestore();
  });
});
