import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import {
  ratehawkCertificationScenarioIds,
  runRatehawkCertificationScenario,
  type RatehawkCertificationScenarioId,
} from "@/services/hotel-suppliers/ratehawk-certification-runner.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const noStoreHeaders = { "Cache-Control": "no-store" };
const confirmationPhrase = "RUN RATEHAWK SANDBOX CERTIFICATION";

function isScenarioId(value: unknown): value is RatehawkCertificationScenarioId {
  return typeof value === "string"
    && ratehawkCertificationScenarioIds.includes(value as RatehawkCertificationScenarioId);
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      headers: noStoreHeaders,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid certification request is required." }, {
      status: 400,
      headers: noStoreHeaders,
    });
  }
  const value = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  if (!value || value.confirmation !== confirmationPhrase || !isScenarioId(value.scenario)) {
    return NextResponse.json({ error: "The sandbox certification confirmation is invalid." }, {
      status: 400,
      headers: noStoreHeaders,
    });
  }

  try {
    const result = await runRatehawkCertificationScenario({
      environment: process.env,
      scenarioId: value.scenario,
    });
    return NextResponse.json({
      result,
      message: "RateHawk sandbox certification scenario completed. No production traffic or customer payment was used.",
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("RateHawk sandbox certification scenario failed", error);
    return NextResponse.json({
      error: "The RateHawk sandbox certification scenario could not be completed.",
    }, { status: 502, headers: noStoreHeaders });
  }
}
