import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditPriorityPmsProductionReadiness,
  buildPmsReadiness,
  pmsProviders,
  priorityPmsProviderIds,
} from "@/services/hotel-suppliers";
import type { PriorityPmsLaunchEvidence, PriorityPmsProviderId } from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const [connectionsResult, propertiesResult, credentialsResult, evidenceResult] = await Promise.all([
      admin.from("property_pms_connections").select("id,property_id,provider_id,external_property_code,connection_status,last_validated_at").order("updated_at", { ascending: false }),
      admin.from("properties").select("id,name"),
      admin.from("property_pms_credentials").select("connection_id,updated_at"),
      admin.from("priority_pms_launch_evidence").select("provider_id,vendor_approved,property_mapped,sandbox_validated,updated_at"),
    ]);
    if (connectionsResult.error) throw connectionsResult.error;
    if (propertiesResult.error) throw propertiesResult.error;
    if (credentialsResult.error) throw credentialsResult.error;
    const evidenceTrackingAvailable = !evidenceResult.error;
    if (evidenceResult.error && evidenceResult.error.code !== "42P01") throw evidenceResult.error;

    const propertyNames = new Map((propertiesResult.data ?? []).map((property) => [property.id, property.name]));
    const configured = new Map((credentialsResult.data ?? []).map((credential) => [credential.connection_id, credential.updated_at]));
    const manifests = new Map(pmsProviders.map((provider) => [provider.id, provider]));
    const evidence = Object.fromEntries((evidenceResult.data ?? []).map((item) => [item.provider_id, {
      vendorApproved: item.vendor_approved,
      propertyMapped: item.property_mapped,
      sandboxValidated: item.sandbox_validated,
    }])) as Partial<Record<PriorityPmsProviderId, PriorityPmsLaunchEvidence>>;

    return NextResponse.json(
      {
        providers: buildPmsReadiness(process.env),
        priorityProductionReadiness: auditPriorityPmsProductionReadiness(process.env, evidence),
        evidenceTrackingAvailable,
        connections: (connectionsResult.data ?? []).map((connection) => ({
          ...connection,
          property_name: propertyNames.get(connection.property_id) ?? "Unknown property",
          credential_keys: manifests.get(connection.provider_id)?.requiredConfiguration ?? [],
          credentials_configured: configured.has(connection.id),
          credentials_updated_at: configured.get(connection.id) ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PMS integration readiness failed", error);
    return NextResponse.json(
      { error: "PMS integration readiness could not be loaded." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json() as {
      providerId?: string;
      evidence?: Partial<Record<keyof PriorityPmsLaunchEvidence, unknown>>;
    };
    if (!body.providerId || !priorityPmsProviderIds.includes(body.providerId as PriorityPmsProviderId)) {
      return NextResponse.json({ error: "A supported priority PMS provider is required." }, { status: 400 });
    }
    const patch = body.evidence ?? {};
    const allowedKeys = ["vendorApproved", "propertyMapped", "sandboxValidated"] as const;
    if (Object.keys(patch).length === 0 || Object.keys(patch).some((key) => !allowedKeys.includes(key as typeof allowedKeys[number]))
      || Object.values(patch).some((value) => typeof value !== "boolean")) {
      return NextResponse.json({ error: "Evidence must contain supported boolean launch gates." }, { status: 400 });
    }

    const providerId = body.providerId as PriorityPmsProviderId;
    const admin = createAdminClient();
    const currentResult = await admin.from("priority_pms_launch_evidence")
      .select("vendor_approved,property_mapped,sandbox_validated")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (currentResult.error) {
      if (currentResult.error.code === "42P01") {
        return NextResponse.json({ error: "Apply migration 034 before recording launch evidence." }, { status: 503 });
      }
      throw currentResult.error;
    }

    const current = currentResult.data ?? { vendor_approved: false, property_mapped: false, sandbox_validated: false };
    const next = {
      vendorApproved: patch.vendorApproved as boolean | undefined ?? current.vendor_approved,
      propertyMapped: patch.propertyMapped as boolean | undefined ?? current.property_mapped,
      sandboxValidated: patch.sandboxValidated as boolean | undefined ?? current.sandbox_validated,
    };
    if (!next.vendorApproved) {
      next.propertyMapped = false;
      next.sandboxValidated = false;
    } else if (!next.propertyMapped) {
      next.sandboxValidated = false;
    }
    if (patch.propertyMapped === true && !next.vendorApproved) {
      return NextResponse.json({ error: "Vendor approval must be recorded before property mapping." }, { status: 409 });
    }
    if (patch.sandboxValidated === true && (!next.vendorApproved || !next.propertyMapped)) {
      return NextResponse.json({ error: "Vendor approval and property mapping are required before sandbox validation." }, { status: 409 });
    }

    const updateResult = await admin.from("priority_pms_launch_evidence").upsert({
      provider_id: providerId,
      vendor_approved: next.vendorApproved,
      property_mapped: next.propertyMapped,
      sandbox_validated: next.sandboxValidated,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }).select("provider_id,vendor_approved,property_mapped,sandbox_validated,updated_at").single();
    if (updateResult.error) throw updateResult.error;

    const evidence = {
      vendorApproved: updateResult.data.vendor_approved,
      propertyMapped: updateResult.data.property_mapped,
      sandboxValidated: updateResult.data.sandbox_validated,
    };
    const readiness = auditPriorityPmsProductionReadiness(process.env, { [providerId]: evidence })
      .find((provider) => provider.id === providerId);
    return NextResponse.json({ readiness, updatedAt: updateResult.data.updated_at }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("PMS launch evidence update failed", error);
    return NextResponse.json({ error: "PMS launch evidence could not be updated." }, { status: 503 });
  }
}
