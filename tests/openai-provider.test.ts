import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let createTravelPlan: typeof import("../lib/ai/openai-provider").createTravelPlan;
let getOpenAIProviderConfiguration: typeof import("../lib/ai/openai-provider").getOpenAIProviderConfiguration;
let travelPlanRequestSchema: typeof import("../lib/ai/openai-provider").travelPlanRequestSchema;

beforeAll(async () => {
  ({ createTravelPlan, getOpenAIProviderConfiguration, travelPlanRequestSchema } = await import("../lib/ai/openai-provider"));
});

describe("OpenAI travel-planning provider", () => {
  it("requires both the server credential and the explicit activation gate", () => {
    expect(getOpenAIProviderConfiguration({ OPENAI_API_KEY: "secret" }).enabled).toBe(false);
    expect(getOpenAIProviderConfiguration({ OPENAI_PROVIDER_ENABLED: "true" }).enabled).toBe(false);
    expect(getOpenAIProviderConfiguration({ OPENAI_API_KEY: "secret", OPENAI_PROVIDER_ENABLED: "true" }).enabled).toBe(true);
  });

  it("validates and bounds traveler input", () => {
    expect(travelPlanRequestSchema.safeParse({ message: "Plan Miami" }).success).toBe(true);
    expect(travelPlanRequestSchema.safeParse({ message: "no" }).success).toBe(false);
    expect(travelPlanRequestSchema.safeParse({ message: "x".repeat(2_001) }).success).toBe(false);
  });

  it("uses the Responses API without storing the response", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: "Consider South Beach and verify live rates before booking.",
        }],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await createTravelPlan("Plan a weekend in Miami", {
      env: {
        OPENAI_API_KEY: "server-only-test-key",
        OPENAI_PROVIDER_ENABLED: "true",
        OPENAI_MODEL: "gpt-5.6-luna",
      },
      fetch: request,
    });

    expect(result).toEqual({
      message: "Consider South Beach and verify live rates before booking.",
      model: "gpt-5.6-luna",
    });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer server-only-test-key" }));
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual(expect.objectContaining({ model: "gpt-5.6-luna", store: false, max_output_tokens: 500 }));
    expect(body.instructions).toContain("Never claim that rates, availability, reservations, payments, or policies are live or confirmed.");
  });

  it("fails closed while the provider gate is disabled", async () => {
    await expect(createTravelPlan("Plan a weekend in Miami", {
      env: { OPENAI_API_KEY: "server-only-test-key", OPENAI_PROVIDER_ENABLED: "false" },
      fetch: vi.fn<typeof fetch>(),
    })).rejects.toThrow("OPENAI_PROVIDER_DISABLED");
  });
});
