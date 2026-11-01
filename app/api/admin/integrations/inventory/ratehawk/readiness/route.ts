import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateRatehawkCertificationReadiness,
  ratehawkCertificationHotelIds,
} from "@/services/hotel-suppliers/ratehawk-certification-readiness";
import { ratehawkCertificationScenarioIds } from "@/services/hotel-suppliers/ratehawk-certification-runner.server";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      headers: noStoreHeaders,
    });
  }

  const admin = createAdminClient();
  const [receiptResult, validationResult] = await Promise.all([
    admin.from("ratehawk_certification_receipts")
      .select("scenario")
      .eq("result", "passed")
      .order("tested_at", { ascending: false }),
    admin.from("inventory_supplier_validation_evidence")
      .select("validation_kind,environment")
      .eq("supplier_id", "ratehawk")
      .eq("result", "passed")
      .order("tested_at", { ascending: false }),
  ]);

  if (receiptResult.error || validationResult.error) {
    return NextResponse.json({ error: "RateHawk production readiness evidence could not be loaded." }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  const scenarios = new Set((receiptResult.data ?? []).map((item) => item.scenario));
  const sandboxValidationKinds = new Set((validationResult.data ?? [])
    .filter((item) => item.environment === "sandbox")
    .map((item) => item.validation_kind));
  const productionSmokeValidated = (validationResult.data ?? []).some(
    (item) => item.environment === "production" && item.validation_kind === "production_smoke",
  );
  const certificationScenariosComplete = ratehawkCertificationScenarioIds.every(
    (scenario) => scenarios.has(scenario),
  );
  const readiness = evaluateRatehawkCertificationReadiness(process.env, {
    mappedHotelIds: certificationScenariosComplete ? ratehawkCertificationHotelIds : [],
    contentImplemented: certificationScenariosComplete,
    searchValidated: sandboxValidationKinds.has("hotel_search"),
    hotelpageImplemented: certificationScenariosComplete,
    prebookValidated: sandboxValidationKinds.has("hotel_prebook"),
    bookingFormValidated: certificationScenariosComplete,
    bookingFinishValidated: certificationScenariosComplete,
    finalStatusValidated: certificationScenariosComplete,
    cancellationValidated: certificationScenariosComplete,
    checklistSubmitted: enabled(process.env.HOTEL_INVENTORY_RATEHAWK_CHECKLIST_SUBMITTED),
    certificationApproved: enabled(process.env.HOTEL_INVENTORY_RATEHAWK_CERTIFICATION_APPROVED),
    productionSmokeValidated,
    liveEnabled: enabled(process.env.HOTEL_INVENTORY_RATEHAWK_LIVE_ENABLED),
  });

  return NextResponse.json({
    readiness,
    evidence: {
      certificationScenariosComplete,
      completedScenarioCount: ratehawkCertificationScenarioIds.filter((scenario) => scenarios.has(scenario)).length,
      requiredScenarioCount: ratehawkCertificationScenarioIds.length,
      searchValidated: sandboxValidationKinds.has("hotel_search"),
      prebookValidated: sandboxValidationKinds.has("hotel_prebook"),
      productionSmokeValidated,
    },
  }, { headers: noStoreHeaders });
}
