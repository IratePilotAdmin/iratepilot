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
      admin.from("priority_pms_launch_evidence").select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,updated_at"),
    ]);
    if (connectionsResult.error) throw connectionsResult.error;
    if (propertiesResult.error) throw propertiesResult.error;
    if (credentialsResult.error) throw credentialsResult.error;
    const evidenceTrackingAvailable = !evidenceResult.error;
    let evidenceRows = evidenceResult.data ?? [];
    if (evidenceResult.error?.code === "42703") {
      const legacyEvidenceResult = await admin.from("priority_pms_launch_evidence")
        .select("provider_id,vendor_approved,property_mapped,sandbox_validated,updated_at");
      if (legacyEvidenceResult.error) throw legacyEvidenceResult.error;
      evidenceRows = (legacyEvidenceResult.data ?? []).map((item) => ({
        ...item,
        webhook_validated: false,
        production_smoke_validated: false,
        live_enabled: false,
      }));
    } else if (evidenceResult.error && evidenceResult.error.code !== "42P01") {
      throw evidenceResult.error;
    }

    const propertyNames = new Map((propertiesResult.data ?? []).map((property) => [property.id, property.name]));
    const configured = new Map((credentialsResult.data ?? []).map((credential) => [credential.connection_id, credential.updated_at]));
    const manifests = new Map(pmsProviders.map((provider) => [provider.id, provider]));
    const evidence = Object.fromEntries(evidenceRows.map((item) => [item.provider_id, {
      vendorApproved: item.vendor_approved,
      propertyMapped: item.property_mapped,
      sandboxValidated: item.sandbox_validated,
      webhookValidated: item.webhook_validated,
      productionSmokeValidated: item.production_smoke_validated,
      liveEnabled: item.live_enabled,
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
    const allowedKeys = ["vendorApproved", "propertyMapped", "sandboxValidated", "webhookValidated", "productionSmokeValidated", "liveEnabled"] as const;
    if (Object.keys(patch).length === 0 || Object.keys(patch).some((key) => !allowedKeys.includes(key as typeof allowedKeys[number]))
      || Object.values(patch).some((value) => typeof value !== "boolean")) {
      return NextResponse.json({ error: "Evidence must contain supported boolean launch gates." }, { status: 400 });
    }

    const providerId = body.providerId as PriorityPmsProviderId;
    const admin = createAdminClient();
    const currentResult = await admin.from("priority_pms_launch_evidence")
      .select("vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (currentResult.error) {
      if (currentResult.error.code === "42P01" || currentResult.error.code === "42703") {
        return NextResponse.json({ error: "Apply migrations 034 and 035 before recording launch evidence." }, { status: 503 });
      }
      throw currentResult.error;
    }

    const current = currentResult.data ?? {
      vendor_approved: false,
      property_mapped: false,
      sandbox_validated: false,
      webhook_validated: false,
      production_smoke_validated: false,
      live_enabled: false,
    };
    const next = {
      vendorApproved: patch.vendorApproved as boolean | undefined ?? current.vendor_approved,
      propertyMapped: patch.propertyMapped as boolean | undefined ?? current.property_mapped,
      sandboxValidated: patch.sandboxValidated as boolean | undefined ?? current.sandbox_validated,
      webhookValidated: patch.webhookValidated as boolean | undefined ?? current.webhook_validated,
      productionSmokeValidated: patch.productionSmokeValidated as boolean | undefined ?? current.production_smoke_validated,
      liveEnabled: patch.liveEnabled as boolean | undefined ?? current.live_enabled,
    };
    if (!next.vendorApproved) {
      next.propertyMapped = false;
      next.sandboxValidated = false;
      next.webhookValidated = false;
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.propertyMapped) {
      next.sandboxValidated = false;
      next.webhookValidated = false;
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.sandboxValidated) {
      next.webhookValidated = false;
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.webhookValidated) {
      next.productionSmokeValidated = false;
      next.liveEnabled = false;
    } else if (!next.productionSmokeValidated) {
      next.liveEnabled = false;
    }
    if (patch.propertyMapped === true && !next.vendorApproved) {
      return NextResponse.json({ error: "Vendor approval must be recorded before property mapping." }, { status: 409 });
    }
    if (patch.sandboxValidated === true && (!next.vendorApproved || !next.propertyMapped)) {
      return NextResponse.json({ error: "Vendor approval and property mapping are required before sandbox validation." }, { status: 409 });
    }
    if (patch.webhookValidated === true && !next.sandboxValidated) {
      return NextResponse.json({ error: "Sandbox validation is required before webhook validation." }, { status: 409 });
    }
    if (patch.productionSmokeValidated === true && !next.webhookValidated) {
      return NextResponse.json({ error: "Webhook validation is required before the production smoke test." }, { status: 409 });
    }
    if (patch.liveEnabled === true && !next.productionSmokeValidated) {
      return NextResponse.json({ error: "The production smoke test must pass before live traffic is enabled." }, { status: 409 });
    }

    const updateResult = await admin.from("priority_pms_launch_evidence").upsert({
      provider_id: providerId,
      vendor_approved: next.vendorApproved,
      property_mapped: next.propertyMapped,
      sandbox_validated: next.sandboxValidated,
      webhook_validated: next.webhookValidated,
      production_smoke_validated: next.productionSmokeValidated,
      live_enabled: next.liveEnabled,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }).select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,updated_at").single();
    if (updateResult.error) throw updateResult.error;

    const evidence = {
      vendorApproved: updateResult.data.vendor_approved,
      propertyMapped: updateResult.data.property_mapped,
      sandboxValidated: updateResult.data.sandbox_validated,
      webhookValidated: updateResult.data.webhook_validated,
      productionSmokeValidated: updateResult.data.production_smoke_validated,
      liveEnabled: updateResult.data.live_enabled,
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
