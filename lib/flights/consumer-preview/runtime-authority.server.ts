import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireFlightConsumerPreviewRuntime,
  resolveFlightConsumerPreviewRuntime,
  type FlightConsumerPreviewRuntimeDecision,
} from "./runtime.server";

async function readDatabaseRuntimeAuthority() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_flight_consumer_preview_runtime_authority_v1");
    if (error) return null;
    if (Array.isArray(data)) return data.length === 1 ? data[0] : null;
    return data ?? null;
  } catch {
    return null;
  }
}

export async function getFlightConsumerPreviewRuntimeDecision(): Promise<FlightConsumerPreviewRuntimeDecision> {
  return resolveFlightConsumerPreviewRuntime(process.env, await readDatabaseRuntimeAuthority());
}

export async function getFlightConsumerPreviewPageRuntime() {
  const decision = await getFlightConsumerPreviewRuntimeDecision();
  return Object.freeze({
    enabled: decision.authorized,
    reason: decision.authorized
      ? "Authenticated Duffel and Stripe test-mode Preview is enabled."
      : "The private Consumer Preview gate is closed.",
  });
}

export async function requireFlightConsumerPreviewRequestRuntime() {
  return requireFlightConsumerPreviewRuntime(process.env, await readDatabaseRuntimeAuthority());
}
