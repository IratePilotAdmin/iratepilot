import "server-only";

import { z } from "zod";

const responseSchema = z.object({
  output_text: z.string().trim().min(1).optional(),
  output: z.array(z.object({
    content: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
});

function extractOutputText(payload: z.infer<typeof responseSchema>) {
  if (payload.output_text) return payload.output_text;

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text?.trim())
    .filter((item): item is string => Boolean(item))
    .join("\n\n");

  return text || null;
}

export const travelPlanRequestSchema = z.object({
  message: z.string().trim().min(3).max(2_000),
});

export type OpenAIProviderConfiguration = {
  enabled: boolean;
  model: string;
};

export function getOpenAIProviderConfiguration(
  env: Record<string, string | undefined> = process.env,
): OpenAIProviderConfiguration {
  return {
    enabled: env.OPENAI_PROVIDER_ENABLED === "true" && Boolean(env.OPENAI_API_KEY?.trim()),
    model: env.OPENAI_MODEL?.trim() || "gpt-5.6-luna",
  };
}

export async function createTravelPlan(
  message: string,
  options: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  } = {},
) {
  const env = options.env ?? process.env;
  const configuration = getOpenAIProviderConfiguration(env);
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!configuration.enabled || !apiKey) {
    throw new Error("OPENAI_PROVIDER_DISABLED");
  }

  const response = await (options.fetch ?? fetch)("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: configuration.model,
      instructions: [
        "You are iRatePilot's travel-planning assistant.",
        "Give concise, practical planning guidance for hotels, flights, cars, and vacation homes.",
        "Never claim that rates, availability, reservations, payments, or policies are live or confirmed.",
        "Tell the traveler to verify current inventory and terms in iRatePilot search before booking.",
        "Do not request passport numbers, payment-card details, government identifiers, passwords, or health information.",
      ].join(" "),
      input: message,
      max_output_tokens: 500,
      store: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`OPENAI_REQUEST_FAILED_${response.status}`);
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("OPENAI_RESPONSE_INVALID");
  const outputText = extractOutputText(parsed.data);
  if (!outputText) throw new Error("OPENAI_RESPONSE_INVALID");
  return { message: outputText, model: configuration.model };
}
