import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditPriorityPmsProductionReadiness,
  buildPmsReadiness,
  pmsProviders,
} from "@/services/hotel-suppliers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["admin"]);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const [connectionsResult, propertiesResult, credentialsResult] = await Promise.all([
      admin.from("property_pms_connections").select("id,property_id,provider_id,external_property_code,connection_status,last_validated_at").order("updated_at", { ascending: false }),
      admin.from("properties").select("id,name"),
      admin.from("property_pms_credentials").select("connection_id,updated_at"),
    ]);
    if (connectionsResult.error) throw connectionsResult.error;
    if (propertiesResult.error) throw propertiesResult.error;
    if (credentialsResult.error) throw credentialsResult.error;

    const propertyNames = new Map((propertiesResult.data ?? []).map((property) => [property.id, property.name]));
    const configured = new Map((credentialsResult.data ?? []).map((credential) => [credential.connection_id, credential.updated_at]));
    const manifests = new Map(pmsProviders.map((provider) => [provider.id, provider]));

    return NextResponse.json(
      {
        providers: buildPmsReadiness(process.env),
        priorityProductionReadiness: auditPriorityPmsProductionReadiness(process.env),
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
