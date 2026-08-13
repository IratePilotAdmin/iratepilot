import { createAdminClient } from "../supabase/admin";
import {
  assertSynxisTrafficAuthorized,
  type SynxisRuntimeEvidence,
  type SynxisTrafficMode,
} from "../../services/hotel-suppliers/synxis/runtime-gate";

export type SynxisRuntimeEvidenceReader = () => Promise<SynxisRuntimeEvidence | null>;

async function readPersistedEvidence(): Promise<SynxisRuntimeEvidence | null> {
  const result = await createAdminClient()
    .from("synxis_crs_launch_evidence")
    .select("vendor_approved,certification_environment_approved,property_mapped,sandbox_validated,production_smoke_validated,live_enabled")
    .eq("provider_id", "sabre-synxis")
    .maybeSingle();
  if (result.error) {
    throw new Error("SynXis traffic is blocked because launch evidence could not be verified");
  }
  if (!result.data) return null;
  return {
    vendorApproved: result.data.vendor_approved === true,
    certificationEnvironmentApproved: result.data.certification_environment_approved === true,
    propertyMapped: result.data.property_mapped === true,
    sandboxValidated: result.data.sandbox_validated === true,
    productionSmokeValidated: result.data.production_smoke_validated === true,
    liveEnabled: result.data.live_enabled === true,
  };
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
