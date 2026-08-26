import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { requestFlightConsumerPreviewAuthoritativeCompletion } from "../components/flights/consumer-preview/authoritative-completion-recovery";

const orderId = "22222222-2222-4222-8222-222222222222";

describe("Flight Consumer Preview authoritative recovery client", () => {
  it("posts no PaymentIntent or browser idempotency material and refreshes the clean receipt", async () => {
    const post = vi.fn(async (url: string, init: RequestInit) => {
      void url;
      void init;
      return { ok: true };
    });
    const replace = vi.fn();
    const refresh = vi.fn();
    await expect(requestFlightConsumerPreviewAuthoritativeCompletion({
      orderId,
      post,
      replace,
      refresh,
    })).resolves.toBe("requested");
    expect(post).toHaveBeenCalledWith(
      `/api/flights/preview/orders/${orderId}/resume`,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    const init = post.mock.calls[0]![1];
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
    expect(JSON.stringify(init)).not.toMatch(/payment_intent|client_secret|idempotency/i);
    expect(replace).toHaveBeenCalledWith(`/flights/preview/confirmation/${orderId}`);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("fails closed generically and ignores invalid order identities", async () => {
    const rejected = vi.fn(async (url: string, init: RequestInit) => {
      void url;
      void init;
      return { ok: false };
    });
    await expect(requestFlightConsumerPreviewAuthoritativeCompletion({
      orderId,
      post: rejected,
      replace: vi.fn(),
      refresh: vi.fn(),
    })).resolves.toBe("review");
    const post = vi.fn();
    await expect(requestFlightConsumerPreviewAuthoritativeCompletion({
      orderId: "bad",
      post,
      replace: vi.fn(),
      refresh: vi.fn(),
    })).resolves.toBe("ignored");
    expect(post).not.toHaveBeenCalled();
  });
});
