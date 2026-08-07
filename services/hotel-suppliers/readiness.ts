import { pmsProviders } from "./providers";
import type { PmsProviderManifest, PmsProviderReadiness } from "./types";

type Environment = Record<string, string | undefined>;

function requiredEnvironmentKeys(provider: PmsProviderManifest) {
  return provider.requiredConfiguration.map(
    (suffix) => `${provider.environmentPrefix}_${suffix}`,
  );
}

export function buildPmsReadiness(environment: Environment): PmsProviderReadiness[] {
  return pmsProviders.map((provider) => {
    const requiredKeys = requiredEnvironmentKeys(provider);
    const configuredKeys = requiredKeys.filter((key) => Boolean(environment[key]?.trim()));
    const missingConfiguration = requiredKeys.filter((key) => !environment[key]?.trim());

    const status = configuredKeys.length === 0
      ? "not_configured"
      : missingConfiguration.length > 0
        ? "credentials_required"
        : "ready_for_validation";

    return {
      id: provider.id,
      name: provider.name,
      vendor: provider.vendor,
      status,
      capabilities: provider.capabilities,
      certificationRequired: provider.certificationRequired,
      missingConfiguration,
      documentationUrl: provider.documentationUrl,
      notes: provider.notes,
    };
  });
}
