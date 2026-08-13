import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditPriorityPmsProductionReadiness,
  buildPmsReadiness,
  pmsProviders,
  priorityPmsProviderIds,
  isVerifiedActivationDetail,
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
      admin.from("priority_pms_launch_evidence").select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes,updated_at"),
    ]);
    if (connectionsResult.error) throw connectionsResult.error;
    if (propertiesResult.error) throw propertiesResult.error;
    if (credentialsResult.error) throw credentialsResult.error;
    const evidenceTrackingAvailable = !evidenceResult.error;
    let evidenceRows = evidenceResult.data ?? [];
    if (evidenceResult.error?.code === "42703") {
      const launchEvidenceResult = await admin.from("priority_pms_launch_evidence")
        .select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,updated_at");
      if (!launchEvidenceResult.error) {
        evidenceRows = (launchEvidenceResult.data ?? []).map((item) => ({
          ...item,
          vendor_approval_reference: null,
          approved_environment: null,
          property_code: null,
          support_contact: null,
          verification_notes: null,
        }));
      } else if (launchEvidenceResult.error.code !== "42703") {
        throw launchEvidenceResult.error;
      } else {
      const legacyEvidenceResult = await admin.from("priority_pms_launch_evidence")
        .select("provider_id,vendor_approved,property_mapped,sandbox_validated,updated_at");
      if (legacyEvidenceResult.error) throw legacyEvidenceResult.error;
      evidenceRows = (legacyEvidenceResult.data ?? []).map((item) => ({
        ...item,
        webhook_validated: false,
        production_smoke_validated: false,
        live_enabled: false,
        vendor_approval_reference: null,
        approved_environment: null,
        property_code: null,
        support_contact: null,
        verification_notes: null,
      }));
      }
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
      vendorApprovalReference: item.vendor_approval_reference ?? "",
      approvedEnvironment: item.approved_environment ?? "",
      propertyCode: item.property_code ?? "",
      supportContact: item.support_contact ?? "",
      verificationNotes: item.verification_notes ?? "",
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
      details?: Record<string, unknown>;
    };
    if (!body.providerId || !priorityPmsProviderIds.includes(body.providerId as PriorityPmsProviderId)) {
      return NextResponse.json({ error: "A supported PMS provider is required." }, { status: 400 });
    }
    const patch = body.evidence ?? {};
    const details = body.details ?? {};
    const allowedKeys = ["vendorApproved", "propertyMapped", "sandboxValidated", "webhookValidated", "productionSmokeValidated", "liveEnabled"] as const;
    const allowedDetailKeys = ["vendorApprovalReference", "approvedEnvironment", "propertyCode", "supportContact", "verificationNotes"] as const;
    if ((Object.keys(patch).length === 0 && Object.keys(details).length === 0)
      || Object.keys(patch).some((key) => !allowedKeys.includes(key as typeof allowedKeys[number]))
      || Object.values(patch).some((value) => typeof value !== "boolean")) {
      return NextResponse.json({ error: "Evidence must contain supported boolean launch gates." }, { status: 400 });
    }
    if (Object.keys(details).some((key) => !allowedDetailKeys.includes(key as typeof allowedDetailKeys[number]))
      || Object.values(details).some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "Evidence details must contain supported text fields." }, { status: 400 });
    }
    const detailLimits = { vendorApprovalReference: 500, approvedEnvironment: 200, propertyCode: 200, supportContact: 500, verificationNotes: 4000 } as const;
    if (Object.entries(details).some(([key, value]) => (value as string).trim().length > detailLimits[key as keyof typeof detailLimits])) {
      return NextResponse.json({ error: "One or more evidence details exceed the permitted length." }, { status: 400 });
    }

    const providerId = body.providerId as PriorityPmsProviderId;
    const admin = createAdminClient();
    const currentResult = await admin.from("priority_pms_launch_evidence")
      .select("vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (currentResult.error) {
      if (currentResult.error.code === "42P01" || currentResult.error.code === "42703") {
        return NextResponse.json({ error: "Apply PMS launch-evidence migrations through 038 before recording launch evidence." }, { status: 503 });
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
      vendor_approval_reference: null,
      approved_environment: null,
      property_code: null,
      support_contact: null,
      verification_notes: null,
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
    const nextDetails = {
      vendorApprovalReference: typeof details.vendorApprovalReference === "string" ? details.vendorApprovalReference : current.vendor_approval_reference,
      approvedEnvironment: typeof details.approvedEnvironment === "string" ? details.approvedEnvironment : current.approved_environment,
      propertyCode: typeof details.propertyCode === "string" ? details.propertyCode : current.property_code,
      supportContact: typeof details.supportContact === "string" ? details.supportContact : current.support_contact,
    };
    if (patch.liveEnabled === true && Object.values(nextDetails).some((value) => !isVerifiedActivationDetail(value ?? ""))) {
      return NextResponse.json({ error: "Verified vendor approval, environment, real property code, and support contact details are required before live traffic is enabled." }, { status: 409 });
    }

    const updateResult = await admin.from("priority_pms_launch_evidence").upsert({
      provider_id: providerId,
      vendor_approved: next.vendorApproved,
      property_mapped: next.propertyMapped,
      sandbox_validated: next.sandboxValidated,
      webhook_validated: next.webhookValidated,
      production_smoke_validated: next.productionSmokeValidated,
      live_enabled: next.liveEnabled,
      vendor_approval_reference: typeof details.vendorApprovalReference === "string" ? details.vendorApprovalReference.trim() || null : undefined,
      approved_environment: typeof details.approvedEnvironment === "string" ? details.approvedEnvironment.trim() || null : undefined,
      property_code: typeof details.propertyCode === "string" ? details.propertyCode.trim() || null : undefined,
      support_contact: typeof details.supportContact === "string" ? details.supportContact.trim() || null : undefined,
      verification_notes: typeof details.verificationNotes === "string" ? details.verificationNotes.trim() || null : undefined,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }).select("provider_id,vendor_approved,property_mapped,sandbox_validated,webhook_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact,verification_notes,updated_at").single();
    if (updateResult.error) throw updateResult.error;

    const evidence = {
      vendorApproved: updateResult.data.vendor_approved,
      propertyMapped: updateResult.data.property_mapped,
      sandboxValidated: updateResult.data.sandbox_validated,
      webhookValidated: updateResult.data.webhook_validated,
      productionSmokeValidated: updateResult.data.production_smoke_validated,
      liveEnabled: updateResult.data.live_enabled,
      vendorApprovalReference: updateResult.data.vendor_approval_reference ?? "",
      approvedEnvironment: updateResult.data.approved_environment ?? "",
      propertyCode: updateResult.data.property_code ?? "",
      supportContact: updateResult.data.support_contact ?? "",
      verificationNotes: updateResult.data.verification_notes ?? "",
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

