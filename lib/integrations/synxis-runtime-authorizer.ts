import { createAdminClient } from "../supabase/admin";
import {
  assertSynxisTrafficAuthorized,
  type SynxisRuntimeEvidence,
  type SynxisTrafficMode,
} from "../../services/hotel-suppliers/synxis/runtime-gate";
import { buildVerifiedSynxisGates } from "../../services/hotel-suppliers/synxis";

export type SynxisRuntimeEvidenceReader = () => Promise<SynxisRuntimeEvidence | null>;

type PersistedSynxisEvidence = {
  vendor_approved?: boolean | null;
  certification_environment_approved?: boolean | null;
  property_mapped?: boolean | null;
  sandbox_validated?: boolean | null;
  production_smoke_validated?: boolean | null;
  live_enabled?: boolean | null;
  vendor_approval_reference?: string | null;
  approved_environment?: string | null;
  property_code?: string | null;
  support_contact?: string | null;
};

export function buildVerifiedSynxisRuntimeEvidence(
  environment: Record<string, string | undefined>,
  row: PersistedSynxisEvidence,
): SynxisRuntimeEvidence {
  const verifiedGates = buildVerifiedSynxisGates(environment, {
    vendorApproved: row.vendor_approved === true,
    certificationEnvironmentApproved: row.certification_environment_approved === true,
    propertyMapped: row.property_mapped === true,
    sandboxValidated: row.sandbox_validated === true,
    productionSmokeValidated: row.production_smoke_validated === true,
    vendorApprovalReference: row.vendor_approval_reference ?? "",
    approvedEnvironment: row.approved_environment ?? "",
    propertyCode: row.property_code ?? "",
    supportContact: row.support_contact ?? "",
  });
  return {
    ...verifiedGates,
    liveEnabled: verifiedGates.productionSmokeValidated && row.live_enabled === true,
  };
}

async function readPersistedEvidence(): Promise<SynxisRuntimeEvidence | null> {
  const result = await createAdminClient()
    .from("synxis_crs_launch_evidence")
    .select("vendor_approved,certification_environment_approved,property_mapped,sandbox_validated,production_smoke_validated,live_enabled,vendor_approval_reference,approved_environment,property_code,support_contact")
    .eq("provider_id", "sabre-synxis")
    .maybeSingle();
  if (result.error) {
    throw new Error("SynXis traffic is blocked because launch evidence could not be verified");
  }
  if (!result.data) return null;
  return buildVerifiedSynxisRuntimeEvidence(process.env, result.data);
}

export function createSynxisRuntimeAuthorizer(
  readEvidence: SynxisRuntimeEvidenceReader = readPersistedEvidence,
) {
  return async (mode: SynxisTrafficMode) => {
    let evidence: SynxisRuntimeEvidence | null;
    try {
      evidence = await readEvidence();
    } catch {
      throw new Error("SynXis traffic is blocked because launch evidence could not be verified");
    }
    assertSynxisTrafficAuthorized(evidence, mode);
  };
}
