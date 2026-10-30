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

function isFinalStatus(value: unknown): value is "confirmed" | "failed" | "timed_out" {
  return value === "confirmed" || value === "failed" || value === "timed_out";
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      headers: noStoreHeaders,
    });
  }

  const { data, error } = await createAdminClient()
    .from("ratehawk_certification_receipts")
    .select("scenario, partner_order_id, final_status, final_error, booking_form_attempts, status_attempts, cancelled, cancellation_amount, cancellation_currency, tested_at")
    .eq("result", "passed")
    .order("tested_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "RateHawk certification evidence could not be loaded." }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  const latestByScenario = new Map<RatehawkCertificationScenarioId, {
    scenario: RatehawkCertificationScenarioId;
    partnerOrderId: string;
    finalStatus: "confirmed" | "failed" | "timed_out";
    finalError: string | null;
    bookingFormAttempts: number;
    statusAttempts: number;
    cancelled: boolean;
    cancellationAmount: string | null;
    cancellationCurrency: string | null;
  }>();

  for (const row of data ?? []) {
    if (!isScenarioId(row.scenario) || latestByScenario.has(row.scenario) || !isFinalStatus(row.final_status)) continue;
    latestByScenario.set(row.scenario, {
      scenario: row.scenario,
      partnerOrderId: row.partner_order_id,
      finalStatus: row.final_status,
      finalError: row.final_error,
      bookingFormAttempts: row.booking_form_attempts,
      statusAttempts: row.status_attempts,
      cancelled: row.cancelled,
      cancellationAmount: row.cancellation_amount,
      cancellationCurrency: row.cancellation_currency,
    });
  }

  return NextResponse.json({
    results: ratehawkCertificationScenarioIds
      .map((scenario) => latestByScenario.get(scenario))
      .filter((result) => result !== undefined),
  }, { headers: noStoreHeaders });
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
