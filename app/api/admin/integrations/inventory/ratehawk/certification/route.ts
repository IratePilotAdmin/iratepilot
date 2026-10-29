import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyRatehawkCertificationFailure,
  ratehawkCertificationScenarioIds,
  runRatehawkCertificationScenario,
  type RatehawkCertificationScenarioId,
} from "@/services/hotel-suppliers/ratehawk-certification-runner.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const noStoreHeaders = { "Cache-Control": "no-store" };
const confirmationPhrase = "RUN RATEHAWK SANDBOX CERTIFICATION";

function deploymentRevision() {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return revision && /^[a-f0-9]{7,64}$/i.test(revision) ? revision : null;
}

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
    const testedAt = new Date().toISOString();
    const { error } = await createAdminClient()
      .from("ratehawk_certification_receipts")
      .insert({
        scenario: result.scenario,
        result: "passed",
        partner_order_id: result.partnerOrderId,
        final_status: result.finalStatus,
        final_error: result.finalError,
        booking_form_attempts: result.bookingFormAttempts,
        status_attempts: result.statusAttempts,
        cancelled: result.cancelled,
        cancellation_amount: result.cancellationAmount,
        cancellation_currency: result.cancellationCurrency,
        tested_by: auth.user.id,
        tested_at: testedAt,
        deployment_revision: deploymentRevision(),
      });
    if (error) {
      return NextResponse.json({
        result,
        certificationPassed: true,
        evidenceRecorded: false,
        error: "The RateHawk sandbox certification scenario passed, but its evidence could not be saved.",
      }, { status: 503, headers: noStoreHeaders });
    }
    return NextResponse.json({
      result,
      certificationPassed: true,
      evidenceRecorded: true,
      message: "RateHawk sandbox certification scenario completed and its evidence was saved. No production traffic or customer payment was used.",
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("RateHawk sandbox certification scenario failed", error);
    const failure = classifyRatehawkCertificationFailure(error);
    return NextResponse.json({
      error: "The RateHawk sandbox certification scenario could not be completed.",
      failure: {
        scenario: value.scenario,
        ...failure,
      },
    }, { status: 502, headers: noStoreHeaders });
  }
}
