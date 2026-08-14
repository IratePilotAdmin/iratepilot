export type SynxisTrafficMode = "certification" | "production_smoke" | "live";

export type SynxisRuntimeEvidence = {
  vendorApproved: boolean;
  certificationEnvironmentApproved: boolean;
  propertyMapped: boolean;
  sandboxValidated: boolean;
  productionSmokeValidated: boolean;
  liveEnabled: boolean;
};

const requirements: Record<SynxisTrafficMode, Array<keyof SynxisRuntimeEvidence>> = {
  certification: [
    "vendorApproved",
    "certificationEnvironmentApproved",
    "propertyMapped",
  ],
  production_smoke: [
    "vendorApproved",
    "certificationEnvironmentApproved",
    "propertyMapped",
    "sandboxValidated",
  ],
  live: [
    "vendorApproved",
    "certificationEnvironmentApproved",
    "propertyMapped",
    "sandboxValidated",
    "productionSmokeValidated",
    "liveEnabled",
  ],
};

export function assertSynxisTrafficAuthorized(
  evidence: SynxisRuntimeEvidence | null,
  mode: SynxisTrafficMode,
) {
  if (!evidence) {
    throw new Error("SynXis traffic is blocked because persisted launch evidence is unavailable");
  }
  const missing = requirements[mode].filter((gate) => !evidence[gate]);
  if (missing.length > 0) {
    throw new Error(`SynXis ${mode.replaceAll("_", " ")} traffic is blocked by persisted launch gates: ${missing.join(", ")}`);
  }
}
